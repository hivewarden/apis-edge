/**
 * ESP32 stub for event_logger.
 *
 * SQLite is not available on ESP32 (no native port without significant
 * effort). This stub satisfies the API so the main loop compiles and
 * runs. Detection events are logged via ESP_LOG instead of a database.
 *
 * TODO: Replace with NVS-based or SPIFFS-based event storage for ESP32.
 */

#ifdef APIS_PLATFORM_ESP32

#include "event_logger.h"
#include "log.h"

#include <string.h>
#include <stdio.h>

static bool g_initialized = false;
static uint32_t g_event_count = 0;

// Schema SQL (required extern, but unused on ESP32)
const char *EVENT_SCHEMA_SQL = "";

event_logger_config_t event_logger_config_defaults(void) {
    event_logger_config_t cfg = {
        .db_path = "/data/detections.db",
        .min_free_mb = MIN_FREE_SPACE_MB,
        .prune_days = DEFAULT_PRUNE_DAYS,
    };
    return cfg;
}

event_logger_status_t event_logger_init(const event_logger_config_t *config) {
    (void)config;
    g_initialized = true;
    g_event_count = 0;
    LOG_INFO("Event logger initialized (ESP32 stub - no database)");
    return EVENT_LOGGER_OK;
}

int64_t event_logger_log(const classified_detection_t *detection,
                         bool laser_fired, const char *clip_file) {
    if (!g_initialized || !detection) return -1;

    g_event_count++;
    LOG_INFO("Event #%u: class=%d conf=%d at (%d,%d) laser=%d clip=%s",
             g_event_count,
             detection->classification,
             detection->confidence,
             detection->detection.centroid_x,
             detection->detection.centroid_y,
             laser_fired,
             clip_file ? clip_file : "(none)");

    return (int64_t)g_event_count;
}

int event_logger_get_events(const char *since_timestamp,
                            const char *until_timestamp,
                            event_record_t *events) {
    (void)since_timestamp;
    (void)until_timestamp;
    (void)events;
    return 0;  // No events stored
}

int event_logger_get_unsynced(event_record_t *events, int max_count) {
    (void)events;
    (void)max_count;
    return 0;
}

int event_logger_mark_synced(int64_t event_id) {
    (void)event_id;
    return 0;
}

int event_logger_mark_synced_batch(const int64_t *event_ids, int count) {
    (void)event_ids;
    (void)count;
    return 0;
}

int event_logger_prune(int days) {
    (void)days;
    return 0;
}

int event_logger_get_status(storage_status_t *status) {
    if (!status) return -1;
    memset(status, 0, sizeof(*status));
    status->total_events = g_event_count;
    status->free_mb = 2048.0f;  // Placeholder
    status->total_mb = 3072.0f;
    return 0;
}

bool event_logger_is_initialized(void) {
    return g_initialized;
}

void event_logger_close(void) {
    g_initialized = false;
    LOG_INFO("Event logger closed (ESP32 stub)");
}

int event_logger_clear_clip_reference(const char *clip_path) {
    (void)clip_path;
    return 0;
}

const char *event_logger_status_str(event_logger_status_t status) {
    switch (status) {
        case EVENT_LOGGER_OK: return "OK";
        case EVENT_LOGGER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case EVENT_LOGGER_ERROR_INVALID_PARAM: return "Invalid parameter";
        case EVENT_LOGGER_ERROR_DB_OPEN: return "Database open failed";
        case EVENT_LOGGER_ERROR_DB_QUERY: return "Query failed";
        case EVENT_LOGGER_ERROR_NO_MEMORY: return "Memory allocation failed";
        default: return "Unknown";
    }
}

#endif // APIS_PLATFORM_ESP32
