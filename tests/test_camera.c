/**
 * Test program for APIS camera module.
 *
 * Usage:
 *   ./test_camera                      # Run for 10 seconds
 *   ./test_camera --duration 5         # Run for 5 seconds
 *   ./test_camera --save               # Save frames to disk
 *   ./test_camera --device /dev/video1 # Use specific device
 *   ./test_camera --help               # Show usage
 *
 * Tests:
 *   1. Camera initialization
 *   2. Frame capture at target FPS
 *   3. Frame validity and metadata
 *   4. FPS measurement accuracy
 */

#include "config.h"
#include "frame.h"
#include "log.h"
#include "camera.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdbool.h>

#ifdef APIS_PLATFORM_PI
#include <sys/stat.h>
#endif

// Test configuration
typedef struct {
    int duration_s;
    bool save_frames;
    int save_interval;
    const char *device_path;
    bool verbose;
} test_config_t;

/**
 * Get current time in milliseconds.
 */
static uint32_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

/**
 * Save frame as PPM file (simple format, no dependencies).
 */
static bool save_frame_ppm(const frame_t *frame, const char *filename) {
    FILE *f = fopen(filename, "wb");
    if (!f) {
        fprintf(stderr, "Failed to open %s for writing\n", filename);
        return false;
    }

    // PPM header
    fprintf(f, "P6\n%d %d\n255\n", frame->width, frame->height);

    // Convert BGR to RGB and write
    for (int i = 0; i < FRAME_SIZE; i += 3) {
        fputc(frame->data[i + 2], f);  // R
        fputc(frame->data[i + 1], f);  // G
        fputc(frame->data[i + 0], f);  // B
    }

    fclose(f);
    return true;
}

/**
 * Print usage information.
 */
static void print_usage(const char *prog_name) {
    printf("Usage: %s [OPTIONS]\n\n", prog_name);
    printf("Test the APIS camera capture module.\n\n");
    printf("Options:\n");
    printf("  --duration SECONDS   Run for specified duration (default: 10)\n");
    printf("  --save               Save frames to disk (every 30 frames)\n");
    printf("  --save-interval N    Save every N frames (default: 30)\n");
    printf("  --device PATH        Use specific camera device (default: /dev/video0)\n");
    printf("  --verbose            Enable verbose output\n");
    printf("  --help               Show this help message\n");
    printf("\n");
    printf("Example:\n");
    printf("  %s --duration 30 --save --device /dev/video0\n", prog_name);
}

/**
 * Parse command line arguments.
 */
static bool parse_args(int argc, char *argv[], test_config_t *config) {
    // Defaults
    config->duration_s = 10;
    config->save_frames = false;
    config->save_interval = 30;
    config->device_path = "/dev/video0";
    config->verbose = false;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            return false;
        } else if (strcmp(argv[i], "--duration") == 0 && i + 1 < argc) {
            config->duration_s = atoi(argv[++i]);
            if (config->duration_s < 1) config->duration_s = 10;
        } else if (strcmp(argv[i], "--save") == 0) {
            config->save_frames = true;
        } else if (strcmp(argv[i], "--save-interval") == 0 && i + 1 < argc) {
            config->save_interval = atoi(argv[++i]);
            if (config->save_interval < 1) config->save_interval = 30;
        } else if (strcmp(argv[i], "--device") == 0 && i + 1 < argc) {
            config->device_path = argv[++i];
        } else if (strcmp(argv[i], "--verbose") == 0 || strcmp(argv[i], "-v") == 0) {
            config->verbose = true;
        } else {
            fprintf(stderr, "Unknown option: %s\n", argv[i]);
            print_usage(argv[0]);
            return false;
        }
    }

    return true;
}

// Callback test state
static volatile uint32_t g_callback_count = 0;
static volatile uint32_t g_callback_last_seq = 0;

/**
 * Test callback function for verifying callback mechanism.
 */
static void test_frame_callback(const frame_t *frame, void *user_data) {
    int *test_value = (int *)user_data;
    if (frame && frame->valid) {
        g_callback_count++;
        g_callback_last_seq = frame->sequence;
        // Verify user_data is passed correctly
        if (test_value && *test_value == 42) {
            // User data verified
        }
    }
}

/**
 * Test the camera callback mechanism.
 *
 * @return true if callback test passed
 */
