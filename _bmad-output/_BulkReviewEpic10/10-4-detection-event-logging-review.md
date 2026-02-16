# Code Review: Story 10.4 - Detection Event Logging

**Reviewer:** Claude (Adversarial Code Review)
**Date:** 2026-01-26
**Story:** 10-4-detection-event-logging
**Status:** done

---

## Review Summary

**Story Status:** done
**Git vs Story Discrepancies:** 0 major discrepancies
**Issues Found:** 4 High, 3 Medium, 1 Low

---

## Git vs Story File List Analysis

The story claims these files were created/modified:
- `apis-edge/include/event_logger.h` - EXISTS, verified
- `apis-edge/src/storage/event_logger.c` - EXISTS, verified
- `apis-edge/src/storage/schema.c` - EXISTS, verified
- `apis-edge/hal/storage/sqlite_hal.h` - EXISTS, verified
- `apis-edge/hal/storage/pi/sqlite_pi.c` - EXISTS, verified
- `apis-edge/hal/storage/esp32/sqlite_esp32.c` - EXISTS, verified
- `apis-edge/tests/test_event_logger.c` - EXISTS, verified

All claimed files exist in the codebase. No files discovered in git that are missing from story documentation.

---

## Acceptance Criteria Validation

### AC1: Event Recording - PARTIAL

**Given** a hornet is detected
**When** the detection is confirmed
**Then** an event record is created with required fields

| Field | Required | Implementation Status |
|-------|----------|----------------------|
| Timestamp (ISO 8601) | Yes | IMPLEMENTED - `get_iso_timestamp()` |
| Confidence level | Yes | IMPLEMENTED - stored as "high"/"medium"/"low" |
| Bounding box coordinates | Yes | IMPLEMENTED - x, y, w, h fields |
| Size in pixels | Yes | IMPLEMENTED - `area` field stores contour area |
| Hover duration | Yes | IMPLEMENTED - `hover_duration_ms` |
| Laser activated | Yes | IMPLEMENTED - `laser_fired` boolean |

**Finding:** AC1 is IMPLEMENTED.

### AC2: Local Storage - IMPLEMENTED

| Requirement | Status |
|-------------|--------|
| Events stored in SQLite | IMPLEMENTED |
| Queryable by date range | IMPLEMENTED - `event_logger_get_events()` |
| Auto-incrementing IDs | IMPLEMENTED - `INTEGER PRIMARY KEY AUTOINCREMENT` |

**Finding:** AC2 is IMPLEMENTED.

### AC3: Storage Management - PARTIAL

| Requirement | Status |
|-------------|--------|
| Detect low storage (<100MB free) | IMPLEMENTED - `min_free_mb` config |
| Auto-prune oldest events (>30 days) | IMPLEMENTED - calls `event_logger_prune()` |
| Warning logged | IMPLEMENTED - `LOG_WARN` on low storage |

**Finding:** AC3 is IMPLEMENTED.

### AC4: Persistence - IMPLEMENTED

| Requirement | Status |
|-------------|--------|
| Events survive restart | IMPLEMENTED - SQLite WAL mode |
| IDs continue after restart | IMPLEMENTED - autoincrement |

**Finding:** AC4 is IMPLEMENTED. Test `test_persistence()` validates this.

---

## Task Completion Audit

### Task 1: Database Schema (AC: 1, 2) - [x] marked complete

| Subtask | Evidence | Status |
|---------|----------|--------|
| 1.1: Create SQLite database file | `sqlite3_open()` in `event_logger_init()` | DONE |
| 1.2: Create `events` table with all fields | `schema.c` has full CREATE TABLE | DONE |
| 1.3: Add indexes for common queries | 4 indexes created in schema.c | DONE |

### Task 2: Event Recording (AC: 1) - [x] marked complete

| Subtask | Evidence | Status |
|---------|----------|--------|
| 2.1: Create `EventLogger` module | `event_logger.c`, `event_logger.h` | DONE |
| 2.2: Implement `event_logger_log()` | Line 170-254 in event_logger.c | DONE |
| 2.3: Add `synced` flag | Field exists, default 0 | DONE |

### Task 3: Query Interface (AC: 2) - [x] marked complete

| Subtask | Evidence | Status |
|---------|----------|--------|
| 3.1: Implement `event_logger_get_events()` | Lines 297-370 | DONE |
| 3.2: Implement `event_logger_get_unsynced()` | Lines 372-411 | DONE |
| 3.3: Implement `event_logger_mark_synced()` | Lines 413-444 | DONE |

