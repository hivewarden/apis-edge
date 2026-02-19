/**
 * FIFO clip storage management.
 *
 * Monitors clip storage directory and automatically deletes
 * oldest clips when storage threshold is exceeded.
 */

#include "storage_manager.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <limits.h>
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#endif

// S8-H2 fix: HAL-style mutex wrappers instead of direct pthread usage
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define STORAGE_LOCK()   pthread_mutex_lock(&g_mutex)
#define STORAGE_UNLOCK() pthread_mutex_unlock(&g_mutex)
#elif defined(APIS_PLATFORM_ESP32)
static SemaphoreHandle_t g_storage_sem = NULL;
#define STORAGE_LOCK()   do { if (g_storage_sem) xSemaphoreTake(g_storage_sem, portMAX_DELAY); } while(0)
#define STORAGE_UNLOCK() do { if (g_storage_sem) xSemaphoreGive(g_storage_sem); } while(0)
#else
#define STORAGE_LOCK()   ((void)0)
#define STORAGE_UNLOCK() ((void)0)
#endif

// Module state - protected by mutex for thread safety
static storage_manager_config_t g_config;
static bool g_initialized = false;
static storage_manager_clip_deleted_cb g_on_clip_deleted_cb = NULL;

// Track uploaded clips (I1 fix for clip_uploader integration)
// S8-L-04: Uses linear search with 256-byte entries (25.6 KB total). This is
// acceptable on Pi but somewhat wasteful on ESP32 (~5% of available SRAM).
// TODO: For ESP32, consider a hash set or store only filenames (not full paths)
// to reduce memory footprint. At 100 entries, linear search is adequate.
#define MAX_UPLOADED_CLIPS 100
static char g_uploaded_clips[MAX_UPLOADED_CLIPS][256];
static int g_uploaded_count = 0;

storage_manager_config_t storage_manager_config_defaults(void) {
    storage_manager_config_t config;
    memset(&config, 0, sizeof(config));
    snprintf(config.clips_dir, sizeof(config.clips_dir), "./data/clips");
    config.max_size_mb = DEFAULT_MAX_STORAGE_MB;
    config.target_free_mb = DEFAULT_TARGET_FREE_MB;
    return config;
}

storage_manager_status_t storage_manager_init(const storage_manager_config_t *config) {
    STORAGE_LOCK();

    if (g_initialized) {
        LOG_WARN("Storage manager already initialized");
        STORAGE_UNLOCK();
        return STORAGE_MANAGER_OK;
    }

    if (config == NULL) {
        g_config = storage_manager_config_defaults();
    } else {
        g_config = *config;
    }

    // Validate configuration to prevent integer underflow in cleanup calculations
    if (g_config.target_free_mb >= g_config.max_size_mb) {
        LOG_ERROR("Invalid config: target_free_mb (%u) must be less than max_size_mb (%u)",
                  g_config.target_free_mb, g_config.max_size_mb);
        STORAGE_UNLOCK();
        return STORAGE_MANAGER_ERROR_INVALID_PARAM;
    }

#ifdef APIS_PLATFORM_PI
    // Ensure directory exists
    if (mkdir(g_config.clips_dir, 0755) < 0 && errno != EEXIST) {
        LOG_WARN("Could not create clips directory: %s", g_config.clips_dir);
        // Continue anyway - directory might already exist
    }
#endif

    g_initialized = true;

    STORAGE_UNLOCK();

    LOG_INFO("Storage manager initialized (max: %u MB, target free: %u MB)",
             g_config.max_size_mb, g_config.target_free_mb);

    return STORAGE_MANAGER_OK;
}

bool storage_manager_is_initialized(void) {
    STORAGE_LOCK();
    bool init = g_initialized;
    STORAGE_UNLOCK();
    return init;
}

