/**
 * Pi SQLite HAL Implementation
 *
 * Standard SQLite on Linux filesystem - minimal HAL layer since
 * the Pi has a full POSIX filesystem.
 */

#ifdef APIS_PLATFORM_PI

#include "../sqlite_hal.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <sys/statvfs.h>
#include <sqlite3.h>

static bool g_initialized = false;
// S8-L-02: This static buffer means concurrent callers would alias the same
// memory, and two sequential calls would overwrite the first result. Currently
// only called during single-threaded init, so safe in practice.
// TODO: Refactor to accept a caller-provided buffer to avoid aliasing risk:
//   int sqlite_hal_get_db_path(const char *filename, char *out, size_t out_len);
static char g_db_path[256];

int sqlite_hal_init(void) {
    if (g_initialized) {
        return 0;
    }

    // Initialize SQLite library
    int rc = sqlite3_initialize();
    if (rc != SQLITE_OK) {
        LOG_ERROR("sqlite_hal: Failed to initialize SQLite: %d", rc);
        return -1;
    }

    g_initialized = true;
    LOG_INFO("sqlite_hal: Pi storage HAL initialized");
    return 0;
}

bool sqlite_hal_is_initialized(void) {
    return g_initialized;
}

const char *sqlite_hal_get_db_path(const char *filename) {
    if (filename == NULL) {
        return "./data/detections.db";
    }

    // On Pi, we just use the path as-is or prepend ./data/
    if (filename[0] == '/' || filename[0] == '.') {
        // Absolute or relative path - use as-is
        snprintf(g_db_path, sizeof(g_db_path), "%s", filename);
    } else {
        // Just filename - prepend default data directory
        snprintf(g_db_path, sizeof(g_db_path), "./data/%s", filename);
    }

    return g_db_path;
}

void sqlite_hal_cleanup(void) {
    if (g_initialized) {
        sqlite3_shutdown();
        g_initialized = false;
        LOG_INFO("sqlite_hal: Pi storage HAL cleaned up");
    }
}

int sqlite_hal_get_storage_info(uint64_t *free_bytes, uint64_t *total_bytes) {
    if (free_bytes == NULL || total_bytes == NULL) {
        return -1;
    }

    struct statvfs stat;
    const char *path = g_db_path[0] ? g_db_path : "./data";

    if (statvfs(path, &stat) != 0) {
        LOG_WARN("sqlite_hal: Failed to get storage info for %s", path);
        *free_bytes = 0;
        *total_bytes = 0;
        return -1;
    }

    *free_bytes = (uint64_t)stat.f_bfree * stat.f_bsize;
    *total_bytes = (uint64_t)stat.f_blocks * stat.f_bsize;

    return 0;
}

#endif // APIS_PLATFORM_PI
