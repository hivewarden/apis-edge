/**
 * ESP32 Entry Point Wrapper for APIS Edge
 *
 * This file initializes the ESP32-specific subsystems (NVS, SPIFFS) before
 * calling the platform-agnostic APIS main() function from src/main.c.
 *
 * Initialization sequence:
 *   1. NVS Flash (device configuration, WiFi settings)
 *   2. SPIFFS (event database, clips, configuration)
 *   3. PSRAM pre-allocation (QR scanner, motion detection buffers)
 *   4. Camera init (GDMA descriptors need unfragmented internal SRAM)
 *   5. WiFi (STA or AP mode)
 *   6. APIS main() (capture loop, detection pipeline)
 */

#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_spiffs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wifi_provision.h"
#include "led_controller.h"
#include "camera.h"
#include "qr_scanner.h"
#include "detection.h"
#include "rolling_buffer.h"
#include "config_manager.h"
#include "server_comm.h"
#include "http_server.h"
#include "mdns_discovery.h"
#include "onboarding_defaults.h"
#include "secure_util.h"

#include <string.h>

// Forward declarations of platform-agnostic functions from src/main.c
extern int main(int argc, char *argv[]);
extern void apis_preallocate_frame(void);

static const char *TAG = "apis_esp32";

typedef struct {
    camera_mode_t mode;
    int width;
    int height;
    const char *name;
} qr_scan_mode_config_t;

static const qr_scan_mode_config_t k_qr_scan_primary_mode = {
    CAMERA_MODE_XGA_GRAY, 1024, 768, "XGA"
};
static const qr_scan_mode_config_t k_qr_scan_fallback_mode = {
    CAMERA_MODE_VGA_GRAY, 640, 480, "VGA"
};
static qr_scan_mode_config_t g_qr_scan_mode = {
    CAMERA_MODE_XGA_GRAY, 1024, 768, "XGA"
};

static camera_qr_profile_t next_qr_profile(camera_qr_profile_t profile) {
    switch (profile) {
        case CAMERA_QR_PROFILE_SCREEN_GLARE:
            return CAMERA_QR_PROFILE_SCREEN_BALANCED;
        case CAMERA_QR_PROFILE_SCREEN_BALANCED:
            return CAMERA_QR_PROFILE_SCREEN_BRIGHT;
        case CAMERA_QR_PROFILE_SCREEN_BRIGHT:
        default:
            return CAMERA_QR_PROFILE_SCREEN_GLARE;
    }
}

typedef enum {
    ONBOARDING_STATE_SKIP = 0,
    ONBOARDING_STATE_QR_SCAN,
    ONBOARDING_STATE_QR_CLAIMED,
    ONBOARDING_STATE_DETECTION_READY,
    ONBOARDING_STATE_FAILED,
} onboarding_state_t;

static const char *onboarding_state_str(onboarding_state_t state) {
    switch (state) {
        case ONBOARDING_STATE_SKIP: return "SKIP";
        case ONBOARDING_STATE_QR_SCAN: return "QR_SCAN";
        case ONBOARDING_STATE_QR_CLAIMED: return "QR_CLAIMED";
        case ONBOARDING_STATE_DETECTION_READY: return "DETECTION_READY";
        case ONBOARDING_STATE_FAILED: return "FAILED";
        default: return "UNKNOWN";
    }
}

static void restart_due_to_init_failure(const char *reason) {
    ESP_LOGE(TAG, "Startup failed: %s", reason ? reason : "unknown");
    ESP_LOGE(TAG, "Rebooting in 5 seconds...");
    vTaskDelay(pdMS_TO_TICKS(5000));
    esp_restart();
}

static bool allocate_detection_phase_resources(void) {
    bool ok = true;

    if (motion_init(NULL) == MOTION_OK) {
        ESP_LOGI(TAG, "Motion detection allocated (~2MB PSRAM)");
    } else {
        ESP_LOGE(TAG, "Motion detection allocation failed");
        ok = false;
    }

    rolling_buffer_config_t buf_cfg = rolling_buffer_config_defaults();
    buf_cfg.duration_seconds = 1.0f;
    buf_cfg.fps = 3;
    if (rolling_buffer_init(&buf_cfg) == ROLLING_BUFFER_OK) {
        ESP_LOGI(TAG, "Rolling buffer allocated for 1s pre-roll");
    } else {
        ESP_LOGE(TAG, "Rolling buffer allocation failed");
        ok = false;
    }

    apis_preallocate_frame();
    ESP_LOGI(TAG, "Analysis frame buffer allocated for runtime watch path");

    return ok;
}

