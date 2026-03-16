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
#include "coordinate_mapper.h"
#include "deterrent_state.h"
#include "edge_telemetry.h"
#include "laser_controller.h"
#include "storage_manager.h"
#include "led_controller.h"
#include "qr_scanner.h"
#include "safety_layer.h"
#include "server_comm.h"
#include "servo_controller.h"
#include "targeting.h"
#include "manual_capture.h"
#include "vision_runtime.h"
#include "profile_scoring.h"
#include "shadow_lane_gate.h"
#include "sync_pipeline.h"
#include "secure_util.h"
#include "platform.h"
#include "psram_alloc.h"
#include "time_util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <signal.h>
#endif
#include <stdbool.h>
#include <errno.h>

#ifdef APIS_PLATFORM_PI
#include <sys/stat.h>
#include <unistd.h>
#endif

#ifdef APIS_PLATFORM_ESP32
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_heap_caps.h"
#include "wifi_provision.h"
#include "http_server.h"
#include "config_manager.h"
#include "captive_dns.h"
#include "mdns_discovery.h"
#include "onboarding_defaults.h"
#endif

// Configuration
#define RECONNECT_DELAY_S 30  // AC3: 30 second delay between reconnect attempts
#define MAX_RECONNECT_ATTEMPTS 10
#define FPS_LOG_INTERVAL_S 5
#define STORAGE_CHECK_INTERVAL_S 60  // Check storage status every 60 seconds
#define HEARTBEAT_STARTUP_DELAY_MS 15000U
#define HEARTBEAT_STARTUP_MIN_FRAMES 10U
#define HEARTBEAT_STARTUP_MAX_WAIT_MS 12000U
#define HD_WATCH_FIRST_FRAME_TIMEOUT_MS 12000U

// Global shutdown flag
static volatile bool g_running = true;

// Pre-allocated frame buffer for ESP32.
// On ESP32, malloc from PSRAM while camera DMA + WiFi are active causes
// INT WDT (MSPI bus contention in heap critical section). This buffer
// is allocated in app_main() before camera DMA starts.
static frame_t *g_frame_prealloc = NULL;

#ifdef APIS_PLATFORM_ESP32
static bool g_defer_server_comm_start = false;

static void maybe_start_deferred_heartbeat(bool *heartbeat_start_pending,
                                           const char *reason) {
    if (!heartbeat_start_pending || !*heartbeat_start_pending ||
        server_comm_is_running()) {
        return;
    }

    if (server_comm_start() == 0) {
        LOG_INFO("Heartbeat service started (%s)", reason ? reason : "deferred");
        *heartbeat_start_pending = false;
        g_defer_server_comm_start = false;
    } else {
        LOG_WARN("Heartbeat service failed to start (%s); will retry",
                 reason ? reason : "deferred");
    }
}
#endif

/**
 * Pre-allocate large PSRAM buffers before camera DMA starts.
 * Called from ESP32 app_main() before camera_init().
 */
void apis_preallocate_frame(void) {
    if (!g_frame_prealloc) {
        g_frame_prealloc = psram_malloc(sizeof(frame_t));
    }
}

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/**
 * Signal handler for graceful shutdown.
 *
 * NOTE: Only sets g_running flag. Logging here would be unsafe because
 * LOG_INFO uses non-async-signal-safe functions (printf, mutex, etc.).
 * The shutdown message is logged after the main loop exits instead.
 *
 * Not used on ESP32 (FreeRTOS doesn't support POSIX signals).
 */
static void signal_handler(int sig) {
    (void)sig;
    g_running = false;
}
#endif

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

#ifdef APIS_PLATFORM_ESP32
static void fallback_to_local_watch_mode(bool *hd_watch_active,
                                         camera_jpeg_frame_t *raw_capture) {
    bool reopen_camera;

    if (hd_watch_active == NULL || !*hd_watch_active) {
        return;
    }

    reopen_camera = camera_is_open();
    if (camera_reconfigure(CAMERA_MODE_QVGA_GRAY) != CAMERA_OK) {
        LOG_ERROR("Failed to enter local QVGA failsafe mode");
        return;
    }

    if (reopen_camera && camera_open() != CAMERA_OK) {
        LOG_ERROR("Failed to reopen camera in local QVGA failsafe mode");
        return;
    }

    *hd_watch_active = false;
    if (raw_capture != NULL) {
        raw_capture->size = 0;
        raw_capture->width = 0;
        raw_capture->height = 0;
        raw_capture->valid = false;
    }

    vision_runtime_configure(config_manager_get_install_profile(),
                             "qvga_gray_failsafe",
                             320,
                             240,
                             320,
                             240);
    LOG_WARN("HD watch disabled; running local QVGA failsafe mode");
}
#endif

static int init_targeting_stack(const config_t *config) {
    const install_profile_spec_t *profile =
        install_profile_get_spec(config_manager_get_install_profile());
    camera_params_t camera_params = {
        .width = profile != NULL ? profile->analysis_width : FRAME_WIDTH,
        .height = profile != NULL ? profile->analysis_height : FRAME_HEIGHT,
        .fov_h_deg = profile != NULL ? profile->fov_h_deg : COORD_DEFAULT_FOV_H_DEG,
        .fov_v_deg = profile != NULL ? profile->fov_v_deg : COORD_DEFAULT_FOV_V_DEG,
    };
    char artifact_dir[DETERRENT_ARTIFACT_PATH_MAX];
    bool init_actuation_stack =
        config_manager_get_deterrent_mode() == CONFIG_DETERRENT_MODE_LIVE;

    if (init_actuation_stack) {
        if (servo_controller_init() != SERVO_OK) {
            LOG_ERROR("Servo controller init failed");
            return -1;
        }
    }

    if (coord_mapper_init(&camera_params) != COORD_OK) {
        LOG_ERROR("Coordinate mapper init failed");
        if (init_actuation_stack) {
            servo_controller_cleanup();
        }
        return -1;
    }

    if (init_actuation_stack) {
        if (laser_controller_init() != LASER_OK) {
            LOG_ERROR("Laser controller init failed");
            coord_mapper_cleanup();
            servo_controller_cleanup();
            return -1;
        }

        if (safety_layer_init() != SAFETY_OK) {
            LOG_ERROR("Safety layer init failed");
            laser_controller_cleanup();
            coord_mapper_cleanup();
            servo_controller_cleanup();
            return -1;
        }
    } else {
        LOG_INFO("Shadow mode startup: skipping servo and laser hardware init");
    }

    if (targeting_init() != TARGET_OK) {
        LOG_ERROR("Targeting init failed");
        if (init_actuation_stack) {
            safety_cleanup();
            laser_controller_cleanup();
        }
        coord_mapper_cleanup();
        if (init_actuation_stack) {
            servo_controller_cleanup();
        }
        return -1;
    }

    snprintf(artifact_dir, sizeof(artifact_dir), "%s/deterrent", config->storage.data_dir);
    if (deterrent_state_init(artifact_dir) != 0) {
        LOG_ERROR("Deterrent state init failed");
        targeting_cleanup();
        if (init_actuation_stack) {
            safety_cleanup();
            laser_controller_cleanup();
        }
        coord_mapper_cleanup();
        if (init_actuation_stack) {
            servo_controller_cleanup();
        }
        return -1;
    }

    return 0;
}

