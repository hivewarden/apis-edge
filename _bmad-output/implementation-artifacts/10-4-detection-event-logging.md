# Story 10.4: Detection Event Logging

Status: done

## Story

As an **APIS unit**,
I want to log all detection events locally,
So that data is preserved even without network connectivity.

## Acceptance Criteria

### AC1: Event Recording
**Given** a hornet is detected
**When** the detection is confirmed
**Then** an event record is created with:
- Timestamp (ISO 8601)
- Confidence level
- Bounding box coordinates
- Size in pixels
- Hover duration (if applicable)
- Laser activated (yes/no)

### AC2: Local Storage
**Given** events are logged
**When** I query the local database
**Then** events are stored in SQLite
**And** can be queried by date range
**And** include auto-incrementing IDs

### AC3: Storage Management
**Given** storage is running low (<100MB free)
**When** new events are logged
**Then** oldest events (>30 days) are auto-pruned
**And** a warning is logged

### AC4: Persistence
**Given** the unit restarts
**When** it comes back online
**Then** all previous events are still accessible
**And** logging continues with new IDs

## Tasks / Subtasks

- [x] **Task 1: Database Schema** (AC: 1, 2)
  - [x] 1.1: Create SQLite database file
  - [x] 1.2: Create `events` table with all fields
  - [x] 1.3: Add indexes for common queries (timestamp, synced)

- [x] **Task 2: Event Recording** (AC: 1)
  - [x] 2.1: Create `EventLogger` module
  - [x] 2.2: Implement `event_logger_log()` function
  - [x] 2.3: Add `synced` flag for server upload tracking

- [x] **Task 3: Query Interface** (AC: 2)
  - [x] 3.1: Implement `event_logger_get_events()` with date filtering
  - [x] 3.2: Implement `event_logger_get_unsynced()`
  - [x] 3.3: Implement `event_logger_mark_synced()`

- [x] **Task 4: Storage Management** (AC: 3, 4)
  - [x] 4.1: Implement storage check routine
  - [x] 4.2: Implement auto-pruning of old events
  - [x] 4.3: Test persistence across restarts

## Technical Notes

### Architecture Clarification: Edge vs Server Storage

> **Important:** This story implements **LOCAL SQLite storage on the edge device**.
> The Architecture document specifies YugabyteDB for the server — that's the companion
> portal database. Edge devices use SQLite locally for offline-first operation.
>
> **Data Flow:**
> ```
> Edge Device (SQLite)  →  Server (YugabyteDB)
>        ↑                        ↑
>   Local storage           Central storage
>   Offline-capable         Multi-tenant
>   Syncs via Story 10.7    API accessible
> ```
>
> The `synced` flag tracks which events have been uploaded to the server.

### Project Structure

```
apis-edge/
├── include/
│   └── event_logger.h       # Event logger interface
├── src/
│   └── storage/
│       ├── event_logger.c   # SQLite event logging
│       └── schema.c         # Database schema definition
├── hal/
│   └── storage/
│       ├── sqlite_hal.h     # SQLite abstraction
│       ├── pi/
│       │   └── sqlite_pi.c  # Standard SQLite for Pi
│       └── esp32/
│           └── sqlite_esp32.c # SQLite with SPIFFS/LittleFS
└── tests/
    └── test_event_logger.c
```

### Event Logger Interface

