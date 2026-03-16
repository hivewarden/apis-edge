# Code Review: Story 10.6 - HTTP Control API

**Reviewer:** Claude Opus 4.5 (BMAD Adversarial Review)
**Date:** 2026-01-26
**Story:** 10-6-http-control-api.md
**Story Status:** done

---

## Git vs Story Discrepancies

**Files in Story File List:**
| File | Action | Description |
|------|--------|-------------|
| `include/http_server.h` | Created | HTTP server public interface |
| `src/http/http_server.c` | Created | Full HTTP server implementation |
| `tests/test_http_server.c` | Created | Comprehensive test suite |
| `CMakeLists.txt` | Modified | Added test_http_server target |

**Actual Files Modified (Git):**
- Story artifact `_bmad-output/implementation-artifacts/10-6-http-control-api.md`
- HTTP server source exists at `/apis-edge/src/http/http_server.c`
- Test file exists at `/apis-edge/tests/test_http_server.c`
- Header exists at `/apis-edge/include/http_server.h`
- CMakeLists.txt at `/apis-edge/CMakeLists.txt`

**Discrepancy:** The story claims test results of "53 passed, 0 failed" but the build is currently **BROKEN** due to missing linker dependencies.

---

## Acceptance Criteria Verification

| AC# | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | GET /status returns armed, detection_enabled, uptime_seconds, detections_today, storage_free_mb, firmware_version | PARTIAL | http_server.c:603-651 - All fields present but detections_today/storage_free use default fallbacks due to broken build |
| AC2 | POST /arm enables armed state, LED solid green | IMPLEMENTED | http_server.c:653-677 - Calls config_manager_set_armed(true) and led_controller_set_state(LED_STATE_ARMED) |
| AC3 | POST /disarm disables armed state, LED solid yellow | IMPLEMENTED | http_server.c:679-703 - Calls config_manager_set_armed(false) and led_controller_set_state(LED_STATE_DISARMED) |
| AC4 | GET /stream returns MJPEG with correct Content-Type and boundary | IMPLEMENTED | http_server.c:759-834 - Returns multipart/x-mixed-replace with boundary=frame |
| AC5 | GET/POST /config reads and updates configuration with validation | IMPLEMENTED | http_server.c:705-757 - Uses config_manager_get_public() and config_manager_update() |
| AC6 | Error handling returns 400, 404, 500 with JSON error format | IMPLEMENTED | http_server.c:319-330 - http_send_error() returns proper JSON format |

---

## Issues Found

### I1: CRITICAL - CMakeLists.txt Missing Link Dependencies (BUILD BROKEN)

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/CMakeLists.txt`
**Line:** 291-299
**Severity:** CRITICAL

**Problem:** The previous remediation (I2, I3) added dependencies on `event_logger.h` and `storage_manager.h` to http_server.c (lines 11-12), but the CMakeLists.txt was NOT updated to link against these modules. This causes a linker failure:

```
Undefined symbols for architecture arm64:
  "_event_logger_get_status", referenced from: _handle_status in http_server.c.o
  "_event_logger_is_initialized", referenced from: _handle_status in http_server.c.o
  "_storage_manager_get_stats", referenced from: _handle_status in http_server.c.o
  "_storage_manager_is_initialized", referenced from: _handle_status in http_server.c.o
```

**Current Code (CMakeLists.txt:291-299):**
```cmake
add_executable(test_http_server
    tests/test_http_server.c
    src/http/http_server.c
    src/led/led_controller.c
    src/config/config_manager.c
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)
```

**Required Fix:** Add event_logger and storage_manager source files:
```cmake
add_executable(test_http_server
    tests/test_http_server.c
    src/http/http_server.c
    src/led/led_controller.c
    src/config/config_manager.c
    src/storage/event_logger.c      # MISSING
    src/storage/schema.c            # MISSING (dependency of event_logger)
    src/storage/storage_manager.c   # MISSING
    src/config.c
    src/log.c
    lib/cJSON/cJSON.c
)
```

**Impact:** The story claims "53 tests passing" but the test executable cannot be built. Task 6.3 "Update CMakeLists.txt with new sources" is marked [x] complete but is NOT actually complete.

---

### I2: HIGH - Test Does Not Initialize Required Modules

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_http_server.c`
**Line:** 481-496
**Severity:** HIGH