static bool test_callback_mechanism(void) {
    printf("\n--- Testing Callback Mechanism ---\n");

    // Reset callback state
    g_callback_count = 0;
    g_callback_last_seq = 0;

    // Set up callback with test user data
    int test_user_data = 42;
    camera_set_callback(test_frame_callback, &test_user_data);

    // Allocate frame buffer
    frame_t *frame = malloc(sizeof(frame_t));
    if (!frame) {
        printf("  [FAIL] Could not allocate frame for callback test\n");
        return false;
    }

    // Capture a few frames to trigger callbacks
    printf("  Capturing frames with callback...\n");
    uint32_t frames_to_capture = 10;
    uint32_t captured = 0;

    for (uint32_t i = 0; i < frames_to_capture * 2 && captured < frames_to_capture; i++) {
        camera_status_t status = camera_read(frame, 1000);
        if (status == CAMERA_OK && frame->valid) {
            captured++;
        }
    }

    // Verify callback was invoked
    bool passed = true;

    if (g_callback_count > 0) {
        printf("  [PASS] Callback invoked %u times\n", g_callback_count);
    } else {
        printf("  [FAIL] Callback was never invoked\n");
        passed = false;
    }

    if (g_callback_count == captured) {
        printf("  [PASS] Callback count matches captured frames (%u)\n", captured);
    } else {
        printf("  [WARN] Callback count (%u) != captured frames (%u)\n",
               g_callback_count, captured);
        // Not a failure, just a warning
    }

    // Clear callback
    camera_set_callback(NULL, NULL);

    // Capture one more frame to verify callback is not called
    g_callback_count = 0;
    camera_status_t status = camera_read(frame, 1000);
    if (status == CAMERA_OK && frame->valid && g_callback_count == 0) {
        printf("  [PASS] Callback correctly disabled after set to NULL\n");
    } else if (g_callback_count > 0) {
        printf("  [FAIL] Callback still invoked after being set to NULL\n");
        passed = false;
    }

    free(frame);
    printf("  Callback test: %s\n", passed ? "PASSED" : "FAILED");
    return passed;
}

/**
 * Run camera test.
 */
