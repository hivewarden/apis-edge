/**
 * Test program for centroid tracker module.
 *
 * Tests:
 * - Track registration and deregistration
 * - Centroid-based matching
 * - Position history
 * - Disappeared frame handling
 */

#include "tracker.h"
#include "detection.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT(cond, msg) do { \
    if (!(cond)) { \
        printf("FAIL: %s (line %d)\n", msg, __LINE__); \
        tests_failed++; \
        return; \
    } \
} while(0)

#define TEST_PASS(name) do { \
    printf("PASS: %s\n", name); \
    tests_passed++; \
} while(0)

/**
 * Test basic track registration.
 *
 * Note: Each test calls tracker_cleanup() at start to ensure clean state,
 * since TEST_ASSERT returns early on failure without cleanup.
 */
static void test_registration(void) {
    printf("\n--- Test: Track Registration ---\n");

    // Cleanup any prior state (in case previous test failed mid-execution)
    tracker_cleanup();
    tracker_init(NULL);
    TEST_ASSERT(tracker_is_initialized(), "Tracker should be initialized");

    tracked_detection_t results[MAX_TRACKED_OBJECTS];

    // Create a detection
    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    // First update - should create new track
    int count = tracker_update(&det, 1, 0, results);
    TEST_ASSERT(count == 1, "Should have 1 tracked detection");
    TEST_ASSERT(results[0].is_new == true, "Track should be new");
    TEST_ASSERT(results[0].track_id > 0, "Track ID should be assigned");
    TEST_ASSERT(tracker_get_active_count() == 1, "Should have 1 active track");

    uint32_t first_id = results[0].track_id;

    // Second update with same position - should match existing track
    count = tracker_update(&det, 1, 100, results);
    TEST_ASSERT(count == 1, "Should still have 1 tracked detection");
    TEST_ASSERT(results[0].is_new == false, "Track should not be new");
    TEST_ASSERT(results[0].track_id == first_id, "Track ID should be same");

    tracker_cleanup();
    TEST_PASS("Track Registration");
}

/**
 * Test centroid matching across frames.
 */