```c
// include/event_logger.h
#ifndef APIS_EVENT_LOGGER_H
#define APIS_EVENT_LOGGER_H

#include "classifier.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_EVENTS_PER_QUERY 100
#define MIN_FREE_SPACE_MB 100
#define DEFAULT_PRUNE_DAYS 30

/**
 * Event record structure for database storage.
 */
typedef struct {
    int64_t id;                 // Auto-increment ID
    char timestamp[32];         // ISO 8601 timestamp
    char confidence[8];         // "high", "medium", "low"
    uint16_t x, y, w, h;        // Bounding box
    uint32_t area;              // Contour area
    uint16_t centroid_x;
    uint16_t centroid_y;
    uint32_t hover_duration_ms; // Hover time
    bool laser_fired;           // Whether laser was activated
    char clip_file[64];         // Path to video clip (optional)
    bool synced;                // Uploaded to server?
    char created_at[32];        // Record creation timestamp
} event_record_t;

/**
 * Event logger configuration.
 */
typedef struct {
    char db_path[128];          // Path to SQLite database
    uint32_t min_free_mb;       // Minimum free space before warning
    uint32_t prune_days;        // Days before auto-pruning
} event_logger_config_t;

/**
 * Storage status information.
 */
typedef struct {
    float free_mb;
    float total_mb;
    bool warning;               // True if free space < min_free_mb
    uint32_t total_events;
    uint32_t unsynced_events;
    float db_size_mb;
} storage_status_t;

/**
 * Initialize the event logger.
 *
 * @param config Logger configuration (NULL for defaults)
 * @return 0 on success, -1 on failure
 */
int event_logger_init(const event_logger_config_t *config);

/**
 * Log a detection event.
 *
 * @param detection Classified detection from classifier
 * @param laser_fired Whether laser was activated
 * @param clip_file Path to video clip (can be NULL)
 * @return Event ID on success, -1 on failure
 */
int64_t event_logger_log(
    const classified_detection_t *detection,
    bool laser_fired,
    const char *clip_file
);

/**
 * Get events with optional date filtering.
 *
 * @param since_timestamp ISO 8601 start timestamp (NULL for no filter)
 * @param until_timestamp ISO 8601 end timestamp (NULL for no filter)
 * @param events Output array (must hold MAX_EVENTS_PER_QUERY entries)
 * @return Number of events found
 */
int event_logger_get_events(
    const char *since_timestamp,
    const char *until_timestamp,
    event_record_t *events
);

/**
 * Get events not yet synced to server.
 *
 * @param events Output array
 * @param max_count Maximum events to return
 * @return Number of unsynced events
 */
int event_logger_get_unsynced(event_record_t *events, int max_count);

/**
 * Mark an event as synced to server.
 *
 * @param event_id Event ID to mark
 * @return 0 on success, -1 on failure
 */
int event_logger_mark_synced(int64_t event_id);

/**
 * Prune old events (synced only).
 *
 * @param days Delete events older than N days
 * @return Number of events deleted
 */
int event_logger_prune(int days);

/**
 * Get storage status.
 *
 * @param status Output storage status
 * @return 0 on success
 */
int event_logger_get_status(storage_status_t *status);

/**
 * Get default configuration.
 */
event_logger_config_t event_logger_config_defaults(void);

/**
 * Close event logger and release resources.
 */
void event_logger_close(void);

#endif // APIS_EVENT_LOGGER_H
```

### Database Schema

```c
// src/storage/schema.c
/**
 * SQLite database schema for event storage.
 */

#include "event_logger.h"

const char *SCHEMA_SQL =
    "-- Detection events table\n"
    "CREATE TABLE IF NOT EXISTS events (\n"
    "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
    "    timestamp TEXT NOT NULL,\n"
    "    confidence TEXT NOT NULL,\n"
    "    x INTEGER NOT NULL,\n"
    "    y INTEGER NOT NULL,\n"
    "    w INTEGER NOT NULL,\n"
    "    h INTEGER NOT NULL,\n"
    "    area INTEGER NOT NULL,\n"
    "    centroid_x INTEGER NOT NULL,\n"
    "    centroid_y INTEGER NOT NULL,\n"
    "    hover_duration_ms INTEGER DEFAULT 0,\n"
    "    laser_fired INTEGER DEFAULT 0,\n"
    "    clip_file TEXT,\n"
    "    synced INTEGER DEFAULT 0,\n"
    "    created_at TEXT DEFAULT CURRENT_TIMESTAMP\n"
    ");\n"
    "\n"
    "-- Indexes for common queries\n"
    "CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);\n"
    "CREATE INDEX IF NOT EXISTS idx_synced ON events(synced);\n"
    "CREATE INDEX IF NOT EXISTS idx_confidence ON events(confidence);\n";
```

