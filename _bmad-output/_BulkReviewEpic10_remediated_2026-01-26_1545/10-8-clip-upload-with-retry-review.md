# Code Review: Story 10.8 - Clip Upload with Retry

**Story File:** `_bmad-output/implementation-artifacts/10-8-clip-upload-with-retry.md`
**Reviewer:** Claude Opus 4.5 (Adversarial Review)
**Date:** 2026-01-26
**Status:** PASS

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Upload Triggering - POST /api/units/clips with multipart form data and detection_id | IMPLEMENTED | `clip_uploader.c:345-536` - `do_upload()` sends multipart POST with detection_id and clip file |
| AC2 | Successful Upload - 201 returns marks clip uploaded, can be pruned | IMPLEMENTED | `clip_uploader.c:581-585` - Sets `uploaded=true` and calls `compact_queue()` on 201 |
| AC3 | Upload Failure with Retry - exponential backoff 1min, 2min, 4min, 8min, max 1hr | IMPLEMENTED | `clip_uploader.c:87-97` - `clip_uploader_retry_delay()` implements backoff correctly |
| AC4 | Queue Processing - FIFO order, rate limited | IMPLEMENTED | `clip_uploader.c:264-281` - `find_next_uploadable()` finds oldest; `MIN_UPLOAD_INTERVAL_SEC=30` rate limits |
| AC5 | Queue Limit - 50 clips max, oldest dropped and logged | IMPLEMENTED | `clip_uploader.c:731-750` - Drops oldest when full with LOG_WARN |

---

## Issues Found

### I1: Missing storage_manager Integration for Mark as Uploaded

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 581-585
**Severity:** MEDIUM
**Category:** Incomplete Implementation
**Status:** [x] FIXED

**Description:** AC2 states clips marked as uploaded "can be pruned according to retention policy". Task 5.3 states "Mark clips as uploaded in storage_manager (via uploaded flag)". However, the current implementation only marks clips as uploaded in the in-memory queue (and persisted JSON), but never notifies `storage_manager` that the clip was successfully uploaded.

The `storage_manager.h` interface does not have a `mark_as_uploaded()` function, and the clip uploader never calls into storage_manager. This means storage_manager has no knowledge of which clips have been uploaded to the server and which haven't, making "can be pruned according to retention policy" impossible to implement correctly.

**Evidence:**
- `clip_uploader.c` includes only: `config_manager.h`, `log.h`, `platform.h` - no storage_manager.h
- Task 5.3 claims `[x]` but no storage_manager integration exists

**Fix Applied:** Added storage_manager.h include, added storage_manager_mark_uploaded() and storage_manager_is_uploaded() functions to storage_manager module, and call storage_manager_mark_uploaded() on successful upload.

---

### I2: ESP32 Upload Not Implemented (TODO Placeholder)

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 540-544
**Severity:** MEDIUM
**Category:** Incomplete Implementation
**Status:** [x] FIXED

**Description:** The ESP32 platform upload implementation is a stub that always returns `UPLOAD_STATUS_NO_CONFIG`:

```c
static upload_status_t do_upload(clip_queue_entry_t *entry) {
    // TODO: Implement ESP-IDF HTTP client upload
    (void)entry;
    return UPLOAD_STATUS_NO_CONFIG;
}
```

While the story's Technical Notes mention "ESP32 Platform: ESP-IDF HTTP client component", the actual implementation is just a TODO comment. This means the clip uploader will never successfully upload on ESP32.

**Evidence:** Lines 540-544 have TODO comment and no actual implementation.

**Fix Applied:** Implemented full ESP-IDF HTTP client upload using esp_http_client API with multipart form data support.

---

### I3: Potential Data Loss - Queue Not Persisted on Clip Queue Overflow

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 745-750
**Severity:** MEDIUM
**Category:** Data Loss Risk
**Status:** [x] FIXED

**Description:** When queue is full and oldest is dropped, the code marks it as uploaded and compacts, but `save_queue_to_disk()` is NOT called after the overflow drop - only after adding the new clip (line 770). This creates a window where:

1. Queue full (50 clips)
2. Oldest clip marked `uploaded=true` and compacted (removed from queue)
3. If system crashes HERE, oldest clip is gone but queue wasn't persisted
4. On restart, the new clip that triggered overflow won't be in queue

**Evidence:** Lines 745-750 do `compact_queue()` but no `save_queue_to_disk()`.

**Fix Applied:** Added save_queue_to_disk() call immediately after compact_queue() during overflow handling.

---

### I4: Thread Safety Issue - g_initialized Check Outside Lock

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 711-715
**Severity:** LOW
**Category:** Race Condition
**Status:** [x] FIXED

**Description:** In `clip_uploader_queue()`, the check `if (!g_initialized)` happens before acquiring the lock:

```c
int clip_uploader_queue(const char *clip_path, const char *detection_id) {
    if (!g_initialized) {  // <- No lock held
        return -1;
    }
    ...
    UPLOAD_LOCK();
```

While `g_initialized` is marked `volatile`, this is technically a TOCTOU race - between checking and acquiring lock, `clip_uploader_cleanup()` could run on another thread.

**Evidence:** Line 711-715 shows check-then-lock pattern.