storage_manager_status_t storage_manager_get_stats(storage_stats_t *stats) {
    if (stats == NULL) {
        return STORAGE_MANAGER_ERROR_INVALID_PARAM;
    }

    STORAGE_LOCK();

    if (!g_initialized) {
        LOG_WARN("storage_manager_get_stats called before initialization");
        STORAGE_UNLOCK();
        return STORAGE_MANAGER_ERROR_NOT_INITIALIZED;
    }

    // Copy config locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);
    uint32_t max_size_mb = g_config.max_size_mb;

    STORAGE_UNLOCK();

    memset(stats, 0, sizeof(*stats));

#ifdef APIS_PLATFORM_PI
    DIR *dir = opendir(clips_dir);
    if (!dir) {
        LOG_WARN("Could not open clips directory: %s", clips_dir);
        return STORAGE_MANAGER_ERROR_DIR_ACCESS;
    }

    uint64_t total_bytes = 0;
    struct dirent *entry;

    while ((entry = readdir(dir)) != NULL) {
        // Skip directories
        if (entry->d_type == DT_DIR) {
            continue;
        }

        // Check if it's an MP4 file
        size_t len = strlen(entry->d_name);
        if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
            char filepath[256];
            snprintf(filepath, sizeof(filepath), "%s/%s",
                     clips_dir, entry->d_name);

            struct stat st;
            if (stat(filepath, &st) == 0) {
                total_bytes += (uint64_t)st.st_size;
                stats->clip_count++;
            }
        }
    }

    closedir(dir);

    stats->total_size_kb = (uint32_t)(total_bytes / 1024);
    stats->total_size_mb = (uint32_t)(total_bytes / (1024 * 1024));
    stats->needs_cleanup = stats->total_size_mb > max_size_mb;
#endif

    return STORAGE_MANAGER_OK;
}

bool storage_manager_needs_cleanup(void) {
    storage_stats_t stats;
    if (storage_manager_get_stats(&stats) != STORAGE_MANAGER_OK) {
        return false;
    }
    return stats.needs_cleanup;
}

#ifdef APIS_PLATFORM_PI
/**
 * Structure for sorting clips by modification time.
 */
typedef struct {
    char path[256];
    time_t mtime;
    size_t size;
} clip_file_t;

/**
 * Comparison function for sorting files by modification time (oldest first).
 */
static int compare_mtime(const void *a, const void *b) {
    const clip_file_t *fa = (const clip_file_t *)a;
    const clip_file_t *fb = (const clip_file_t *)b;
    if (fa->mtime < fb->mtime) return -1;
    if (fa->mtime > fb->mtime) return 1;
    return 0;
}
#endif

int storage_manager_cleanup(void) {
    STORAGE_LOCK();

    if (!g_initialized) {
        LOG_WARN("storage_manager_cleanup called before initialization");
        STORAGE_UNLOCK();
        return -1;
    }

    // Copy config and callback locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);
    uint32_t max_size_mb = g_config.max_size_mb;
    uint32_t target_free_mb = g_config.target_free_mb;
    storage_manager_clip_deleted_cb cb = g_on_clip_deleted_cb;

    STORAGE_UNLOCK();

#ifdef APIS_PLATFORM_PI
    // TOCTOU fix: Single-pass directory scan to count + collect filenames.
    // Previously used two separate opendir() calls which created a race
    // condition where files could be added/removed between passes.

    // Initial allocation - will grow if needed
    int clip_capacity = 64;
    clip_file_t *clips = malloc(clip_capacity * sizeof(clip_file_t));
    if (!clips) {
        LOG_ERROR("Failed to allocate clip list");
        return -1;
    }

    DIR *dir = opendir(clips_dir);
    if (!dir) {
        LOG_ERROR("Could not open clips directory: %s", clips_dir);
        free(clips);
        return -1;
    }

    int clip_count = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_type == DT_DIR) {
            continue;
        }

        size_t len = strlen(entry->d_name);
        if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
            // Grow array if needed
            if (clip_count >= clip_capacity) {
                int new_capacity = clip_capacity * 2;
                clip_file_t *new_clips = realloc(clips, new_capacity * sizeof(clip_file_t));
                if (!new_clips) {
                    LOG_WARN("Could not grow clip list, proceeding with %d clips", clip_count);
                    break;
                }
                clips = new_clips;
                clip_capacity = new_capacity;
            }

            snprintf(clips[clip_count].path, sizeof(clips[clip_count].path),
                     "%s/%s", clips_dir, entry->d_name);

            struct stat st;
            if (stat(clips[clip_count].path, &st) == 0) {
                clips[clip_count].mtime = st.st_mtime;
                clips[clip_count].size = (size_t)st.st_size;
                clip_count++;
            }
        }
    }
    closedir(dir);

    if (clip_count == 0) {
        free(clips);
        return 0;
    }

    // Sort by modification time (oldest first)
    qsort(clips, clip_count, sizeof(clip_file_t), compare_mtime);

    // Calculate how much to delete
    size_t total_size = 0;
    for (int i = 0; i < clip_count; i++) {
        total_size += clips[i].size;
    }

    size_t max_bytes = (size_t)max_size_mb * 1024 * 1024;
    size_t target_bytes = (size_t)(max_size_mb - target_free_mb) * 1024 * 1024;

    if (total_size <= max_bytes) {
        // No cleanup needed
        free(clips);
        return 0;
    }

    size_t to_free = total_size - target_bytes;

    // Delete oldest clips
    int deleted = 0;
    size_t freed = 0;

    for (int i = 0; i < clip_count && freed < to_free; i++) {
        if (unlink(clips[i].path) == 0) {
            LOG_INFO("Deleted clip: %s (%.1f KB)",
                     clips[i].path, (float)clips[i].size / 1024.0f);

            // Notify callback if registered (for event logger integration)
            if (cb != NULL) {
                cb(clips[i].path);
            }

            freed += clips[i].size;
            deleted++;
        } else {
            LOG_WARN("Failed to delete clip: %s (%s)",
                     clips[i].path, strerror(errno));
        }
    }

    free(clips);

    if (deleted > 0) {
        LOG_INFO("Storage cleanup: deleted %d clips, freed %.1f MB",
                 deleted, (float)freed / (1024.0f * 1024.0f));
    }

    return deleted;
