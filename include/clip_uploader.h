/**
 * Clip Uploader for APIS Edge Device.
 *
 * Handles uploading detection clips to the server with:
 * - Queue management (up to 50 clips)
 * - Exponential backoff retry on failure
 * - Rate limiting between uploads
 * - Persistent queue for crash recovery
 *
 * Thread-safe. Runs a background thread for uploads.
 */

#ifndef APIS_CLIP_UPLOADER_H
#define APIS_CLIP_UPLOADER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// ============================================================================
// Configuration Constants
// ============================================================================

#define MAX_UPLOAD_QUEUE        50      // Maximum queued clips
#define MIN_UPLOAD_INTERVAL_SEC 30      // Minimum seconds between uploads
#define INITIAL_RETRY_SEC       60      // 1 minute initial retry delay
#define MAX_RETRY_SEC           3600    // 1 hour maximum retry interval
#define MAX_UPLOAD_RETRIES      10      // S8-M5: Maximum retry attempts before giving up
#define UPLOAD_TIMEOUT_SEC      120     // 2 minute upload timeout
#define QUEUE_CHECK_INTERVAL_MS 5000    // How often to check queue (5s)

#define CLIP_PATH_MAX           256
#define DETECTION_ID_MAX        64

// ============================================================================
// Types
// ============================================================================

/**
 * Clip upload queue entry.
 */
typedef struct {
    char clip_path[CLIP_PATH_MAX];      // Path to clip file
    char detection_id[DETECTION_ID_MAX]; // Detection event ID
    uint32_t retry_count;               // Number of retry attempts
    int64_t next_retry_time;            // Unix timestamp for next retry (0 = now)
    int64_t queued_time;                // When clip was queued (Unix timestamp)
    bool uploaded;                      // Whether successfully uploaded
} clip_queue_entry_t;

/**
 * Upload result status.
 */
typedef enum {
    UPLOAD_STATUS_SUCCESS = 0,          // 201 Created
    UPLOAD_STATUS_NETWORK_ERROR,        // Connection failed
    UPLOAD_STATUS_SERVER_ERROR,         // 5xx response
    UPLOAD_STATUS_AUTH_ERROR,           // 401/403 response
    UPLOAD_STATUS_CLIENT_ERROR,         // 4xx response (bad request)
    UPLOAD_STATUS_FILE_ERROR,           // File not found or read error
    UPLOAD_STATUS_NO_CONFIG,            // Server not configured
} upload_status_t;

/**
 * Queue statistics.
 */
typedef struct {
    uint32_t pending_count;             // Clips waiting to upload
    uint32_t uploaded_count;            // Clips successfully uploaded
    uint32_t failed_count;              // Clips that failed permanently
    uint32_t retry_count;               // Clips waiting for retry
    int64_t last_upload_time;           // Last successful upload (Unix timestamp)
    int64_t oldest_pending_time;        // Oldest clip in queue (Unix timestamp)
} upload_stats_t;

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize clip uploader.
 * Loads persistent queue from disk if exists.
 * @return 0 on success, -1 on error
 */
int clip_uploader_init(void);

/**
 * Start background upload thread.
 * @return 0 on success, -1 on error
 */
int clip_uploader_start(void);

/**
 * Queue a clip for upload.
 * If queue is full, oldest unuploaded clip is dropped.
 * @param clip_path Path to the clip file
 * @param detection_id Detection event ID (for linking on server)
 * @return 0 on success, -1 on error
 */
int clip_uploader_queue(const char *clip_path, const char *detection_id);

/**
 * Get number of pending clips in queue.
 * @return Number of pending clips (not yet uploaded)
 */
uint32_t clip_uploader_pending_count(void);

/**
 * Get upload statistics.
 * @param stats Output statistics struct
 * @return 0 on success, -1 on error
 */
int clip_uploader_get_stats(upload_stats_t *stats);

/**
 * Stop upload thread.
 */
void clip_uploader_stop(void);

/**
 * Cleanup and persist queue.
 */
void clip_uploader_cleanup(void);

/**
 * Check if uploader is initialized.
 * @return true if initialized
 */
bool clip_uploader_is_initialized(void);

/**
 * Check if uploader is running.
 * @return true if upload thread is active
 */
bool clip_uploader_is_running(void);

/**
 * Get status name for logging.
 * @param status The upload status
 * @return Static string name
 */
const char *upload_status_name(upload_status_t status);

/**
 * Calculate retry delay based on retry count.
 * Uses exponential backoff: delay = min(60 * 2^retry, 3600)
 * @param retry_count Number of previous retries
 * @return Delay in seconds
 */
uint32_t clip_uploader_retry_delay(uint32_t retry_count);

// ============================================================================
// Testing Support
// ============================================================================

/**
 * Clear all entries from queue (for testing).
 */
void clip_uploader_clear_queue(void);

/**
 * Get queue entry by index (for testing).
 * @param index Queue index (0-based)
 * @param entry Output entry
 * @return 0 on success, -1 if index out of range
 */
int clip_uploader_get_entry(uint32_t index, clip_queue_entry_t *entry);

#endif // APIS_CLIP_UPLOADER_H
