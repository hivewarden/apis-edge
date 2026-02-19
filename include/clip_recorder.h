/**
 * Clip Recorder API
 *
 * Detection-triggered video clip recording with pre-roll support.
 * Records frames to H.264 MP4 files with automatic overlap handling.
 */

#ifndef APIS_CLIP_RECORDER_H
#define APIS_CLIP_RECORDER_H

#include "frame.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_LINKED_EVENTS 10
#define PRE_ROLL_SECONDS 2
#define POST_ROLL_SECONDS 3
#define CLIP_PATH_MAX 128

/**
 * Clip recorder status codes.
 */
typedef enum {
    CLIP_RECORDER_OK = 0,
    CLIP_RECORDER_ERROR_NOT_INITIALIZED,
    CLIP_RECORDER_ERROR_INVALID_PARAM,
    CLIP_RECORDER_ERROR_ENCODER_FAILED,
    CLIP_RECORDER_ERROR_FILE_WRITE,
    CLIP_RECORDER_ERROR_NO_MEMORY,
} clip_recorder_status_t;

/**
 * Recording state machine states.
 */
typedef enum {
    RECORD_STATE_IDLE = 0,
    RECORD_STATE_RECORDING,
    RECORD_STATE_EXTENDING,
    RECORD_STATE_FINALIZING,
    RECORD_STATE_ERROR,
} record_state_t;

/**
 * Clip recorder configuration.
 */
typedef struct {
    char output_dir[CLIP_PATH_MAX];  // Clip storage directory
    uint8_t fps;                     // Recording FPS (10 default)
    uint8_t pre_roll_seconds;        // Seconds before detection (2 default)
    uint8_t post_roll_seconds;       // Seconds after detection (3 default)
} clip_recorder_config_t;

/**
 * Clip recording result.
 */
typedef struct {
    char filepath[CLIP_PATH_MAX];              // Full path to recorded clip
    uint32_t duration_ms;                      // Clip duration in ms
    uint32_t file_size;                        // File size in bytes
    int64_t linked_events[MAX_LINKED_EVENTS];  // Event IDs linked to this clip
    int linked_count;                          // Number of linked events
} clip_result_t;

/**
 * Initialize the clip recorder.
 *
 * @param config Configuration (NULL for defaults)
 * @return CLIP_RECORDER_OK on success
 */
clip_recorder_status_t clip_recorder_init(const clip_recorder_config_t *config);

/**
 * Start recording a new clip.
 * Pre-roll frames are taken from the rolling buffer.
 * If already recording, extends the current clip instead.
 *
 * IMPORTANT - POINTER LIFETIME: The returned pointer points to an internal
 * static buffer. The pointer remains valid until:
 *   - clip_recorder_cleanup() is called
 *   - A new clip is started (when IDLE) causing the buffer to be overwritten
 *
 * If you need to preserve the path across calls, copy it to your own buffer:
 *   const char *path = clip_recorder_start(event_id);
 *   if (path) {
 *       char my_path[CLIP_PATH_MAX];
 *       snprintf(my_path, sizeof(my_path), "%s", path);
 *   }
 *
 * THREAD SAFETY: This function is thread-safe. The state check and extend
 * operation are performed atomically while holding the internal mutex.
 *
 * @param event_id Event ID to link to this clip
 * @return Path to clip file (NULL on error), points to internal buffer
 */
const char *clip_recorder_start(int64_t event_id);

/**
 * Feed a frame to the clip recorder.
 * Call this from the main capture loop for every frame.
 * Frame is recorded if in recording state.
 *
 * @param frame Frame to potentially record
 * @return true if clip was finalized this call
 */
bool clip_recorder_feed_frame(const frame_t *frame);

/**
 * Extend the current clip (for overlapping detections).
 * Adds the event ID to the linked events and extends recording time.
 *
 * @param event_id Additional event ID to link
 */
void clip_recorder_extend(int64_t event_id);

/**
 * Check if recording is active.
 *
 * @return true if currently recording or extending
 */
bool clip_recorder_is_recording(void);

/**
 * Get current recording state.
 *
 * @return Current state
 */
record_state_t clip_recorder_get_state(void);

/**
 * Force stop recording (e.g., on shutdown).
 * Finalizes the current clip if any.
 *
 * @param result Output clip result (can be NULL)
 * @return 0 if clip was finalized, -1 if no clip was recording
 */
int clip_recorder_stop(clip_result_t *result);

/**
 * Get current clip filepath.
 *
 * IMPORTANT - POINTER LIFETIME: Same as clip_recorder_start(). The returned
 * pointer points to an internal static buffer. Copy to your own buffer if
 * you need to preserve the path.
 *
 * @return Current clip path or NULL if not recording, points to internal buffer
 */
const char *clip_recorder_get_current_path(void);

/**
 * Get linked event IDs for current clip.
 *
 * @param event_ids Output array
 * @param max_count Maximum events to return
 * @return Number of linked events
 */
int clip_recorder_get_linked_events(int64_t *event_ids, int max_count);

/**
 * Check if clip recorder is initialized.
 *
 * @return true if initialized
 */
bool clip_recorder_is_initialized(void);

/**
 * Get default configuration.
 *
 * @return Default configuration values
 */
clip_recorder_config_t clip_recorder_config_defaults(void);

/**
 * Cleanup clip recorder resources.
 */
void clip_recorder_cleanup(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *clip_recorder_status_str(clip_recorder_status_t status);

/**
 * Get human-readable state string.
 *
 * @param state Recording state
 * @return Static string description
 */
const char *clip_recorder_state_str(record_state_t state);

#endif // APIS_CLIP_RECORDER_H