#else
    return 0;
#endif
}

// ============================================================================
// Path Traversal Protection
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/**
 * Check if a path is safely contained within a base directory.
 * Uses realpath() to resolve symlinks and ".." components.
 * Returns true if safe, false if path escapes base_dir.
 */
static bool is_safe_storage_path(const char *path, const char *base_dir) {
    if (!path || !base_dir) return false;

    char resolved_path[PATH_MAX];
    char resolved_base[PATH_MAX];

    if (realpath(base_dir, resolved_base) == NULL) {
        return false;
    }

    if (realpath(path, resolved_path) == NULL) {
        return false;  // File must exist for delete
    }

    size_t base_len = strlen(resolved_base);
    if (strncmp(resolved_path, resolved_base, base_len) != 0) {
        LOG_WARN("Path traversal detected in delete: %s escapes %s", path, base_dir);
        return false;
    }

    if (resolved_path[base_len] != '/' && resolved_path[base_len] != '\0') {
        return false;
    }

    return true;
}
#endif

int storage_manager_delete_clip(const char *filepath) {
    if (filepath == NULL || filepath[0] == '\0') {
        return -1;
    }

    STORAGE_LOCK();

    if (!g_initialized) {
        STORAGE_UNLOCK();
        return -1;
    }

    // Copy clips_dir for path validation
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);

    // Get callback while holding lock
    storage_manager_clip_deleted_cb cb = g_on_clip_deleted_cb;

    STORAGE_UNLOCK();

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    // Path traversal protection: ensure filepath is within clips directory
    if (!is_safe_storage_path(filepath, clips_dir)) {
        LOG_ERROR("Delete rejected (path traversal): %s", filepath);
        return -1;
    }
#endif

#ifdef APIS_PLATFORM_PI
    if (unlink(filepath) == 0) {
        LOG_DEBUG("Deleted clip: %s", filepath);
        // Notify callback if registered
        if (cb != NULL) {
            cb(filepath);
        }
        return 0;
    } else {
        LOG_WARN("Failed to delete clip: %s (%s)", filepath, strerror(errno));
        return -1;
    }
#else
    (void)filepath;
    (void)cb;
    return 0;
#endif
}

