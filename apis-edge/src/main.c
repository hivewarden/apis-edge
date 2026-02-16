/**
 * APIS Edge Device - Main Entry Point
 *
 * Orchestrates camera capture, motion detection, and clip recording.
 *
 * Stories implemented:
 * - Story 10.1: Camera capture with error recovery
 * - Story 10.2: Motion detection pipeline
 * - Story 10.3: Size filtering and hover detection
 * - Story 10.4: Detection event logging (SQLite storage)
 * - Story 10.5: Clip recording and storage
 */

#include "config.h"
#include "frame.h"
#include "log.h"
#include "camera.h"
#include "detection.h"
#include "tracker.h"
#include "classifier.h"
#include "event_logger.h"
#include "rolling_buffer.h"
#include "clip_recorder.h"
#include "storage_manager.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <stdbool.h>
#include <errno.h>

#ifdef APIS_PLATFORM_PI
#include <sys/stat.h>
#include <unistd.h>
#endif

// Configuration
#define RECONNECT_DELAY_S 30  // AC3: 30 second delay between reconnect attempts
#define MAX_RECONNECT_ATTEMPTS 10
#define FPS_LOG_INTERVAL_S 5
#define STORAGE_CHECK_INTERVAL_S 60  // Check storage status every 60 seconds

// Global shutdown flag
static volatile bool g_running = true;

/**
 * Signal handler for graceful shutdown.
 *
 * NOTE: Only sets g_running flag. Logging here would be unsafe because
 * LOG_INFO uses non-async-signal-safe functions (printf, mutex, etc.).
 * The shutdown message is logged after the main loop exits instead.
 */
static void signal_handler(int sig) {
    (void)sig;
    g_running = false;
}

/**
 * Create required directories.
 */
static void setup_directories(const config_t *config) {
#ifdef APIS_PLATFORM_PI
    // Create data directory
    if (mkdir(config->storage.data_dir, 0755) < 0 && errno != EEXIST) {
        LOG_WARN("Could not create data dir: %s", config->storage.data_dir);
    }

    // Create clips directory
    if (mkdir(config->storage.clips_dir, 0755) < 0 && errno != EEXIST) {
        LOG_WARN("Could not create clips dir: %s", config->storage.clips_dir);
    }

    // Create log directory
    char log_dir[CONFIG_PATH_MAX];
    snprintf(log_dir, sizeof(log_dir), "%s", config->logging.file_path);
    char *last_slash = strrchr(log_dir, '/');
    if (last_slash) {
        *last_slash = '\0';
        if (mkdir(log_dir, 0755) < 0 && errno != EEXIST) {
            LOG_WARN("Could not create log dir: %s", log_dir);
        }
    }
#else
    (void)config;
#endif
}

/**
 * Initialize logging from configuration.
 */
static void init_logging(const config_t *config) {
    log_level_t level = log_level_parse(config->logging.level);
    log_init(config->logging.file_path, level, config->logging.json_format);
}

/**
 * Attempt to reconnect camera after failure.
 *
 * @return CAMERA_OK on success, error code on failure
 */
static camera_status_t reconnect_camera(void) {
    camera_close();

    for (int attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS && g_running; attempt++) {
        LOG_INFO("Reconnect attempt %d/%d...", attempt, MAX_RECONNECT_ATTEMPTS);

        apis_sleep_ms(RECONNECT_DELAY_S * 1000);

        camera_status_t status = camera_open();
        if (status == CAMERA_OK) {
            LOG_INFO("Camera reconnected successfully");
            return CAMERA_OK;
        }

        LOG_WARN("Reconnect attempt %d failed: %s", attempt, camera_status_str(status));
    }

    LOG_ERROR("Failed to reconnect camera after %d attempts", MAX_RECONNECT_ATTEMPTS);
    return CAMERA_ERROR_DISCONNECTED;
}

/**
 * Callback wrapper for clip deletion notifications.
 *
 * Wraps event_logger_clear_clip_reference() to match the void return type
 * expected by storage_manager_clip_deleted_cb. This avoids undefined behavior
 * from function pointer type mismatch.
 *
 * @param clip_path Path to the deleted clip file
 */
static void on_clip_deleted_callback(const char *clip_path) {
    (void)event_logger_clear_clip_reference(clip_path);
}

/**
 * Main capture loop.
 *
 * @param config Application configuration
 * @return Exit code (0 on success)
 */