static void seed_onboarding_server_choice(uint16_t http_port) {
    static runtime_config_t cfg_snap;

    config_manager_get_effective_snapshot(&cfg_snap);
    if (strlen(cfg_snap.server.url) > 0) {
        ESP_LOGI(TAG, "Onboarding server already available: %s", cfg_snap.server.url);
        return;
    }

    config_manager_clear_runtime_server_url();

    char ap_ssid[32];
    wifi_provision_get_ap_ssid(ap_ssid, sizeof(ap_ssid));
    const char *prefix = "HiveWarden-";
    const char *device_suffix = ap_ssid;
    if (strncmp(ap_ssid, prefix, strlen(prefix)) == 0) {
        device_suffix = ap_ssid + strlen(prefix);
    }

    (void)mdns_discovery_init(device_suffix, http_port);

    mdns_server_result_t server;
    if (mdns_discovery_find_server(&server) == 0) {
        char url[128];
        snprintf(url, sizeof(url), "http://%s:%u", server.host, server.port);
        if (config_manager_set_runtime_server_choice(url, CONFIG_HOME_SOURCE_MDNS) == 0) {
            ESP_LOGI(TAG, "Onboarding runtime server found via mDNS: %s", url);
            return;
        }
    }

    if (strlen(ONBOARDING_DEFAULT_URL) > 0 &&
        config_manager_set_runtime_server_choice(
            ONBOARDING_DEFAULT_URL,
            CONFIG_HOME_SOURCE_DEFAULT) == 0) {
        ESP_LOGI(TAG, "Onboarding using default server: %s", ONBOARDING_DEFAULT_URL);
        return;
    }

    if (strlen(ONBOARDING_FALLBACK_URL) > 0 &&
        config_manager_set_runtime_server_choice(
            ONBOARDING_FALLBACK_URL,
            CONFIG_HOME_SOURCE_FALLBACK) == 0) {
        ESP_LOGI(TAG, "Onboarding using fallback server: %s", ONBOARDING_FALLBACK_URL);
        return;
    }

    ESP_LOGW(TAG, "Onboarding has no resolved server URL yet");
}

static bool get_claim_server_url(char *out, size_t out_size, const qr_scan_result_t *qr) {
    static runtime_config_t cfg_snap;

    if (qr && strlen(qr->server_url) > 0) {
        snprintf(out, out_size, "%s", qr->server_url);
        return true;
    }

    config_manager_get_effective_snapshot(&cfg_snap);
    if (strlen(cfg_snap.server.url) == 0) {
        return false;
    }

    snprintf(out, out_size, "%s", cfg_snap.server.url);
    return true;
}

static bool finalize_claimed_identity(const char *claim_server_url, const char *api_key,
                                      const char *source_label) {
    if (config_manager_finalize_claim(claim_server_url, api_key) != 0) {
        ESP_LOGE(TAG, "Failed to persist claimed identity from %s", source_label);
        return false;
    }

    ESP_LOGI(TAG, "Device claimed via %s — server: %s", source_label, claim_server_url);
    return true;
}

