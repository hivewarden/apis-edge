# Code Review: Story 10.3 - Size Filtering & Hover Detection

**Reviewer:** BMAD Code Review Agent
**Date:** 2026-01-26
**Story File:** `_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Size-Based Filtering | IMPLEMENTED | `classifier.c:82-100` - `classify_by_size()` filters by min_size (18px), max_size (100px), and hornet range (18-50px) |
| AC2 | Hover Detection | IMPLEMENTED | `classifier.c:112-163` - `analyze_hover()` tracks movement within hover_radius over hover_time_ms |
| AC3 | Transient Classification | IMPLEMENTED | `classifier.c:225-232` - Non-hovering hornet-sized objects get CONFIDENCE_MEDIUM |
| AC4 | Size Calibration Mode | DEFERRED | Story explicitly defers this to future work (acceptable) |

---

## Issues Found

### I1: Missing Test for Tracker Slot Exhaustion Recovery

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_tracker.c`
**Line:** N/A (missing test)
**Severity:** MEDIUM
**Category:** Test Coverage

**Description:**
The tracker has a hard limit of `MAX_TRACKED_OBJECTS=20`. While there's a test that exceeds `MAX_DETECTIONS`, there's no test that:
1. Fills all 20 slots
2. Verifies new detections are rejected gracefully
3. Tests slot recycling when objects disappear

This is important because in a busy scene with many moving objects, the tracker could exhaust slots. The code handles this (`register_object()` returns NULL when no slots), but behavior is untested.

**Suggested Fix:**
Add a test that creates 20+ simultaneous detections, verifies only 20 are tracked, then allows some to disappear and verifies new ones can be tracked.

---

### I2: Potential Integer Overflow in Distance Calculation Comment Mismatch

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/tracker.c`
**Line:** 67-72
**Severity:** LOW
**Category:** Code Quality

**Description:**
The comment mentions preventing overflow with int64_t cast, but the actual overflow risk is minimal at VGA resolution (640x480). The code is correct but the comment overstates the risk:

```c
// Cast to int64_t before multiplication to prevent overflow
// (e.g., 640*640 + 480*480 = 640000 fits uint32_t but intermediate can overflow)
return (uint32_t)((int64_t)dx * dx + (int64_t)dy * dy);
```

The comment says "640*640 + 480*480 = 640000" which is wrong (should be 819200). Also, the cast is to int64_t but dx/dy are ints, so the first multiplication happens as int anyway. The defensive cast is fine, but the comment is misleading.

**Suggested Fix:**
Update comment to: `// Use int64_t to prevent overflow for large distances (max ~819200 at VGA)`

---

### I3: Hover Detection Uses Bounding Box Not True Radius

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/classifier.c`
**Line:** 133-140
**Severity:** LOW
**Category:** Documentation

**Description:**
The hover detection uses Chebyshev distance (max of x/y range) rather than Euclidean radius. The code has a comment explaining this is intentional, but the story and API documentation say "~50px radius" which implies Euclidean distance.

The discrepancy could confuse someone tuning `hover_radius` - they might expect 50px Euclidean but get 50px Chebyshev (which allows ~70px diagonal movement).

**Suggested Fix:**
Either:
1. Update `classifier.h` documentation to clarify: "Max movement range (Chebyshev distance, not Euclidean radius)"
2. Or rename the config field to `hover_max_range` instead of `hover_radius`

---

### I4: No Thread Safety Documentation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/include/tracker.h`
**Line:** 75-100
**Severity:** MEDIUM
**Category:** Documentation

**Description:**
Both tracker and classifier use global state (`g_state`, `g_config`, `g_initialized`) but the API headers don't document thread safety requirements. On ESP32/Pi, if multiple threads call `tracker_update()` or `classifier_classify()` simultaneously, data corruption will occur.

The real-world detection pipeline is likely single-threaded, but this should be documented explicitly.

**Suggested Fix:**
Add to both header files:
```c
/**
 * Thread Safety: NOT thread-safe. All functions must be called from a single thread.
 * The tracker/classifier uses global state that is not protected by mutexes.
 */
```

---

