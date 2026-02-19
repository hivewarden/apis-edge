/**
 * ESP32 Entry Point Wrapper for APIS Edge
 *
 * This file initializes the ESP32-specific subsystems (NVS, SPIFFS) before
 * calling the platform-agnostic APIS main() function from src/main.c.
 *
 * Initialization sequence:
 *   1. NVS Flash (device configuration, WiFi settings)
 *   2. SPIFFS (event database, clips, configuration)
 *   3. APIS main() (camera, motion detection, control loop)
 */

#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_spiffs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wifi_provision.h"
#include "led_controller.h"

// Forward declaration of platform-agnostic main from src/main.c
extern int main(int argc, char *argv[]);

static const char *TAG = "apis_esp32";

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
 * ESP32 Application Entry Point
 *
 * Called by the ESP32 bootloader after hardware initialization.
 * Sets up ESP32 subsystems before launching the APIS main loop.
 *
 * Note: ESP32 applications don't exit - they run indefinitely.
 * The main loop handles graceful shutdown via command interface.
 */
void app_main(void) {
    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "APIS Edge starting on ESP32-S3 Sense");
    ESP_LOGI(TAG, "========================================");

    // Step 1: Initialize NVS (required for WiFi + device config)
    init_nvs();

    // Step 2: Initialize SPIFFS (required for event database + clips)
    init_spiffs();

    // Step 3: Initialize WiFi (STA or AP mode)
    ESP_LOGI(TAG, "Initializing WiFi...");
    if (wifi_provision_init() == 0) {
        wifi_prov_mode_t mode = wifi_provision_get_mode();
        if (mode == WIFI_PROV_MODE_AP) {
            ESP_LOGW(TAG, "Running in AP mode - visit http://192.168.4.1:8080/setup");
            // Set LED to boot pattern to indicate setup needed
            if (led_controller_is_initialized()) {
                led_controller_set_state(LED_STATE_BOOT);
            }
        } else {
            ESP_LOGI(TAG, "WiFi connected in STA mode");
        }
    } else {
        ESP_LOGE(TAG, "WiFi initialization failed - continuing without network");
    }

    // Step 4: Launch platform-agnostic APIS main
    // This starts the full system: camera, detection, HTTP server, control loop
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
