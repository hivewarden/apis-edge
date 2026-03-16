# Code Review: Story 10.3 - Size Filtering & Hover Detection

**Reviewer:** Claude Code Review Agent
**Date:** 2026-01-26
**Story File:** `_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`
**Status:** Changes Requested

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 3     |
| MEDIUM   | 4     |
| LOW      | 2     |

**Verdict:** The core implementation is solid with well-structured C code, proper memory management, and comprehensive tests. However, there are missing documentation requirements, a partially unimplemented acceptance criterion, and several code quality issues that need addressing.

---

## HIGH SEVERITY ISSUES

### Issue 1: Missing Dev Agent Record Section
**File:** `_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`
**Type:** Documentation Gap

The story file is missing the standard "Dev Agent Record" section that should include:
- **File List:** Complete list of files created/modified
- **Change Log:** Commit hashes and descriptions

The story shows files to create in "Files to Create" section but has no documentation of what was actually done, when commits were made, or verification that files exist.

**Required Action:**
Add a "Dev Agent Record" section at the end of the story file with:
```markdown
## Dev Agent Record

### File List
| File | Action | Description |
|------|--------|-------------|
| apis-edge/include/tracker.h | Created | Centroid tracker API |
| apis-edge/include/classifier.h | Created | Hornet classifier API |
| apis-edge/src/detection/tracker.c | Created | Tracker implementation |
| apis-edge/src/detection/classifier.c | Created | Classifier implementation |
| apis-edge/tests/test_tracker.c | Created | Tracker unit tests |
| apis-edge/tests/test_classifier.c | Created | Classifier unit tests |
| apis-edge/CMakeLists.txt | Modified | Added build targets |

### Change Log
| Date | Author | Commit | Description |
|------|--------|--------|-------------|
| ... | ... | ... | ... |
```

---

### Issue 2: AC3 Transient Classification Not Fully Implemented
**File:** `apis-edge/src/detection/classifier.c`
**Lines:** N/A (missing)
**Type:** Acceptance Criteria Gap

AC3 states: "it's logged as 'transient' (lower confidence) **And still triggers alert but not full laser activation**"

The classifier does NOT:
1. Have an explicit `CLASS_TRANSIENT` or similar classification type
2. Emit any alert signal for transient detections
3. Differentiate between "no laser" and "brief pulse" activation levels

The current implementation only sets `confidence = CONFIDENCE_MEDIUM` for non-hovering hornet-sized objects, which is insufficient to meet AC3.

**Required Action:**
Either:
A) Add explicit transient handling in classifier output (e.g., `is_transient` boolean field in `classified_detection_t`)
B) Update AC3 to clarify that the alert/laser behavior is handled by the targeting system (Story 10.4 or later), and add a note to the story that transient classification is implicitly `CLASS_HORNET + CONFIDENCE_MEDIUM + !is_hovering`

---

### Issue 3: Test Executables Not Building in Test Platform Mode
**File:** `apis-edge/CMakeLists.txt`
**Lines:** 105-259
**Type:** Build Configuration Bug

The `test_tracker` and `test_classifier` executables are wrapped inside:
```cmake
if(NOT APIS_PLATFORM STREQUAL "test")
    ...
endif()
```

This means these tests CANNOT be built on macOS during local development since macOS defaults to `APIS_PLATFORM=test`. This contradicts the goal of having tests that "work on any platform."

Both tests only depend on:
- `src/detection/tracker.c` / `classifier.c`
- `src/config.c`
- `src/log.c`

None of these require hardware dependencies.

**Required Action:**
Move `test_tracker` and `test_classifier` outside the `if(NOT APIS_PLATFORM STREQUAL "test")` block, similar to how `test_config_manager`, `test_http_server`, etc. are handled.

---

## MEDIUM SEVERITY ISSUES

### Issue 4: Greedy Algorithm Suboptimal for Multi-Object Tracking
**File:** `apis-edge/src/detection/tracker.c`
**Lines:** 195-259
**Type:** Algorithm Limitation

The comment at line 6 mentions "Hungarian algorithm approximation" but the actual implementation uses a greedy nearest-neighbor approach. For scenes with multiple crossing hornets, this can produce incorrect track assignments.

Example: Two tracks A and B, two detections X and Y. If A is closest to X, and B is also closest to X (but X is closest to A), the greedy algorithm assigns A->X first, leaving B->Y even if the optimal assignment would be A->Y, B->X.

**Impact:** In busy scenes with multiple hornets, tracks may be incorrectly swapped, causing hover detection to reset prematurely.

**Required Action:**
Either:
A) Implement proper Hungarian algorithm (optimal but more complex)
B) Add a comment explaining the limitation and documenting that greedy is acceptable for typical hornet density (1-3 at a time)
C) Add a test case that demonstrates the limitation and acceptable behavior

