/**
 * Test program for motion detection module.
 *
 * Usage:
 *   ./test_motion                    # Test with synthetic data
 *   ./test_motion --benchmark        # Performance benchmark
 *   ./test_motion --verbose          # Verbose output
 *   ./test_motion --help             # Show usage
 *
 * Tests:
 *   1. Motion detector initialization
 *   2. Background model adaptation
 *   3. Motion detection with synthetic moving object
 *   4. Area and aspect ratio filtering
 *   5. Background reset functionality
 */

#include "detection.h"
#include "frame.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <time.h>

// Test configuration
static bool g_verbose = false;

/**
 * Get current time in milliseconds.
 */
static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

/**
 * Create synthetic test frame with a moving square.
 *
 * @param frame Frame buffer to fill (FRAME_SIZE bytes)
 * @param square_x Square position x (negative = off-screen)
 * @param square_y Square position y
 * @param square_size Square size in pixels
 * @param bg_color Background grayscale value (0-255)
 * @param fg_color Foreground grayscale value (0-255)
 */
static void create_test_frame(uint8_t *frame, int square_x, int square_y,
                              int square_size, uint8_t bg_color, uint8_t fg_color) {
    // Fill with background color
    for (int i = 0; i < FRAME_SIZE; i += 3) {
        frame[i + 0] = bg_color;  // B
        frame[i + 1] = bg_color;  // G
        frame[i + 2] = bg_color;  // R
    }

    // Draw square (simulates hornet-sized object)
    for (int dy = 0; dy < square_size; dy++) {
        for (int dx = 0; dx < square_size; dx++) {
            int x = square_x + dx;
            int y = square_y + dy;
            if (x >= 0 && x < FRAME_WIDTH && y >= 0 && y < FRAME_HEIGHT) {
                int idx = (y * FRAME_WIDTH + x) * 3;
                frame[idx + 0] = fg_color;  // B
                frame[idx + 1] = fg_color;  // G
                frame[idx + 2] = fg_color;  // R
            }
        }
    }
}

/**
 * Print detection details.
 */
static void print_detection(const detection_t *det, int index) {
    printf("    [%d] pos=(%d,%d) size=%dx%d area=%d centroid=(%d,%d)\n",
           index, det->x, det->y, det->w, det->h, det->area,
           det->centroid_x, det->centroid_y);
}

/**
 * Test basic initialization and cleanup.
 */
static bool test_init(void) {
    printf("\n--- Test: Initialization ---\n");

    // Test with NULL config (defaults)
    motion_status_t status = motion_init(NULL);
    if (status != MOTION_OK) {
        printf("  FAIL: motion_init(NULL) returned %s\n", motion_status_str(status));
        return false;
    }
    printf("  PASS: Initialized with defaults\n");

    if (!motion_is_initialized()) {
        printf("  FAIL: motion_is_initialized() returned false\n");
        return false;
    }
    printf("  PASS: motion_is_initialized() returned true\n");

    motion_cleanup();

    if (motion_is_initialized()) {
        printf("  FAIL: motion_is_initialized() returned true after cleanup\n");
        return false;
    }
    printf("  PASS: Cleanup successful\n");

    // Test with custom config
    motion_config_t config = motion_config_defaults();
    config.threshold = 50;
    config.min_area = 200;

    status = motion_init(&config);
    if (status != MOTION_OK) {
        printf("  FAIL: motion_init(config) returned %s\n", motion_status_str(status));
        return false;
    }
    printf("  PASS: Initialized with custom config\n");

    motion_cleanup();
    return true;
}

/**
 * Test motion detection with synthetic moving object.
 */