**Problem:** The test initializes `config_manager` but does NOT initialize `event_logger` or `storage_manager`. Since http_server.c now calls these modules (with is_initialized() guards), the "real metrics" code paths are NEVER tested. The tests only verify the default fallback values (0 for detections_today, 1024 for storage_free_mb).

**Current Test Setup:**
```c
int main(void) {
    log_init(NULL, LOG_LEVEL_ERROR, false);
    config_manager_init(true);  // Only this is initialized
    // MISSING: event_logger_init()
    // MISSING: storage_manager_init()

    printf("=== HTTP Server Tests ===\n");
    test_server_lifecycle();
```

**Required Fix:** Add initialization for event_logger and storage_manager:
```c
int main(void) {
    log_init(NULL, LOG_LEVEL_ERROR, false);
    config_manager_init(true);
    event_logger_init(NULL);      // Use defaults
    storage_manager_init(NULL);   // Use defaults

    printf("=== HTTP Server Tests ===\n");
    test_server_lifecycle();

    // And cleanup
    storage_manager_cleanup_resources();
    event_logger_close();
    config_manager_cleanup();
```

---

### I3: MEDIUM - Status Endpoint Test Only Validates Types, Not Values

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_http_server.c`
**Line:** 161-196
**Severity:** MEDIUM

**Problem:** The status endpoint test (`test_status_endpoint`) only verifies that fields exist and are the correct JSON type. It does NOT verify that the values are reasonable or that the integration with event_logger/storage_manager actually works.

**Current Tests:**
```c
cJSON *detections = cJSON_GetObjectItem(json, "detections_today");
TEST_ASSERT(detections != NULL && cJSON_IsNumber(detections), "detections_today field is number");

cJSON *storage = cJSON_GetObjectItem(json, "storage_free_mb");
TEST_ASSERT(storage != NULL && cJSON_IsNumber(storage), "storage_free_mb field is number");
```

**Better Tests Would:**
1. Log a test detection via event_logger, then verify detections_today > 0
2. Verify storage_free_mb returns a value within expected range (not hardcoded 1024)
3. Verify uptime_seconds increases over time

---

### I4: MEDIUM - Story Technical Notes Contradict Implementation

**File:** `_bmad-output/implementation-artifacts/10-6-http-control-api.md`
**Line:** 106-119
**Severity:** MEDIUM

**Problem:** The story's Technical Notes claim the following file structure:
```
apis-edge/
├── include/
│   └── http_server.h       # HTTP server interface
├── src/
│   └── http/
│       ├── http_server.c   # Core server implementation
│       ├── http_parser.c   # Request parsing
│       └── http_handlers.c # Endpoint handlers
```

But the actual implementation is:
```
apis-edge/
├── include/
│   └── http_server.h
├── src/
│   └── http/
│       ├── http_server.c   # Contains ALL code (parsing + handlers)
│       └── http_utils.c    # NOT MENTIONED in story
```

The story claims separate files for parser and handlers, but everything is in one 841-line http_server.c file. The http_utils.c file exists but is not documented in the story.

---

### I5: MEDIUM - detections_today Uses Total Events, Not Today's Events

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Line:** 619-626
**Severity:** MEDIUM

**Problem:** AC1 specifically requires `detections_today` to return today's detection count. The implementation uses `status.total_events` which is the TOTAL count of all events ever, not just today's events.

**Current Code:**
```c
if (event_logger_is_initialized()) {
    storage_status_t status;
    if (event_logger_get_status(&status) == 0) {
        // Use total_events as approximation; in production, could filter by today's date
        detections_today = (int)status.total_events;  // WRONG: This is ALL events, not today
    }
}
```

**Comment admits the problem:** "Use total_events as approximation; in production, could filter by today's date"

**Required Fix:** Use date-filtered query from event_logger_get_events() with today's date range, or implement a dedicated event_logger_count_today() function.

---

### I6: LOW - http_utils.c Not Linked or Used in HTTP Server Test

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_utils.c`
**Severity:** LOW