static void cleanup_targeting_stack(void) {
    deterrent_state_cleanup();
    targeting_cleanup();
    safety_cleanup();
    laser_controller_cleanup();
    coord_mapper_cleanup();
    servo_controller_cleanup();
}

static const classified_detection_t *find_targeted_classification(uint32_t track_id,
                                                                  const classified_detection_t **box_map,
                                                                  int candidate_count) {
    for (int i = 0; i < candidate_count; i++) {
        if (box_map[i] != NULL && box_map[i]->track_id == track_id) {
            return box_map[i];
        }
    }

    return NULL;
}

static void recover_failed_clip_recording(void) {
    manual_capture_snapshot_t capture_snapshot;
    char failed_clip[CLIP_PATH_MAX] = {0};
    const char *current_clip = clip_recorder_get_current_path();
    bool manual_capture_clip = false;

    if (current_clip != NULL) {
        snprintf(failed_clip, sizeof(failed_clip), "%s", current_clip);
    }

    manual_capture_get_snapshot(&capture_snapshot);
    manual_capture_clip =
        capture_snapshot.state == MANUAL_CAPTURE_STATE_RECORDING &&
        (failed_clip[0] == '\0' ||
         strcmp(capture_snapshot.last_clip_path, failed_clip) == 0);

    if (manual_capture_clip) {
        manual_capture_mark_error("Manual capture recorder failed");
    }

    if (clip_recorder_abort(true) != 0) {
        LOG_WARN("Clip recorder entered ERROR state but abort failed");
        return;
    }

    if (failed_clip[0] != '\0') {
        LOG_WARN("Recovered from clip recorder error for %s", failed_clip);
    } else {
        LOG_WARN("Recovered from clip recorder error");
    }
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
    const install_profile_spec_t *install_profile =
        install_profile_get_spec(config_manager_get_install_profile());
    bool hd_watch_required =
        install_profile != NULL && install_profile->requires_hd_watch;
    bool hd_watch_active = hd_watch_required;
    bool vision_watch_unsupported = false;
    uint32_t vision_probe_start_ms = 0;
    uint32_t vision_sensor_frames = 0;
    uint32_t vision_analysis_frames = 0;
    uint32_t vision_consecutive_read_failures = 0;
    float analysis_fps = 0.0f;
#ifdef APIS_PLATFORM_ESP32
    size_t min_internal_heap = SIZE_MAX;
    size_t min_psram_heap = SIZE_MAX;
    camera_jpeg_frame_t raw_capture = {0};
    uint32_t capture_loop_start_ms = get_time_ms();
#endif

    vision_runtime_init();
    vision_runtime_configure(config_manager_get_install_profile(),
                             hd_watch_active ? "hd_jpeg" : "qvga_gray",
                             install_profile != NULL ? install_profile->sensor_width : FRAME_WIDTH,
                             install_profile != NULL ? install_profile->sensor_height : FRAME_HEIGHT,
                             install_profile != NULL ? install_profile->analysis_width : FRAME_WIDTH,
                             install_profile != NULL ? install_profile->analysis_height : FRAME_HEIGHT);
    vision_runtime_set_watch_mode_state(
        hd_watch_required ? VISION_WATCH_MODE_PROBING : VISION_WATCH_MODE_READY);
    vision_runtime_clear_error();

    // Initialize camera
    camera_status_t status = camera_init(&config->camera);
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera init failed: %s", camera_status_str(status));
        if (led_controller_is_initialized())
            led_controller_set_state(LED_STATE_CAMERA_FAIL);
        return 1;
    }

#ifdef APIS_PLATFORM_ESP32
    if (hd_watch_required) {
        if (camera_reconfigure(CAMERA_MODE_HD_JPEG) != CAMERA_OK) {
            vision_watch_unsupported = true;
            vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_UNSUPPORTED);
            vision_runtime_set_error("Failed to enter HD_JPEG watch mode");
            LOG_ERROR("HD watch mode probe failed before open");
            (void)camera_reconfigure(CAMERA_MODE_QVGA_GRAY);
            hd_watch_active = false;
            vision_runtime_configure(config_manager_get_install_profile(),
                                     "qvga_gray_failsafe",
                                     320,
                                     240,
                                     320,
                                     240);
        } else {
            raw_capture.data = malloc(FRAME_JPEG_MAX_SIZE);
            raw_capture.capacity = FRAME_JPEG_MAX_SIZE;
            if (raw_capture.data == NULL) {
                vision_watch_unsupported = true;
                vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_UNSUPPORTED);
                vision_runtime_set_error("Failed to allocate raw JPEG buffer");
                LOG_ERROR("Failed to allocate raw JPEG buffer for HD watch mode");
                (void)camera_reconfigure(CAMERA_MODE_QVGA_GRAY);
                hd_watch_active = false;
                vision_runtime_configure(config_manager_get_install_profile(),
                                         "qvga_gray_failsafe",
                                         320,
                                         240,
                                         320,
                                         240);
            }
        }
    }
#endif

    // Open camera
    status = camera_open();
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera open failed: %s", camera_status_str(status));
        if (led_controller_is_initialized())
            led_controller_set_state(LED_STATE_CAMERA_FAIL);
        return 1;
    }

    LOG_INFO("Camera opened for install profile %s",
             install_profile_name(config_manager_get_install_profile()));

#ifndef APIS_PLATFORM_ESP32
    // Initialize QR scanner for device claiming (non-fatal if it fails).
    // On ESP32, QR scanning is handled in app_main() before the capture loop.
    if (qr_scanner_init() != QR_SCANNER_OK) {
        LOG_WARN("QR scanner init failed — QR claiming disabled");
    }
