# Code Review: Story 12.2 - Coordinate Mapping (Pixel to Servo)

**Reviewer:** Claude Code (BMAD Workflow)
**Date:** 2026-01-26
**Story File:** `_bmad-output/implementation-artifacts/12-2-coordinate-mapping-pixel-to-servo.md`
**Status:** PASS

---

## Acceptance Criteria Verification

| AC# | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Pixel (x,y) converted to servo angles (pan, tilt) | PASS | `coord_mapper_pixel_to_angle()` in coordinate_mapper.c:350-388 |
| AC2 | Conversion accounts for camera field of view | PASS | FOV params in camera_params_t, used in pixel_to_raw_angle():94-106 |
| AC3 | Laser points at same physical location camera sees | PASS | Linear interpolation mapping implemented |
| AC4 | Offset correction applied (parallax) | PASS | `apply_calibration()`:111-114 applies offsets |
| AC5 | Calibration mode: point laser, click marker, calculate offset | PASS | `coord_mapper_add_point()` and `coord_mapper_compute_calibration()` |
| AC6 | Calibration saved | PASS | `coord_mapper_save_calibration()`:242-297 writes JSON |
| AC7 | Calibration loaded on boot | PASS | Auto-load in `coord_mapper_init()`:345 calls load_calibration |
| AC8 | Calibration applied to all transformations | PASS | `apply_calibration()` called in pixel_to_angle |

---

## Issues Found

### I1: Multi-Point Calibration Scale Computation Not Implemented

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c`
**Line:** 524-527
**Severity:** MEDIUM

**Description:** The `coord_mapper_compute_calibration()` function documents that 2+ points could compute scale factors, but the implementation only uses the first point for offset calculation and hardcodes scale to 1.0.

**Code:**
```c
// If we have 2+ points, could compute scale as well
// For now, just use offsets from first point
g_calibration.scale_pan = 1.0f;
g_calibration.scale_tilt = 1.0f;
```

**Impact:** Users adding multiple calibration points may expect scale correction but won't get it.

**Suggested Fix:** Either implement least-squares scale computation from multiple points, or document this limitation clearly in the header.

- [x] FIXED: Added clear documentation in both coordinate_mapper.c and coordinate_mapper.h explaining this limitation

---

### I2: Memory Leak on JSON Parse Failure Path

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c`
**Line:** 173-179
**Severity:** HIGH

**Description:** When `cJSON_Parse()` fails, the function returns without freeing the `content` buffer that was allocated.

**Code:**
```c
cJSON *json = cJSON_Parse(content);
free(content);  // This is correct

if (json == NULL) {
    LOG_ERROR("Failed to parse calibration JSON");
    return COORD_ERROR_FILE_INVALID;  // content already freed - OK
}
```

**Impact:** Upon closer inspection, the code IS correct - `free(content)` is called before the NULL check. This is NOT an issue. REDACTED.

- [x] NOT AN ISSUE: Code is correct as written

---

### I2: Division by Zero Risk in Scale Factors

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c`
**Line:** 121-122
**Severity:** HIGH

**Description:** In `raw_angle_to_pixel()`, scale factors are used as divisors but could theoretically be zero if corrupted calibration data is loaded.

**Code:**
```c
float uncal_pan = (angles.pan_deg - g_calibration.offset_pan_deg) / g_calibration.scale_pan;
float uncal_tilt = (angles.tilt_deg - g_calibration.offset_tilt_deg) / g_calibration.scale_tilt;
```

**Impact:** Division by zero would cause undefined behavior/crash.

**Suggested Fix:** Add validation when loading calibration:
```c
if (g_calibration.scale_pan <= 0.0001f) g_calibration.scale_pan = 1.0f;
if (g_calibration.scale_tilt <= 0.0001f) g_calibration.scale_tilt = 1.0f;
```

- [x] FIXED: Added safe scale factor calculation with minimum threshold of 0.0001f in raw_angle_to_pixel()

---

### I3: Missing Validation of Camera Parameters

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c`
**Line:** 576-592
**Severity:** MEDIUM

**Description:** `coord_mapper_set_camera_params()` accepts any camera_params_t without validating that width, height, and FOV values are reasonable (non-zero, positive).

**Code:**
```c
coord_status_t coord_mapper_set_camera_params(const camera_params_t *params) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }
    if (params == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }
    COORD_LOCK();
    g_camera = *params;  // No validation!
    COORD_UNLOCK();
    ...
}
```

**Impact:** Zero width/height would cause division by zero in `pixel_to_raw_angle()`.

