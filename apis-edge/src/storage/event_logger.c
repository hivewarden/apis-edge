/**
 * Local SQLite event logging for edge device.
 *
 * Stores detection events in a local SQLite database for offline-first
 * operation. Events are marked as synced once uploaded to the server.
 */

#include "event_logger.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <pthread.h>

#ifdef APIS_PLATFORM_PI
#include <sqlite3.h>
#include <sys/statvfs.h>
#include <sys/stat.h>
#include <errno.h>
#endif

#ifdef APIS_PLATFORM_ESP32
#include <sqlite3.h>
#include "esp_spiffs.h"
#endif

// Schema SQL defined in schema.c
extern const char *EVENT_SCHEMA_SQL;

// Module state - protected by g_mutex for thread safety
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static sqlite3 *g_db = NULL;
static event_logger_config_t g_config;
static bool g_initialized = false;

event_logger_config_t event_logger_config_defaults(void) {
    event_logger_config_t config;
    memset(&config, 0, sizeof(config));
    snprintf(config.db_path, sizeof(config.db_path), "./data/detections.db");
    config.min_free_mb = MIN_FREE_SPACE_MB;
    config.prune_days = DEFAULT_PRUNE_DAYS;
    return config;
}

/**
 * Create parent directories for a path.
 */
static int ensure_parent_dir(const char *path) {
#ifdef APIS_PLATFORM_PI
    char dir[EVENT_PATH_MAX];
    snprintf(dir, sizeof(dir), "%s", path);

    char *last_slash = strrchr(dir, '/');
    if (last_slash && last_slash != dir) {
        *last_slash = '\0';
        if (mkdir(dir, 0755) < 0 && errno != EEXIST) {
            LOG_WARN("Could not create directory: %s (%s)", dir, strerror(errno));
            return -1;
        }
    }
#else
    (void)path;
#endif
    return 0;
}

/**
 * Get current timestamp in ISO 8601 format.
 */
static void get_iso_timestamp(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm *tm = gmtime(&now);
    if (tm) {
        strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        LOG_WARN("gmtime() returned NULL, falling back to epoch timestamp");
        snprintf(buf, size, "1970-01-01T00:00:00Z");
    }
}

/**
 * Convert confidence level to string for storage.
 */
static const char *confidence_to_db_string(confidence_level_t level) {
    switch (level) {
        case CONFIDENCE_HIGH:   return "high";
        case CONFIDENCE_MEDIUM: return "medium";
        case CONFIDENCE_LOW:    return "low";
        default:                return "unknown";
    }
}

event_logger_status_t event_logger_init(const event_logger_config_t *config) {
    pthread_mutex_lock(&g_mutex);

    if (g_initialized) {
        LOG_WARN("Event logger already initialized");
        pthread_mutex_unlock(&g_mutex);
        return EVENT_LOGGER_OK;
    }

    if (config == NULL) {
        g_config = event_logger_config_defaults();
    } else {
        g_config = *config;
    }

    // Validate config
    if (g_config.min_free_mb == 0) {
        g_config.min_free_mb = MIN_FREE_SPACE_MB;
    }
    if (g_config.prune_days == 0) {
        g_config.prune_days = DEFAULT_PRUNE_DAYS;
    }

    // Ensure directory exists
    if (ensure_parent_dir(g_config.db_path) < 0) {
        LOG_WARN("Could not create parent directory for database");
        // Continue anyway - sqlite might still work if path exists
    }

    // Open database
    int rc = sqlite3_open(g_config.db_path, &g_db);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to open database '%s': %s",
                  g_config.db_path, sqlite3_errmsg(g_db));
        if (g_db) {
            sqlite3_close(g_db);
            g_db = NULL;
        }
        pthread_mutex_unlock(&g_mutex);
        return EVENT_LOGGER_ERROR_DB_OPEN;
    }

    // Set pragmas for better performance and reliability
    sqlite3_exec(g_db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);
    sqlite3_exec(g_db, "PRAGMA synchronous=NORMAL;", NULL, NULL, NULL);
    sqlite3_exec(g_db, "PRAGMA busy_timeout=5000;", NULL, NULL, NULL);

    // Create schema
    char *err_msg = NULL;
    rc = sqlite3_exec(g_db, EVENT_SCHEMA_SQL, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to create schema: %s", err_msg);
        sqlite3_free(err_msg);
        sqlite3_close(g_db);
        g_db = NULL;
        pthread_mutex_unlock(&g_mutex);
        return EVENT_LOGGER_ERROR_DB_QUERY;
    }

    g_initialized = true;
    LOG_INFO("Event logger initialized (db: %s, prune: %u days)",
             g_config.db_path, g_config.prune_days);

    pthread_mutex_unlock(&g_mutex);
    return EVENT_LOGGER_OK;
}