#endif

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
    if (install_profile != NULL && install_profile->stale_track_timeout_ms > 0) {
        uint16_t stale_frames =
            (uint16_t)((install_profile->stale_track_timeout_ms + 99U) / 100U);
        if (stale_frames == 0U) {
            stale_frames = 1U;
        }
        if (stale_frames > MAX_DISAPPEARED_FRAMES) {
            stale_frames = MAX_DISAPPEARED_FRAMES;
        }
        tracker_cfg.max_disappeared = stale_frames;
    }
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
    if (install_profile != NULL) {
        classifier_cfg.min_size = install_profile->hornet_min_px;
        classifier_cfg.max_size = install_profile->hornet_max_px + 24;
        classifier_cfg.hornet_min = install_profile->hornet_min_px;
        classifier_cfg.hornet_max = install_profile->hornet_max_px;
        classifier_cfg.hover_radius = install_profile->hover_radius_px;
        classifier_cfg.hover_time_ms = install_profile->hover_threshold_ms;
    }
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
#ifdef APIS_PLATFORM_ESP32
    // ESP32 has limited PSRAM (~4MB free after camera + motion detection).
    // Reduce pre-roll to 3 frames (~2.7MB) instead of default 20 (~18MB).
    buffer_cfg.duration_seconds = 1.0f;
    buffer_cfg.fps = 3;
#endif
    rolling_buffer_status_t buffer_status = rolling_buffer_init(&buffer_cfg);
    if (buffer_status != ROLLING_BUFFER_OK) {
#ifdef APIS_PLATFORM_ESP32
        // Non-fatal on ESP32 — continue without pre-roll capability
        LOG_WARN("Rolling buffer init failed: %s (continuing without pre-roll)",
                 rolling_buffer_status_str(buffer_status));
#else
        LOG_ERROR("Rolling buffer init failed: %s", rolling_buffer_status_str(buffer_status));
        event_logger_close();
        classifier_cleanup();
        tracker_cleanup();
        motion_cleanup();
        camera_close();
        return 1;
#endif
    } else {
        LOG_INFO("Rolling buffer initialized (%.1f seconds pre-roll)",
                 buffer_cfg.duration_seconds);
    }

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

    // Allocate frame buffer (use pre-allocated buffer on ESP32)
    frame_t *frame = g_frame_prealloc;
    g_frame_prealloc = NULL;  // Transfer ownership
    if (!frame) {
        frame = psram_malloc(sizeof(frame_t));  // Fallback for non-ESP32
    }
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
        psram_free(frame);
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
        psram_free(frame);
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
        psram_free(frame);
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

    if (sync_pipeline_init(
#if defined(APIS_PLATFORM_TEST)
            true
#else
            false
#endif
        ) != 0) {
        LOG_ERROR("Business sync pipeline init failed");
        free(classified_results);
        free(tracked_results);
        free(detection_result);
        psram_free(frame);
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

    if (init_targeting_stack(config) != 0) {
        LOG_ERROR("Targeting stack init failed");
        sync_pipeline_cleanup();
        free(classified_results);
        free(tracked_results);
        free(detection_result);
        psram_free(frame);
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

    laser_controller_set_activation_callback(sync_pipeline_on_laser_activation_event, NULL);

    deterrent_state_set_mode(CONFIG_DETERRENT_MODE_SHADOW);
    targeting_set_actuation_enabled(false);
    LOG_INFO("Targeting stack initialized for shadow-mode validation");

    // Tracking variables
    uint32_t last_fps_log_ms = 0;
    uint32_t last_storage_check_ms = 0;
    uint32_t consecutive_failures = 0;
    uint32_t total_detections = 0;
    uint32_t total_hornet_detections = 0;
    shadow_lane_gate_t shadow_gate;
    bool last_armed_state = false;
    config_deterrent_mode_t last_deterrent_mode = CONFIG_DETERRENT_MODE_SHADOW;
#ifdef APIS_PLATFORM_ESP32
    bool heartbeat_start_pending = g_defer_server_comm_start;
    uint32_t heartbeat_warmup_start_ms = 0;
    uint32_t heartbeat_warmup_frames = 0;
#endif

    LOG_INFO("Entering main capture loop");
    shadow_lane_gate_reset(&shadow_gate);

    // Main loop
    while (g_running) {
#ifdef APIS_PLATFORM_ESP32
        // Yield to FreeRTOS scheduler so WiFi, DHCP, and other system tasks
        // can run. Must use at least 1 tick (10ms at 100Hz tick rate).
        // pdMS_TO_TICKS(1) rounds to 0 which is a no-op!
        vTaskDelay(1);
#endif
#ifdef APIS_PLATFORM_ESP32
        status = camera_read_capture(frame,
                                     hd_watch_active ? &raw_capture : NULL,
                                     1000);
#else
        status = camera_read(frame, 1000);  // 1 second timeout
#endif

        if (status == CAMERA_ERROR_READ_FAILED) {
            // Timeout or temporary failure
            consecutive_failures++;
            vision_consecutive_read_failures++;
#ifdef APIS_PLATFORM_ESP32
            if (vision_consecutive_read_failures > 10 && !vision_watch_unsupported) {
                vision_watch_unsupported = true;
                vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_UNSUPPORTED);
                vision_runtime_set_error("More than 10 consecutive camera read failures");
                fallback_to_local_watch_mode(&hd_watch_active, &raw_capture);
                maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                               "HD watch unsupported after read failures");
            }
#endif
#ifdef APIS_PLATFORM_ESP32
            if (heartbeat_start_pending) {
                heartbeat_warmup_start_ms = 0;
                heartbeat_warmup_frames = 0;
                if (get_time_ms() - capture_loop_start_ms >= HEARTBEAT_STARTUP_MAX_WAIT_MS) {
                    maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                                   "camera warm-up timeout");
                }
            }
            if (hd_watch_required && !vision_watch_unsupported &&
                vision_sensor_frames == 0 &&
                get_time_ms() - capture_loop_start_ms >= HD_WATCH_FIRST_FRAME_TIMEOUT_MS) {
                vision_watch_unsupported = true;
                vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_UNSUPPORTED);
                vision_runtime_set_error("HD watch produced no valid frames within 12s");
                fallback_to_local_watch_mode(&hd_watch_active, &raw_capture);
                maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                               "HD watch produced no valid frames");
            }
