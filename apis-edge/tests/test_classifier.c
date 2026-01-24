/**
 * Test program for classifier module.
 *
 * Tests:
 * - Size-based classification
 * - Hover detection
 * - Transient detection
 * - Confidence scoring
 */

#include "classifier.h"
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
 * Test size-based classification.
 *
 * Note: Each test calls cleanup functions at start to ensure clean state,
 * since TEST_ASSERT returns early on failure without cleanup.
 */
static void test_size_classification(void) {
    printf("\n--- Test: Size Classification ---\n");

    // Cleanup any prior state (in case previous test failed mid-execution)
    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[3];
    classified_detection_t classified[3];

    // Too small (bee-sized, 12px)
    detection_t small = {
        .x = 100, .y = 100, .w = 12, .h = 10, .area = 120,
        .centroid_x = 106, .centroid_y = 105
    };

    // Hornet-sized (30px)
    detection_t hornet = {
        .x = 200, .y = 100, .w = 30, .h = 25, .area = 750,
        .centroid_x = 215, .centroid_y = 112
    };

    // Too large (not insect, 120px)
    detection_t large = {
        .x = 300, .y = 100, .w = 120, .h = 100, .area = 12000,
        .centroid_x = 360, .centroid_y = 150
    };

    detection_t dets[3] = {small, hornet, large};

    // Track them
    int tracked_count = tracker_update(dets, 3, 0, tracked);
    TEST_ASSERT(tracked_count == 3, "Should track 3 detections");

    // Classify them
    int classified_count = classifier_classify(tracked, tracked_count, classified);
    TEST_ASSERT(classified_count == 3, "Should classify 3 detections");

    // Check classifications
    printf("Small (w=%d): class=%s (expected TOO_SMALL)\n",
           classified[0].detection.w, classification_str(classified[0].classification));
    TEST_ASSERT(classified[0].classification == CLASS_TOO_SMALL, "Small should be TOO_SMALL");

    printf("Hornet (w=%d): class=%s (expected HORNET)\n",
           classified[1].detection.w, classification_str(classified[1].classification));
    TEST_ASSERT(classified[1].classification == CLASS_HORNET, "Hornet-sized should be HORNET");

    printf("Large (w=%d): class=%s (expected TOO_LARGE)\n",
           classified[2].detection.w, classification_str(classified[2].classification));
    TEST_ASSERT(classified[2].classification == CLASS_TOO_LARGE, "Large should be TOO_LARGE");

    // Check confidence levels
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_LOW, "Too small should have LOW confidence");
    TEST_ASSERT(classified[2].confidence == CONFIDENCE_LOW, "Too large should have LOW confidence");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Size Classification");
}

/**
 * Test hover detection.
 */
static void test_hover_detection(void) {
    printf("\n--- Test: Hover Detection ---\n");

    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);

    // Configure classifier with 1000ms hover time
    classifier_config_t config = classifier_config_defaults();
    config.hover_time_ms = 1000;
    config.hover_radius = 50;
    classifier_init(&config);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Simulate 15 frames of a hovering object (slight jitter, within radius)
    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    uint32_t track_id = 0;

    for (int frame = 0; frame < 15; frame++) {
        // Add slight jitter (within 50px hover radius)
        det.centroid_x = 115 + (frame % 3) * 5 - 5;  // 110-120
        det.centroid_y = 112 + (frame % 2) * 5 - 2;  // 110-117
        det.x = det.centroid_x - 15;
        det.y = det.centroid_y - 12;

        uint32_t timestamp = frame * 100;  // 10 FPS = 100ms per frame

        int tracked_count = tracker_update(&det, 1, timestamp, tracked);
        if (frame == 0) {
            track_id = tracked[0].track_id;
        }

        int classified_count = classifier_classify(tracked, tracked_count, classified);

        if (frame == 14) {  // Last frame (1400ms total)
            printf("Frame %d (t=%ums): track_id=%u, hovering=%d, duration=%ums, confidence=%s\n",
                   frame, timestamp,
                   classified[0].track_id,
                   classified[0].is_hovering,
                   classified[0].track_age_ms,
                   confidence_level_str(classified[0].confidence));
        }
    }

    // After 1400ms with small movement, should be classified as HIGH confidence (hovering)
    TEST_ASSERT(classified[0].is_hovering == true, "Should detect hovering");
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_HIGH, "Should be HIGH confidence");
    TEST_ASSERT(classified[0].classification == CLASS_HORNET, "Should be classified as HORNET");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Hover Detection");
}