### Event Logger Implementation

```c
// src/storage/event_logger.c
/**
 * Local SQLite event logging for edge device.
 */

#include "event_logger.h"
#include "log.h"
#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/statvfs.h>
#include <sys/stat.h>

extern const char *SCHEMA_SQL;

static sqlite3 *g_db = NULL;
static event_logger_config_t g_config;
static bool g_initialized = false;

event_logger_config_t event_logger_config_defaults(void) {
    return (event_logger_config_t){
        .db_path = "./data/detections.db",
        .min_free_mb = MIN_FREE_SPACE_MB,
        .prune_days = DEFAULT_PRUNE_DAYS,
    };
}

/**
 * Create parent directories for a path.
 */
static void ensure_parent_dir(const char *path) {
    char dir[128];
    strncpy(dir, path, sizeof(dir) - 1);

    char *last_slash = strrchr(dir, '/');
    if (last_slash) {
        *last_slash = '\0';
        mkdir(dir, 0755);
    }
}

/**
 * Get current timestamp in ISO 8601 format.
 */
static void get_iso_timestamp(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm *tm = gmtime(&now);
    strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
}

/**
 * Convert confidence level to string.
 */
static const char *confidence_to_string(confidence_level_t level) {
    switch (level) {
        case CONFIDENCE_HIGH:   return "high";
        case CONFIDENCE_MEDIUM: return "medium";
        case CONFIDENCE_LOW:    return "low";
        default:                return "unknown";
    }
}

int event_logger_init(const event_logger_config_t *config) {
    if (config == NULL) {
        g_config = event_logger_config_defaults();
    } else {
        g_config = *config;
    }

    // Ensure directory exists
    ensure_parent_dir(g_config.db_path);

    // Open database
    int rc = sqlite3_open(g_config.db_path, &g_db);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to open database: %s", sqlite3_errmsg(g_db));
        return -1;
    }

    // Set pragmas for better performance
    sqlite3_exec(g_db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);
    sqlite3_exec(g_db, "PRAGMA synchronous=NORMAL;", NULL, NULL, NULL);

    // Create schema
    char *err_msg = NULL;
    rc = sqlite3_exec(g_db, SCHEMA_SQL, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to create schema: %s", err_msg);
        sqlite3_free(err_msg);
        sqlite3_close(g_db);
        return -1;
    }

    g_initialized = true;
    LOG_INFO("Event logger initialized (db: %s)", g_config.db_path);

    return 0;
}

int64_t event_logger_log(
    const classified_detection_t *detection,
    bool laser_fired,
    const char *clip_file
) {
    if (!g_initialized || !detection) {
        return -1;
    }

    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));

    const char *sql =
        "INSERT INTO events (timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, clip_file) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Failed to prepare statement: %s", sqlite3_errmsg(g_db));
        return -1;
    }

    sqlite3_bind_text(stmt, 1, timestamp, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, confidence_to_string(detection->confidence), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 3, detection->detection.x);
    sqlite3_bind_int(stmt, 4, detection->detection.y);
    sqlite3_bind_int(stmt, 5, detection->detection.w);
    sqlite3_bind_int(stmt, 6, detection->detection.h);
    sqlite3_bind_int(stmt, 7, detection->detection.area);
    sqlite3_bind_int(stmt, 8, detection->detection.centroid_x);
    sqlite3_bind_int(stmt, 9, detection->detection.centroid_y);
    sqlite3_bind_int(stmt, 10, detection->hover_duration_ms);
    sqlite3_bind_int(stmt, 11, laser_fired ? 1 : 0);

    if (clip_file) {
        sqlite3_bind_text(stmt, 12, clip_file, -1, SQLITE_STATIC);
    } else {
        sqlite3_bind_null(stmt, 12);
    }

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        LOG_ERROR("Failed to insert event: %s", sqlite3_errmsg(g_db));
        return -1;
    }

    int64_t event_id = sqlite3_last_insert_rowid(g_db);

    LOG_DEBUG("Logged event: id=%lld, confidence=%s, laser=%d",
              (long long)event_id,
              confidence_to_string(detection->confidence),
              laser_fired);

    return event_id;
}

int event_logger_get_events(
    const char *since_timestamp,
    const char *until_timestamp,
    event_record_t *events
) {
    if (!g_initialized || !events) {
        return -1;
    }

    // Build query with optional filters
    char sql[512];
    snprintf(sql, sizeof(sql),
        "SELECT id, timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, "
        "clip_file, synced, created_at FROM events WHERE 1=1");

    if (since_timestamp) {
        snprintf(sql + strlen(sql), sizeof(sql) - strlen(sql),
                 " AND timestamp >= '%s'", since_timestamp);
    }
    if (until_timestamp) {
        snprintf(sql + strlen(sql), sizeof(sql) - strlen(sql),
                 " AND timestamp <= '%s'", until_timestamp);
    }

    snprintf(sql + strlen(sql), sizeof(sql) - strlen(sql),
             " ORDER BY timestamp DESC LIMIT %d", MAX_EVENTS_PER_QUERY);

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        LOG_ERROR("Query failed: %s", sqlite3_errmsg(g_db));
        return -1;
    }

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < MAX_EVENTS_PER_QUERY) {
        event_record_t *e = &events[count];

        e->id = sqlite3_column_int64(stmt, 0);
        strncpy(e->timestamp, (const char *)sqlite3_column_text(stmt, 1),
                sizeof(e->timestamp) - 1);
        strncpy(e->confidence, (const char *)sqlite3_column_text(stmt, 2),
                sizeof(e->confidence) - 1);
        e->x = (uint16_t)sqlite3_column_int(stmt, 3);
        e->y = (uint16_t)sqlite3_column_int(stmt, 4);
        e->w = (uint16_t)sqlite3_column_int(stmt, 5);
        e->h = (uint16_t)sqlite3_column_int(stmt, 6);
        e->area = (uint32_t)sqlite3_column_int(stmt, 7);
        e->centroid_x = (uint16_t)sqlite3_column_int(stmt, 8);
        e->centroid_y = (uint16_t)sqlite3_column_int(stmt, 9);
        e->hover_duration_ms = (uint32_t)sqlite3_column_int(stmt, 10);
        e->laser_fired = sqlite3_column_int(stmt, 11) != 0;

        const char *clip = (const char *)sqlite3_column_text(stmt, 12);
        if (clip) {
            strncpy(e->clip_file, clip, sizeof(e->clip_file) - 1);
        } else {
            e->clip_file[0] = '\0';
        }

        e->synced = sqlite3_column_int(stmt, 13) != 0;
        strncpy(e->created_at, (const char *)sqlite3_column_text(stmt, 14),
                sizeof(e->created_at) - 1);

        count++;
    }

    sqlite3_finalize(stmt);
    return count;
}

int event_logger_get_unsynced(event_record_t *events, int max_count) {
    if (!g_initialized || !events) {
        return -1;
    }

    const char *sql =
        "SELECT id, timestamp, confidence, x, y, w, h, area, "
        "centroid_x, centroid_y, hover_duration_ms, laser_fired, "
        "clip_file, synced, created_at FROM events "
        "WHERE synced = 0 ORDER BY timestamp LIMIT ?";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return -1;
    }

    sqlite3_bind_int(stmt, 1, max_count);

    int count = 0;
    while (sqlite3_step(stmt) == SQLITE_ROW && count < max_count) {
        event_record_t *e = &events[count];

        e->id = sqlite3_column_int64(stmt, 0);
        strncpy(e->timestamp, (const char *)sqlite3_column_text(stmt, 1),
                sizeof(e->timestamp) - 1);
        strncpy(e->confidence, (const char *)sqlite3_column_text(stmt, 2),
                sizeof(e->confidence) - 1);
        e->x = (uint16_t)sqlite3_column_int(stmt, 3);
        e->y = (uint16_t)sqlite3_column_int(stmt, 4);
        e->w = (uint16_t)sqlite3_column_int(stmt, 5);
        e->h = (uint16_t)sqlite3_column_int(stmt, 6);
        e->area = (uint32_t)sqlite3_column_int(stmt, 7);
        e->centroid_x = (uint16_t)sqlite3_column_int(stmt, 8);
        e->centroid_y = (uint16_t)sqlite3_column_int(stmt, 9);
        e->hover_duration_ms = (uint32_t)sqlite3_column_int(stmt, 10);
        e->laser_fired = sqlite3_column_int(stmt, 11) != 0;

        const char *clip = (const char *)sqlite3_column_text(stmt, 12);
        if (clip) {
            strncpy(e->clip_file, clip, sizeof(e->clip_file) - 1);
        } else {
            e->clip_file[0] = '\0';
        }

        e->synced = false;
        strncpy(e->created_at, (const char *)sqlite3_column_text(stmt, 14),
                sizeof(e->created_at) - 1);

        count++;
    }

    sqlite3_finalize(stmt);
    return count;
}

int event_logger_mark_synced(int64_t event_id) {
    if (!g_initialized) {
        return -1;
    }

    const char *sql = "UPDATE events SET synced = 1 WHERE id = ?";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, event_id);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    return (rc == SQLITE_DONE) ? 0 : -1;
}

int event_logger_prune(int days) {
    if (!g_initialized) {
        return -1;
    }

    // Calculate cutoff date
    time_t now = time(NULL);
    time_t cutoff = now - (days * 24 * 60 * 60);
    struct tm *tm = gmtime(&cutoff);

    char cutoff_str[32];
    strftime(cutoff_str, sizeof(cutoff_str), "%Y-%m-%dT%H:%M:%SZ", tm);

    // Delete old synced events
    const char *sql = "DELETE FROM events WHERE timestamp < ? AND synced = 1";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(g_db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return -1;
    }

    sqlite3_bind_text(stmt, 1, cutoff_str, -1, SQLITE_STATIC);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    if (rc != SQLITE_DONE) {
        return -1;
    }

    int deleted = sqlite3_changes(g_db);

    if (deleted > 0) {
        LOG_INFO("Pruned %d old events (older than %d days)", deleted, days);
    }

    return deleted;
}

int event_logger_get_status(storage_status_t *status) {
    if (!g_initialized || !status) {
        return -1;
    }

    // Get disk space
    struct statvfs stat;
    if (statvfs(g_config.db_path, &stat) == 0) {
        status->free_mb = (float)(stat.f_bfree * stat.f_bsize) / (1024.0f * 1024.0f);
        status->total_mb = (float)(stat.f_blocks * stat.f_bsize) / (1024.0f * 1024.0f);
        status->warning = status->free_mb < g_config.min_free_mb;
    } else {
        status->free_mb = 0;
        status->total_mb = 0;
        status->warning = true;
    }

    // Get database size
    struct stat db_stat;
    if (stat(g_config.db_path, &db_stat) == 0) {
        status->db_size_mb = (float)db_stat.st_size / (1024.0f * 1024.0f);
    } else {
        status->db_size_mb = 0;
    }

    // Get event counts
    const char *sql_total = "SELECT COUNT(*) FROM events";
    const char *sql_unsynced = "SELECT COUNT(*) FROM events WHERE synced = 0";

    sqlite3_stmt *stmt;

    if (sqlite3_prepare_v2(g_db, sql_total, -1, &stmt, NULL) == SQLITE_OK) {
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            status->total_events = (uint32_t)sqlite3_column_int(stmt, 0);
        }
        sqlite3_finalize(stmt);
    }

    if (sqlite3_prepare_v2(g_db, sql_unsynced, -1, &stmt, NULL) == SQLITE_OK) {
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            status->unsynced_events = (uint32_t)sqlite3_column_int(stmt, 0);
        }
        sqlite3_finalize(stmt);
    }

    return 0;
}

void event_logger_close(void) {
    if (g_db) {
        sqlite3_close(g_db);
        g_db = NULL;
    }
    g_initialized = false;
    LOG_INFO("Event logger closed");
}
```

