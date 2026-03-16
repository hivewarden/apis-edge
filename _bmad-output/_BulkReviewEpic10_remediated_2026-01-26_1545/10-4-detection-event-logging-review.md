# Code Review: Story 10-4 Detection Event Logging

**Reviewer:** Claude (Adversarial Code Review)
**Date:** 2026-01-26
**Story:** 10-4-detection-event-logging
**Status:** PASS

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Event Recording with timestamp, confidence, bbox, size, hover, laser | IMPLEMENTED | `event_logger_log()` in event_logger.c:170-239 records all required fields |
| AC2 | SQLite storage, query by date range, auto-increment IDs | IMPLEMENTED | Schema uses `INTEGER PRIMARY KEY AUTOINCREMENT`, `event_logger_get_events()` supports date filtering |
| AC3 | Auto-prune old events when storage <100MB | IMPLEMENTED | Auto-prune now triggers in `event_logger_log()` when storage warning is set |
| AC4 | Persistence across restarts | IMPLEMENTED | Test `test_persistence()` validates data survives close/reopen cycle |

---

## Issues Found

### I1: Missing Automatic Storage Management Trigger

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** N/A (feature not implemented)
**Severity:** HIGH

**Description:** AC3 states "When new events are logged, Then oldest events (>30 days) are auto-pruned" when storage is low. The implementation has `event_logger_prune()` but it is NEVER called automatically. The `event_logger_log()` function does not check storage status or trigger pruning.

**Expected:** Before logging an event, check `storage_status.warning` flag and call `event_logger_prune()` automatically.

**Current:** Pruning only happens when manually called by external code.

**Fix:** Add storage check in `event_logger_log()`:
```c
// After successful insert, check if pruning needed
storage_status_t status;
if (event_logger_get_status(&status) == 0 && status.warning) {
    LOG_WARN("Storage low (%.2f MB free), auto-pruning", status.free_mb);
    event_logger_prune(g_config.prune_days);
}
```

- [x] **FIXED:** Added auto-prune logic after successful insert in event_logger_log()

---

### I2: Missing HAL SQLite Abstraction Files

**File:** Story document vs actual implementation
**Line:** N/A
**Severity:** MEDIUM

**Description:** The story specifies these files should be created:
- `hal/storage/sqlite_hal.h`
- `hal/storage/pi/sqlite_pi.c`
- `hal/storage/esp32/sqlite_esp32.c`

However, these files do NOT exist. The ESP32-specific SQLite initialization code is documented in the story but never implemented. Instead, `event_logger.c` uses `#ifdef APIS_PLATFORM_ESP32` directly but the ESP32 SPIFFS initialization is incomplete.

**Expected:** Separate HAL layer files for Pi and ESP32 SQLite implementations.

**Current:** Platform-specific code is inline in event_logger.c with #ifdefs, ESP32 SPIFFS init code from story is missing.

- [x] **FIXED:** Created all three HAL files with full implementation

---

### I3: SQL Injection Risk in Date Filtering

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** 302-330 (event_logger_get_events)
**Severity:** LOW

**Description:** While the implementation uses parameterized queries (good!), the parameter binding logic has unnecessary complexity and the code building approach with snprintf to construct SQL is slightly error-prone.

The current implementation properly uses `sqlite3_bind_text()` for timestamp parameters, so this is not a vulnerability. However, the code structure could be simplified for maintainability.

**Current (acceptable but complex):**
```c
if (since_timestamp && until_timestamp) {
    snprintf(sql, sizeof(sql), "%s AND timestamp >= ? AND timestamp <= ? ...", sql_base, MAX_EVENTS_PER_QUERY);
    param_count = 2;
}
```

- [x] **NOTED:** Not a security issue - parameterized queries are used. Code structure is acceptable.

---

### I4: Missing Warning Log When Storage Low

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** 541-594 (event_logger_get_status)
**Severity:** MEDIUM

**Description:** AC3 states "a warning is logged" when storage is running low. The implementation sets `status.warning = true` but does NOT log any warning message. The warning flag is set but never acted upon.

**Expected:** When `status.warning` becomes true, a LOG_WARN should be emitted.

**Current:** Only sets the boolean flag silently.

**Fix:** Add in `event_logger_get_status()`:
```c
if (status->warning) {
    LOG_WARN("Storage low: %.2f MB free (threshold: %u MB)",
             status->free_mb, g_config.min_free_mb);
}
```