/**
 * Test transient (fast-moving) detection.
 */
static void test_transient_detection(void) {
    printf("\n--- Test: Transient Detection ---\n");

    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Simulate 5 frames of a fast-moving hornet-sized object
    detection_t det = {
        .w = 30, .h = 25, .area = 750
    };

    for (int frame = 0; frame < 5; frame++) {
        // Moving fast (>50px per frame)
        det.centroid_x = 100 + frame * 60;  // 100, 160, 220, 280, 340
        det.centroid_y = 100 + frame * 40;  // 100, 140, 180, 220, 260
        det.x = det.centroid_x - 15;
        det.y = det.centroid_y - 12;

        uint32_t timestamp = frame * 100;

        int tracked_count = tracker_update(&det, 1, timestamp, tracked);
        int classified_count = classifier_classify(tracked, tracked_count, classified);
    }

    // Should be MEDIUM confidence (hornet-sized but not hovering)
    printf("Transient: hovering=%d, confidence=%s, classification=%s\n",
           classified[0].is_hovering,
           confidence_level_str(classified[0].confidence),
           classification_str(classified[0].classification));

    TEST_ASSERT(classified[0].is_hovering == false, "Should not be hovering");
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_MEDIUM, "Should be MEDIUM confidence");
    TEST_ASSERT(classified[0].classification == CLASS_HORNET, "Should be classified as HORNET");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Transient Detection");
}

/**
 * Test confidence scoring for different scenarios.
 */
static void test_confidence_scoring(void) {
    printf("\n--- Test: Confidence Scoring ---\n");

    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Test case 1: Too small = LOW
    detection_t small = { .w = 10, .h = 8, .area = 80, .centroid_x = 100, .centroid_y = 100 };
    tracker_update(&small, 1, 0, tracked);
    classifier_classify(tracked, 1, classified);
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_LOW, "Too small should be LOW");
    tracker_reset();

    // Test case 2: Too large = LOW
    detection_t large = { .w = 150, .h = 120, .area = 18000, .centroid_x = 200, .centroid_y = 200 };
    tracker_update(&large, 1, 0, tracked);
    classifier_classify(tracked, 1, classified);
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_LOW, "Too large should be LOW");
    tracker_reset();

    // Test case 3: Hornet-sized, brief = MEDIUM (no time for hover)
    detection_t brief = { .w = 30, .h = 25, .area = 750, .centroid_x = 300, .centroid_y = 300 };
    tracker_update(&brief, 1, 0, tracked);
    classifier_classify(tracked, 1, classified);
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_MEDIUM, "Hornet-sized brief should be MEDIUM");
    tracker_reset();

    // Test case 4: Unknown size range (between min and hornet_min) = LOW
    // Default: min_size=18, hornet_min=18, so this won't trigger
    // Let's test with custom config
    classifier_cleanup();
    classifier_config_t config = classifier_config_defaults();
    config.min_size = 15;
    config.hornet_min = 20;
    classifier_init(&config);

    detection_t unknown = { .w = 17, .h = 16, .area = 272, .centroid_x = 400, .centroid_y = 400 };
    tracker_update(&unknown, 1, 0, tracked);
    classifier_classify(tracked, 1, classified);
    printf("Unknown size (17px): class=%s, confidence=%s\n",
           classification_str(classified[0].classification),
           confidence_level_str(classified[0].confidence));
    TEST_ASSERT(classified[0].classification == CLASS_UNKNOWN, "17px with min=15, hornet_min=20 should be UNKNOWN");
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_LOW, "UNKNOWN should have LOW confidence");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Confidence Scoring");
}

/**
 * Test error handling.
 */
static void test_error_handling(void) {
    printf("\n--- Test: Error Handling ---\n");

    tracker_cleanup();
    classifier_cleanup();

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Test before initialization
    int count = classifier_classify(tracked, 1, classified);
    TEST_ASSERT(count == -1, "Should return -1 before initialization");
    TEST_ASSERT(classifier_is_initialized() == false, "Should not be initialized");

    classifier_init(NULL);
    tracker_init(NULL);

    // Test NULL parameters
    count = classifier_classify(NULL, 1, classified);
    TEST_ASSERT(count == -1, "Should return -1 for NULL tracked");

    count = classifier_classify(tracked, 1, NULL);
    TEST_ASSERT(count == -1, "Should return -1 for NULL results");

    // Test negative count
    count = classifier_classify(tracked, -5, classified);
    TEST_ASSERT(count == 0, "Should return 0 for negative count");

    // Test zero count
    count = classifier_classify(tracked, 0, classified);
    TEST_ASSERT(count == 0, "Should return 0 for zero count");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Error Handling");
}