#endif
            if (consecutive_failures > 10) {
                LOG_WARN("Multiple consecutive read failures (%d)", consecutive_failures);
            }
            continue;
        }

        if (status == CAMERA_ERROR_DISCONNECTED) {
            LOG_ERROR("Camera disconnected");
            consecutive_failures = 0;
            vision_consecutive_read_failures = 0;
#ifdef APIS_PLATFORM_ESP32
            if (heartbeat_start_pending) {
                heartbeat_warmup_start_ms = 0;
                heartbeat_warmup_frames = 0;
                if (get_time_ms() - capture_loop_start_ms >= HEARTBEAT_STARTUP_MAX_WAIT_MS) {
                    maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                                   "camera reconnect timeout");
                }
            }
#endif

            if (reconnect_camera() != CAMERA_OK) {
                if (led_controller_is_initialized())
                    led_controller_set_state(LED_STATE_CAMERA_FAIL);
                break;
            }
            continue;
        }

        if (status != CAMERA_OK || !frame->valid) {
            LOG_WARN("Frame capture failed: %s", camera_status_str(status));
            consecutive_failures++;
            vision_consecutive_read_failures++;
#ifdef APIS_PLATFORM_ESP32
            if (heartbeat_start_pending) {
                heartbeat_warmup_start_ms = 0;
                heartbeat_warmup_frames = 0;
                if (get_time_ms() - capture_loop_start_ms >= HEARTBEAT_STARTUP_MAX_WAIT_MS) {
                    maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                                   "camera invalid-frame timeout");
                }
            }
#endif
            continue;
        }

        // Reset failure counter on success
        consecutive_failures = 0;
        vision_consecutive_read_failures = 0;

        if (vision_probe_start_ms == 0) {
            vision_probe_start_ms = frame->timestamp_ms;
        }
        vision_sensor_frames++;

#ifdef APIS_PLATFORM_ESP32
        if (heartbeat_start_pending && !server_comm_is_running()) {
            if (heartbeat_warmup_start_ms == 0) {
                heartbeat_warmup_start_ms = frame->timestamp_ms;
            }
            heartbeat_warmup_frames++;

            if (heartbeat_warmup_frames >= HEARTBEAT_STARTUP_MIN_FRAMES &&
                frame->timestamp_ms - heartbeat_warmup_start_ms >= HEARTBEAT_STARTUP_DELAY_MS) {
                if (server_comm_start() == 0) {
                    LOG_INFO("Heartbeat service started after %u stable frames (%ums)",
                             heartbeat_warmup_frames,
                             frame->timestamp_ms - heartbeat_warmup_start_ms);
                    heartbeat_start_pending = false;
                    g_defer_server_comm_start = false;
                } else {
                    heartbeat_warmup_start_ms = 0;
                    heartbeat_warmup_frames = 0;
                    LOG_WARN("Heartbeat service failed to start after capture warm-up; retrying");
                }
            }
        }

        {
            camera_stats_t stats;
            uint32_t probe_elapsed_ms;
            float drop_percent = 0.0f;

            camera_get_stats(&stats);
            if (stats.frames_captured > 0) {
                drop_percent = ((float)stats.frames_dropped * 100.0f) /
                               (float)stats.frames_captured;
            }

            probe_elapsed_ms = frame->timestamp_ms - vision_probe_start_ms;
            if (probe_elapsed_ms > 0) {
                analysis_fps = ((float)vision_analysis_frames * 1000.0f) /
                               (float)probe_elapsed_ms;
            }

            {
                size_t current_internal_heap = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
                size_t current_psram_heap = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
                if (current_internal_heap < min_internal_heap) {
                    min_internal_heap = current_internal_heap;
                }
                if (current_psram_heap < min_psram_heap) {
                    min_psram_heap = current_psram_heap;
                }
            }

            vision_runtime_set_metrics(stats.current_fps, analysis_fps, drop_percent);

            if (hd_watch_required && !vision_watch_unsupported &&
                probe_elapsed_ms >= 20000U && vision_sensor_frames >= 80U) {
                const char *unsupported_reason = NULL;

                if (stats.current_fps < 4.0f) {
                    unsupported_reason = "HD watch camera_fps below 4";
                } else if (analysis_fps < 3.0f) {
                    unsupported_reason = "HD watch analysis_fps below 3";
                } else if (drop_percent > 5.0f) {
                    unsupported_reason = "HD watch dropped frame budget exceeded";
                } else if (min_internal_heap < (128U * 1024U)) {
                    unsupported_reason = "Internal heap floor below 128KB";
                } else if (min_psram_heap < (512U * 1024U)) {
                    unsupported_reason = "PSRAM floor below 512KB";
                }

                if (unsupported_reason != NULL) {
                    vision_watch_unsupported = true;
                    vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_UNSUPPORTED);
                    vision_runtime_set_error(unsupported_reason);
                    LOG_ERROR("%s", unsupported_reason);
                    fallback_to_local_watch_mode(&hd_watch_active, &raw_capture);
                    maybe_start_deferred_heartbeat(&heartbeat_start_pending,
                                                   "HD watch unsupported after probe");
                } else {
                    vision_runtime_set_watch_mode_state(VISION_WATCH_MODE_READY);
                }
            }
        }
#endif

#ifndef APIS_PLATFORM_ESP32
        // QR claiming: scan when device is UNCLAIMED (has WiFi but no API key).
        // On ESP32, QR scanning is handled in app_main() before the capture loop
        // starts — by the time we get here, the device is either fully claimed
        // or running standalone (no WiFi).
        if (led_controller_is_state_active(LED_STATE_UNCLAIMED) &&
            qr_scanner_is_initialized()) {
            qr_scan_result_t qr = {0};
            qr_scanner_status_t qr_status = qr_scanner_scan_frame(frame, &qr);
            if (qr_status == QR_SCANNER_OK && qr.found) {
                LOG_INFO("QR code detected — validating with %s", qr.server_url);
                if (server_comm_validate_key(qr.server_url, qr.api_key) == 0) {
                    LOG_INFO("QR claiming validated (test platform — not saving)");
                } else {
                    LOG_WARN("QR API key validation failed");
                }
                secure_clear(&qr, sizeof(qr));
            }
        }

        // When UNCLAIMED, skip the heavy detection pipeline — the device
        // only needs QR scanning.
        if (led_controller_is_state_active(LED_STATE_UNCLAIMED)) {
            // Log FPS periodically even in QR-only mode
            if (frame->timestamp_ms - last_fps_log_ms > FPS_LOG_INTERVAL_S * 1000) {
                camera_stats_t stats;
                camera_get_stats(&stats);
                LOG_INFO("Stats (QR-only): FPS=%.1f, frames=%u, uptime=%us",
                         stats.current_fps, stats.frames_captured, stats.uptime_s);
                last_fps_log_ms = frame->timestamp_ms;
            }
            continue;
        }
