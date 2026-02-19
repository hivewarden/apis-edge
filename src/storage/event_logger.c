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

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#ifdef APIS_PLATFORM_PI
#include <sqlite3.h>
#include <sys/statvfs.h>
#include <sys/stat.h>
#include <errno.h>
#endif
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <sqlite3.h>
#include "esp_spiffs.h"
#endif

// Test platform also needs sqlite3
#if defined(APIS_PLATFORM_TEST) && !defined(APIS_PLATFORM_PI)
#include <sqlite3.h>
#endif

// Schema SQL defined in schema.c
extern const char *EVENT_SCHEMA_SQL;

// S8-H2 fix: HAL-style mutex wrappers instead of direct pthread usage
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define EVENT_LOCK()   pthread_mutex_lock(&g_mutex)
#define EVENT_UNLOCK() pthread_mutex_unlock(&g_mutex)
#elif defined(APIS_PLATFORM_ESP32)
static SemaphoreHandle_t g_event_sem = NULL;
#define EVENT_LOCK()   do { if (g_event_sem) xSemaphoreTake(g_event_sem, portMAX_DELAY); } while(0)
#define EVENT_UNLOCK() do { if (g_event_sem) xSemaphoreGive(g_event_sem); } while(0)
#else
#define EVENT_LOCK()   ((void)0)
#define EVENT_UNLOCK() ((void)0)
#endif

// Module state - protected by mutex for thread safety
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
 * Uses gmtime_r() for thread safety (gmtime() uses a shared static buffer).
 */
static void get_iso_timestamp(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm tm_buf;
    struct tm *tm = gmtime_r(&now, &tm_buf);
    if (tm) {
        strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        LOG_WARN("gmtime_r() returned NULL, falling back to epoch timestamp");
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
    EVENT_LOCK();

    if (g_initialized) {
        LOG_WARN("Event logger already initialized");
        EVENT_UNLOCK();
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
        EVENT_UNLOCK();
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
        EVENT_UNLOCK();
        return EVENT_LOGGER_ERROR_DB_QUERY;
    }

    g_initialized = true;
    LOG_INFO("Event logger initialized (db: %s, prune: %u days)",
             g_config.db_path, g_config.prune_days);

    EVENT_UNLOCK();
    return EVENT_LOGGER_OK;
}

bool event_logger_is_initialized(void) {
    EVENT_LOCK();
    bool initialized = g_initialized;
    EVENT_UNLOCK();
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

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_log called before initialization");
        EVENT_UNLOCK();
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
        EVENT_UNLOCK();
        return -1;
    }

    // S8-M7 fix: Use SQLITE_TRANSIENT for stack-local `timestamp` buffer
    // and caller-provided `clip_file` to ensure SQLite copies the data.
    // SQLITE_STATIC is only safe for string literals with program lifetime.
    sqlite3_bind_text(stmt, 1, timestamp, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, confidence_to_db_string(detection->confidence), -1, SQLITE_STATIC);  // String literal, safe
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
        sqlite3_bind_text(stmt, 12, clip_file, -1, SQLITE_TRANSIENT);
    } else {
        sqlite3_bind_null(stmt, 12);
    }

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to insert event: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    int64_t event_id = sqlite3_last_insert_rowid(g_db);

    LOG_DEBUG("Logged event: id=%lld, confidence=%s, laser=%d",
              (long long)event_id,
              confidence_to_db_string(detection->confidence),
              laser_fired);

    // AC3: After successful insert, check if storage is low and auto-prune.
    // SECURITY FIX: Hold the mutex through the entire insert + status check + prune
    // sequence to prevent a race where another thread could interleave operations
    // between insert and prune.
    bool should_prune = false;

#ifdef APIS_PLATFORM_PI
    {
        struct statvfs stat_buf;
        if (statvfs(g_config.db_path, &stat_buf) == 0) {
            float free_mb = (float)((uint64_t)stat_buf.f_bfree * stat_buf.f_bsize) / (1024.0f * 1024.0f);
            if (free_mb < g_config.min_free_mb && free_mb > 0) {
                LOG_WARN("Storage low (%.2f MB free, threshold: %u MB), auto-pruning old events",
                         free_mb, g_config.min_free_mb);
                should_prune = true;
            }
        }
    }