/**
 * Test string conversion functions.
 */
static void test_string_functions(void) {
    printf("\n--- Test: String Functions ---\n");

    // Note: This test doesn't use tracker/classifier state, but cleanup for consistency
    tracker_cleanup();
    classifier_cleanup();

    // Confidence level strings
    TEST_ASSERT(strcmp(confidence_level_str(CONFIDENCE_LOW), "LOW") == 0, "LOW string");
    TEST_ASSERT(strcmp(confidence_level_str(CONFIDENCE_MEDIUM), "MEDIUM") == 0, "MEDIUM string");
    TEST_ASSERT(strcmp(confidence_level_str(CONFIDENCE_HIGH), "HIGH") == 0, "HIGH string");
    TEST_ASSERT(strcmp(confidence_level_str((confidence_level_t)99), "UNKNOWN") == 0, "Invalid confidence string");

    // Classification strings
    TEST_ASSERT(strcmp(classification_str(CLASS_TOO_SMALL), "TOO_SMALL") == 0, "TOO_SMALL string");
    TEST_ASSERT(strcmp(classification_str(CLASS_TOO_LARGE), "TOO_LARGE") == 0, "TOO_LARGE string");
    TEST_ASSERT(strcmp(classification_str(CLASS_UNKNOWN), "UNKNOWN") == 0, "UNKNOWN string");
    TEST_ASSERT(strcmp(classification_str(CLASS_HORNET), "HORNET") == 0, "HORNET string");
    TEST_ASSERT(strcmp(classification_str((classification_t)99), "INVALID") == 0, "Invalid class string");

    // Status strings
    TEST_ASSERT(strcmp(classifier_status_str(CLASSIFIER_OK), "OK") == 0, "OK status");
    TEST_ASSERT(strcmp(classifier_status_str(CLASSIFIER_ERROR_NOT_INITIALIZED), "Not initialized") == 0, "Not init status");

    TEST_PASS("String Functions");
}

/**
 * Test timestamp wraparound handling.
 *
 * uint32_t timestamps wrap after ~49 days. The classifier must handle
 * the case where newest_ts < oldest_ts due to wraparound.
 */
static void test_timestamp_wraparound(void) {
    printf("\n--- Test: Timestamp Wraparound ---\n");

    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);

    classifier_config_t config = classifier_config_defaults();
    config.hover_time_ms = 1000;
    config.hover_radius = 50;
    classifier_init(&config);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Hornet-sized detection that hovers
    detection_t det = {
        .x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
        .centroid_x = 115, .centroid_y = 112
    };

    // Start near uint32_t max (simulating ~49 days of uptime)
    uint32_t start_ts = UINT32_MAX - 500;  // 500ms before wrap

    // First frame before wraparound
    int tracked_count = tracker_update(&det, 1, start_ts, tracked);
    TEST_ASSERT(tracked_count == 1, "Should track initial detection");

    // Add slight jitter (within hover radius)
    det.centroid_x = 118;
    det.centroid_y = 114;

    // Second frame - timestamp wraps around
    // start_ts + 600 = UINT32_MAX - 500 + 600 = UINT32_MAX + 100 = 99 (wrapped)
    uint32_t wrapped_ts = start_ts + 600;  // This wraps to a small number
    tracked_count = tracker_update(&det, 1, wrapped_ts, tracked);

    // Third frame - more time after wrap
    det.centroid_x = 116;
    det.centroid_y = 113;
    uint32_t later_ts = wrapped_ts + 500;  // ~1100ms total duration
    tracked_count = tracker_update(&det, 1, later_ts, tracked);

    // Classify - should recognize the track duration spans the wrap
    int classified_count = classifier_classify(tracked, tracked_count, classified);
    TEST_ASSERT(classified_count == 1, "Should classify detection");

    printf("Wraparound test: track_age=%u ms, hovering=%d, confidence=%s\n",
           classified[0].track_age_ms,
           classified[0].is_hovering,
           confidence_level_str(classified[0].confidence));

    // Track age should be ~1100ms (spanning the wraparound)
    // Allow some tolerance for calculation
    TEST_ASSERT(classified[0].track_age_ms >= 1000 && classified[0].track_age_ms <= 1200,
               "Track age should account for timestamp wraparound (~1100ms)");

    // Should be hovering (within radius for >1000ms)
    TEST_ASSERT(classified[0].is_hovering == true, "Should detect hovering across wraparound");
    TEST_ASSERT(classified[0].confidence == CONFIDENCE_HIGH, "Should be HIGH confidence");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Timestamp Wraparound");
}