#endif

        // Story 10.5: Feed frame to rolling buffer for pre-roll
        rolling_buffer_add_capture(frame,
#ifdef APIS_PLATFORM_ESP32
                                   (hd_watch_active && raw_capture.valid) ? raw_capture.data : NULL,
                                   (hd_watch_active && raw_capture.valid) ? raw_capture.size : 0,
                                   (hd_watch_active && raw_capture.valid) ? raw_capture.width : 0,
                                   (hd_watch_active && raw_capture.valid) ? raw_capture.height : 0
#else
                                   NULL, 0, 0, 0
#endif
        );

        {
            uint32_t manual_duration_ms = 0;
            bool manual_upload_requested = false;

            if (manual_capture_peek_pending(&manual_duration_ms, &manual_upload_requested)) {
                if (clip_recorder_is_recording() &&
                    clip_recorder_get_owner() == CLIP_RECORDER_OWNER_SHADOW) {
                    LOG_INFO("Manual capture preempting active shadow evidence clip");
                    deterrent_state_mark_error("Shadow evidence preempted by manual capture");
                    (void)clip_recorder_abort(true);
                }
            }

            if (!clip_recorder_is_recording() &&
                manual_capture_peek_pending(&manual_duration_ms, &manual_upload_requested)) {
                const char *manual_clip = clip_recorder_start_owned(
                    0, manual_duration_ms, CLIP_RECORDER_OWNER_MANUAL);
                if (manual_clip != NULL) {
                    manual_capture_mark_recording(manual_clip, NULL);
                    LOG_INFO("Started manual capture: %s", manual_clip);
                } else {
                    manual_capture_mark_error("Failed to start manual capture");
                }
            }
        }

        // Story 10.5: Feed frame to clip recorder (if recording)
        if (clip_recorder_is_recording()) {
            bool finalized = clip_recorder_feed_capture(
                frame,
#ifdef APIS_PLATFORM_ESP32
                (hd_watch_active && raw_capture.valid) ? raw_capture.data : NULL,
                (hd_watch_active && raw_capture.valid) ? raw_capture.size : 0,
                (hd_watch_active && raw_capture.valid) ? raw_capture.width : 0,
                (hd_watch_active && raw_capture.valid) ? raw_capture.height : 0
#else
                NULL, 0, 0, 0
#endif
            );
            if (finalized) {
                clip_result_t finalized_result;
                if (clip_recorder_consume_last_result(&finalized_result) == 0) {
                    manual_capture_snapshot_t capture_snapshot;
                    bool manual_capture_clip = false;
                    bool should_upload = true;

                    manual_capture_get_snapshot(&capture_snapshot);
                    manual_capture_clip =
                        capture_snapshot.state == MANUAL_CAPTURE_STATE_RECORDING &&
                        strcmp(capture_snapshot.last_clip_path, finalized_result.filepath) == 0;

                    if (manual_capture_clip) {
                        manual_capture_mark_recorded(&finalized_result);
                        should_upload = capture_snapshot.upload_requested;
                    }

                    sync_pipeline_queue_finalized_clip(&finalized_result,
                                                       should_upload,
                                                       manual_capture_clip);
                } else {
                    LOG_WARN("Clip recorder reported finalization with no result payload");
                }
            }
        }

        if (clip_recorder_get_state() == RECORD_STATE_ERROR) {
            recover_failed_clip_recording();
        }

        {
            config_deterrent_mode_t deterrent_mode = CONFIG_DETERRENT_MODE_SHADOW;
            bool armed = false;
            bool detection_gate_open = true;

#ifdef APIS_PLATFORM_ESP32
            deterrent_mode = config_manager_get_deterrent_mode();
            armed = config_manager_is_armed();
            detection_gate_open = !vision_watch_unsupported &&
                                  (armed || deterrent_mode == CONFIG_DETERRENT_MODE_SHADOW);
#else
            armed = false;
#endif

            if (deterrent_mode != last_deterrent_mode) {
                deterrent_state_set_mode(deterrent_mode);
                targeting_set_actuation_enabled(
                    deterrent_mode == CONFIG_DETERRENT_MODE_LIVE);
                last_deterrent_mode = deterrent_mode;
                LOG_INFO("Deterrent mode set to %s",
                         config_deterrent_mode_name(deterrent_mode));
            }

            if (armed != last_armed_state) {
                if (armed) {
                    laser_controller_arm();
                } else {
                    if (deterrent_mode == CONFIG_DETERRENT_MODE_LIVE) {
                        targeting_cancel();
                    }
                    laser_controller_disarm();
                }
                last_armed_state = armed;
            }

            safety_feed_watchdog();
            safety_update();

            if (!detection_gate_open) {
                deterrent_state_update_tracking(NULL, NULL);
                safety_set_detection_active(false);
                vision_runtime_set_active_lane(-1);

                if (frame->timestamp_ms - last_fps_log_ms > FPS_LOG_INTERVAL_S * 1000) {
                    camera_stats_t stats;
                    camera_get_stats(&stats);
                    LOG_INFO("Stats (disarmed live mode): FPS=%.1f, frames=%u, uptime=%us",
                             stats.current_fps, stats.frames_captured, stats.uptime_s);
                    last_fps_log_ms = frame->timestamp_ms;
                }
                continue;
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
            detection_box_t target_boxes[MAX_TRACKED_OBJECTS];
            const classified_detection_t *target_map[MAX_TRACKED_OBJECTS];
            const classified_detection_t *selected_cls = NULL;
            const classified_detection_t *selected_profile_cls = NULL;
            targeting_snapshot_t targeting_snapshot;
            profile_target_selection_t profile_selection;
            bool saw_hornet_activity = false;
            bool shadow_profile_clip_only =
                install_profile != NULL &&
                install_profile->id == INSTALL_PROFILE_HIGH_MOUNT_THREE_HIVE_V1 &&
                config_manager_get_deterrent_mode() == CONFIG_DETERRENT_MODE_SHADOW;

            memset(target_boxes, 0, sizeof(target_boxes));
            memset(target_map, 0, sizeof(target_map));
            memset(&targeting_snapshot, 0, sizeof(targeting_snapshot));
            profile_scoring_reset(&profile_selection);

            // Classify tracked detections
            int num_classified = classifier_classify(tracked_results, num_tracked, classified_results);

            // Process classified results
            for (int i = 0; i < num_classified; i++) {
                classified_detection_t *cls = &classified_results[i];

                // Count hornet detections (MEDIUM or HIGH confidence)
                if (cls->classification == CLASS_HORNET &&
                    cls->confidence >= CONFIDENCE_MEDIUM) {
                    saw_hornet_activity = true;
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

                        if (!shadow_profile_clip_only) {
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

                    edge_telemetry_on_detection(cls,
                                                install_profile,
                                                frame->width,
                                                frame->height,
                                                frame->timestamp_ms);
                }
            }

            if (!saw_hornet_activity) {
                edge_telemetry_on_idle(frame->timestamp_ms);
            }

            profile_scoring_select_target(install_profile,
                                          classified_results,
                                          num_classified,
                                          frame->width,
                                          frame->height,
                                          &profile_selection);
            for (int lane = 0; lane < PROFILE_SCORING_LANE_COUNT; lane++) {
                const profile_lane_candidate_t *lane_best = &profile_selection.lanes[lane];
                const classified_detection_t *candidate =
                    lane_best->candidate_index >= 0
                        ? &classified_results[lane_best->candidate_index]
                        : NULL;

                if (candidate == NULL) {
                    vision_runtime_clear_lane(lane);
                    continue;
                }

                vision_runtime_update_lane(lane,
                                           candidate->track_id,
                                           candidate->detection.centroid_x,
                                           candidate->detection.centroid_y,
                                           candidate->detection.w * candidate->detection.h,
                                           candidate->hover_duration_ms,
                                           confidence_level_str(candidate->confidence),
                                           lane_best->score,
                                           shadow_lane_gate_is_cooling(&shadow_gate,
                                                                       lane,
                                                                       frame->timestamp_ms));
            }
            vision_runtime_set_active_lane(profile_selection.active_lane);
            selected_profile_cls =
                profile_selection.selected_index >= 0
                    ? &classified_results[profile_selection.selected_index]
                    : NULL;
            int target_candidate_count = 0;
            if (selected_profile_cls != NULL &&
                selected_profile_cls->confidence == CONFIDENCE_HIGH) {
                target_boxes[0].x = selected_profile_cls->detection.x;
                target_boxes[0].y = selected_profile_cls->detection.y;
                target_boxes[0].width = selected_profile_cls->detection.w;
                target_boxes[0].height = selected_profile_cls->detection.h;
                target_boxes[0].confidence = 1.0f;
                target_boxes[0].id = selected_profile_cls->track_id;
                target_map[0] = selected_profile_cls;
                target_candidate_count = 1;
            }

            safety_set_detection_active(target_candidate_count > 0);
            targeting_process_detections(target_boxes, (uint32_t)target_candidate_count);
            targeting_update();

            if (targeting_get_snapshot(&targeting_snapshot) == TARGET_OK &&
                targeting_snapshot.target_active) {
                selected_cls = find_targeted_classification(targeting_snapshot.target.track_id,
                                                            target_map,
                                                            target_candidate_count);

                if (selected_cls != NULL) {
                    safety_validate_tilt(targeting_snapshot.target.target_angle.tilt_deg);
                }

                deterrent_state_update_tracking(&targeting_snapshot, selected_cls);
            } else {
                deterrent_state_update_tracking(NULL, NULL);
                shadow_lane_gate_note_loss(&shadow_gate,
                                           frame->timestamp_ms,
                                           install_profile != NULL
                                               ? install_profile->reacquire_quiet_ms
                                               : 0);
            }

#ifdef APIS_PLATFORM_ESP32
            if (config_manager_get_deterrent_mode() == CONFIG_DETERRENT_MODE_SHADOW &&
                targeting_snapshot.target_active &&
                selected_cls != NULL) {
                int active_lane = install_profile_resolve_lane(
                    install_profile, frame->width, targeting_snapshot.target.centroid.x);
                bool lane_cooling = shadow_lane_gate_is_cooling(&shadow_gate,
                                                                active_lane,
                                                                frame->timestamp_ms);

                if (active_lane >= 0 && active_lane < PROFILE_SCORING_LANE_COUNT) {
                    vision_runtime_update_lane(active_lane,
                                               targeting_snapshot.target.track_id,
                                               targeting_snapshot.target.centroid.x,
                                               targeting_snapshot.target.centroid.y,
                                               targeting_snapshot.target.area,
                                               selected_cls->hover_duration_ms,
                                               confidence_level_str(selected_cls->confidence),
                                               200.0f,
                                               lane_cooling);
                }

                if (shadow_lane_gate_should_emit(&shadow_gate,
                                                 active_lane,
                                                 targeting_snapshot.target.track_id,
                                                 frame->timestamp_ms)) {
                    const char *shadow_clip_path = clip_recorder_get_current_path();

                    if ((shadow_clip_path == NULL || shadow_clip_path[0] == '\0') &&
                        !manual_capture_is_active()) {
                        shadow_clip_path = clip_recorder_start_owned(
                            0, 3000, CLIP_RECORDER_OWNER_SHADOW);
                    }

                    if (shadow_clip_path != NULL && shadow_clip_path[0] != '\0') {
                        deterrent_state_mark_clip_path(shadow_clip_path);
                    }

                    deterrent_state_record_shadow_event(frame,
                                                        &targeting_snapshot,
                                                        selected_cls,
                                                        shadow_clip_path,
                                                        true);

                    LOG_INFO("Shadow target acquired: track=%u center=(%d,%d) area=%d hover=%ums would_move=%s would_fire=%s clip=%s",
                             targeting_snapshot.target.track_id,
                             targeting_snapshot.target.centroid.x,
                             targeting_snapshot.target.centroid.y,
                             targeting_snapshot.target.area,
                             selected_cls->hover_duration_ms,
                             targeting_snapshot.would_move ? "true" : "false",
                             targeting_snapshot.would_fire ? "true" : "false",
                             shadow_clip_path != NULL ? shadow_clip_path : "");

                    shadow_lane_gate_note_emit(&shadow_gate,
                                               active_lane,
                                               targeting_snapshot.target.track_id);
                }
            } else if (!targeting_snapshot.target_active) {
                shadow_lane_gate_note_loss(&shadow_gate,
                                           frame->timestamp_ms,
                                           install_profile != NULL
                                               ? install_profile->reacquire_quiet_ms
                                               : 0);
            }
#endif
        } else {
            edge_telemetry_on_idle(frame->timestamp_ms);
            targeting_process_detections(NULL, 0);
            targeting_update();
            safety_set_detection_active(false);
            deterrent_state_update_tracking(NULL, NULL);
            for (int lane = 0; lane < PROFILE_SCORING_LANE_COUNT; lane++) {
                vision_runtime_clear_lane(lane);
            }
            vision_runtime_set_active_lane(-1);
            shadow_lane_gate_note_loss(&shadow_gate,
                                       frame->timestamp_ms,
                                       install_profile != NULL
                                           ? install_profile->reacquire_quiet_ms
                                           : 0);
        }

        // Story 10.5: Check if clip storage needs cleanup
        if (storage_manager_needs_cleanup()) {
            LOG_WARN("Clip storage threshold exceeded, cleaning up oldest clips");
            int deleted = storage_manager_cleanup();
            if (deleted > 0) {
                LOG_INFO("Deleted %d old clips to free storage", deleted);
            }
        }

        vision_analysis_frames++;
    }

    // Cleanup — stop camera DMA first to prevent PSRAM heap spinlock
    // deadlocks when freeing PSRAM-allocated buffers (quirc, motion).
    LOG_INFO("Shutting down... (total motions=%u, hornet detections=%u)",
             total_detections, total_hornet_detections);
    camera_close();

    // Stop any active recording
    if (clip_recorder_is_recording()) {
        clip_result_t final_result;
        clip_recorder_stop(&final_result);
        LOG_INFO("Stopped final clip: %s", final_result.filepath);

        manual_capture_snapshot_t capture_snapshot;
        bool manual_capture_clip = false;
        bool should_upload = true;

        manual_capture_get_snapshot(&capture_snapshot);
        manual_capture_clip =
            capture_snapshot.state == MANUAL_CAPTURE_STATE_RECORDING &&
            strcmp(capture_snapshot.last_clip_path, final_result.filepath) == 0;

        if (manual_capture_clip) {
            manual_capture_mark_recorded(&final_result);
            should_upload = capture_snapshot.upload_requested;
        }

        sync_pipeline_queue_finalized_clip(&final_result,
                                           should_upload,
                                           manual_capture_clip);
    }

    free(classified_results);
    free(tracked_results);
    free(detection_result);
    free(frame);
    qr_scanner_cleanup();
    storage_manager_cleanup_resources();
    sync_pipeline_cleanup();
    clip_recorder_cleanup();
    manual_capture_cleanup();
    rolling_buffer_cleanup();
    event_logger_close();
    cleanup_targeting_stack();
    classifier_cleanup();
    tracker_cleanup();
    motion_cleanup();
    vision_runtime_cleanup();
#ifdef APIS_PLATFORM_ESP32
    free(raw_capture.data);
    raw_capture.data = NULL;
#endif

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

    // Initialize LED controller first — provides visual feedback from boot
    if (led_controller_init() == 0) {
        led_controller_set_state(LED_STATE_BOOT);
    }

    manual_capture_init();

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    // Setup signal handlers (not available on ESP32 / FreeRTOS)
    // S8-L-06: signal() has implementation-defined behavior (System V vs BSD
    // semantics). On our target platforms (glibc on Pi), BSD semantics are used
    // which keep the handler installed after invocation.
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
#endif

#ifdef APIS_PLATFORM_ESP32
    // In AP setup mode, don't start the heavy camera/detection pipeline.
    // Just run the HTTP server and wait for the user to configure WiFi
    // via the setup page. This keeps CPU free for WiFi client handling.
    if (wifi_provision_get_mode() == WIFI_PROV_MODE_AP) {
        LOG_INFO("Device in setup mode - waiting for WiFi configuration");

        // Switch LED from BOOT to SETUP (pulsing cyan)
        led_controller_clear_state(LED_STATE_BOOT);
        led_controller_set_state(LED_STATE_SETUP);

        char ap_ssid[32];
        wifi_provision_get_ap_ssid(ap_ssid, sizeof(ap_ssid));
        LOG_INFO("=== SETUP CREDENTIALS ===");
        LOG_INFO("  WiFi Network: %s", ap_ssid);
        LOG_INFO("  WiFi Password: (open hotspot)");
        LOG_INFO("  Setup URL: http://192.168.4.1/setup (auto-popup)");
        LOG_INFO("=========================");

        // Initialize config manager so needs_setup=true is set correctly
        // (without this, config_manager_needs_setup() returns false and
        // the /setup endpoint requires authentication)
        config_manager_init(false);

        // Start captive DNS server: intercepts all DNS queries and responds
        // with our AP IP (192.168.4.1). This makes captive portal detection
        // work on iOS, Android, Windows, and macOS — the setup page pops up
        // automatically when a phone connects to our WiFi.
        esp_netif_ip_info_t ip_info;
        esp_netif_t *ap_netif = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
        if (ap_netif && esp_netif_get_ip_info(ap_netif, &ip_info) == ESP_OK) {
            if (captive_dns_start(ip_info.ip.addr) == 0) {
                LOG_INFO("Captive DNS started — portal will auto-popup on connect");
            } else {
                LOG_WARN("Captive DNS failed — users must manually visit setup URL");
            }
        } else {
            LOG_WARN("Could not get AP IP for captive DNS");
        }

        // Start HTTP server on port 80 for captive portal.
        // Port 80 is required because OS captive portal probes (Apple, Google,
        // Microsoft) always use port 80. Port 8080 would not be detected.
        http_config_t http_cfg = http_server_default_config();
        http_cfg.port = 80;
        if (http_server_init(&http_cfg) == 0 && http_server_start(true) == 0) {
            LOG_INFO("HTTP server started on port %d for setup (captive portal)",
                     http_cfg.port);
        } else {
            LOG_ERROR("Failed to start HTTP server for setup");
        }

        // Idle loop - yield to FreeRTOS so WiFi + HTTP + DNS can work.
        // If no client connects within AP_TIMEOUT_S, stop AP and fall through
        // to standalone detection mode (no WiFi, no server, just hornets).
        #define AP_TIMEOUT_S (5 * 60)  // 5 minutes
        int heartbeat = 0;
        bool ap_timed_out = false;
        while (g_running) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            heartbeat++;

            // Check AP timeout
            if (heartbeat >= AP_TIMEOUT_S) {
                wifi_sta_list_t sta_list;
                bool has_clients = (esp_wifi_ap_get_sta_list(&sta_list) == ESP_OK
                                    && sta_list.num > 0);
                if (!has_clients) {
                    LOG_INFO("AP timeout (%ds) — no client connected, "
                             "entering standalone detection mode", AP_TIMEOUT_S);
                    ap_timed_out = true;
                    break;
                }
            }

            // Log heartbeat every 10 seconds so serial shows device is alive
            if (heartbeat % 10 == 0) {
                wifi_sta_list_t sta_list;
                if (esp_wifi_ap_get_sta_list(&sta_list) == ESP_OK) {
                    LOG_INFO("Setup mode alive (%ds) — %d client(s) connected",
                             heartbeat, sta_list.num);
                } else {
                    LOG_INFO("Setup mode alive (%ds)", heartbeat);
                }
            }
        }

        captive_dns_stop();
        http_server_stop();
        http_server_cleanup();

        if (ap_timed_out) {
            // Stop AP radio and fall through to standalone detection mode
            wifi_provision_stop_ap();
            led_controller_clear_state(LED_STATE_SETUP);

            // Allocate detection-phase PSRAM (was not allocated in QR phase)
            if (motion_init(NULL) == MOTION_OK) {
                LOG_INFO("Motion detection allocated for standalone mode");
            }
            rolling_buffer_config_t buf_cfg = rolling_buffer_config_defaults();
            buf_cfg.duration_seconds = 1.0f;
            buf_cfg.fps = 3;
            rolling_buffer_init(&buf_cfg);
            apis_preallocate_frame();
            qr_scanner_cleanup();  // Free QR PSRAM if allocated

            // Init camera at QVGA for detection
            if (camera_reconfigure(CAMERA_MODE_QVGA_GRAY) == CAMERA_OK) {
                LOG_INFO("Camera reconfigured to QVGA for standalone detection");
            }
            // Fall through to run_capture_loop() below
        } else {
            manual_capture_cleanup();
            log_shutdown();
            return 0;
        }
    }