### ESP32 SQLite HAL

For ESP32, SQLite runs with SPIFFS or LittleFS backend:

```c
// hal/storage/esp32/sqlite_esp32.c
/**
 * ESP32 SQLite implementation using SPIFFS/LittleFS.
 *
 * Uses the sqlite3_esp32 library which provides SQLite
 * with flash filesystem backend.
 */

#ifdef ESP_PLATFORM

#include "event_logger.h"
#include "log.h"

#include <sqlite3.h>
#include "esp_spiffs.h"
#include "esp_vfs.h"

#define SPIFFS_MOUNT_POINT "/spiffs"

static bool g_spiffs_mounted = false;

/**
 * Initialize SPIFFS filesystem for SQLite storage.
 */
int sqlite_hal_init(void) {
    esp_vfs_spiffs_conf_t conf = {
        .base_path = SPIFFS_MOUNT_POINT,
        .partition_label = NULL,
        .max_files = 5,
        .format_if_mount_failed = true,
    };

    esp_err_t ret = esp_vfs_spiffs_register(&conf);
    if (ret != ESP_OK) {
        LOG_ERROR("SPIFFS mount failed: %s", esp_err_to_name(ret));
        return -1;
    }

    g_spiffs_mounted = true;
    LOG_INFO("SPIFFS mounted at %s", SPIFFS_MOUNT_POINT);

    // Initialize SQLite
    sqlite3_initialize();

    return 0;
}

/**
 * Get full path for database file.
 */
const char *sqlite_hal_get_db_path(const char *filename) {
    static char path[128];
    snprintf(path, sizeof(path), "%s/%s", SPIFFS_MOUNT_POINT, filename);
    return path;
}

void sqlite_hal_cleanup(void) {
    if (g_spiffs_mounted) {
        esp_vfs_spiffs_unregister(NULL);
        g_spiffs_mounted = false;
    }
    sqlite3_shutdown();
}

#endif // ESP_PLATFORM
```