- [x] **FIXED:** Added LOG_WARN in event_logger_get_status() when warning flag is set

---

### I5: ESP32 SPIFFS Initialization Not Implemented

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** 26-28
**Severity:** MEDIUM

**Description:** The story documents ESP32-specific SQLite initialization using SPIFFS (lines ~700-755 in story), including mounting the SPIFFS filesystem and initializing SQLite. However, the actual implementation just has an `#include` for `esp_spiffs.h` but no code to:
1. Mount SPIFFS filesystem
2. Initialize SQLite on ESP32
3. Handle ESP32-specific database paths

The `event_logger_init()` function on ESP32 would fail because SPIFFS is not mounted.

**Expected:** Complete ESP32 HAL implementation per story specification.

**Current:** Only the #include exists, no actual SPIFFS mounting code.

- [x] **FIXED:** Created hal/storage/esp32/sqlite_esp32.c with full SPIFFS mounting implementation

---

### I6: Test Does Not Verify Auto-Pruning on Storage Warning

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_event_logger.c`
**Line:** 239-284 (test_pruning)
**Severity:** MEDIUM

**Description:** The test for pruning only tests manual `event_logger_prune()` calls. There is no test to verify AC3's automatic pruning when storage is low. This is related to I1 - the feature doesn't exist, so the test doesn't exist.

**Expected:** Test that simulates low storage condition and verifies auto-pruning triggers.

**Current:** Only tests explicit prune() calls.

- [x] **FIXED:** Added test_auto_prune_on_storage_warning() test function

---

### I7: Story Missing Dev Agent Record / File List Section

**File:** `/Users/jermodelaruelle/Projects/apis/_bmad-output/implementation-artifacts/10-4-detection-event-logging.md`
**Line:** N/A
**Severity:** LOW

**Description:** The story document lacks the standard "Dev Agent Record" section with "File List" and "Change Log" that tracks what files were actually created/modified. The "Files to Create" section at the end lists expected files but doesn't confirm actual implementation.

**Expected:** Dev Agent Record section with verified file list.

**Current:** Only "Files to Create" wishlist, no confirmation of actual files.

- [x] **FIXED:** Added Dev Agent Record section with File List and updated Change Log

---

### I8: Unused Variable Warning in get_events

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/storage/event_logger.c`
**Line:** 350
**Severity:** LOW

**Description:** The variable `param_count` is set but only suppressed with a cast. This indicates the code could be simplified.

**Current:**
```c
(void)param_count; // Suppress unused variable warning
```

**Expected:** Remove the unused variable entirely since bind_idx already tracks the parameter position.

- [x] **FIXED:** Removed param_count variable, kept bind_idx with (void) cast

---

## Verdict

**PASS**

All issues have been remediated:

1. **I1 (HIGH):** Auto-pruning now triggers automatically when storage is low
2. **I2 (MEDIUM):** HAL SQLite abstraction files created
3. **I3 (LOW):** Not a vulnerability (parameterized queries used) - noted
4. **I4 (MEDIUM):** Warning log now emitted when storage low
5. **I5 (MEDIUM):** ESP32 SPIFFS implementation created in HAL
6. **I6 (MEDIUM):** Test for auto-prune behavior added
7. **I7 (LOW):** Dev Agent Record section added to story
8. **I8 (LOW):** Unused variable removed

### Summary
- **Issues Fixed:** 7 of 8 (I3 was not a vulnerability, just noted)
- **ACs Fully Implemented:** 4 of 4
- **ACs Partially Implemented:** 0

---

## Remediation Log

**Remediated:** 2026-01-26
**Issues Fixed:** 7 of 8

### Changes Applied
- I1: Added auto-prune trigger in event_logger_log() after successful insert
- I2: Created hal/storage/sqlite_hal.h, hal/storage/pi/sqlite_pi.c, hal/storage/esp32/sqlite_esp32.c
- I4: Added LOG_WARN in event_logger_get_status() when warning flag is true
- I5: Implemented full ESP32 SPIFFS mounting in sqlite_esp32.c
- I6: Added test_auto_prune_on_storage_warning() test function
- I7: Added Dev Agent Record section with File List to story file
- I8: Removed unused param_count variable in event_logger_get_events()

### Remaining Issues
- I3: Not fixed (not a vulnerability - just code style observation, parameterized queries are correctly used)

---

_Reviewed by Claude (Adversarial Code Review) on 2026-01-26_
_Remediated by Claude on 2026-01-26_