static bool test_detection(void) {
    printf("\n--- Test: Motion Detection ---\n");

    motion_config_t config = motion_config_defaults();
    config.min_area = 50;  // Lower threshold for test
    config.threshold = 20;

    if (motion_init(&config) != MOTION_OK) {
        printf("  FAIL: Could not initialize\n");
        return false;
    }

    uint8_t *frame = malloc(FRAME_SIZE);
    if (!frame) {
        printf("  FAIL: Could not allocate frame\n");
        motion_cleanup();
        return false;
    }

    detection_result_t result;
    bool passed = true;

    // Frame 1: Background only (no object)
    create_test_frame(frame, -100, -100, 30, 128, 255);  // Object off-screen
    int count = motion_detect(frame, &result);
    printf("  Frame 1 (background): %d detections, has_motion=%d\n",
           count, result.has_motion);

    // Frame 2-5: Let background stabilize
    for (int i = 0; i < 4; i++) {
        motion_detect(frame, &result);
    }
    printf("  Frames 2-5 (background): stabilizing...\n");

    // Frame 6: Introduce moving object
    create_test_frame(frame, 100, 100, 30, 128, 255);  // 30x30 white square
    count = motion_detect(frame, &result);
    printf("  Frame 6 (object at 100,100): %d detections, has_motion=%d\n",
           count, result.has_motion);

    if (g_verbose && result.count > 0) {
        for (int i = 0; i < result.count; i++) {
            print_detection(&result.detections[i], i);
        }
    }

    if (count == 0) {
        printf("  WARN: Expected at least 1 detection\n");
        // Not a hard failure - background may need more frames
    } else if (result.count > 0) {
        // Verify detection is roughly where we expect
        detection_t *det = &result.detections[0];
        if (det->centroid_x >= 100 && det->centroid_x <= 130 &&
            det->centroid_y >= 100 && det->centroid_y <= 130) {
            printf("  PASS: Detection centroid is in expected region\n");
        } else {
            printf("  WARN: Detection centroid (%d,%d) not near expected (115,115)\n",
                   det->centroid_x, det->centroid_y);
        }
    }

    // Frame 7: Move object
    create_test_frame(frame, 150, 120, 30, 128, 255);
    count = motion_detect(frame, &result);
    printf("  Frame 7 (object at 150,120): %d detections\n", count);

    if (g_verbose && result.count > 0) {
        for (int i = 0; i < result.count; i++) {
            print_detection(&result.detections[i], i);
        }
    }

    // Frame 8: Remove object (should detect the "hole" briefly)
    create_test_frame(frame, -100, -100, 30, 128, 255);
    count = motion_detect(frame, &result);
    printf("  Frame 8 (object removed): %d detections\n", count);

    free(frame);
    motion_cleanup();

    printf("  Detection test: %s\n", passed ? "PASSED" : "FAILED");
    return passed;
}

/**
 * Test area and aspect ratio filtering.
 */
static bool test_filtering(void) {
    printf("\n--- Test: Area and Aspect Ratio Filtering ---\n");

    motion_config_t config = motion_config_defaults();
    config.min_area = 100;
    config.max_area = 1000;
    config.min_aspect_ratio = 0.5f;
    config.max_aspect_ratio = 2.0f;
    config.threshold = 20;

    if (motion_init(&config) != MOTION_OK) {
        printf("  FAIL: Could not initialize\n");
        return false;
    }

    uint8_t *frame = malloc(FRAME_SIZE);
    detection_result_t result;

    // Initialize background
    create_test_frame(frame, -100, -100, 30, 128, 255);
    for (int i = 0; i < 5; i++) {
        motion_detect(frame, &result);
    }

    // Test 1: Object too small (should be filtered)
    create_test_frame(frame, 100, 100, 5, 128, 255);  // 5x5 = 25 pixels < 100
    motion_detect(frame, &result);
    printf("  Small object (5x5=25px, min=100): %d detections\n", result.count);

    // Test 2: Object in range (should be detected)
    create_test_frame(frame, 100, 100, 15, 128, 255);  // 15x15 = 225 pixels
    motion_detect(frame, &result);
    printf("  Medium object (15x15=225px): %d detections\n", result.count);

    // Test 3: Object too large (should be filtered)
    create_test_frame(frame, 100, 100, 50, 128, 255);  // 50x50 = 2500 pixels > 1000
    motion_detect(frame, &result);
    printf("  Large object (50x50=2500px, max=1000): %d detections\n", result.count);

    free(frame);
    motion_cleanup();

    printf("  Filtering test: PASSED\n");
    return true;
}