static bool try_pending_claim_token(void) {
    char claim_token[CFG_MAX_API_KEY_LEN] = {0};
    char claim_server_url[CFG_MAX_URL_LEN] = {0};
    char claimed_api_key[CFG_MAX_API_KEY_LEN] = {0};

    if (config_manager_get_pending_claim_token(claim_token, sizeof(claim_token)) != 0) {
        return false;
    }

    if (!config_manager_begin_claim_exchange()) {
        secure_clear(claim_token, sizeof(claim_token));
        return false;
    }

    if (config_manager_get_pending_claim_server_url(
            claim_server_url, sizeof(claim_server_url)) != 0 &&
        !get_claim_server_url(claim_server_url, sizeof(claim_server_url), NULL)) {
        ESP_LOGW(TAG, "Pending claim token present but no server URL is available yet");
        config_manager_end_claim_exchange();
        secure_clear(claim_token, sizeof(claim_token));
        return false;
    }

    ESP_LOGI(TAG, "Pending claim token detected — exchanging with %s", claim_server_url);
    if (server_comm_exchange_claim_token(claim_server_url, claim_token,
                                         claimed_api_key, sizeof(claimed_api_key)) != 0) {
        ESP_LOGW(TAG, "Pending claim token exchange failed");
        config_manager_end_claim_exchange();
        secure_clear(claim_token, sizeof(claim_token));
        secure_clear(claimed_api_key, sizeof(claimed_api_key));
        return false;
    }

    secure_clear(claim_token, sizeof(claim_token));
    if (!finalize_claimed_identity(claim_server_url, claimed_api_key, "pending token")) {
        config_manager_end_claim_exchange();
        secure_clear(claimed_api_key, sizeof(claimed_api_key));
        return false;
    }

    config_manager_end_claim_exchange();
    secure_clear(claimed_api_key, sizeof(claimed_api_key));
    return true;
}

static bool configure_qr_scan_buffers(const qr_scan_mode_config_t *mode) {
    if (!mode) {
        return false;
    }

    qr_scanner_cleanup();
    if (qr_scanner_init_with_size(mode->width, mode->height) != QR_SCANNER_OK) {
        ESP_LOGW(TAG, "QR scanner allocation failed at %s (%dx%d)",
                 mode->name, mode->width, mode->height);
        return false;
    }

    g_qr_scan_mode = *mode;
    ESP_LOGI(TAG, "QR scanner allocated at %s (%dx%d, ~%dKB)",
             mode->name, mode->width, mode->height,
             (mode->width * mode->height) / 1024);
    return true;
}

/**
 * Initialize NVS (Non-Volatile Storage)
 *
 * NVS stores:
 *   - Device configuration (WiFi SSID, server URL, etc.)
 *   - WiFi credentials
 *   - Device identity (MAC address, name)
 *   - Persistent state (last seen events, firmware version)
 */
static void init_nvs(void) {
    ESP_LOGI(TAG, "Initializing NVS");

    esp_err_t ret = nvs_flash_init();

    // If NVS is full or corrupted, erase and reinitialize
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS corrupted or full - erasing");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    ESP_ERROR_CHECK(ret);
    ESP_LOGI(TAG, "NVS initialized successfully");
}

/**
 * Initialize SPIFFS (SPI Flash File System)
 *
 * SPIFFS partition layout (from partitions.csv):
 *   - Partition: "storage" (3MB)
 *   - Mounted at: /data
 *   - Contains:
 *     * events.db (SQLite event log)
 *     * clips/ (recorded motion clips)
 *     * temp/ (temporary processing files)
 *
 * SPIFFS is required for:
 *   - Event logging (motion detections, classifications)
 *   - Clip storage (short video segments)
 *   - Configuration persistence
 */
static void init_spiffs(void) {
    ESP_LOGI(TAG, "Initializing SPIFFS");

    esp_vfs_spiffs_conf_t conf = {
        .base_path = "/data",
        .partition_label = "storage",
        .max_files = 10,
        .format_if_mount_failed = true  // Auto-format if corrupted
    };

    esp_err_t ret = esp_vfs_spiffs_register(&conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPIFFS registration failed: %s", esp_err_to_name(ret));
        return;
    }

    // Query SPIFFS usage
    size_t total = 0, used = 0;
    ret = esp_spiffs_info("storage", &total, &used);
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "SPIFFS: %.1f MB total, %.1f MB used",
                 total / (1024.0 * 1024.0), used / (1024.0 * 1024.0));
    } else {
        ESP_LOGW(TAG, "Failed to get SPIFFS info: %s", esp_err_to_name(ret));
    }
}

/**
 * Run QR scanning loop in the QR/onboarding phase.
 *
 * Blocks until a valid QR code is scanned or the device is reset.
 * Camera must be initialized at QVGA before calling this.
 */