static void test_centroid_matching(void) {
    printf("\n--- Test: Centroid Matching ---\n");

    tracker_cleanup();
    tracker_init(NULL);
    tracked_detection_t results[MAX_TRACKED_OBJECTS];

    // Create initial detection
    detection_t det1 = {
        .x = 100, .y = 100, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    int count = tracker_update(&det1, 1, 0, results);
    uint32_t track_id = results[0].track_id;

    // Move detection slightly (within max_distance=100)
    detection_t det2 = {
        .x = 120, .y = 110, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 135, .centroid_y = 122  // Moved ~22 pixels
    };

    count = tracker_update(&det2, 1, 100, results);
    TEST_ASSERT(count == 1, "Should have 1 tracked detection");
    TEST_ASSERT(results[0].track_id == track_id, "Should match existing track");
    TEST_ASSERT(results[0].is_new == false, "Should not be new");

    // Move detection far away (beyond max_distance=100)
    detection_t det3 = {
        .x = 400, .y = 300, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 415, .centroid_y = 312  // Moved ~300 pixels
    };

    count = tracker_update(&det3, 1, 200, results);
    TEST_ASSERT(count == 1, "Should have 1 tracked detection");
    TEST_ASSERT(results[0].track_id != track_id, "Should be new track");
    TEST_ASSERT(results[0].is_new == true, "Should be new");
    TEST_ASSERT(tracker_get_active_count() == 2, "Should have 2 active tracks");

    tracker_cleanup();
    TEST_PASS("Centroid Matching");
}

/**
 * Test position history tracking.
 */
static void test_position_history(void) {
    printf("\n--- Test: Position History ---\n");

    tracker_cleanup();
    tracker_init(NULL);
    tracked_detection_t results[MAX_TRACKED_OBJECTS];
    track_position_t history[MAX_TRACK_HISTORY];

    // Create detection and track it for several frames
    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    tracker_update(&det, 1, 0, results);
    uint32_t track_id = results[0].track_id;

    // Update position over several frames
    for (int i = 1; i < 10; i++) {
        det.centroid_x = 115 + i * 2;  // Move slightly each frame
        det.centroid_y = 112 + i;
        det.x = det.centroid_x - 15;
        det.y = det.centroid_y - 12;

        tracker_update(&det, 1, i * 100, results);
    }

    // Get history
    int hist_count = tracker_get_history(track_id, history);
    TEST_ASSERT(hist_count == 10, "Should have 10 history entries");

    // Verify chronological order (oldest to newest)
    for (int i = 1; i < hist_count; i++) {
        TEST_ASSERT(history[i].timestamp_ms > history[i-1].timestamp_ms,
                   "History should be in chronological order");
    }

    // Verify first and last positions
    TEST_ASSERT(history[0].x == 115, "First position x should be 115");
    TEST_ASSERT(history[hist_count-1].x == 115 + 18, "Last position x should be 133");

    tracker_cleanup();
    TEST_PASS("Position History");
}

/**
 * Test disappearing track handling.
 */
static void test_disappeared_tracks(void) {
    printf("\n--- Test: Disappeared Tracks ---\n");

    tracker_cleanup();
    tracker_config_t config = tracker_config_defaults();
    config.max_disappeared = 5;  // Short for testing
    tracker_init(&config);

    tracked_detection_t results[MAX_TRACKED_OBJECTS];

    // Create a detection
    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    tracker_update(&det, 1, 0, results);
    TEST_ASSERT(tracker_get_active_count() == 1, "Should have 1 active track");

    // Update with no detections for 5 frames (max_disappeared)
    for (int i = 0; i < 5; i++) {
        tracker_update(NULL, 0, (i + 1) * 100, results);
    }
    TEST_ASSERT(tracker_get_active_count() == 1, "Track should still be active after 5 frames");

    // One more frame - should deregister
    tracker_update(NULL, 0, 600, results);
    TEST_ASSERT(tracker_get_active_count() == 0, "Track should be deregistered after 6 frames");

    tracker_cleanup();
    TEST_PASS("Disappeared Tracks");
}

/**
 * Test multiple simultaneous tracks.
 */
static void test_multiple_tracks(void) {
    printf("\n--- Test: Multiple Tracks ---\n");

    tracker_cleanup();
    tracker_init(NULL);
    tracked_detection_t results[MAX_TRACKED_OBJECTS];

    // Create 3 detections at different positions
    detection_t dets[3] = {
        { .x = 100, .y = 100, .w = 30, .h = 25, .area = 750, .centroid_x = 115, .centroid_y = 112 },
        { .x = 300, .y = 200, .w = 35, .h = 30, .area = 1050, .centroid_x = 317, .centroid_y = 215 },
        { .x = 500, .y = 100, .w = 28, .h = 22, .area = 616, .centroid_x = 514, .centroid_y = 111 },
    };

    int count = tracker_update(dets, 3, 0, results);
    TEST_ASSERT(count == 3, "Should track 3 detections");
    TEST_ASSERT(tracker_get_active_count() == 3, "Should have 3 active tracks");

    // All should be new
    for (int i = 0; i < count; i++) {
        TEST_ASSERT(results[i].is_new == true, "All tracks should be new");
    }

    // Move all detections slightly
    dets[0].centroid_x += 10; dets[0].centroid_y += 5;
    dets[1].centroid_x += 15; dets[1].centroid_y += 10;
    dets[2].centroid_x += 5; dets[2].centroid_y += 8;

    uint32_t ids[3] = { results[0].track_id, results[1].track_id, results[2].track_id };

    count = tracker_update(dets, 3, 100, results);
    TEST_ASSERT(count == 3, "Should still track 3 detections");

    // All should match existing tracks (not new)
    for (int i = 0; i < count; i++) {
        TEST_ASSERT(results[i].is_new == false, "Tracks should not be new");
        // Track IDs should be preserved (though order may differ)
        bool found = false;
        for (int j = 0; j < 3; j++) {
            if (results[i].track_id == ids[j]) found = true;
        }
        TEST_ASSERT(found, "Track ID should match one of original IDs");
    }

    tracker_cleanup();
    TEST_PASS("Multiple Tracks");
}

/**
 * Test error handling for edge cases.
 */
static void test_error_handling(void) {
    printf("\n--- Test: Error Handling ---\n");

    tracker_cleanup();
    tracked_detection_t results[MAX_TRACKED_OBJECTS];

    // Test before initialization
    int count = tracker_update(NULL, 0, 0, results);
    TEST_ASSERT(count == -1, "Should return -1 before initialization");
    TEST_ASSERT(tracker_is_initialized() == false, "Should not be initialized");

    tracker_init(NULL);

    // Test NULL results
    count = tracker_update(NULL, 0, 0, NULL);
    TEST_ASSERT(count == -1, "Should return -1 for NULL results");

    // Test negative count (should be clamped to 0)
    detection_t det = { .centroid_x = 100, .centroid_y = 100 };
    count = tracker_update(&det, -5, 0, results);
    TEST_ASSERT(count == 0, "Should handle negative count");

    // Test exceeding MAX_DETECTIONS
    detection_t many_dets[MAX_DETECTIONS + 10];
    memset(many_dets, 0, sizeof(many_dets));
    for (int i = 0; i < MAX_DETECTIONS + 10; i++) {
        many_dets[i].centroid_x = i * 100;
        many_dets[i].centroid_y = i * 50;
    }
    count = tracker_update(many_dets, MAX_DETECTIONS + 10, 0, results);
    TEST_ASSERT(count <= MAX_TRACKED_OBJECTS, "Should not exceed MAX_TRACKED_OBJECTS");

    // Test get_history for non-existent track
    track_position_t history[MAX_TRACK_HISTORY];
    int hist_count = tracker_get_history(99999, history);
    TEST_ASSERT(hist_count == 0, "Should return 0 for non-existent track");

    // Test get_object for non-existent track
    const tracked_object_t *obj = tracker_get_object(99999);
    TEST_ASSERT(obj == NULL, "Should return NULL for non-existent track");

    tracker_cleanup();
    TEST_PASS("Error Handling");
}

/**
 * Test history ring buffer wraparound.
 */
static void test_history_wraparound(void) {
    printf("\n--- Test: History Ring Buffer Wraparound ---\n");

    tracker_cleanup();
    tracker_init(NULL);
    tracked_detection_t results[MAX_TRACKED_OBJECTS];
    track_position_t history[MAX_TRACK_HISTORY];

    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25,
        .area = 750,
        .centroid_x = 100, .centroid_y = 100
    };

    tracker_update(&det, 1, 0, results);
    uint32_t track_id = results[0].track_id;

    // Update for more than MAX_TRACK_HISTORY frames
    for (int i = 1; i < MAX_TRACK_HISTORY + 15; i++) {
        det.centroid_x = 100 + i;
        det.centroid_y = 100 + i;
        tracker_update(&det, 1, i * 100, results);
    }

    // Get history - should have MAX_TRACK_HISTORY entries
    int hist_count = tracker_get_history(track_id, history);
    TEST_ASSERT(hist_count == MAX_TRACK_HISTORY, "History should be capped at MAX_TRACK_HISTORY");

    // History should be in chronological order
    for (int i = 1; i < hist_count; i++) {
        TEST_ASSERT(history[i].timestamp_ms > history[i-1].timestamp_ms,
                   "History should be chronological after wraparound");
    }

    // Oldest entry should be from around frame 15 (we added 15 extra)
    // Frame 15 timestamp = 15 * 100 = 1500
    TEST_ASSERT(history[0].timestamp_ms >= 1500 && history[0].timestamp_ms <= 1600,
               "Oldest entry should be from around frame 15");

    tracker_cleanup();
    TEST_PASS("History Ring Buffer Wraparound");
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    printf("=== Tracker Module Tests ===\n");

    test_registration();
    test_centroid_matching();
    test_position_history();
    test_disappeared_tracks();
    test_multiple_tracks();
    test_error_handling();
    test_history_wraparound();

    printf("\n=== Test Summary ===\n");
    printf("Passed: %d\n", tests_passed);
    printf("Failed: %d\n", tests_failed);

    return tests_failed > 0 ? 1 : 0;
}