### Task 4: Storage Management (AC: 3, 4) - [x] marked complete

| Subtask | Evidence | Status |
|---------|----------|--------|
| 4.1: Implement storage check | `event_logger_get_status()` | DONE |
| 4.2: Implement auto-pruning | Lines 238-251 auto-prune on log | DONE |
| 4.3: Test persistence | `test_persistence()` in test file | DONE |

---

## Code Quality Issues

### HIGH SEVERITY

#### Issue 1: SQL Injection Vulnerability in Date Filtering

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Lines:** 323-339

**Problem:** The date filtering uses string formatting with `snprintf` to build SQL queries with timestamp values. While the timestamps are bound as parameters, the query structure is built dynamically without parameterizing the LIMIT clause properly.

**Code:**
```c
snprintf(sql, sizeof(sql),
         "%s AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT %d",
         sql_base, MAX_EVENTS_PER_QUERY);
```

**Impact:** While `MAX_EVENTS_PER_QUERY` is a constant (low risk), this pattern is fragile. If someone changes this to accept a user-provided limit, it becomes injectable.

**Recommendation:** Use `sqlite3_bind_int()` for the LIMIT parameter as well for consistency and safety.

---

#### Issue 2: Potential Deadlock in Auto-Prune Logic

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Lines:** 238-251

**Problem:** The `event_logger_log()` function unlocks the mutex and then calls `event_logger_get_status()` and `event_logger_prune()`, which both re-acquire the mutex. This creates a window where another thread could modify the database between operations.

**Code:**
```c
pthread_mutex_unlock(&g_mutex);

storage_status_t status;
if (event_logger_get_status(&status) == 0 && status.warning) {
    LOG_WARN("Storage low...");
    int pruned = event_logger_prune(g_config.prune_days);
```

**Impact:** Race condition where storage check and prune are not atomic. Could lead to:
1. Multiple threads all deciding to prune simultaneously
2. Inconsistent state between check and action

**Recommendation:** Either:
- Use a flag to prevent concurrent auto-prune operations
- Perform the check while still holding the lock (requires internal non-locking versions of get_status/prune)

---

#### Issue 3: ESP32 Storage Info Not Implemented in event_logger_get_status()

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Lines:** 565-578

**Problem:** The `event_logger_get_status()` function only implements disk space checking for `APIS_PLATFORM_PI`. On ESP32, the storage status fields (`free_mb`, `total_mb`, `db_size_mb`) will always be 0.

**Code:**
```c
#ifdef APIS_PLATFORM_PI
    // Get disk space
    struct statvfs stat_buf;
    if (statvfs(g_config.db_path, &stat_buf) == 0) {
        // ... implementation
    }
    // Get database size
    struct stat db_stat;
    if (stat(g_config.db_path, &db_stat) == 0) {
        // ... implementation
    }
#endif
```

**Impact:** AC3 (storage management) will NOT work on ESP32 because:
1. `status.warning` will never trigger (free_mb = 0, but `free_mb > 0` check prevents warning)
2. Auto-pruning will never be triggered on ESP32

**Recommendation:** The `sqlite_esp32.c` HAL has `sqlite_hal_get_storage_info()` - use it! Add ESP32 branch:
```c
#ifdef APIS_PLATFORM_ESP32
    uint64_t free_bytes, total_bytes;
    if (sqlite_hal_get_storage_info(&free_bytes, &total_bytes) == 0) {
        status->free_mb = (float)free_bytes / (1024.0f * 1024.0f);
        status->total_mb = (float)total_bytes / (1024.0f * 1024.0f);
    }
#endif
```

---

#### Issue 4: SQLite HAL Not Used by Event Logger

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`

**Problem:** The story claims to implement HAL files (`sqlite_hal.h`, `sqlite_pi.c`, `sqlite_esp32.c`), but `event_logger.c` does NOT use the HAL layer. It directly includes platform-specific headers and uses `sqlite3_open()` directly.

**Evidence:**
- `event_logger.c` includes `<sqlite3.h>` directly (line 19, 26)
- Uses `statvfs()` directly (line 567) instead of `sqlite_hal_get_storage_info()`
- Does not call `sqlite_hal_init()` before using SQLite
- Does not call `sqlite_hal_get_db_path()` for path resolution

**Impact:** The HAL layer exists but is dead code - never called. On ESP32, the SPIFFS filesystem won't be mounted because `sqlite_hal_init()` is never called.

**Recommendation:** Refactor `event_logger_init()` to call `sqlite_hal_init()` first and use HAL functions for path resolution and storage info.

---

### MEDIUM SEVERITY

#### Issue 5: No Test for Clip Reference Cleanup

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_event_logger.c`