static bool run_qr_scanning_loop(void) {
    const int k_max_consecutive_capture_failures = 20;
    const int k_max_consecutive_process_failures = 20;
    const uint32_t k_profile_switch_interval_frames = 25;
    const TickType_t k_pending_claim_retry_ticks = pdMS_TO_TICKS(5000);
    int capture_failures = 0;
    int process_failures = 0;
    uint32_t last_profile_switch_frame = 0;
    TickType_t last_pending_claim_attempt = 0;

    ESP_LOGI(TAG, "Entering QR scanning phase (%s %dx%d)...",
             g_qr_scan_mode.name, g_qr_scan_mode.width, g_qr_scan_mode.height);
    camera_set_qr_profile(CAMERA_QR_PROFILE_SCREEN_BALANCED);
    ESP_LOGI(TAG, "QR screen-scan profile: %s",
             camera_qr_profile_name(camera_get_qr_profile()));
    if (led_controller_is_initialized()) {
        led_controller_set_state(LED_STATE_UNCLAIMED);
    }

    if (!qr_scanner_is_initialized()) {
        ESP_LOGE(TAG, "QR scanner is not initialized");
        return false;
    }

    while (true) {
        TickType_t now = xTaskGetTickCount();
        if (config_manager_has_pending_claim_token() &&
            (last_pending_claim_attempt == 0 ||
             now - last_pending_claim_attempt >= k_pending_claim_retry_ticks)) {
            last_pending_claim_attempt = now;
            if (try_pending_claim_token()) {
                return true;
            }
        }

        // Lightweight camera read: fb_get → feed quirc → fb_return
        camera_status_t cam_status = camera_read_qr(1000);
        if (cam_status != CAMERA_OK) {
            capture_failures++;
            ESP_LOGW(TAG, "QR capture failed (%d/%d): %s",
                     capture_failures, k_max_consecutive_capture_failures,
                     camera_status_str(cam_status));
            if (capture_failures >= k_max_consecutive_capture_failures) {
                ESP_LOGE(TAG, "QR capture failed too many times");
                return false;
            }
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        capture_failures = 0;

        // Process QR detection
        qr_scan_result_t qr = {0};
        qr_scanner_status_t qr_status = qr_scanner_process(&qr);
        if (qr_status != QR_SCANNER_OK) {
            process_failures++;
            ESP_LOGW(TAG, "QR process failed (%d/%d): %s",
                     process_failures, k_max_consecutive_process_failures,
                     qr_scanner_status_str(qr_status));
            secure_clear(&qr, sizeof(qr));
            if (process_failures >= k_max_consecutive_process_failures) {
                ESP_LOGE(TAG, "QR processing failed too many times");
                return false;
            }
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        process_failures = 0;

        qr_scanner_diagnostics_t qr_diag = {0};
        qr_scanner_get_diagnostics(&qr_diag);

        if (qr.found) {
            static char claim_server_url[CFG_MAX_URL_LEN];
            char claimed_api_key[64] = {0};

            if (!get_claim_server_url(claim_server_url, sizeof(claim_server_url), &qr)) {
                ESP_LOGW(TAG, "QR decoded but no server URL is available for claim validation");
                secure_clear(&qr, sizeof(qr));
                vTaskDelay(pdMS_TO_TICKS(250));
                continue;
            }

            if (qr.claim_type == QR_CLAIM_TOKEN) {
                if (!config_manager_begin_claim_exchange()) {
                    secure_clear(&qr, sizeof(qr));
                    vTaskDelay(pdMS_TO_TICKS(250));
                    continue;
                }
                ESP_LOGI(TAG, "QR claim token detected — exchanging with %s", claim_server_url);
                if (server_comm_exchange_claim_token(
                        claim_server_url, qr.claim_token,
                        claimed_api_key, sizeof(claimed_api_key)) != 0) {
                    config_manager_end_claim_exchange();
                    ESP_LOGW(TAG, "QR claim token exchange failed");
                    secure_clear(&qr, sizeof(qr));
                    secure_clear(claimed_api_key, sizeof(claimed_api_key));
                    vTaskDelay(pdMS_TO_TICKS(250));
                    continue;
                }
                if (!finalize_claimed_identity(claim_server_url, claimed_api_key, "QR claim token")) {
                    config_manager_end_claim_exchange();
                    secure_clear(&qr, sizeof(qr));
                    secure_clear(claimed_api_key, sizeof(claimed_api_key));
                    return false;
                }
                config_manager_end_claim_exchange();
                secure_clear(&qr, sizeof(qr));
                secure_clear(claimed_api_key, sizeof(claimed_api_key));
                return true;
            } else {
                strncpy(claimed_api_key, qr.api_key, sizeof(claimed_api_key) - 1);
                claimed_api_key[sizeof(claimed_api_key) - 1] = '\0';
            }

            ESP_LOGI(TAG, "QR code detected — validating with %s", claim_server_url);
            if (server_comm_validate_key(claim_server_url, claimed_api_key) == 0) {
                if (!finalize_claimed_identity(claim_server_url, claimed_api_key, "QR API key")) {
                    secure_clear(&qr, sizeof(qr));
                    secure_clear(claimed_api_key, sizeof(claimed_api_key));
                    return false;
                }
                secure_clear(&qr, sizeof(qr));
                secure_clear(claimed_api_key, sizeof(claimed_api_key));
                return true;
            } else {
                ESP_LOGW(TAG, "QR API key validation failed");
            }
            secure_clear(claimed_api_key, sizeof(claimed_api_key));
        }

        if (!qr.found &&
            qr_diag.frames_with_payload == 0 &&
            qr_diag.frames_processed - last_profile_switch_frame >= k_profile_switch_interval_frames) {
            camera_qr_profile_t current_profile = camera_get_qr_profile();
            camera_qr_profile_t next_profile = next_qr_profile(current_profile);
            camera_set_qr_profile(next_profile);
            last_profile_switch_frame = qr_diag.frames_processed;
            ESP_LOGI(TAG, "QR decode still pending (%s via %s) — switching screen profile to %s",
                     qr_diag.last_decode_error[0] ? qr_diag.last_decode_error : "no payload",
                     qr_diag.last_decode_pass,
                     camera_qr_profile_name(next_profile));
        }

        secure_clear(&qr, sizeof(qr));
        vTaskDelay(pdMS_TO_TICKS(100));  // ~10 FPS QR scanning
    }

    return false;
}

/**
 * Transition from QR scanning phase to detection phase.
 *
 * Sequence: stop camera DMA → free QR PSRAM → allocate detection PSRAM →
 * reinit camera at detection resolution → update LED.
 */
static bool phase_transition_to_detection(void) {
    ESP_LOGI(TAG, "Transitioning to detection phase...");

    // 1. Stop camera DMA (safe for PSRAM operations)
    camera_close();

    // 2. Free QR scanner PSRAM (~75KB)
    qr_scanner_cleanup();

    // 3. Allocate detection-phase PSRAM (now safe, no DMA)
    if (!allocate_detection_phase_resources()) {
        ESP_LOGE(TAG, "Detection resource allocation failed");
        return false;
    }

    // 4. Reinit camera at QVGA. The main capture loop will perform the
    // install-profile HD probe and mark unsupported loudly if it cannot hold.
    if (camera_reconfigure(CAMERA_MODE_QVGA_GRAY) != CAMERA_OK) {
        ESP_LOGE(TAG, "Camera detection reconfigure failed");
        return false;
    }
    ESP_LOGI(TAG, "Camera reconfigured to QVGA (320x240)");

    // 5. Update LED
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_UNCLAIMED);
        led_controller_set_state(LED_STATE_DISARMED);
    }

    ESP_LOGI(TAG, "Detection phase ready (~6MB PSRAM)");
    return true;
}