// S8-I-03: This function uses manual reverse-order resource deallocation on each
// error path, creating 8+ copies of increasingly long cleanup sequences. Adding
// a new resource requires updating all error paths.
// TODO: Refactor to use a goto-based cleanup pattern (Linux kernel style):
//   if (init_A()) goto fail_a;
//   if (init_B()) goto fail_b;
//   ...
//   return 0;
//   fail_b: cleanup_A();
//   fail_a: return 1;
// This centralizes cleanup and makes adding new resources a single-line change.
static int run_capture_loop(const config_t *config) {
    // Initialize camera
    camera_status_t status = camera_init(&config->camera);
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera init failed: %s", camera_status_str(status));
        return 1;
    }

    // Open camera
    status = camera_open();
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera open failed: %s", camera_status_str(status));
        return 1;
    }

    LOG_INFO("Camera opened: %dx%d @ %d FPS target",
             config->camera.width, config->camera.height, config->camera.fps);

    // Initialize motion detection
    motion_config_t motion_cfg = motion_config_defaults();
    motion_cfg.threshold = (uint8_t)(config->detection.motion_threshold * 255);
    motion_cfg.min_area = (uint16_t)config->detection.min_contour_area;
    motion_cfg.max_area = (uint16_t)config->detection.max_contour_area;

    motion_status_t motion_status = motion_init(&motion_cfg);
    if (motion_status != MOTION_OK) {
        LOG_ERROR("Motion detection init failed: %s", motion_status_str(motion_status));
        camera_close();
        return 1;
    }

    LOG_INFO("Motion detection initialized (threshold=%d, min_area=%d)",
             motion_cfg.threshold, motion_cfg.min_area);

    // Story 10.3: Initialize tracker
    tracker_config_t tracker_cfg = tracker_config_defaults();
    tracker_status_t tracker_status = tracker_init(&tracker_cfg);
    if (tracker_status != TRACKER_OK) {
        LOG_ERROR("Tracker init failed: %s", tracker_status_str(tracker_status));
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Tracker initialized (max_distance=%d, max_disappeared=%d)",
             tracker_cfg.max_distance, tracker_cfg.max_disappeared);

    // Story 10.3: Initialize classifier
    classifier_config_t classifier_cfg = classifier_config_defaults();
    classifier_status_t classifier_status = classifier_init(&classifier_cfg);
    if (classifier_status != CLASSIFIER_OK) {
        LOG_ERROR("Classifier init failed: %s", classifier_status_str(classifier_status));
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Classifier initialized (hornet size: %d-%d px, hover: %d ms)",
             classifier_cfg.hornet_min, classifier_cfg.hornet_max, classifier_cfg.hover_time_ms);

    // Story 10.4: Initialize event logger
    event_logger_config_t event_cfg = event_logger_config_defaults();
    snprintf(event_cfg.db_path, sizeof(event_cfg.db_path), "%s/detections.db",
             config->storage.data_dir);
    event_logger_status_t event_status = event_logger_init(&event_cfg);
    if (event_status != EVENT_LOGGER_OK) {
        LOG_ERROR("Event logger init failed: %s", event_logger_status_str(event_status));
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Event logger initialized (db: %s)", event_cfg.db_path);

    // Story 10.5: Initialize rolling buffer for pre-roll frames
    rolling_buffer_config_t buffer_cfg = rolling_buffer_config_defaults();
    rolling_buffer_status_t buffer_status = rolling_buffer_init(&buffer_cfg);
    if (buffer_status != ROLLING_BUFFER_OK) {
        LOG_ERROR("Rolling buffer init failed: %s", rolling_buffer_status_str(buffer_status));
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Rolling buffer initialized (%.1f seconds pre-roll)",
             buffer_cfg.duration_seconds);

    // Story 10.5: Initialize clip recorder
    clip_recorder_config_t clip_cfg = clip_recorder_config_defaults();
    snprintf(clip_cfg.output_dir, sizeof(clip_cfg.output_dir), "%s",
             config->storage.clips_dir);
    clip_recorder_status_t clip_status = clip_recorder_init(&clip_cfg);
    if (clip_status != CLIP_RECORDER_OK) {
        LOG_ERROR("Clip recorder init failed: %s", clip_recorder_status_str(clip_status));
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Clip recorder initialized (output: %s)", clip_cfg.output_dir);

    // Story 10.5: Initialize storage manager
    storage_manager_config_t storage_cfg = storage_manager_config_defaults();
    snprintf(storage_cfg.clips_dir, sizeof(storage_cfg.clips_dir), "%s",
             config->storage.clips_dir);
    storage_manager_status_t storage_status = storage_manager_init(&storage_cfg);
    if (storage_status != STORAGE_MANAGER_OK) {
        LOG_ERROR("Storage manager init failed: %s", storage_manager_status_str(storage_status));
        clip_recorder_cleanup();
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }
    LOG_INFO("Storage manager initialized (max: %u MB)", storage_cfg.max_size_mb);

    // Story 10.5 AC4: Wire up clip deletion callback to clear event references
    storage_manager_set_clip_deleted_callback(on_clip_deleted_callback);

    // Allocate frame buffer
    frame_t *frame = malloc(sizeof(frame_t));
    if (!frame) {
        LOG_ERROR("Failed to allocate frame buffer (%zu bytes)", sizeof(frame_t));
        storage_manager_cleanup_resources();
        clip_recorder_cleanup();
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }

    // Allocate detection result buffer
    detection_result_t *detection_result = malloc(sizeof(detection_result_t));
    if (!detection_result) {
        LOG_ERROR("Failed to allocate detection result buffer");
        free(frame);
        storage_manager_cleanup_resources();
        clip_recorder_cleanup();
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }

    // Allocate tracking results buffer
    tracked_detection_t *tracked_results = malloc(sizeof(tracked_detection_t) * MAX_TRACKED_OBJECTS);
    if (!tracked_results) {
        LOG_ERROR("Failed to allocate tracking results buffer");
        free(detection_result);
        free(frame);
        storage_manager_cleanup_resources();
        clip_recorder_cleanup();
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }

    // Allocate classification results buffer
    classified_detection_t *classified_results = malloc(sizeof(classified_detection_t) * MAX_TRACKED_OBJECTS);
    if (!classified_results) {
        LOG_ERROR("Failed to allocate classification results buffer");
        free(tracked_results);
        free(detection_result);
        free(frame);
        storage_manager_cleanup_resources();
        clip_recorder_cleanup();
        rolling_buffer_cleanup();
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
    }

    // Tracking variables
    uint32_t last_fps_log_ms = 0;
    uint32_t last_storage_check_ms = 0;
    uint32_t consecutive_failures = 0;
    uint32_t total_detections = 0;
    uint32_t total_hornet_detections = 0;

    // Main loop
    while (g_running) {
        status = camera_read(frame, 1000);  // 1 second timeout

        if (status == CAMERA_ERROR_READ_FAILED) {
            // Timeout or temporary failure
            consecutive_failures++;
            if (consecutive_failures > 10) {
                LOG_WARN("Multiple consecutive read failures (%d)", consecutive_failures);
            }
            continue;
        }

        if (status == CAMERA_ERROR_DISCONNECTED) {
            LOG_ERROR("Camera disconnected");
            consecutive_failures = 0;

            if (reconnect_camera() != CAMERA_OK) {
                break;
            }
            continue;
        }

        if (status != CAMERA_OK || !frame->valid) {
            LOG_WARN("Frame capture failed: %s", camera_status_str(status));
            consecutive_failures++;
            continue;
        }

        // Reset failure counter on success
        consecutive_failures = 0;

        // Story 10.5: Feed frame to rolling buffer for pre-roll
        rolling_buffer_add(frame);

        // Story 10.5: Feed frame to clip recorder (if recording)
        if (clip_recorder_is_recording()) {
            bool finalized = clip_recorder_feed_frame(frame);
            if (finalized) {
                LOG_DEBUG("Clip recording finalized");
            }
        }

        // Log FPS periodically
        if (frame->timestamp_ms - last_fps_log_ms > FPS_LOG_INTERVAL_S * 1000) {
            camera_stats_t stats;
            camera_get_stats(&stats);

            LOG_INFO("Stats: FPS=%.1f, frames=%u, uptime=%us, motions=%u, hornets=%u, tracks=%d",
                     stats.current_fps, stats.frames_captured, stats.uptime_s,
                     total_detections, total_hornet_detections, tracker_get_active_count());

            last_fps_log_ms = frame->timestamp_ms;
        }

        // AC3: Check storage status periodically and auto-prune if low
        if (frame->timestamp_ms - last_storage_check_ms > STORAGE_CHECK_INTERVAL_S * 1000) {
            storage_status_t storage_status;
            if (event_logger_get_status(&storage_status) == 0) {
                if (storage_status.warning) {
                    LOG_WARN("Low storage: %.1f MB free (threshold: %d MB) - auto-pruning",
                             storage_status.free_mb, event_cfg.min_free_mb);
                    int pruned = event_logger_prune(event_cfg.prune_days);
                    if (pruned > 0) {
                        LOG_INFO("Auto-pruned %d events to free storage", pruned);
                    }
                }
            }
            last_storage_check_ms = frame->timestamp_ms;
        }

        // Story 10.2: Motion Detection Pipeline
        int num_detections = motion_detect(frame->data, detection_result);
        detection_result->frame_seq = frame->sequence;
        detection_result->timestamp_ms = frame->timestamp_ms;

        if (num_detections > 0) {
            total_detections += num_detections;
            LOG_DEBUG("Frame %u: %d motion regions detected",
                      frame->sequence, num_detections);
        }

        // Story 10.3: Tracking and Classification
        int num_tracked = tracker_update(
            detection_result->detections,
            num_detections > 0 ? num_detections : 0,
            frame->timestamp_ms,
            tracked_results
        );

        if (num_tracked > 0) {
            // Classify tracked detections
            int num_classified = classifier_classify(tracked_results, num_tracked, classified_results);

            // Process classified results
            for (int i = 0; i < num_classified; i++) {
                classified_detection_t *cls = &classified_results[i];

                // Count hornet detections (MEDIUM or HIGH confidence)
                if (cls->classification == CLASS_HORNET &&
                    cls->confidence >= CONFIDENCE_MEDIUM) {
                    total_hornet_detections++;

                    LOG_DEBUG("Track %u: %s confidence %s (%dx%d, hovering=%d, age=%ums)",
                              cls->track_id,
                              classification_str(cls->classification),
                              confidence_level_str(cls->confidence),
                              cls->detection.w, cls->detection.h,
                              cls->is_hovering, cls->track_age_ms);

                    // HIGH confidence = hovering hornet (laser target)
                    if (cls->confidence == CONFIDENCE_HIGH) {
                        LOG_INFO("HIGH CONFIDENCE HORNET: track=%u, hovering at (%d,%d) for %ums",
                                 cls->track_id,
                                 cls->detection.centroid_x,
                                 cls->detection.centroid_y,
                                 cls->hover_duration_ms);
                    }

                    // Story 10.4: Log detection event to database
                    // Get current clip path if recording
                    const char *clip_path = clip_recorder_get_current_path();
                    int64_t event_id = event_logger_log(cls, false, clip_path);
                    if (event_id > 0) {
                        LOG_DEBUG("Logged detection event: id=%lld, track=%u",
                                  (long long)event_id, cls->track_id);

                        // Story 10.5: Start or extend clip recording
                        if (clip_recorder_is_recording()) {
                            // Extend existing clip with this event
                            clip_recorder_extend(event_id);
                        } else {
                            // Start new clip recording
                            const char *new_clip = clip_recorder_start(event_id);
                            if (new_clip) {
                                LOG_INFO("Started clip recording: %s", new_clip);
                            }
                        }
                    }
                }
            }
        }

        // Story 10.5: Check if clip storage needs cleanup
        if (storage_manager_needs_cleanup()) {
            LOG_WARN("Clip storage threshold exceeded, cleaning up oldest clips");
            int deleted = storage_manager_cleanup();
            if (deleted > 0) {
                LOG_INFO("Deleted %d old clips to free storage", deleted);
            }
        }
    }

    // Cleanup
    LOG_INFO("Shutting down... (total motions=%u, hornet detections=%u)",
             total_detections, total_hornet_detections);

    // Stop any active recording
    if (clip_recorder_is_recording()) {
        clip_result_t final_result;
        clip_recorder_stop(&final_result);
        LOG_INFO("Stopped final clip: %s", final_result.filepath);
    }

    free(classified_results);
    free(tracked_results);
    free(detection_result);
    free(frame);
    storage_manager_cleanup_resources();
    clip_recorder_cleanup();
    rolling_buffer_cleanup();
    event_logger_close();
    classifier_cleanup();
    tracker_cleanup();
    motion_cleanup();
    camera_close();

    return 0;
}

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    printf("APIS Edge Device v0.1.0\n");
    printf("=======================\n\n");

    // Load configuration
    const config_t *config = config_load(NULL);

    // Initialize logging
    init_logging(config);

    // Create directories
    setup_directories(config);

    LOG_INFO("APIS Edge starting...");

    // Setup signal handlers
    // S8-L-06: signal() has implementation-defined behavior (System V vs BSD
    // semantics). On our target platforms (glibc on Pi, irrelevant on ESP32),
    // BSD semantics are used which keep the handler installed after invocation.
    // TODO: Replace with sigaction() for fully portable behavior if other
    // platforms are targeted in the future.
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // Run main capture loop
    int result = run_capture_loop(config);

    // Cleanup - log final message before shutting down the logger
    LOG_INFO("APIS Edge stopped (exit code: %d)", result);
    log_shutdown();

    return result;
}