#endif

    if (should_prune) {
        // Inline prune logic (same as event_logger_prune but without re-acquiring mutex)
        int prune_days = (int)g_config.prune_days;
        if (prune_days < 0) prune_days = 0;

        time_t prune_now = time(NULL);
        time_t prune_cutoff = prune_now - ((time_t)prune_days * (time_t)86400);
        struct tm prune_tm_buf;
        struct tm *prune_tm = gmtime_r(&prune_cutoff, &prune_tm_buf);

        if (prune_tm) {
            char prune_cutoff_str[EVENT_TIMESTAMP_MAX];
            strftime(prune_cutoff_str, sizeof(prune_cutoff_str), "%Y-%m-%dT%H:%M:%SZ", prune_tm);

            const char *prune_sql = "DELETE FROM events WHERE timestamp < ? AND synced = 1";
            sqlite3_stmt *prune_stmt = NULL;
            int prc = sqlite3_prepare_v2(g_db, prune_sql, -1, &prune_stmt, NULL);
            if (prc == SQLITE_OK) {
                // S8-M7 fix: stack-local buffer, use SQLITE_TRANSIENT
                sqlite3_bind_text(prune_stmt, 1, prune_cutoff_str, -1, SQLITE_TRANSIENT);
                prc = sqlite3_step(prune_stmt);
                sqlite3_finalize(prune_stmt);

                if (prc == SQLITE_DONE) {
                    int pruned = sqlite3_changes(g_db);
                    if (pruned > 0) {
                        LOG_INFO("Auto-pruned %d old events due to low storage", pruned);
                        if (pruned > 100) {
                            sqlite3_exec(g_db, "VACUUM;", NULL, NULL, NULL);
                        }
                    }
                }
            }
        }
    }

    EVENT_UNLOCK();

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

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_get_events called before initialization");
        EVENT_UNLOCK();
        return -1;
    }

    // Build query with parameterized filters
    const char *sql_base =
        "SELECT id, timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, "
        "clip_file, synced, created_at FROM events WHERE 1=1";

    char sql[512];

    if (since_timestamp && until_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
    } else if (since_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp >= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
    } else if (until_timestamp) {
        snprintf(sql, sizeof(sql),
                 "%s AND timestamp <= ? ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
    } else {
        snprintf(sql, sizeof(sql),
                 "%s ORDER BY timestamp DESC LIMIT %d",
                 sql_base, MAX_EVENTS_PER_QUERY);
    }

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Query prepare failed: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
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
    (void)bind_idx; // Suppress unused variable warning after final bind

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < MAX_EVENTS_PER_QUERY) {
        populate_event_from_row(stmt, &events[count]);
        count++;
    }

    sqlite3_finalize(stmt);
    EVENT_UNLOCK();
    return count;
}

int event_logger_get_unsynced(event_record_t *events, int max_count) {
    if (events == NULL || max_count <= 0) {
        LOG_WARN("event_logger_get_unsynced: invalid parameters");
        return -1;
    }

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_get_unsynced called before initialization");
        EVENT_UNLOCK();
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
        EVENT_UNLOCK();
        return -1;
    }

    sqlite3_bind_int(stmt, 1, max_count);

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < max_count) {
        populate_event_from_row(stmt, &events[count]);
        count++;
    }

    sqlite3_finalize(stmt);
    EVENT_UNLOCK();
    return count;
}

int event_logger_mark_synced(int64_t event_id) {
    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_mark_synced called before initialization");
        EVENT_UNLOCK();
        return -1;
    }

    const char *sql = "UPDATE events SET synced = 1 WHERE id = ?";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Update prepare failed: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, event_id);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to mark event synced: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    EVENT_UNLOCK();
    return 0;
}

int event_logger_mark_synced_batch(const int64_t *event_ids, int count) {
    if (event_ids == NULL || count <= 0) {
        return 0;
    }

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_mark_synced_batch called before initialization");
        EVENT_UNLOCK();
        return -1;
    }

    // Use a transaction for batch update
    sqlite3_exec(g_db, "BEGIN TRANSACTION", NULL, NULL, NULL);

    const char *sql = "UPDATE events SET synced = 1 WHERE id = ?";
    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        sqlite3_exec(g_db, "ROLLBACK", NULL, NULL, NULL);
        EVENT_UNLOCK();
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

    EVENT_UNLOCK();
    return marked;
}