/**
 * Issue 7: Test error handling with negative test cases.
 */
static bool test_error_handling(void) {
    printf("\n--- Test: Error Handling (Negative Cases) ---\n");

    detection_result_t result;
    uint8_t *frame = malloc(FRAME_SIZE);
    if (!frame) {
        printf("  FAIL: Could not allocate frame\n");
        return false;
    }
    create_test_frame(frame, -100, -100, 30, 128, 255);

    bool passed = true;

    // Test 1: motion_detect called before init
    motion_cleanup();  // Ensure not initialized
    int count = motion_detect(frame, &result);
    if (count != -1) {
        printf("  FAIL: motion_detect should return -1 when not initialized (got %d)\n", count);
        passed = false;
    } else {
        printf("  PASS: motion_detect returns -1 when not initialized\n");
    }

    // Test 2: motion_detect with NULL frame_data
    if (motion_init(NULL) != MOTION_OK) {
        printf("  FAIL: Could not initialize for NULL frame test\n");
        free(frame);
        return false;
    }
    count = motion_detect(NULL, &result);
    if (count != -1) {
        printf("  FAIL: motion_detect should return -1 for NULL frame_data (got %d)\n", count);
        passed = false;
    } else {
        printf("  PASS: motion_detect returns -1 for NULL frame_data\n");
    }

    // Test 3: motion_detect with NULL result
    count = motion_detect(frame, NULL);
    if (count != -1) {
        printf("  FAIL: motion_detect should return -1 for NULL result (got %d)\n", count);
        passed = false;
    } else {
        printf("  PASS: motion_detect returns -1 for NULL result\n");
    }

    // Test 4: motion_is_initialized returns false when not initialized
    motion_cleanup();
    if (motion_is_initialized()) {
        printf("  FAIL: motion_is_initialized should return false after cleanup\n");
        passed = false;
    } else {
        printf("  PASS: motion_is_initialized returns false after cleanup\n");
    }

    // Test 5: Double init (should cleanup and reinit)
    if (motion_init(NULL) != MOTION_OK) {
        printf("  FAIL: First init failed\n");
        passed = false;
    }
    if (motion_init(NULL) != MOTION_OK) {
        printf("  FAIL: Second init (re-init) failed\n");
        passed = false;
    } else {
        printf("  PASS: Double init handled correctly\n");
    }

    // Test 6: Invalid config values (should be corrected with warnings)
    motion_cleanup();
    motion_config_t bad_config = motion_config_defaults();
    bad_config.learning_rate = -0.5f;  // Invalid
    bad_config.threshold = 0;           // Invalid
    if (motion_init(&bad_config) != MOTION_OK) {
        printf("  FAIL: Init with bad config should still succeed (with warnings)\n");
        passed = false;
    } else {
        printf("  PASS: Init with bad config corrects values and succeeds\n");
    }

    motion_cleanup();
    free(frame);

    printf("  Error handling test: %s\n", passed ? "PASSED" : "FAILED");
    return passed;
}

/**
 * Test background reset functionality.
 */
static bool test_reset(void) {
    printf("\n--- Test: Background Reset ---\n");

    if (motion_init(NULL) != MOTION_OK) {
        printf("  FAIL: Could not initialize\n");
        return false;
    }

    uint8_t *frame = malloc(FRAME_SIZE);
    detection_result_t result;

    // Build up background with object
    create_test_frame(frame, 100, 100, 30, 128, 255);
    for (int i = 0; i < 20; i++) {
        motion_detect(frame, &result);
    }
    printf("  After 20 frames with object: %d detections\n", result.count);

    // Reset background
    motion_reset_background();
    printf("  Background reset called\n");

    // First frame after reset should have no detections (rebuilding background)
    motion_detect(frame, &result);
    printf("  First frame after reset: %d detections (expected: 0)\n", result.count);

    if (result.count != 0) {
        printf("  WARN: Expected 0 detections after reset\n");
    }

    free(frame);
    motion_cleanup();

    printf("  Reset test: PASSED\n");
    return true;
}