**Fix Applied:** Moved g_initialized check inside the lock to prevent TOCTOU race condition.

---

### I5: Incomplete Error Handling - strncpy Without Null Termination Check

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 213-216
**Severity:** LOW
**Category:** Code Quality
**Status:** [x] FIXED

**Description:** In `load_queue_from_disk()`, strncpy is used but the result may not be null-terminated if source is exactly `CLIP_PATH_MAX-1` chars:

```c
strncpy(e->clip_path, path->valuestring, CLIP_PATH_MAX - 1);
// No explicit null termination
```

The `clip_queue_entry_t` struct initializes with `memset(e, 0, sizeof(*e))` on line 211, so this is technically safe, but inconsistent with safer patterns elsewhere in the code.

**Evidence:** Lines 213, 216-217 use strncpy without explicit null termination.

**Fix Applied:** Added explicit null termination after strncpy calls: `e->clip_path[CLIP_PATH_MAX - 1] = '\0';` and `e->detection_id[DETECTION_ID_MAX - 1] = '\0';`

---

### I6: Test Count Mismatch - Story Claims 113 Tests But Test File Shows Fewer

**File:** `apis-edge/tests/test_clip_uploader.c`
**Line:** 1-394
**Severity:** LOW
**Category:** Documentation Mismatch
**Status:** [x] NO FIX NEEDED

**Description:** The story's Dev Agent Record claims "113 tests passing" but the test file has approximately 60-70 assertions across 10 test functions. The test_queue_limit() function has a loop that adds 50 clips with 50 assertions, which could explain some of the count, but the total visible assertions are:
- test_initialization: 8
- test_status_names: 7
- test_exponential_backoff: 8
- test_queue_operations: 16
- test_queue_limit: ~54 (50 in loop + 4)
- test_statistics: 6
- test_start_stop: 3
- test_cleanup: 3
- test_null_params: 5
- test_fifo_ordering: 3

Total: ~113 assertions (counting loop iterations)

**Evidence:** The count appears correct when including loop iterations in test_queue_limit.

**Fix:** No fix needed - documentation appears accurate upon closer inspection.

---

### I7: Missing Test - No Test for Retry Backoff Reset on Success

**File:** `apis-edge/tests/test_clip_uploader.c`
**Line:** N/A
**Severity:** LOW
**Category:** Test Coverage Gap
**Status:** [x] FIXED

**Description:** AC3 states "Clear backoff on successful upload" (Task 3.3), but there's no test verifying that retry_count and next_retry_time are reset after a successful upload. The tests only verify:
- Exponential backoff calculation (correct)
- Queue operations
- Queue limits

But not the integration behavior of retry reset.

**Evidence:** No test function tests the "backoff cleared on success" scenario.

**Fix Applied:** Added test_retry_state_reset() function that verifies initial state and backoff reset behavior.

---

### I8: URL Parsing Duplicated Between server_comm and clip_uploader

**File:** `apis-edge/src/upload/clip_uploader.c`
**Line:** 287-329
**Severity:** LOW
**Category:** Code Duplication
**Status:** [x] FIXED

**Description:** The `parse_url()` function is duplicated almost identically between:
- `server_comm.c:87-138`
- `clip_uploader.c:287-329`

The only difference is the default path ("/api/units/heartbeat" vs "/api/units/clips"). This violates DRY principle and creates maintenance burden.

**Evidence:** Compare both parse_url implementations - nearly identical code.

**Fix Applied:** Created shared http_utils.h/http_utils.c with http_parse_url() function. Updated both server_comm.c and clip_uploader.c to use the shared utility. Updated CMakeLists.txt to include new source file.

---

## Verdict

**PASS**

All issues have been addressed:
- **3 MEDIUM issues**: All fixed (I1, I2, I3)
- **5 LOW issues**: All fixed or no fix needed (I4, I5, I6, I7, I8)

---

## Summary Statistics

- **Total Issues:** 8
- **High Severity:** 0
- **Medium Severity:** 3 (all fixed)
- **Low Severity:** 5 (all fixed or N/A)
- **Git vs Story Discrepancies:** None detected for apis-edge files

---

## Remediation Log

**Remediated:** 2026-01-26
**Issues Fixed:** 7 of 8 (1 was no-fix-needed)

### Changes Applied
- I1: Added storage_manager_mark_uploaded() integration to clip_uploader.c
- I2: Implemented full ESP32 upload using ESP-IDF HTTP client
- I3: Added save_queue_to_disk() after overflow drop
- I4: Moved g_initialized check inside lock
- I5: Added explicit null termination after strncpy
- I6: No fix needed - documentation was accurate
- I7: Added test_retry_state_reset() test function
- I8: Created http_utils.c/h shared utility, updated both modules

### Files Modified
- `apis-edge/src/upload/clip_uploader.c` - I1, I2, I3, I4, I5, I8
- `apis-edge/src/server/server_comm.c` - I8
- `apis-edge/src/storage/storage_manager.c` - I1
- `apis-edge/include/storage_manager.h` - I1
- `apis-edge/include/http_utils.h` - I8 (new)
- `apis-edge/src/http/http_utils.c` - I8 (new)
- `apis-edge/tests/test_clip_uploader.c` - I7
- `apis-edge/CMakeLists.txt` - I8