/**
 * ESP32 Application Entry Point
 *
 * Called by the ESP32 bootloader after hardware initialization.
 * Sets up ESP32 subsystems with lifecycle-aware PSRAM allocation:
 *
 *   QR phase (unclaimed):  ~157KB PSRAM (quirc 75KB + 1 camera fb 77KB)
 *   Detection phase (claimed): ~3.5MB PSRAM (motion + rolling buf + frame + 1 fb)
 *
 * QR scanning and motion detection NEVER run simultaneously — this prevents
 * MSPI bus contention that causes PSRAM cache corruption and DMA crashes.
 *
 * Initialization sequence:
 *   1. NVS Flash (device configuration, WiFi settings)
 *   2. SPIFFS (event database, clips, configuration)
 *   3. Phase-aware PSRAM allocation (QR-only OR detection-only)
 *   4. WiFi (STA or AP mode)
 *   5. Camera init (QVGA for QR and detection on ESP32)
 *   6. QR scanning loop (if unclaimed) → phase transition → detection
 *   7. APIS main() (capture loop, detection pipeline)
 */
void app_main(void) {
    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "APIS Edge starting on ESP32-S3 Sense");
    ESP_LOGI(TAG, "========================================");

    // Step 1: Initialize NVS (required for WiFi + device config)
    init_nvs();

    // Step 2: Initialize SPIFFS (required for event database + clips)
    init_spiffs();

    // Step 3: Determine device state from NVS to decide PSRAM allocation.
    // Check BEFORE WiFi init (lightweight NVS reads, no network needed).
    bool has_wifi = wifi_provision_has_credentials();
    // Initialize config manager early to check API key state.
    // config_manager_init() loads from /data/apis/config.json (SPIFFS).
    config_manager_init(false);
    runtime_config_t cfg_snap;
    config_manager_get_public(&cfg_snap);
    bool has_api_key = (strlen(cfg_snap.server.api_key) > 0);
    bool needs_qr = has_wifi && !has_api_key;
    bool fully_claimed = has_wifi && has_api_key;

    ESP_LOGI(TAG, "Device state: wifi=%d, api_key=%d, needs_qr=%d, claimed=%d",
             has_wifi, has_api_key, needs_qr, fully_claimed);

    // Step 4: Phase-aware PSRAM allocation BEFORE camera DMA starts.
    // On ESP32 with CONFIG_SPIRAM_USE_MALLOC, malloc/calloc > 16KB routes
    // to PSRAM automatically. Camera DMA on the MSPI bus causes PSRAM heap
    // spinlock contention, so large PSRAM allocations must happen before
    // esp_camera_init() starts DMA.
    if (!fully_claimed) {
        // QR/onboarding phase: dedicate as much image detail as this board can
        // hold because the operator is indoors and explicitly trying to claim.
        ESP_LOGI(TAG, "QR phase — allocating high-resolution scan buffers...");
        if (!configure_qr_scan_buffers(&k_qr_scan_primary_mode) &&
            !configure_qr_scan_buffers(&k_qr_scan_fallback_mode)) {
            ESP_LOGE(TAG, "QR scanner allocation failed");
        }
        // Do NOT allocate motion, rolling buffer, or frame_t
    } else {
        // Detection phase: full PSRAM (~5.8MB total)
        ESP_LOGI(TAG, "Detection phase — allocating full PSRAM...");
        if (!allocate_detection_phase_resources()) {
            restart_due_to_init_failure("detection resource allocation failed");
            return;
        }
    }

    // Step 5: Initialize WiFi BEFORE camera.
    // Camera DMA starts immediately on init and competes with WiFi on the
    // MSPI bus for PSRAM access. Starting camera before WiFi causes
    // EV-EOF-OVF (DMA event overflow) during WiFi init, which corrupts the
    // camera state machine and makes esp_camera_fb_get() block forever.
    ESP_LOGI(TAG, "Initializing WiFi...");
    if (wifi_provision_init() == 0) {
        wifi_prov_mode_t mode = wifi_provision_get_mode();
        if (mode == WIFI_PROV_MODE_AP) {
            ESP_LOGW(TAG, "Running in AP mode - visit http://192.168.4.1/setup");
            if (led_controller_is_initialized()) {
                led_controller_set_state(LED_STATE_BOOT);
            }
        } else {
            ESP_LOGI(TAG, "WiFi connected in STA mode");
        }
    } else {
        ESP_LOGE(TAG, "WiFi initialization failed - continuing without network");
    }

    // Step 6: Initialize camera AFTER WiFi — resolution depends on phase.
    ESP_LOGI(TAG, "Initializing camera...");
    if (!fully_claimed) {
        if (camera_reconfigure(g_qr_scan_mode.mode) == CAMERA_OK) {
            ESP_LOGI(TAG, "Camera initialized at %s for QR scanning",
                     g_qr_scan_mode.name);
        } else if (g_qr_scan_mode.mode != CAMERA_MODE_VGA_GRAY) {
            ESP_LOGW(TAG, "Camera %s init failed — falling back to VGA",
                     g_qr_scan_mode.name);
            if (!configure_qr_scan_buffers(&k_qr_scan_fallback_mode) ||
                camera_reconfigure(g_qr_scan_mode.mode) != CAMERA_OK) {
                ESP_LOGE(TAG, "Camera VGA fallback init failed");
            } else {
                ESP_LOGI(TAG, "Camera initialized at VGA for QR scanning");
            }
        } else {
            ESP_LOGE(TAG, "Camera VGA init failed");
        }
    } else {
    // Detection phase bootstrap: QVGA. The main capture loop upgrades to the
    // install-profile watch mode before opening the continuous pipeline.
    if (camera_init(NULL) == CAMERA_OK) {
            ESP_LOGI(TAG, "Camera initialized for detection bootstrap");
        } else {
            ESP_LOGW(TAG, "Camera QVGA init failed — will retry in capture loop");
        }
    }

    // Step 7: Onboarding state machine for STA devices that need QR claiming.
    onboarding_state_t onboarding_state = ONBOARDING_STATE_SKIP;
    if (needs_qr && wifi_provision_get_mode() == WIFI_PROV_MODE_STA) {
        http_config_t http_cfg = http_server_default_config();
        if (http_server_init(&http_cfg) == 0 && http_server_start(true) == 0) {
            ESP_LOGI(TAG, "Onboarding HTTP server started on port %d", http_cfg.port);
            seed_onboarding_server_choice(http_cfg.port);
        } else {
            ESP_LOGW(TAG, "Onboarding HTTP server failed to start");
        }
        onboarding_state = ONBOARDING_STATE_QR_SCAN;
    }

    while (onboarding_state != ONBOARDING_STATE_SKIP &&
           onboarding_state != ONBOARDING_STATE_DETECTION_READY &&
           onboarding_state != ONBOARDING_STATE_FAILED) {
        ESP_LOGI(TAG, "Onboarding state: %s", onboarding_state_str(onboarding_state));
        switch (onboarding_state) {
            case ONBOARDING_STATE_QR_SCAN:
                onboarding_state = run_qr_scanning_loop() ?
                    ONBOARDING_STATE_QR_CLAIMED : ONBOARDING_STATE_FAILED;
                break;
            case ONBOARDING_STATE_QR_CLAIMED:
                onboarding_state = phase_transition_to_detection() ?
                    ONBOARDING_STATE_DETECTION_READY : ONBOARDING_STATE_FAILED;
                break;
            default:
                onboarding_state = ONBOARDING_STATE_FAILED;
                break;
        }
    }

    if (onboarding_state == ONBOARDING_STATE_FAILED) {
        restart_due_to_init_failure("onboarding failed");
        return;
    }

    // Step 8: Launch platform-agnostic APIS main.
    // For fully_claimed devices: camera, motion, rolling buffer already init'd.
    // For AP mode devices: main() enters AP idle loop (no capture).
    // For just-claimed devices: phase transition completed above.
    ESP_LOGI(TAG, "Launching APIS main application...");
    char *argv[] = {"apis-edge"};
    int exit_code = main(1, argv);

    // On ESP32, main() typically doesn't return unless there's a fatal error
    ESP_LOGE(TAG, "APIS main returned unexpectedly with code: %d", exit_code);

    // Prevent immediate reboot - wait and potentially reboot
    ESP_LOGW(TAG, "Halting - will reboot in 5 seconds");
    vTaskDelay(pdMS_TO_TICKS(5000));

    esp_restart();
}
