/**
 * Event Logger API
 *
 * Local SQLite storage for detection events on the edge device.
 * Events are stored locally and can be synced to the server later.
 */

#ifndef APIS_EVENT_LOGGER_H
#define APIS_EVENT_LOGGER_H

#include "classifier.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_EVENTS_PER_QUERY 100
#define MIN_FREE_SPACE_MB 100
#define DEFAULT_PRUNE_DAYS 30
#define EVENT_PATH_MAX 128
#define EVENT_TIMESTAMP_MAX 32
#define EVENT_CONFIDENCE_MAX 8
#define EVENT_CLIP_PATH_MAX 64

/**
 * Event logger status codes.
 */
typedef enum {
    EVENT_LOGGER_OK = 0,
    EVENT_LOGGER_ERROR_NOT_INITIALIZED,
    EVENT_LOGGER_ERROR_INVALID_PARAM,
    EVENT_LOGGER_ERROR_DB_OPEN,
    EVENT_LOGGER_ERROR_DB_QUERY,
    EVENT_LOGGER_ERROR_NO_MEMORY,
} event_logger_status_t;

/**
 * Event record structure for database storage.
 */
typedef struct {
    int64_t id;                             // Auto-increment ID
    char timestamp[EVENT_TIMESTAMP_MAX];    // ISO 8601 timestamp
    char confidence[EVENT_CONFIDENCE_MAX];  // "high", "medium", "low"
    uint16_t x, y, w, h;                    // Bounding box
    uint32_t area;                          // Contour area
    uint16_t centroid_x;
    uint16_t centroid_y;
    uint32_t hover_duration_ms;             // Hover time
    bool laser_fired;                       // Whether laser was activated
    char clip_file[EVENT_CLIP_PATH_MAX];    // Path to video clip (optional)
    bool synced;                            // Uploaded to server?
    char created_at[EVENT_TIMESTAMP_MAX];   // Record creation timestamp
} event_record_t;

/**
 * Event logger configuration.
 */
typedef struct {
    char db_path[EVENT_PATH_MAX];   // Path to SQLite database
    uint32_t min_free_mb;           // Minimum free space before warning
    uint32_t prune_days;            // Days before auto-pruning
} event_logger_config_t;

/**
 * Storage status information.
 */
typedef struct {
    float free_mb;              // Free disk space in MB
    float total_mb;             // Total disk space in MB
    bool warning;               // True if free space < min_free_mb
    uint32_t total_events;      // Total events in database
    uint32_t unsynced_events;   // Events not yet synced to server
    float db_size_mb;           // Database file size in MB
} storage_status_t;

/**
 * Initialize the event logger.
 *
 * @param config Logger configuration (NULL for defaults)
 * @return EVENT_LOGGER_OK on success
 */
event_logger_status_t event_logger_init(const event_logger_config_t *config);

/**
 * Log a detection event.
 *
 * @param detection Classified detection from classifier
 * @param laser_fired Whether laser was activated
 * @param clip_file Path to video clip (can be NULL)
 * @return Event ID on success (>0), -1 on failure
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
 * @return Number of events found (>=0), -1 on error
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
 * @return Number of unsynced events (>=0), -1 on error
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
 * Mark multiple events as synced.
 *
 * @param event_ids Array of event IDs
 * @param count Number of IDs
 * @return Number of events marked, -1 on error
 */
int event_logger_mark_synced_batch(const int64_t *event_ids, int count);

/**
 * Prune old events (synced only).
 *
 * @param days Delete events older than N days (only if synced=true)
 * @return Number of events deleted, -1 on error
 */
int event_logger_prune(int days);

/**
 * Get storage status.
 *
 * @param status Output storage status
 * @return 0 on success, -1 on failure
 */
int event_logger_get_status(storage_status_t *status);

/**
 * Check if event logger is initialized.
 *
 * @return true if initialized
 */
bool event_logger_is_initialized(void);

/**
 * Get default configuration.
 *
 * @return Default configuration values
 */
event_logger_config_t event_logger_config_defaults(void);

/**
 * Close event logger and release resources.
 */
void event_logger_close(void);

/**
 * Clear clip_file reference for events that reference a deleted clip.
 * This is called by the storage manager when a clip file is deleted
 * to ensure the database doesn't reference non-existent files.
 *
 * THREAD SAFETY: This function is thread-safe and can be called from
 * any thread (e.g., from storage_manager_cleanup callback).
 *
 * @param clip_path Full path to the deleted clip file
 * @return Number of events updated, -1 on error
 */
int event_logger_clear_clip_reference(const char *clip_path);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *event_logger_status_str(event_logger_status_t status);

#endif // APIS_EVENT_LOGGER_H