**Problem:** The file http_utils.c exists in the http/ directory but:
1. Is not mentioned in the story File List
2. Is not linked in the test_http_server CMake target
3. Its purpose and relationship to http_server is unclear

This file appears to be used by server_comm (line 353 of CMakeLists.txt) but not by http_server itself. Either:
- It should be documented in the story if related
- Or it should be moved if unrelated to this story

---

### I7: LOW - Hardcoded DEFAULT_MAX_STORAGE_MB Calculation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/http/http_server.c`
**Line:** 635-637
**Severity:** LOW

**Problem:** The storage_free_mb calculation hardcodes DEFAULT_MAX_STORAGE_MB as 1000:

```c
uint32_t max_storage = 1000; // DEFAULT_MAX_STORAGE_MB
storage_free_mb = (stats.total_size_mb < max_storage) ?
                  (max_storage - stats.total_size_mb) : 0;
```

This should use the constant from storage_manager.h (DEFAULT_MAX_STORAGE_MB) or get the configured max from storage_manager_config.

---

## Task Completion Audit

| Task | Status | Verified? | Evidence |
|------|--------|-----------|----------|
| 1.1: Implement minimal HTTP/1.1 server | [x] | YES | http_server.c:336-396 uses POSIX sockets |
| 1.2: Parse HTTP request line and headers | [x] | YES | http_server.c:428-516 parse_request() |
| 1.3: Route requests to handler functions | [x] | YES | http_server.c:531-592 route_request() |
| 1.4: Send HTTP responses with proper headers | [x] | YES | http_server.c:289-330 response helpers |
| 1.5: Handle concurrent connections | [x] | YES | http_server.c uses select() with timeout |
| 2.1: Implement GET /status handler | [x] | YES | http_server.c:603-651 handle_status() |
| 2.2: Gather system metrics | [x] | PARTIAL | Uptime works, storage/detections use fallbacks |
| 2.3: Query detection count from event logger | [x] | NO | Uses total_events not today's count |
| 2.4: Format JSON response | [x] | YES | Uses cJSON library |
| 3.1-3.4: Arm/Disarm handlers | [x] | YES | http_server.c:653-703 |
| 4.1-4.3: Config handlers | [x] | YES | http_server.c:705-757 |
| 5.1-5.5: MJPEG stream | [x] | YES | http_server.c:759-834 |
| 6.1: Add to main.c | [x] | DEFERRED | Explicitly deferred to Story 10.7 |
| 6.2: Create test_http_server.c | [x] | PARTIAL | Tests exist but incomplete coverage |
| **6.3: Update CMakeLists.txt** | **[x]** | **NO** | **Missing event_logger/storage_manager sources** |
| 6.4: Verify with curl | [x] | CANNOT VERIFY | Build is broken |

---

## Summary

**Issues Found:** 7 total
- 1 CRITICAL (Build broken - missing CMake dependencies)
- 2 HIGH (Test missing module init, detections uses total not today)
- 3 MEDIUM (Weak tests, doc mismatch, wrong metric)
- 1 LOW (http_utils.c undocumented)

**Verdict:** CHANGES REQUESTED

The previous remediation (issues I2/I3 from prior review) introduced new dependencies on event_logger and storage_manager but failed to update CMakeLists.txt to link these modules. This results in a **completely broken build** that prevents verification of the claimed "53 tests passing" result.

Additionally, the "integration" with event_logger is semantically incorrect - it returns total events of all time instead of today's detections as required by AC1.

---

## Review Checklist

- [x] Story file loaded from `_bmad-output/implementation-artifacts/10-6-http-control-api.md`
- [x] Story Status verified as reviewable (done)
- [x] Epic and Story IDs resolved (10.6)
- [x] Architecture/standards docs loaded (CLAUDE.md)
- [x] Tech stack detected and documented (C, POSIX sockets, pthread, cJSON)
- [x] Acceptance Criteria cross-checked against implementation
- [x] File List reviewed and validated for completeness
- [x] Tests identified and mapped to ACs; gaps noted
- [x] Code quality review performed on changed files
- [x] Security review performed on changed files
- [x] Outcome decided: CHANGES REQUESTED
- [x] Review notes documented

_Reviewer: Claude Opus 4.5 on 2026-01-26_