---

### Issue 5: hover_duration_ms Only Set When Hovering
**File:** `apis-edge/src/detection/classifier.c`
**Lines:** 207-209
**Type:** Misleading Field Usage

```c
if (result->is_hovering) {
    result->hover_duration_ms = result->track_age_ms;
}
```

When `is_hovering` is false, `hover_duration_ms` remains 0, but logically a non-hovering object could have been "almost hovering" (e.g., hovering for 900ms before moving). The field name suggests it tracks how long something has been hovering, but it only gets set when the threshold is crossed.

**Impact:** Callers cannot determine "how close to hovering" an object is for debugging or UI display.

**Required Action:**
Consider renaming to `sustained_duration_ms` or documenting that the field is only meaningful when `is_hovering == true`. Alternatively, always populate the field with the actual stationary duration (which would require additional tracking logic).

---

### Issue 6: No Boundary Validation for Centroid Coordinates
**File:** `apis-edge/src/detection/tracker.c`
**Lines:** 84-94
**Type:** Input Validation Gap

The `register_object()` and `update_object()` functions directly copy `det->centroid_x` and `det->centroid_y` without validating they're within frame bounds (0-639 for x, 0-479 for y at VGA resolution).

If motion detection produces invalid centroids (e.g., due to a bug or overflow), the tracker will happily store and process them, potentially causing issues in downstream systems.

**Required Action:**
Add boundary checks or document that callers are responsible for validation. Consider adding:
```c
if (det->centroid_x > 639 || det->centroid_y > 479) {
    LOG_WARN("Centroid out of bounds: (%u,%u)", det->centroid_x, det->centroid_y);
}
```

---

### Issue 7: Story Status "done" But Review Not Performed
**File:** `_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`
**Line:** 3
**Type:** Process Violation

Story status is set to `done` but there's no "Senior Developer Review" section in the file, indicating this code was marked complete without a code review.

**Required Action:**
Status should remain `in-progress` until code review issues are addressed. Update status field to reflect this.

---

## LOW SEVERITY ISSUES

### Issue 8: Inconsistent Return Type Naming
**File:** `apis-edge/include/tracker.h`
**Lines:** 81 vs 95
**Type:** API Inconsistency

`tracker_init()` returns `tracker_status_t` but `tracker_update()` returns `int`. This inconsistency makes error handling confusing.

**Required Action:**
Consider either:
- Making `tracker_update()` return `tracker_status_t` with count available via output parameter
- Adding a comment explaining why the return type differs

---

### Issue 9: Magic Number in Test Assertion
**File:** `apis-edge/tests/test_tracker.c`
**Line:** 170
**Type:** Test Maintainability

```c
TEST_ASSERT(history[hist_count-1].x == 115 + 18, "Last position x should be 133");
```

The `18` is calculated as `(10-1) * 2` from the loop but isn't obvious. If the loop count changes, this assertion silently becomes incorrect.

**Required Action:**
Use a named constant or calculate expected value from loop parameters:
```c
int expected_x = 115 + (10 - 1) * 2;  // 115 + movement over 9 updates
TEST_ASSERT(history[hist_count-1].x == expected_x, "Last position x incorrect");
```

---

## Positive Observations

1. **Excellent error handling:** Both tracker and classifier validate inputs and return appropriate error codes.

2. **Timestamp wraparound handling:** The classifier correctly handles uint32_t timestamp overflow (~49 days).

3. **Ring buffer implementation:** Clean and correct ring buffer for position history.

4. **Comprehensive tests:** Both test files cover normal operation, edge cases, and error conditions.

5. **Good documentation:** Code comments explain non-obvious decisions (e.g., Chebyshev distance rationale).

6. **Static assertions:** Compile-time checks prevent configuration errors.

---

## Required Actions Summary

| Issue | Severity | Action Required |
|-------|----------|-----------------|
| 1 | HIGH | Add Dev Agent Record section to story file |
| 2 | HIGH | Clarify or implement AC3 transient handling |
| 3 | HIGH | Fix CMakeLists.txt to build tests on all platforms |
| 4 | MEDIUM | Document greedy algorithm limitation |
| 5 | MEDIUM | Document hover_duration_ms semantics |
| 6 | MEDIUM | Add centroid boundary validation |
| 7 | MEDIUM | Update story status to in-progress |
| 8 | LOW | Document return type inconsistency |
| 9 | LOW | Fix magic number in test |

---

**Review Outcome:** CHANGES REQUESTED

The implementation is fundamentally sound but has documentation gaps and one partially unimplemented acceptance criterion. Address HIGH and MEDIUM issues before marking the story as complete.