#endif

#ifdef APIS_PLATFORM_ESP32
    if (wifi_provision_get_mode() == WIFI_PROV_MODE_STA) {
        // In STA mode — WiFi connected, switch LED from BOOT to operational
        led_controller_clear_state(LED_STATE_BOOT);

        // Initialize config manager and start HTTP server
        // so the device can be managed (status, arm/disarm, stream) over the network
        config_manager_init(false);

        http_config_t http_cfg = http_server_default_config();
        if (http_server_init(&http_cfg) == 0 && http_server_start(true) == 0) {
            LOG_INFO("HTTP server started on port %d", http_cfg.port);
        } else {
            LOG_WARN("HTTP server failed to start - device will run without web API");
        }

        // Server discovery chain (see onboarding_defaults.h for self-hoster docs):
        //   1. Saved config → use if user configured a URL during setup
        //   2. mDNS → auto-discover _hivewarden._tcp on the local network
        //   3. Default URL → ONBOARDING_DEFAULT_URL (hivewarden.eu or self-hosted)
        //   4. Fallback URL → ONBOARDING_FALLBACK_URL (optional backup)
        {
            // Initialize mDNS: set hostname and advertise this device
            char ap_ssid[32];
            wifi_provision_get_ap_ssid(ap_ssid, sizeof(ap_ssid));
            const char *device_suffix = ap_ssid + strlen("HiveWarden-");
            mdns_discovery_init(device_suffix, http_cfg.port);

            // Check if server URL is already configured (step 1)
            runtime_config_t cfg_snap;
            config_manager_get_public(&cfg_snap);

            if (strlen(cfg_snap.server.url) > 0) {
                // User configured a URL during setup — use it
                LOG_INFO("Server URL configured: %s", cfg_snap.server.url);
            } else {
                // No URL configured — try discovery chain
                bool found = false;
                config_manager_clear_runtime_server_url();

                // Step 2: mDNS auto-discovery (local network)
                mdns_server_result_t server;
                if (mdns_discovery_find_server(&server) == 0) {
                    char url[128];
                    snprintf(url, sizeof(url), "http://%s:%u", server.host, server.port);
                    if (config_manager_set_runtime_server_choice(url, CONFIG_HOME_SOURCE_MDNS) == 0) {
                        LOG_INFO("Runtime server found via mDNS: %s", url);
                        found = true;
                    }
                }

                // Step 3: Default URL from onboarding_defaults.h
                if (!found && strlen(ONBOARDING_DEFAULT_URL) > 0) {
                    if (config_manager_set_runtime_server_choice(
                            ONBOARDING_DEFAULT_URL,
                            CONFIG_HOME_SOURCE_DEFAULT) == 0) {
                        LOG_INFO("Using runtime default server: %s", ONBOARDING_DEFAULT_URL);
                        found = true;
                    }
                }

                // Step 4: Fallback URL (optional, for self-hosters)
                if (!found && strlen(ONBOARDING_FALLBACK_URL) > 0) {
                    if (config_manager_set_runtime_server_choice(
                            ONBOARDING_FALLBACK_URL,
                            CONFIG_HOME_SOURCE_FALLBACK) == 0) {
                        LOG_INFO("Using runtime fallback server: %s", ONBOARDING_FALLBACK_URL);
                        found = true;
                    }
                }

                if (!found) {
                    LOG_WARN("No server configured — device will run detection "
                             "but cannot upload clips or send heartbeats");
                }
            }

            // Check if device has an API key — if not, it's unclaimed
            config_manager_get_public(&cfg_snap);
            if (strlen(cfg_snap.server.api_key) == 0) {
                g_defer_server_comm_start = false;
                led_controller_set_state(LED_STATE_UNCLAIMED);
                LOG_INFO("Device unclaimed — LED shows amber heartbeat. "
                         "Scan a QR code or configure API key to claim.");
            } else {
                // Device is claimed and ready — default to DISARMED
                led_controller_set_state(LED_STATE_DISARMED);

                if (server_comm_init() == 0) {
                    if (server_comm_start() == 0) {
                        g_defer_server_comm_start = false;
                        LOG_INFO("Heartbeat service started before capture warm-up");
                    } else {
                        g_defer_server_comm_start = true;
                        LOG_WARN("Immediate heartbeat start failed; "
                                 "will retry after capture warm-up");
                    }
                } else {
                    g_defer_server_comm_start = false;
                    LOG_WARN("Heartbeat service init failed");
                }
            }
        }
    } else {
        LOG_INFO("WiFi not in STA mode — skipping network bootstrap (standalone mode)");
    }
#endif

    // Run main capture loop (only when WiFi is connected or on non-ESP32)
    int result = run_capture_loop(config);

    // Cleanup LED controller
    server_comm_cleanup();

    if (led_controller_is_initialized()) {
        led_controller_cleanup();
    }

    // Log final message before shutting down the logger
    LOG_INFO("APIS Edge stopped (exit code: %d)", result);
    log_shutdown();

    return result;
}