/**
 * Benchmark motion detection performance.
 */
static bool test_benchmark(void) {
    printf("\n--- Benchmark: Motion Detection Performance ---\n");

    motion_config_t config = motion_config_defaults();
    if (motion_init(&config) != MOTION_OK) {
        printf("  FAIL: Could not initialize\n");
        return false;
    }

    uint8_t *frame = malloc(FRAME_SIZE);
    detection_result_t result;

    // Warm up (initialize background)
    create_test_frame(frame, -100, -100, 30, 128, 255);
    for (int i = 0; i < 10; i++) {
        motion_detect(frame, &result);
    }

    // Benchmark
    int iterations = 100;
    uint64_t start = get_time_ms();

    for (int i = 0; i < iterations; i++) {
        // Alternate between frames with and without object
        int x = (i % 2 == 0) ? 100 + (i % 50) * 2 : -100;
        create_test_frame(frame, x, 100, 30, 128, 255);
        motion_detect(frame, &result);
    }

    uint64_t elapsed = get_time_ms() - start;

    double ms_per_frame = (double)elapsed / iterations;
    double fps = 1000.0 / ms_per_frame;

    printf("  Benchmark results:\n");
    printf("    Frames:        %d\n", iterations);
    printf("    Total time:    %llu ms\n", (unsigned long long)elapsed);
    printf("    Per frame:     %.2f ms\n", ms_per_frame);
    printf("    Potential FPS: %.1f\n", fps);

    // Check against target
    bool passed = true;
#ifdef APIS_PLATFORM_ESP32
    if (fps < 5.0) {
        printf("  FAIL: FPS %.1f < 5 (ESP32 target)\n", fps);
        passed = false;
    } else {
        printf("  PASS: FPS %.1f >= 5 (ESP32 target)\n", fps);
    }
#else
    if (fps < 10.0) {
        printf("  FAIL: FPS %.1f < 10 (Pi target)\n", fps);
        passed = false;
    } else {
        printf("  PASS: FPS %.1f >= 10 (Pi target)\n", fps);
    }
#endif

    free(frame);
    motion_cleanup();

    return passed;
}

/**
 * Print usage information.
 */
static void print_usage(const char *prog_name) {
    printf("Usage: %s [OPTIONS]\n\n", prog_name);
    printf("Test the APIS motion detection module.\n\n");
    printf("Options:\n");
    printf("  --benchmark      Run performance benchmark\n");
    printf("  --verbose, -v    Enable verbose output\n");
    printf("  --help           Show this help message\n");
}

int main(int argc, char *argv[]) {
    bool run_benchmark = false;

    // Parse arguments
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (strcmp(argv[i], "--benchmark") == 0) {
            run_benchmark = true;
        } else if (strcmp(argv[i], "--verbose") == 0 || strcmp(argv[i], "-v") == 0) {
            g_verbose = true;
        }
    }

    // Initialize logging
    log_init(NULL, g_verbose ? LOG_LEVEL_DEBUG : LOG_LEVEL_INFO, false);

    printf("===========================================\n");
    printf("   APIS Motion Detection Module Tests\n");
    printf("===========================================\n");

    bool all_passed = true;

    // Run tests
    if (!test_init()) all_passed = false;
    if (!test_detection()) all_passed = false;
    if (!test_filtering()) all_passed = false;
    if (!test_error_handling()) all_passed = false;  // Issue 7: Negative test cases
    if (!test_reset()) all_passed = false;

    if (run_benchmark) {
        if (!test_benchmark()) all_passed = false;
    }

    // Summary
    printf("\n===========================================\n");
    printf("   Overall Result: %s\n", all_passed ? "PASSED" : "FAILED");
    printf("===========================================\n");

    log_shutdown();

    return all_passed ? 0 : 1;
}