bool event_logger_is_initialized(void) {
    pthread_mutex_lock(&g_mutex);
    bool initialized = g_initialized;
    pthread_mutex_unlock(&g_mutex);
    return initialized;
}

int64_t event_logger_log(
    const classified_detection_t *detection,
    bool laser_fired,
    const char *clip_file
) {
    if (detection == NULL) {
        LOG_WARN("event_logger_log: detection is NULL");
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_log called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    char timestamp[EVENT_TIMESTAMP_MAX];
    get_iso_timestamp(timestamp, sizeof(timestamp));

    const char *sql =
        "INSERT INTO events (timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, clip_file) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to prepare insert: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    sqlite3_bind_text(stmt, 1, timestamp, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, confidence_to_db_string(detection->confidence), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 3, detection->detection.x);
    sqlite3_bind_int(stmt, 4, detection->detection.y);
    sqlite3_bind_int(stmt, 5, detection->detection.w);
    sqlite3_bind_int(stmt, 6, detection->detection.h);
    sqlite3_bind_int(stmt, 7, (int)detection->detection.area);
    sqlite3_bind_int(stmt, 8, detection->detection.centroid_x);
    sqlite3_bind_int(stmt, 9, detection->detection.centroid_y);
    sqlite3_bind_int(stmt, 10, (int)detection->hover_duration_ms);
    sqlite3_bind_int(stmt, 11, laser_fired ? 1 : 0);

    if (clip_file && clip_file[0] != '\0') {
        sqlite3_bind_text(stmt, 12, clip_file, -1, SQLITE_STATIC);
    } else {
        sqlite3_bind_null(stmt, 12);
    }

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to insert event: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    int64_t event_id = sqlite3_last_insert_rowid(g_db);

    LOG_DEBUG("Logged event: id=%lld, confidence=%s, laser=%d",
              (long long)event_id,
              confidence_to_db_string(detection->confidence),
              laser_fired);

    pthread_mutex_unlock(&g_mutex);
    return event_id;
}

/**
 * Helper to populate event_record_t from a SQLite row.
 */
static void populate_event_from_row(sqlite3_stmt *stmt, event_record_t *e) {
    memset(e, 0, sizeof(*e));

    e->id = sqlite3_column_int64(stmt, 0);

    const char *text = (const char *)sqlite3_column_text(stmt, 1);
    if (text) {
        snprintf(e->timestamp, sizeof(e->timestamp), "%s", text);
    }

    text = (const char *)sqlite3_column_text(stmt, 2);
    if (text) {
        snprintf(e->confidence, sizeof(e->confidence), "%s", text);
    }

    e->x = (uint16_t)sqlite3_column_int(stmt, 3);
    e->y = (uint16_t)sqlite3_column_int(stmt, 4);
    e->w = (uint16_t)sqlite3_column_int(stmt, 5);
    e->h = (uint16_t)sqlite3_column_int(stmt, 6);
    e->area = (uint32_t)sqlite3_column_int(stmt, 7);
    e->centroid_x = (uint16_t)sqlite3_column_int(stmt, 8);
    e->centroid_y = (uint16_t)sqlite3_column_int(stmt, 9);
    e->hover_duration_ms = (uint32_t)sqlite3_column_int(stmt, 10);
    e->laser_fired = sqlite3_column_int(stmt, 11) != 0;

    text = (const char *)sqlite3_column_text(stmt, 12);
    if (text) {
        snprintf(e->clip_file, sizeof(e->clip_file), "%s", text);
    }

    e->synced = sqlite3_column_int(stmt, 13) != 0;

    text = (const char *)sqlite3_column_text(stmt, 14);
    if (text) {
        snprintf(e->created_at, sizeof(e->created_at), "%s", text);
    }
}

int event_logger_get_events(
    const char *since_timestamp,
    const char *until_timestamp,
    event_record_t *events
) {
    if (events == NULL) {
        LOG_WARN("event_logger_get_events: events is NULL");
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_get_events called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Build query with parameterized filters
    const char *sql_base =
        "SELECT id, timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, "
        "clip_file, synced, created_at FROM events WHERE 1=1";

    char sql[512];
    int param_count = 0;

    if (since_timestamp && until_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
        param_count = 2;
    } else if (since_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp >= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
        param_count = 1;
    } else if (until_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp <= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
        param_count = 1;
    } else {
        snprintf(sql, sizeof(sql),
                 "%s ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
        param_count = 0;
    }

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Query prepare failed: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Bind parameters
    int bind_idx = 1;
    if (since_timestamp && until_timestamp) {
        sqlite3_bind_text(stmt, bind_idx++, since_timestamp, -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, bind_idx++, until_timestamp, -1, SQLITE_STATIC);
    } else if (since_timestamp) {
        sqlite3_bind_text(stmt, bind_idx++, since_timestamp, -1, SQLITE_STATIC);
    } else if (until_timestamp) {
        sqlite3_bind_text(stmt, bind_idx++, until_timestamp, -1, SQLITE_STATIC);
    }
    (void)param_count; // Suppress unused variable warning

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < MAX_EVENTS_PER_QUERY) {
        populate_event_from_row(stmt, &events[count]);
        count++;
    }

    sqlite3_finalize(stmt);
    pthread_mutex_unlock(&g_mutex);
    return count;
}

int event_logger_get_unsynced(event_record_t *events, int max_count) {
    if (events == NULL || max_count <= 0) {
        LOG_WARN("event_logger_get_unsynced: invalid parameters");
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_get_unsynced called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    const char *sql =
        "SELECT id, timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, "
        "clip_file, synced, created_at FROM events "
        "WHERE synced = 0 ORDER BY timestamp LIMIT ?";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Query prepare failed: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    sqlite3_bind_int(stmt, 1, max_count);

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < max_count) {
        populate_event_from_row(stmt, &events[count]);
        count++;
    }

    sqlite3_finalize(stmt);
    pthread_mutex_unlock(&g_mutex);
    return count;
}

int event_logger_mark_synced(int64_t event_id) {
    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_mark_synced called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    const char *sql = "UPDATE events SET synced = 1 WHERE id = ?";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Update prepare failed: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, event_id);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to mark event synced: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    pthread_mutex_unlock(&g_mutex);
    return 0;
}

int event_logger_mark_synced_batch(const int64_t *event_ids, int count) {
    if (event_ids == NULL || count <= 0) {
        return 0;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_mark_synced_batch called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Use a transaction for batch update
    sqlite3_exec(g_db, "BEGIN TRANSACTION", NULL, NULL, NULL);

    const char *sql = "UPDATE events SET synced = 1 WHERE id = ?";
    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        sqlite3_exec(g_db, "ROLLBACK", NULL, NULL, NULL);
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    int marked = 0;
    for (int i = 0; i < count; i++) {
        sqlite3_reset(stmt);
        sqlite3_bind_int64(stmt, 1, event_ids[i]);
        if (sqlite3_step(stmt) == SQLITE_DONE) {
            marked++;
        }
    }

    sqlite3_finalize(stmt);
    sqlite3_exec(g_db, "COMMIT", NULL, NULL, NULL);

    pthread_mutex_unlock(&g_mutex);
    return marked;
}

int event_logger_prune(int days) {
    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_prune called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    if (days < 0) {
        days = 0;
    }

    // Calculate cutoff date
    // Use (time_t)86400 to avoid potential integer overflow on 32-bit systems
    time_t now = time(NULL);
    time_t cutoff = now - ((time_t)days * (time_t)86400);
    struct tm *tm = gmtime(&cutoff);

    char cutoff_str[EVENT_TIMESTAMP_MAX];
    if (tm) {
        strftime(cutoff_str, sizeof(cutoff_str), "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        LOG_ERROR("Failed to compute cutoff date");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Delete old synced events only
    const char *sql = "DELETE FROM events WHERE timestamp < ? AND synced = 1";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Prune prepare failed: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    sqlite3_bind_text(stmt, 1, cutoff_str, -1, SQLITE_STATIC);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Prune failed: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    int deleted = sqlite3_changes(g_db);

    if (deleted > 0) {
        LOG_INFO("Pruned %d old events (older than %d days)", deleted, days);
        // Only VACUUM when significant deletions to avoid performance overhead
        if (deleted > 100) {
            sqlite3_exec(g_db, "VACUUM;", NULL, NULL, NULL);
        }
    }

    pthread_mutex_unlock(&g_mutex);
    return deleted;
}

int event_logger_get_status(storage_status_t *status) {
    if (status == NULL) {
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_get_status called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    memset(status, 0, sizeof(*status));

#ifdef APIS_PLATFORM_PI
    // Get disk space
    struct statvfs stat_buf;
    if (statvfs(g_config.db_path, &stat_buf) == 0) {
        status->free_mb = (float)((uint64_t)stat_buf.f_bfree * stat_buf.f_bsize) / (1024.0f * 1024.0f);
        status->total_mb = (float)((uint64_t)stat_buf.f_blocks * stat_buf.f_bsize) / (1024.0f * 1024.0f);
    }

    // Get database size
    struct stat db_stat;
    if (stat(g_config.db_path, &db_stat) == 0) {
        status->db_size_mb = (float)db_stat.st_size / (1024.0f * 1024.0f);
    }
#endif

    status->warning = status->free_mb < g_config.min_free_mb && status->free_mb > 0;

    // Get event counts
    sqlite3_stmt *stmt = NULL;

    const char *sql_total = "SELECT COUNT(*) FROM events";
    if (sqlite3_prepare_v2(g_db, sql_total, -1, &stmt, NULL) == SQLITE_OK) {
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            status->total_events = (uint32_t)sqlite3_column_int(stmt, 0);
        }
        sqlite3_finalize(stmt);
    }

    const char *sql_unsynced = "SELECT COUNT(*) FROM events WHERE synced = 0";
    if (sqlite3_prepare_v2(g_db, sql_unsynced, -1, &stmt, NULL) == SQLITE_OK) {
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            status->unsynced_events = (uint32_t)sqlite3_column_int(stmt, 0);
        }
        sqlite3_finalize(stmt);
    }

    pthread_mutex_unlock(&g_mutex);
    return 0;
}

void event_logger_close(void) {
    pthread_mutex_lock(&g_mutex);
    if (g_db) {
        // Ensure WAL is checkpointed before close
        sqlite3_wal_checkpoint(g_db, NULL);
        sqlite3_close(g_db);
        g_db = NULL;
    }
    g_initialized = false;
    pthread_mutex_unlock(&g_mutex);
    LOG_INFO("Event logger closed");
}

int event_logger_clear_clip_reference(const char *clip_path) {
    if (clip_path == NULL || clip_path[0] == '\0') {
        LOG_WARN("event_logger_clear_clip_reference: clip_path is NULL or empty");
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("event_logger_clear_clip_reference called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    const char *sql = "UPDATE events SET clip_file = NULL WHERE clip_file = ?";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to prepare clip reference clear: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    sqlite3_bind_text(stmt, 1, clip_path, -1, SQLITE_STATIC);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to clear clip reference: %s", sqlite3_errmsg(g_db));
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    int updated = sqlite3_changes(g_db);

    if (updated > 0) {
        LOG_DEBUG("Cleared clip reference for %d events: %s", updated, clip_path);
    }

    pthread_mutex_unlock(&g_mutex);
    return updated;
}

const char *event_logger_status_str(event_logger_status_t status) {
    switch (status) {
        case EVENT_LOGGER_OK:                    return "OK";
        case EVENT_LOGGER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case EVENT_LOGGER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        case EVENT_LOGGER_ERROR_DB_OPEN:         return "Database open failed";
        case EVENT_LOGGER_ERROR_DB_QUERY:        return "Database query failed";
        case EVENT_LOGGER_ERROR_NO_MEMORY:       return "Out of memory";
        default:                                 return "Unknown error";
    }
}
