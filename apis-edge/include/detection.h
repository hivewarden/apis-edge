/**
 * Motion Detection API
 *
 * Provides detection structures and the motion detection interface.
 * Platform-specific implementations in hal/detection/pi/ and hal/detection/esp32/.
 */

#ifndef APIS_DETECTION_H
#define APIS_DETECTION_H

#include <stdint.h>
#include <stdbool.h>

#define MAX_DETECTIONS 32  // Maximum detections per frame

// Issue 8 fix: Ensure MAX_DETECTIONS fits in uint8_t (detection_result_t.count)
_Static_assert(MAX_DETECTIONS <= 255, "MAX_DETECTIONS exceeds uint8_t range");

/**
 * A detected motion region.
 */
typedef struct {
    uint16_t x;          // Bounding box top-left x
    uint16_t y;          // Bounding box top-left y
    uint16_t w;          // Bounding box width
    uint16_t h;          // Bounding box height
    uint32_t area;       // Contour area in pixels
    uint16_t centroid_x; // Center point x
    uint16_t centroid_y; // Center point y
} detection_t;

/**
 * Result of motion detection on a single frame.
 */
typedef struct {
    detection_t detections[MAX_DETECTIONS];
    uint8_t count;       // Number of valid detections (0-MAX_DETECTIONS)
    uint32_t frame_seq;  // Frame sequence number
    uint32_t timestamp_ms;
    bool has_motion;     // True if any motion detected (even filtered)
} detection_result_t;

/**
 * Motion detector configuration.
 */
typedef struct {
    float learning_rate;     // Background adaptation rate (0.001 default)
    uint8_t threshold;       // Difference threshold (25 default)
    uint16_t min_area;       // Minimum contour area (100 default)
    uint16_t max_area;       // Maximum contour area (50000 default)
    float min_aspect_ratio;  // Minimum w/h ratio (0.3 default)
    float max_aspect_ratio;  // Maximum w/h ratio (3.0 default)
    bool detect_shadows;     // Shadow detection (true default)
                             // TODO: Shadow detection not yet implemented
} motion_config_t;

/**
 * Motion detector status.
 */
typedef enum {
    MOTION_OK = 0,
    MOTION_ERROR_NOT_INITIALIZED,
    MOTION_ERROR_INVALID_PARAM,
    MOTION_ERROR_NO_MEMORY,
} motion_status_t;

/**
 * Initialize motion detector with configuration.
 *
 * @param config Motion detector configuration (NULL for defaults)
 * @return MOTION_OK on success
 */
motion_status_t motion_init(const motion_config_t *config);

/**
 * Process a frame and detect motion regions.
 *
 * NOTE: Caller is responsible for setting result->timestamp_ms and
 * result->frame_seq after this function returns. This function only
 * populates the detections array, count, and has_motion fields.
 *
 * @param frame_data BGR pixel data (FRAME_SIZE bytes)
 * @param result Output detection results
 * @return Number of detections found (0-MAX_DETECTIONS), -1 on error
 */
int motion_detect(const uint8_t *frame_data, detection_result_t *result);

/**
 * Reset the background model.
 * Call this when camera position changes or scene changes dramatically.
 */
void motion_reset_background(void);

/**
 * Get default motion configuration.
 *
 * @return Default configuration values
 */
motion_config_t motion_config_defaults(void);

/**
 * Check if motion detector is initialized.
 *
 * @return true if initialized
 */
bool motion_is_initialized(void);

/**
 * Cleanup motion detector resources.
 */
void motion_cleanup(void);

/**
 * Get human-readable status string.
 *
 * @param status Status code
 * @return Static string description
 */
const char *motion_status_str(motion_status_t status);

#ifdef DEBUG_VISUALIZATION
/**
 * Draw bounding boxes and centroids on frame for debugging.
 * Modifies frame in place.
 *
 * @param frame BGR frame data (modified)
 * @param result Detection results to visualize
 */
void detection_draw_debug(uint8_t *frame, const detection_result_t *result);
#endif

#endif // APIS_DETECTION_H