int storage_manager_get_oldest_clip(char *path_out, size_t path_size) {
    if (path_out == NULL || path_size == 0) {
        return -1;
    }

    STORAGE_LOCK();

    if (!g_initialized) {
        STORAGE_UNLOCK();
        return -1;
    }

    // Copy config locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);

    STORAGE_UNLOCK();

#ifdef APIS_PLATFORM_PI
    DIR *dir = opendir(clips_dir);
    if (!dir) {
        return -1;
    }

    char oldest_path[256] = {0};
    time_t oldest_mtime = 0;
    bool found = false;

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_type == DT_DIR) {
            continue;
        }

        size_t len = strlen(entry->d_name);
        if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
            char filepath[256];
            snprintf(filepath, sizeof(filepath), "%s/%s",
                     clips_dir, entry->d_name);

            struct stat st;
            if (stat(filepath, &st) == 0) {
                if (!found || st.st_mtime < oldest_mtime) {
                    oldest_mtime = st.st_mtime;
                    snprintf(oldest_path, sizeof(oldest_path), "%s", filepath);
                    found = true;
                }
            }
        }
    }

    closedir(dir);

    if (found) {
        snprintf(path_out, path_size, "%s", oldest_path);
        return 0;
    }
#else
    (void)path_out;
    (void)path_size;
#endif

    return -1;
}

void storage_manager_cleanup_resources(void) {
    STORAGE_LOCK();
    g_initialized = false;
    g_on_clip_deleted_cb = NULL;
    STORAGE_UNLOCK();
    LOG_INFO("Storage manager cleanup complete");
}

void storage_manager_set_clip_deleted_callback(storage_manager_clip_deleted_cb callback) {
    STORAGE_LOCK();
    g_on_clip_deleted_cb = callback;
    STORAGE_UNLOCK();
}

const char *storage_manager_status_str(storage_manager_status_t status) {
    switch (status) {
        case STORAGE_MANAGER_OK:                    return "OK";
        case STORAGE_MANAGER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case STORAGE_MANAGER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        case STORAGE_MANAGER_ERROR_DIR_ACCESS:      return "Directory access failed";
        case STORAGE_MANAGER_ERROR_DELETE_FAILED:   return "Delete failed";
        default:                                    return "Unknown error";
    }
}

storage_manager_status_t storage_manager_mark_uploaded(const char *clip_path) {
    if (clip_path == NULL || clip_path[0] == '\0') {
        return STORAGE_MANAGER_ERROR_INVALID_PARAM;
    }

    STORAGE_LOCK();

    if (!g_initialized) {
        STORAGE_UNLOCK();
        return STORAGE_MANAGER_ERROR_NOT_INITIALIZED;
    }

    // Check if already tracked
    for (int i = 0; i < g_uploaded_count; i++) {
        if (strcmp(g_uploaded_clips[i], clip_path) == 0) {
            STORAGE_UNLOCK();
            return STORAGE_MANAGER_OK;  // Already marked
        }
    }

    // Add to uploaded list
    if (g_uploaded_count < MAX_UPLOADED_CLIPS) {
        strncpy(g_uploaded_clips[g_uploaded_count], clip_path, sizeof(g_uploaded_clips[0]) - 1);
        g_uploaded_clips[g_uploaded_count][sizeof(g_uploaded_clips[0]) - 1] = '\0';
        g_uploaded_count++;
        LOG_DEBUG("Clip marked as uploaded: %s", clip_path);
    } else {
        // List full, remove oldest entry (circular behavior)
        memmove(&g_uploaded_clips[0], &g_uploaded_clips[1],
                (MAX_UPLOADED_CLIPS - 1) * sizeof(g_uploaded_clips[0]));
        strncpy(g_uploaded_clips[MAX_UPLOADED_CLIPS - 1], clip_path, sizeof(g_uploaded_clips[0]) - 1);
        g_uploaded_clips[MAX_UPLOADED_CLIPS - 1][sizeof(g_uploaded_clips[0]) - 1] = '\0';
        LOG_DEBUG("Clip marked as uploaded (list rotated): %s", clip_path);
    }

    STORAGE_UNLOCK();
    return STORAGE_MANAGER_OK;
}

bool storage_manager_is_uploaded(const char *clip_path) {
    if (clip_path == NULL || clip_path[0] == '\0') {
        return false;
    }

    STORAGE_LOCK();

    if (!g_initialized) {
        STORAGE_UNLOCK();
        return false;
    }

    for (int i = 0; i < g_uploaded_count; i++) {
        if (strcmp(g_uploaded_clips[i], clip_path) == 0) {
            STORAGE_UNLOCK();
            return true;
        }
    }

    STORAGE_UNLOCK();
    return false;
}