### Build Configuration

Add to `CMakeLists.txt`:

```cmake
# SQLite dependency
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)

# Storage module
set(STORAGE_SOURCES
    src/storage/event_logger.c
    src/storage/schema.c
)

if(APIS_PLATFORM STREQUAL "pi")
    list(APPEND STORAGE_SOURCES hal/storage/pi/sqlite_pi.c)
elseif(APIS_PLATFORM STREQUAL "esp32")
    list(APPEND STORAGE_SOURCES hal/storage/esp32/sqlite_esp32.c)
endif()

target_sources(apis-edge PRIVATE ${STORAGE_SOURCES})
target_link_libraries(apis-edge ${SQLITE3_LIBRARIES})
target_include_directories(apis-edge PRIVATE ${SQLITE3_INCLUDE_DIRS})
```

### Pi Build Dependencies

```bash
# Install on Raspberry Pi OS
sudo apt-get install -y libsqlite3-dev
```

### Test Program

```c
// tests/test_event_logger.c
/**
 * Test program for event logging module.
 */

#include "event_logger.h"
#include "classifier.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <unistd.h>

static void test_basic_logging(void) {
    printf("Testing basic event logging...\n");

    event_logger_config_t config = event_logger_config_defaults();
    strcpy(config.db_path, "/tmp/test_events.db");

    if (event_logger_init(&config) != 0) {
        printf("FAIL: Failed to init event logger\n");
        return;
    }

    // Create test detection
    classified_detection_t det = {
        .detection = {
            .x = 100, .y = 100, .w = 30, .h = 25,
            .area = 750, .centroid_x = 115, .centroid_y = 112
        },
        .track_id = 1,
        .confidence = CONFIDENCE_HIGH,
        .classification = CLASS_HORNET,
        .is_hovering = true,
        .hover_duration_ms = 1500,
    };

    // Log event
    int64_t id = event_logger_log(&det, true, "det_20260122_143052.mp4");
    printf("Logged event with ID: %lld\n", (long long)id);

    if (id > 0) {
        printf("PASS: Event logged successfully\n");
    } else {
        printf("FAIL: Event logging failed\n");
    }

    // Get status
    storage_status_t status;
    event_logger_get_status(&status);
    printf("Status: %d total events, %d unsynced, %.2f MB free\n",
           status.total_events, status.unsynced_events, status.free_mb);

    // Query events
    event_record_t events[10];
    int count = event_logger_get_events(NULL, NULL, events);
    printf("Retrieved %d events\n", count);

    if (count > 0) {
        printf("  First event: id=%lld, confidence=%s, hovering=%d ms\n",
               (long long)events[0].id, events[0].confidence,
               events[0].hover_duration_ms);
    }

    // Test unsynced
    count = event_logger_get_unsynced(events, 10);
    printf("Unsynced events: %d\n", count);

    // Mark synced
    event_logger_mark_synced(id);
    count = event_logger_get_unsynced(events, 10);
    printf("After mark_synced: %d unsynced\n", count);

    event_logger_close();

    // Cleanup test file
    unlink("/tmp/test_events.db");

    printf("PASS: Basic logging test completed\n");
}

static void test_pruning(void) {
    printf("Testing event pruning...\n");

    event_logger_config_t config = event_logger_config_defaults();
    strcpy(config.db_path, "/tmp/test_prune.db");

    event_logger_init(&config);

    // Log multiple events
    classified_detection_t det = {
        .detection = {.x = 100, .y = 100, .w = 30, .h = 25, .area = 750,
                      .centroid_x = 115, .centroid_y = 112},
        .confidence = CONFIDENCE_MEDIUM,
    };

    for (int i = 0; i < 5; i++) {
        event_logger_log(&det, false, NULL);
    }

    storage_status_t status;
    event_logger_get_status(&status);
    printf("Before prune: %d events\n", status.total_events);

    // Mark all as synced
    event_record_t events[10];
    int count = event_logger_get_unsynced(events, 10);
    for (int i = 0; i < count; i++) {
        event_logger_mark_synced(events[i].id);
    }

    // Prune (0 days = delete all synced)
    int pruned = event_logger_prune(0);
    printf("Pruned %d events\n", pruned);

    event_logger_get_status(&status);
    printf("After prune: %d events\n", status.total_events);

    event_logger_close();
    unlink("/tmp/test_prune.db");

    printf("PASS: Pruning test completed\n");
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    test_basic_logging();
    test_pruning();

    return 0;
}
```

## Files to Create

```
apis-edge/
├── include/
│   └── event_logger.h       # Event logger interface
├── src/
│   └── storage/
│       ├── event_logger.c   # SQLite event logging
│       └── schema.c         # Database schema
├── hal/
│   └── storage/
│       ├── sqlite_hal.h     # SQLite abstraction
│       ├── pi/
│       │   └── sqlite_pi.c  # Standard SQLite
│       └── esp32/
│           └── sqlite_esp32.c # SQLite with SPIFFS
└── tests/
    └── test_event_logger.c
```

## Dependencies

- Story 10.3 (Size Filtering & Hover Detection)

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude | Story created |
| 2026-01-22 | Claude | Rewritten from Python to C with HAL abstraction |