/**
 * Test integrated tracking + classification pipeline.
 */
static void test_full_pipeline(void) {
    printf("\n--- Test: Full Pipeline ---\n");

    tracker_cleanup();
    classifier_cleanup();
    tracker_init(NULL);
    classifier_init(NULL);

    tracked_detection_t tracked[MAX_TRACKED_OBJECTS];
    classified_detection_t classified[MAX_TRACKED_OBJECTS];

    // Simulate a scene with:
    // - Object 1: Hovering hornet (stays in place)
    // - Object 2: Fast bee (moves quickly, too small)
    // - Object 3: Large bird (too big)

    for (int frame = 0; frame < 15; frame++) {
        detection_t dets[3];

        // Hornet hovering at ~200,200
        dets[0] = (detection_t){
            .x = 185 + (frame % 3) * 5,
            .y = 188 + (frame % 2) * 4,
            .w = 30, .h = 25, .area = 750,
            .centroid_x = 200 + (frame % 3) * 5 - 5,
            .centroid_y = 200 + (frame % 2) * 4 - 4
        };

        // Fast bee
        dets[1] = (detection_t){
            .x = 100 + frame * 30,
            .y = 100 + frame * 20,
            .w = 12, .h = 10, .area = 120,
            .centroid_x = 106 + frame * 30,
            .centroid_y = 105 + frame * 20
        };

        // Large bird
        dets[2] = (detection_t){
            .x = 400 - frame * 25,
            .y = 50 + frame * 10,
            .w = 120, .h = 80, .area = 9600,
            .centroid_x = 460 - frame * 25,
            .centroid_y = 90 + frame * 10
        };

        uint32_t timestamp = frame * 100;

        int tracked_count = tracker_update(dets, 3, timestamp, tracked);
        int classified_count = classifier_classify(tracked, tracked_count, classified);

        if (frame == 14) {
            printf("\nFrame %d results:\n", frame);
            for (int i = 0; i < classified_count; i++) {
                printf("  Object %d: class=%s, conf=%s, hovering=%d, size=%dx%d\n",
                       i,
                       classification_str(classified[i].classification),
                       confidence_level_str(classified[i].confidence),
                       classified[i].is_hovering,
                       classified[i].detection.w, classified[i].detection.h);
            }
        }
    }

    // Find and verify each object type
    bool found_high_conf_hornet = false;
    bool found_low_conf_small = false;
    bool found_low_conf_large = false;

    for (int i = 0; i < 3; i++) {
        if (classified[i].classification == CLASS_HORNET &&
            classified[i].confidence == CONFIDENCE_HIGH &&
            classified[i].is_hovering) {
            found_high_conf_hornet = true;
        }
        if (classified[i].classification == CLASS_TOO_SMALL &&
            classified[i].confidence == CONFIDENCE_LOW) {
            found_low_conf_small = true;
        }
        if (classified[i].classification == CLASS_TOO_LARGE &&
            classified[i].confidence == CONFIDENCE_LOW) {
            found_low_conf_large = true;
        }
    }

    TEST_ASSERT(found_high_conf_hornet, "Should find high-confidence hovering hornet");
    TEST_ASSERT(found_low_conf_small, "Should find low-confidence small object");
    TEST_ASSERT(found_low_conf_large, "Should find low-confidence large object");

    tracker_cleanup();
    classifier_cleanup();
    TEST_PASS("Full Pipeline");
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    printf("=== Classifier Module Tests ===\n");

    test_size_classification();
    test_hover_detection();
    test_transient_detection();
    test_confidence_scoring();
    test_error_handling();
    test_string_functions();
    test_timestamp_wraparound();
    test_full_pipeline();

    printf("\n=== Test Summary ===\n");
    printf("Passed: %d\n", tests_passed);
    printf("Failed: %d\n", tests_failed);

    return tests_failed > 0 ? 1 : 0;
}