**Suggested Fix:**
```c
if (params->width == 0 || params->height == 0 ||
    params->fov_h_deg <= 0 || params->fov_v_deg <= 0) {
    return COORD_ERROR_INVALID_PARAM;
}
```

- [x] FIXED: Added validation for width > 0, height > 0, fov_h > 0, fov_v > 0

---

### I4: Test File Claims 120 Tests but Actually Has ~95 Assertions

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_coordinate_mapper.c`
**Line:** N/A (overall)
**Severity:** LOW

**Description:** The story file claims "120 tests passing" but counting TEST_ASSERT macros in the test file shows approximately 95 assertions across 15 test functions. While comprehensive, the claim is inaccurate.

**Impact:** Documentation inconsistency.

**Suggested Fix:** Update story file to reflect actual test count, or add more test cases.

- [x] FIXED: Updated story file claim from "120 tests" to "~95 assertions across 15 test functions"

---

### I5: Story File List Incomplete

**File:** `/Users/jermodelaruelle/Projects/apis/_bmad-output/implementation-artifacts/12-2-coordinate-mapping-pixel-to-servo.md`
**Line:** 58-62
**Severity:** LOW

**Description:** The story's "Dev Agent Record" file list uses relative paths instead of paths from repo root:
- `include/coordinate_mapper.h` should be `apis-edge/include/coordinate_mapper.h`
- `src/laser/coordinate_mapper.c` should be `apis-edge/src/laser/coordinate_mapper.c`

**Impact:** Inconsistent with other story files and makes automated tooling harder.

**Suggested Fix:** Use full paths from repo root.

- [x] FIXED: Changed to full repo-relative paths (apis-edge/...)

---

### I6: No ESP32 Mutex Initialization Check

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/laser/coordinate_mapper.c`
**Line:** 309-317
**Severity:** MEDIUM

**Description:** On ESP32 platform, if `xSemaphoreCreateMutex()` fails, the function returns error. However, subsequent calls to COORD_LOCK/UNLOCK check `g_coord_mutex` for NULL but this is only done on ESP32 - the code path still sets `g_initialized = true` on Pi/Test platforms without mutex verification.

**Code:**
```c
#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_coord_mutex == NULL) {
        g_coord_mutex = xSemaphoreCreateMutex();
        if (g_coord_mutex == NULL) {
            LOG_ERROR("Failed to create coordinate mapper mutex");
            return COORD_ERROR_NO_MEMORY;  // ESP32 only
        }
    }
#endif
```

**Impact:** On Pi/Test, uses static initializer which is fine. No actual bug but code asymmetry is confusing.

**Suggested Fix:** Add comment explaining why Pi/Test platforms don't need runtime mutex creation (static initializer suffices).

- [x] FIXED: Added clarifying comment explaining platform-specific mutex handling

---

### I7: CMakeLists.txt Duplicates servo_controller.c Dependency

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/CMakeLists.txt`
**Line:** 438-465
**Severity:** LOW

**Description:** The test_coordinate_mapper target includes servo_controller.c as a dependency, which is correct. However, this means tests must mock or stub servo_controller functions. The test file doesn't actually test servo integration - it relies on the real servo_controller_clamp_angle function.

**Impact:** Tests are not fully isolated; they depend on servo_controller implementation.

**Suggested Fix:** Either add mock/stub for servo_controller_clamp_angle in tests, or document this as intentional integration testing.

- [x] FIXED: Added documentation comment in test file explaining intentional integration testing

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| HIGH | 1 | 1 |
| MEDIUM | 3 | 3 |
| LOW | 3 | 3 |
| **TOTAL** | **7** | **7** |

---

## Verdict

**PASS**

All issues have been remediated. The implementation is solid, covers all acceptance criteria, and the identified issues have been addressed.

---

## Remediation Log

**Remediated:** 2026-01-26
**Issues Fixed:** 7 of 7

### Changes Applied
- I1: Added clear documentation in coordinate_mapper.c and coordinate_mapper.h about multi-point scale limitation
- I2 (Division by Zero): Added safe scale factor calculation in raw_angle_to_pixel() with 0.0001f threshold
- I3: Added camera parameter validation in coord_mapper_set_camera_params()
- I4: Updated story file test count from "120 tests" to "~95 assertions across 15 test functions"
- I5: Changed story file paths to repo-relative format (apis-edge/...)
- I6: Added clarifying comment about platform-specific mutex handling
- I7: Added documentation comment in test file explaining intentional integration testing

### Remaining Issues
None - all issues resolved.

---

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-26 | Claude Code | Initial adversarial code review |
| 2026-01-26 | Claude Code | Remediation: Fixed all 7 issues |