### I5: Test Assertions Don't Verify Track ID Stability in Matching Test

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/tests/test_tracker.c`
**Line:** 106-108
**Severity:** LOW
**Category:** Test Quality

**Description:**
In `test_centroid_matching()`, when verifying that a nearby detection matches an existing track:

```c
TEST_ASSERT(results[0].track_id == track_id, "Should match existing track");
TEST_ASSERT(results[0].is_new == false, "Should not be new");
```

The test correctly verifies the ID matches, but doesn't verify the detection coordinates were updated on the track object. A bug where the track keeps old coordinates wouldn't be caught.

**Suggested Fix:**
Add assertion:
```c
const tracked_object_t *obj = tracker_get_object(track_id);
TEST_ASSERT(obj != NULL, "Track should exist");
TEST_ASSERT(obj->centroid_x == det2.centroid_x, "Track centroid should be updated");
```

---

### I6: Classifier Doesn't Track Age for Non-Hornet Objects Consistently

**File:** `/Users/jermodelaruelle/Projects/apis/apis-edge/src/detection/classifier.c`
**Line:** 211-223
**Severity:** LOW
**Category:** Code Quality

**Description:**
For hornet-sized objects, `track_age_ms` is calculated via `analyze_hover()`. For non-hornet objects, there's a duplicate history-fetching block:

```c
} else {
    // Still get track age for non-hornet objects
    track_position_t history[MAX_TRACK_HISTORY];
    int hist_count = tracker_get_history(tracked[i].track_id, history);
    ...
}
```

This duplicates the timestamp calculation logic from `analyze_hover()`. If one is updated, the other could be forgotten.

**Suggested Fix:**
Extract timestamp duration calculation into a separate helper function `get_track_duration(track_id)` that both paths can call.

---

### I7: Story File List Section Is Missing

**File:** `/Users/jermodelaruelle/Projects/apis/_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`
**Line:** N/A
**Severity:** MEDIUM
**Category:** Documentation

**Description:**
The story file has detailed "Technical Notes" with code snippets but no "Dev Agent Record" or "File List" section documenting what files were actually created/modified. Per BMAD workflow, completed stories should list:
- Files created
- Files modified
- Tests added

The actual files exist:
- `apis-edge/include/tracker.h` (created)
- `apis-edge/include/classifier.h` (created)
- `apis-edge/src/detection/tracker.c` (created)
- `apis-edge/src/detection/classifier.c` (created)
- `apis-edge/tests/test_tracker.c` (created)
- `apis-edge/tests/test_classifier.c` (created)
- `apis-edge/CMakeLists.txt` (modified - added test executables)

**Suggested Fix:**
Add "Dev Agent Record" section with file list to story markdown.

---

### I8: Story Status vs Git Discrepancy

**File:** `/Users/jermodelaruelle/Projects/apis/_bmad-output/implementation-artifacts/10-3-size-filtering-hover-detection.md`
**Line:** 3
**Severity:** LOW
**Category:** Process

**Description:**
Story status is marked `done`, but git shows no changes to the story file or the C implementation files for this story. Either:
1. The files were committed in a previous commit and this is fine
2. The implementation was done but the story file wasn't updated to record completion properly

Checking git log confirms the files exist and were previously committed, so this is just a documentation process issue.

**Suggested Fix:**
Ensure Change Log in story file reflects when implementation was completed.

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 5 |

**Total Issues: 8**

---

## Verdict

**PASS**

The implementation is solid. All acceptance criteria (AC1-AC3) are properly implemented with good test coverage. AC4 was explicitly deferred per story requirements.

Key strengths:
- Comprehensive test suites for both tracker (7 tests) and classifier (8 tests)
- Edge cases handled (timestamp wraparound, NULL parameters, negative counts)
- Clear error handling with status codes and string functions
- Good separation between tracker and classifier modules

The MEDIUM issues are documentation/process concerns rather than functional bugs:
- I1: Missing slot exhaustion test (defensive, not critical path)
- I4: No thread safety documentation (correct for current use)
- I7: Missing file list in story (process, not code)

**Recommendation:** Fix I7 (add file list to story) and consider I4 (thread safety docs) for maintainability. Other issues are nice-to-have improvements.
