/**
 * Rolling Frame Buffer
 *
 * Thread-safe circular buffer for storing recent frames.
 * Used for clip pre-roll (capturing frames before detection trigger).
 */

#ifndef APIS_ROLLING_BUFFER_H
#define APIS_ROLLING_BUFFER_H

#include "frame.h"
#include <stdint.h>
#include <stdbool.h>

#define BUFFER_DURATION_SECONDS 2
#define BUFFER_FPS 10
#define MAX_BUFFER_FRAMES (BUFFER_DURATION_SECONDS * BUFFER_FPS)

/**
 * Rolling buffer status codes.
 */
typedef enum {
    ROLLING_BUFFER_OK = 0,
    ROLLING_BUFFER_ERROR_NOT_INITIALIZED,
    ROLLING_BUFFER_ERROR_INVALID_PARAM,
    ROLLING_BUFFER_ERROR_NO_MEMORY,
} rolling_buffer_status_t;

/**
 * A frame stored in the rolling buffer.
 */
typedef struct {
    uint8_t *data;           // BGR pixel data (allocated separately)
    uint32_t timestamp_ms;
    uint32_t sequence;
    bool valid;
} buffered_frame_t;

/**
 * Rolling buffer configuration.
 */
typedef struct {
    float duration_seconds;  // Buffer duration (2.0 default)
    uint8_t fps;             // Expected FPS (10 default)
} rolling_buffer_config_t;

/**
 * Initialize the rolling buffer.
 * Pre-allocates frame data buffers.
 *
 * @param config Configuration (NULL for defaults)
 * @return ROLLING_BUFFER_OK on success
 */
rolling_buffer_status_t rolling_buffer_init(const rolling_buffer_config_t *config);

/**
 * Add a frame to the rolling buffer.
 * Oldest frames are automatically discarded when buffer is full.
 *
 * @param frame Frame to add (data is copied)
 * @return ROLLING_BUFFER_OK on success
 */
rolling_buffer_status_t rolling_buffer_add(const frame_t *frame);

/**
 * Get all frames currently in the buffer.
 * Frames are returned in chronological order (oldest first).
 *
 * THREAD SAFETY: This function copies actual frame data while holding the mutex,
 * making it safe to use the returned frames after the call returns. The buffer
 * can continue to receive new frames without corrupting the returned data.
 *
 * MEMORY REQUIREMENTS: Caller MUST pre-allocate the data buffer for each frame
 * entry (frames[i].data must point to FRAME_SIZE bytes of allocated memory).
 * Use rolling_buffer_alloc_frames() for convenience.
 *
 * @param frames Output array (must hold MAX_BUFFER_FRAMES entries with pre-allocated data)
 * @return Number of valid frames (>=0), -1 on error
 */
int rolling_buffer_get_all(buffered_frame_t *frames);

/**
 * Allocate frame array with data buffers for use with rolling_buffer_get_all().
 *
 * @param count Number of frames to allocate (typically MAX_BUFFER_FRAMES)
 * @return Pointer to allocated array, or NULL on failure. Caller must free with
 *         rolling_buffer_free_frames().
 */
buffered_frame_t *rolling_buffer_alloc_frames(int count);

/**
 * Free frame array allocated with rolling_buffer_alloc_frames().
 *
 * @param frames Array to free
 * @param count Number of frames in array
 */
void rolling_buffer_free_frames(buffered_frame_t *frames, int count);

/**
 * Get frame count in buffer.
 *
 * @return Number of frames in buffer
 */
int rolling_buffer_count(void);

/**
 * Clear all frames from buffer.
 */
void rolling_buffer_clear(void);

/**
 * Check if rolling buffer is initialized.
 *
 * @return true if initialized
 */
bool rolling_buffer_is_initialized(void);

/**
 * Get default configuration.
 *
 * @return Default configuration values
 */
rolling_buffer_config_t rolling_buffer_config_defaults(void);

/**
 * Cleanup and free buffer resources.
 */
void rolling_buffer_cleanup(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *rolling_buffer_status_str(rolling_buffer_status_t status);

#endif // APIS_ROLLING_BUFFER_H