**Problem:** The header declares `event_logger_clear_clip_reference()` (lines 172-182 of header) and it's implemented (lines 624-666 of .c), but there's no test coverage for this function.

**Impact:** If clip file deletion integration breaks, no test will catch it.

**Recommendation:** Add test case:
```c
static void test_clip_reference_clear(void) {
    // Log event with clip
    // Verify clip_file is set
    // Clear clip reference
    // Verify clip_file is now empty
}
```

---

#### Issue 6: Batch Sync Returns 0 for NULL/Empty Input Instead of Error

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Lines:** 446-449

**Problem:** `event_logger_mark_synced_batch()` returns 0 when given NULL or count <= 0, but the single-item version `event_logger_mark_synced()` returns -1 for invalid input after init check.

**Code:**
```c
int event_logger_mark_synced_batch(const int64_t *event_ids, int count) {
    if (event_ids == NULL || count <= 0) {
        return 0;  // Inconsistent with other functions
    }
```

**Impact:** Inconsistent error handling. Caller can't distinguish between "nothing to sync" and "invalid input".

**Recommendation:** Return -1 for NULL input to match other functions, or document this intentional behavior.

---

#### Issue 7: Missing Index on clip_file Column

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/schema.c`

**Problem:** The `event_logger_clear_clip_reference()` function queries `WHERE clip_file = ?`, but there's no index on the `clip_file` column.

**Impact:** On devices with many events, clearing clip references will do a full table scan. This could be slow on ESP32 with limited CPU.

**Recommendation:** Add index:
```sql
CREATE INDEX IF NOT EXISTS idx_events_clip_file ON events(clip_file);
```

---

### LOW SEVERITY

#### Issue 8: Hardcoded Default Database Path

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** 42

**Problem:** Default path is `./data/detections.db` which is a relative path. On embedded systems, the current working directory may not be what you expect.

**Code:**
```c
snprintf(config.db_path, sizeof(config.db_path), "./data/detections.db");
```

**Recommendation:** Use an absolute path or document that callers MUST provide explicit path on embedded platforms.

---

## Test Quality Assessment

The test file `test_event_logger.c` is comprehensive with 10 test functions:

| Test | Coverage |
|------|----------|
| `test_init_cleanup` | Init, double-init, close |
| `test_basic_logging` | Insert, count verification |
| `test_event_retrieval` | Query all, unsynced query |
| `test_date_filtering` | Since/until timestamp filtering |
| `test_sync_marking` | Single and batch marking |
| `test_pruning` | Delete old synced events |
| `test_auto_prune_on_storage_warning` | AC3 auto-prune trigger |
| `test_persistence` | Cross-restart data survival |
| `test_error_handling` | NULL checks, pre-init calls |
| `test_status_strings` | Status code strings |

**Missing Test Coverage:**
1. `event_logger_clear_clip_reference()` - no test
2. Concurrent access / thread safety - no test
3. ESP32 platform specifics - not testable on Pi

**Test Quality:** Good - tests use proper cleanup, assertions, and cover most functionality.

---

## Review Decision

**CHANGES REQUESTED**

### Must Fix (HIGH):
1. ESP32 storage info not implemented - AC3 broken on ESP32
2. SQLite HAL not used - HAL is dead code
3. Potential deadlock in auto-prune logic

### Should Fix (MEDIUM):
4. Add test for `event_logger_clear_clip_reference()`
5. Consistent error handling in batch sync
6. Add index on clip_file column

### Nice to Fix (LOW):
7. Use absolute path or document requirement

---

## Summary

The story implementation is **mostly complete** with well-structured code and good test coverage. However, there are significant issues:

1. **ESP32 Support Broken:** The ESP32 HAL files exist but are never used. Storage management (AC3) won't work on ESP32.

2. **Thread Safety Concern:** The auto-prune logic has a race condition window.

3. **Dead Code:** The sqlite_hal layer is implemented but never called.

The core functionality works on Raspberry Pi, but this story cannot be considered "done" until ESP32 support actually works.

---

**Reviewed by:** Claude (Adversarial Senior Developer Review)
**Date:** 2026-01-26
