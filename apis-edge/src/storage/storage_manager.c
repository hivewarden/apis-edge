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
#include <pthread.h>

#ifdef APIS_PLATFORM_PI
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#endif

// Module state - protected by g_mutex for thread safety
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static storage_manager_config_t g_config;
static bool g_initialized = false;
static storage_manager_clip_deleted_cb g_on_clip_deleted_cb = NULL;

storage_manager_config_t storage_manager_config_defaults(void) {
    storage_manager_config_t config;
    memset(&config, 0, sizeof(config));
    snprintf(config.clips_dir, sizeof(config.clips_dir), "./data/clips");
    config.max_size_mb = DEFAULT_MAX_STORAGE_MB;
    config.target_free_mb = DEFAULT_TARGET_FREE_MB;
    return config;
}

storage_manager_status_t storage_manager_init(const storage_manager_config_t *config) {
    pthread_mutex_lock(&g_mutex);

    if (g_initialized) {
        LOG_WARN("Storage manager already initialized");
        pthread_mutex_unlock(&g_mutex);
        return STORAGE_MANAGER_OK;
    }

    if (config == NULL) {
        g_config = storage_manager_config_defaults();
    } else {
        g_config = *config;
    }

#ifdef APIS_PLATFORM_PI
    // Ensure directory exists
    if (mkdir(g_config.clips_dir, 0755) < 0 && errno != EEXIST) {
        LOG_WARN("Could not create clips directory: %s", g_config.clips_dir);
        // Continue anyway - directory might already exist
    }
#endif

    g_initialized = true;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Storage manager initialized (max: %u MB, target free: %u MB)",
             g_config.max_size_mb, g_config.target_free_mb);

    return STORAGE_MANAGER_OK;
}

bool storage_manager_is_initialized(void) {
    pthread_mutex_lock(&g_mutex);
    bool init = g_initialized;
    pthread_mutex_unlock(&g_mutex);
    return init;
}

storage_manager_status_t storage_manager_get_stats(storage_stats_t *stats) {
    if (stats == NULL) {
        return STORAGE_MANAGER_ERROR_INVALID_PARAM;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("storage_manager_get_stats called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return STORAGE_MANAGER_ERROR_NOT_INITIALIZED;
    }

    // Copy config locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);
    uint32_t max_size_mb = g_config.max_size_mb;

    pthread_mutex_unlock(&g_mutex);

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
    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("storage_manager_cleanup called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Copy config and callback locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);
    uint32_t max_size_mb = g_config.max_size_mb;
    uint32_t target_free_mb = g_config.target_free_mb;
    storage_manager_clip_deleted_cb cb = g_on_clip_deleted_cb;

    pthread_mutex_unlock(&g_mutex);

#ifdef APIS_PLATFORM_PI
    // First pass: count files to determine allocation size
    DIR *dir = opendir(clips_dir);
    if (!dir) {
        LOG_ERROR("Could not open clips directory: %s", clips_dir);
        return -1;
    }

    int file_count = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_type == DT_DIR) {
            continue;
        }
        size_t len = strlen(entry->d_name);
        if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
            file_count++;
        }
    }
    closedir(dir);

    if (file_count == 0) {
        return 0;
    }

    // Allocate appropriately sized array
    clip_file_t *clips = malloc(file_count * sizeof(clip_file_t));
    if (!clips) {
        LOG_ERROR("Failed to allocate clip list for %d files", file_count);
        return -1;
    }

    // Second pass: collect file info
    dir = opendir(clips_dir);
    if (!dir) {
        free(clips);
        LOG_ERROR("Could not reopen clips directory: %s", clips_dir);
        return -1;
    }

    int clip_count = 0;
    while ((entry = readdir(dir)) != NULL && clip_count < file_count) {
        if (entry->d_type == DT_DIR) {
            continue;
        }

        size_t len = strlen(entry->d_name);
        if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
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

int storage_manager_delete_clip(const char *filepath) {
    if (filepath == NULL || filepath[0] == '\0') {
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Get callback while holding lock
    storage_manager_clip_deleted_cb cb = g_on_clip_deleted_cb;

    pthread_mutex_unlock(&g_mutex);

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

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    // Copy config locally to minimize lock time
    char clips_dir[STORAGE_PATH_MAX];
    snprintf(clips_dir, sizeof(clips_dir), "%s", g_config.clips_dir);

    pthread_mutex_unlock(&g_mutex);

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
    pthread_mutex_lock(&g_mutex);
    g_initialized = false;
    g_on_clip_deleted_cb = NULL;
    pthread_mutex_unlock(&g_mutex);
    LOG_INFO("Storage manager cleanup complete");
}

void storage_manager_set_clip_deleted_callback(storage_manager_clip_deleted_cb callback) {
    pthread_mutex_lock(&g_mutex);
    g_on_clip_deleted_cb = callback;
    pthread_mutex_unlock(&g_mutex);
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