int event_logger_prune(int days) {
    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_prune called before initialization");
        EVENT_UNLOCK();
        return -1;
    }

    if (days < 0) {
        days = 0;
    }

    // Calculate cutoff date
    // Use (time_t)86400 to avoid potential integer overflow on 32-bit systems
    // Uses gmtime_r() for thread safety (gmtime() uses a shared static buffer).
    time_t now = time(NULL);
    time_t cutoff = now - ((time_t)days * (time_t)86400);
    struct tm tm_buf;
    struct tm *tm = gmtime_r(&cutoff, &tm_buf);

    char cutoff_str[EVENT_TIMESTAMP_MAX];
    if (tm) {
        strftime(cutoff_str, sizeof(cutoff_str), "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        LOG_ERROR("Failed to compute cutoff date");
        EVENT_UNLOCK();
        return -1;
    }

    // Delete old synced events only
    const char *sql = "DELETE FROM events WHERE timestamp < ? AND synced = 1";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Prune prepare failed: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    // S8-M7 fix: cutoff_str is stack-local, use SQLITE_TRANSIENT
    sqlite3_bind_text(stmt, 1, cutoff_str, -1, SQLITE_TRANSIENT);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Prune failed: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    int deleted = sqlite3_changes(g_db);

    if (deleted > 0) {
        LOG_INFO("Pruned %d old events (older than %d days)", deleted, days);
    }

    // S8-M4 fix: Release mutex BEFORE VACUUM to avoid blocking other threads.
    // VACUUM can take significant time on large databases. It's safe to run
    // outside the mutex because SQLite WAL mode handles concurrent access.
    bool needs_vacuum = (deleted > 100);

    EVENT_UNLOCK();

    if (needs_vacuum) {
        // VACUUM outside the mutex - SQLite handles its own locking
        EVENT_LOCK();
        if (g_initialized && g_db) {
            sqlite3_exec(g_db, "VACUUM;", NULL, NULL, NULL);
        }
        EVENT_UNLOCK();
    }

    return deleted;
}

int event_logger_get_status(storage_status_t *status) {
    if (status == NULL) {
        return -1;
    }

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_get_status called before initialization");
        EVENT_UNLOCK();
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

    // AC3: Log warning when storage is running low
    if (status->warning) {
        LOG_WARN("Storage low: %.2f MB free (threshold: %u MB)",
                 status->free_mb, g_config.min_free_mb);
    }

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

    EVENT_UNLOCK();
    return 0;
}

void event_logger_close(void) {
    EVENT_LOCK();
    if (g_db) {
        // Ensure WAL is checkpointed before close
        sqlite3_wal_checkpoint(g_db, NULL);
        sqlite3_close(g_db);
        g_db = NULL;
    }
    g_initialized = false;
    EVENT_UNLOCK();
    LOG_INFO("Event logger closed");
}

int event_logger_clear_clip_reference(const char *clip_path) {
    if (clip_path == NULL || clip_path[0] == '\0') {
        LOG_WARN("event_logger_clear_clip_reference: clip_path is NULL or empty");
        return -1;
    }

    EVENT_LOCK();

    if (!g_initialized) {
        LOG_WARN("event_logger_clear_clip_reference called before initialization");
        EVENT_UNLOCK();
        return -1;
    }

    const char *sql = "UPDATE events SET clip_file = NULL WHERE clip_file = ?";

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to prepare clip reference clear: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    sqlite3_bind_text(stmt, 1, clip_path, -1, SQLITE_STATIC);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to clear clip reference: %s", sqlite3_errmsg(g_db));
        EVENT_UNLOCK();
        return -1;
    }

    int updated = sqlite3_changes(g_db);

    if (updated > 0) {
        LOG_DEBUG("Cleared clip reference for %d events: %s", updated, clip_path);
    }

    EVENT_UNLOCK();
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