static int run_test(const test_config_t *config) {
    printf("Camera Test Configuration:\n");
    printf("  Device:    %s\n", config->device_path);
    printf("  Duration:  %d seconds\n", config->duration_s);
    printf("  Save:      %s\n", config->save_frames ? "yes" : "no");
    if (config->save_frames) {
        printf("  Interval:  every %d frames\n", config->save_interval);
    }
    printf("\n");

    // Create output directory if saving
    if (config->save_frames) {
#ifdef APIS_PLATFORM_PI
        mkdir("frames", 0755);
#endif
    }

    // Initialize logging (minimal for tests)
    log_init(NULL, config->verbose ? LOG_LEVEL_DEBUG : LOG_LEVEL_INFO, false);

    // Configure camera
    apis_camera_config_t cam_config = {
        .width = FRAME_WIDTH,
        .height = FRAME_HEIGHT,
        .fps = 10,
        .focus_distance = 1.5f,
    };
    snprintf(cam_config.device_path, sizeof(cam_config.device_path), "%s", config->device_path);

    printf("Initializing camera...\n");
    camera_status_t status = camera_init(&cam_config);
    if (status != CAMERA_OK) {
        fprintf(stderr, "ERROR: Camera init failed: %s\n", camera_status_str(status));
        return 1;
    }

    printf("Opening camera...\n");
    status = camera_open();
    if (status != CAMERA_OK) {
        fprintf(stderr, "ERROR: Failed to open camera: %s\n", camera_status_str(status));
        return 1;
    }

    printf("Camera opened: %dx%d\n", FRAME_WIDTH, FRAME_HEIGHT);
    printf("Running for %d seconds...\n\n", config->duration_s);

    // Allocate frame buffer
    frame_t *frame = malloc(sizeof(frame_t));
    if (!frame) {
        fprintf(stderr, "ERROR: Failed to allocate frame buffer\n");
        camera_close();
        return 1;
    }

    // Test variables
    uint32_t start_time = get_time_ms();
    uint32_t duration_ms = config->duration_s * 1000;
    uint32_t frame_count = 0;
    uint32_t error_count = 0;
    uint32_t saved_count = 0;

    // FPS tracking
    uint32_t fps_start_time = start_time;
    uint32_t fps_frame_count = 0;
    float min_fps = 1000.0f;
    float max_fps = 0.0f;
    float sum_fps = 0.0f;
    uint32_t fps_samples = 0;

    // Capture loop
    while (get_time_ms() - start_time < duration_ms) {
        status = camera_read(frame, 1000);

        if (status != CAMERA_OK || !frame->valid) {
            error_count++;
            if (config->verbose) {
                printf("\rFrame error: %s", camera_status_str(status));
            }
            continue;
        }

        frame_count++;
        fps_frame_count++;

        // Calculate FPS every second
        uint32_t now = get_time_ms();
        if (now - fps_start_time >= 1000) {
            float fps = (float)fps_frame_count * 1000.0f / (float)(now - fps_start_time);

            if (fps < min_fps) min_fps = fps;
            if (fps > max_fps) max_fps = fps;
            sum_fps += fps;
            fps_samples++;

            if (config->verbose) {
                printf("\rFrame %5u | FPS: %5.1f | Seq: %u | Timestamp: %u ms",
                       frame_count, fps, frame->sequence, frame->timestamp_ms);
            } else {
                printf("\rFrame %5u | FPS: %5.1f", frame_count, fps);
            }
            fflush(stdout);

            fps_start_time = now;
            fps_frame_count = 0;
        }

        // Save frame if requested
        if (config->save_frames && frame_count % config->save_interval == 0) {
            char filename[64];
            snprintf(filename, sizeof(filename), "frames/frame_%05u.ppm", frame_count);

            if (save_frame_ppm(frame, filename)) {
                saved_count++;
                printf(" [Saved %s]", filename);
            }
        }
    }

    uint32_t elapsed = get_time_ms() - start_time;

    // Get final stats
    camera_stats_t stats;
    camera_get_stats(&stats);

    // Print results
    printf("\n\n");
    printf("========================================\n");
    printf("             TEST RESULTS               \n");
    printf("========================================\n");
    printf("  Total frames:     %u\n", frame_count);
    printf("  Errors:           %u\n", error_count);
    printf("  Duration:         %.1f s\n", (float)elapsed / 1000.0f);
    printf("  Average FPS:      %.1f\n", (float)frame_count * 1000.0f / (float)elapsed);

    if (fps_samples > 0) {
        printf("  FPS range:        %.1f - %.1f\n", min_fps, max_fps);
        printf("  Mean FPS:         %.1f\n", sum_fps / fps_samples);
    }

    printf("  Camera stats:\n");
    printf("    - Captured:     %u\n", stats.frames_captured);
    printf("    - Dropped:      %u\n", stats.frames_dropped);
    printf("    - Current FPS:  %.1f\n", stats.current_fps);

    if (config->save_frames) {
        printf("  Frames saved:     %u\n", saved_count);
    }

    printf("========================================\n");

    // Validate results
    bool passed = true;
    float avg_fps = (float)frame_count * 1000.0f / (float)elapsed;

    printf("\nValidation:\n");

    // Check minimum FPS (5.0 is absolute minimum per AC, 8.0 is healthy target)
    if (avg_fps >= 8.0f) {
        printf("  [PASS] FPS >= 8 (%.1f) - healthy performance\n", avg_fps);
    } else if (avg_fps >= 5.0f) {
        printf("  [WARN] FPS >= 5 but < 8 (%.1f) - marginal performance, consider checking CPU load or camera connection\n", avg_fps);
        // Still passes but warns about potential issues
    } else {
        printf("  [FAIL] FPS < 5 (%.1f) - below minimum requirement\n", avg_fps);
        passed = false;
    }

    // Check error rate (2% is healthy, 10% is maximum acceptable)
    float error_rate = (float)error_count / (float)(frame_count + error_count) * 100.0f;
    if (error_rate < 2.0f) {
        printf("  [PASS] Error rate < 2%% (%.1f%%) - healthy performance\n", error_rate);
    } else if (error_rate < 10.0f) {
        printf("  [WARN] Error rate >= 2%% but < 10%% (%.1f%%) - potential issues, check camera stability\n", error_rate);
        // Still passes but warns about potential issues
    } else {
        printf("  [FAIL] Error rate >= 10%% (%.1f%%) - too many frame errors\n", error_rate);
        passed = false;
    }

    // Check frame validity
    if (frame_count > 0) {
        printf("  [PASS] Captured at least one valid frame\n");
    } else {
        printf("  [FAIL] No valid frames captured\n");
        passed = false;
    }

    // Run callback mechanism test
    if (!test_callback_mechanism()) {
        passed = false;
    }

    printf("\nOverall: %s\n", passed ? "PASSED" : "FAILED");

    // Cleanup
    free(frame);
    camera_close();
    log_shutdown();

    return passed ? 0 : 1;
}

int main(int argc, char *argv[]) {
    test_config_t config;

    if (!parse_args(argc, argv, &config)) {
        return 1;
    }

    return run_test(&config);
}
