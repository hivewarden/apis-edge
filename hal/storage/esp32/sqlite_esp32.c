/**
 * ESP32 SQLite HAL Implementation
 *
 * Uses SPIFFS filesystem for SQLite storage on ESP32.
 * The sqlite3_esp32 library provides SQLite with flash filesystem backend.
 */

#ifdef APIS_PLATFORM_ESP32

#include "../sqlite_hal.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <sqlite3.h>
#include "esp_spiffs.h"
#include "esp_vfs.h"

#define SPIFFS_MOUNT_POINT "/spiffs"
#define SPIFFS_MAX_FILES 5

static bool g_spiffs_mounted = false;
static bool g_initialized = false;
static char g_db_path[128];

int sqlite_hal_init(void) {
    if (g_initialized) {
        return 0;
    }

    // Configure SPIFFS
    esp_vfs_spiffs_conf_t conf = {
        .base_path = SPIFFS_MOUNT_POINT,
        .partition_label = NULL,
        .max_files = SPIFFS_MAX_FILES,
        .format_if_mount_failed = true,
    };

    // Mount SPIFFS filesystem
    esp_err_t ret = esp_vfs_spiffs_register(&conf);
    if (ret != ESP_OK) {
        if (ret == ESP_FAIL) {
            LOG_ERROR("sqlite_hal: Failed to mount SPIFFS");
        } else if (ret == ESP_ERR_NOT_FOUND) {
            LOG_ERROR("sqlite_hal: SPIFFS partition not found");
        } else {
            LOG_ERROR("sqlite_hal: SPIFFS init failed: %s", esp_err_to_name(ret));
        }
        return -1;
    }

    g_spiffs_mounted = true;

    // Get SPIFFS partition info
    size_t total = 0, used = 0;
    ret = esp_spiffs_info(NULL, &total, &used);
    if (ret == ESP_OK) {
        LOG_INFO("sqlite_hal: SPIFFS mounted - Total: %d bytes, Used: %d bytes",
                 total, used);
    }

    // Initialize SQLite
    int rc = sqlite3_initialize();
    if (rc != SQLITE_OK) {
        LOG_ERROR("sqlite_hal: Failed to initialize SQLite: %d", rc);
        esp_vfs_spiffs_unregister(NULL);
        g_spiffs_mounted = false;
        return -1;
    }

    g_initialized = true;
    LOG_INFO("sqlite_hal: ESP32 storage HAL initialized at %s", SPIFFS_MOUNT_POINT);
    return 0;
}

bool sqlite_hal_is_initialized(void) {
    return g_initialized;
}

const char *sqlite_hal_get_db_path(const char *filename) {
    if (filename == NULL) {
        filename = "detections.db";
    }

    // Extract just the filename if a path is provided
    const char *basename = strrchr(filename, '/');
    if (basename) {
        basename++; // Skip the '/'
    } else {
        basename = filename;
    }

    // Prepend SPIFFS mount point
    snprintf(g_db_path, sizeof(g_db_path), "%s/%s", SPIFFS_MOUNT_POINT, basename);

    return g_db_path;
}

void sqlite_hal_cleanup(void) {
    if (g_initialized) {
        sqlite3_shutdown();

        if (g_spiffs_mounted) {
            esp_vfs_spiffs_unregister(NULL);
            g_spiffs_mounted = false;
        }

        g_initialized = false;
        LOG_INFO("sqlite_hal: ESP32 storage HAL cleaned up");
    }
}

int sqlite_hal_get_storage_info(uint64_t *free_bytes, uint64_t *total_bytes) {
    if (free_bytes == NULL || total_bytes == NULL) {
        return -1;
    }

    if (!g_spiffs_mounted) {
        *free_bytes = 0;
        *total_bytes = 0;
        return -1;
    }

    size_t total = 0, used = 0;
    esp_err_t ret = esp_spiffs_info(NULL, &total, &used);
    if (ret != ESP_OK) {
        LOG_WARN("sqlite_hal: Failed to get SPIFFS info");
        *free_bytes = 0;
        *total_bytes = 0;
        return -1;
    }

    *total_bytes = (uint64_t)total;
    *free_bytes = (uint64_t)(total - used);

    return 0;
}

#endif // APIS_PLATFORM_ESP32
