/**
 * Storage Manager API
 *
 * FIFO clip storage management with automatic rotation.
 * Deletes oldest clips when storage threshold is exceeded.
 */

#ifndef APIS_STORAGE_MANAGER_H
#define APIS_STORAGE_MANAGER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define DEFAULT_MAX_STORAGE_MB 1000
#define DEFAULT_TARGET_FREE_MB 100
#define STORAGE_PATH_MAX 128
#define MAX_DELETED_PATHS 50

/**
 * Storage manager status codes.
 */
typedef enum {
    STORAGE_MANAGER_OK = 0,
    STORAGE_MANAGER_ERROR_NOT_INITIALIZED,
    STORAGE_MANAGER_ERROR_INVALID_PARAM,
    STORAGE_MANAGER_ERROR_DIR_ACCESS,
    STORAGE_MANAGER_ERROR_DELETE_FAILED,
} storage_manager_status_t;

/**
 * Callback function type for clip deletion notifications.
 * Called when a clip is deleted (either manually or during cleanup).
 * Can be used to update references in other modules (e.g., event logger).
 *
 * @param clip_path Full path to the deleted clip file
 */
typedef void (*storage_manager_clip_deleted_cb)(const char *clip_path);

/**
 * Storage manager configuration.
 */
typedef struct {
    char clips_dir[STORAGE_PATH_MAX];  // Clip storage directory
    uint32_t max_size_mb;              // Maximum storage usage (1000 MB default)
    uint32_t target_free_mb;           // Target free space after cleanup (100 MB)
} storage_manager_config_t;

/**
 * Storage statistics.
 */
typedef struct {
    uint32_t total_size_mb;   // Total clip storage used in MB
    uint32_t total_size_kb;   // Total clip storage used in KB (more precise)
    uint32_t clip_count;      // Number of clip files
    bool needs_cleanup;       // True if over threshold
} storage_stats_t;

/**
 * Initialize the storage manager.
 *
 * @param config Configuration (NULL for defaults)
 * @return STORAGE_MANAGER_OK on success
 */
storage_manager_status_t storage_manager_init(const storage_manager_config_t *config);

/**
 * Get current storage statistics.
 *
 * @param stats Output statistics
 * @return STORAGE_MANAGER_OK on success
 */
storage_manager_status_t storage_manager_get_stats(storage_stats_t *stats);

/**
 * Check if cleanup is needed.
 *
 * @return true if storage exceeds threshold
 */
bool storage_manager_needs_cleanup(void);

/**
 * Perform FIFO cleanup of oldest clips.
 * Deletes clips until storage is below target.
 *
 * @return Number of clips deleted, -1 on error
 */
int storage_manager_cleanup(void);

/**
 * Delete a specific clip file.
 *
 * @param filepath Path to clip to delete
 * @return 0 on success, -1 on failure
 */
int storage_manager_delete_clip(const char *filepath);

/**
 * Get the oldest clip file path.
 *
 * @param path_out Output buffer for path
 * @param path_size Size of output buffer
 * @return 0 on success, -1 if no clips exist
 */
int storage_manager_get_oldest_clip(char *path_out, size_t path_size);

/**
 * Check if storage manager is initialized.
 *
 * @return true if initialized
 */
bool storage_manager_is_initialized(void);

/**
 * Get default configuration.
 *
 * @return Default configuration values
 */
storage_manager_config_t storage_manager_config_defaults(void);

/**
 * Cleanup storage manager resources.
 */
void storage_manager_cleanup_resources(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *storage_manager_status_str(storage_manager_status_t status);

/**
 * Register a callback to be notified when clips are deleted.
 * This is typically used by the event logger to clear clip references
 * from the events table when the corresponding clip file is removed.
 *
 * THREAD SAFETY: This function is thread-safe. The callback will be
 * invoked after the file is successfully deleted, not while holding
 * internal locks.
 *
 * USAGE with event_logger:
 *   #include "event_logger.h"
 *   #include "storage_manager.h"
 *
 *   // In your initialization code, after both modules are initialized:
 *   static void on_clip_deleted(const char *path) {
 *       event_logger_clear_clip_reference(path);
 *   }
 *
 *   storage_manager_set_clip_deleted_callback(on_clip_deleted);
 *
 * @param callback Callback function (NULL to unregister)
 */
void storage_manager_set_clip_deleted_callback(storage_manager_clip_deleted_cb callback);

#endif // APIS_STORAGE_MANAGER_H
