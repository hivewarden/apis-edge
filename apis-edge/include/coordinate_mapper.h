/**
 * Coordinate Mapper for APIS Edge Device.
 *
 * Converts camera pixel coordinates to servo angles for laser aiming.
 * Handles:
 * - Field of view mapping (pixel position to angle)
 * - Calibration offsets (laser/camera parallax correction)
 * - Calibration persistence (JSON file)
 *
 * Thread-safe. All operations are protected by mutex.
 */

#ifndef APIS_COORDINATE_MAPPER_H
#define APIS_COORDINATE_MAPPER_H

#include "servo_controller.h"
#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Configuration Constants
// ============================================================================

// Default camera parameters (can be overridden via calibration)
#define COORD_DEFAULT_WIDTH         640     // Default frame width in pixels
#define COORD_DEFAULT_HEIGHT        480     // Default frame height in pixels
#define COORD_DEFAULT_FOV_H_DEG     60.0f   // Horizontal field of view
#define COORD_DEFAULT_FOV_V_DEG     45.0f   // Vertical field of view (4:3 aspect)

// Calibration file path
#define COORD_CALIBRATION_PATH      "/data/apis/calibration.json"

// Maximum calibration points
#define COORD_MAX_CALIBRATION_POINTS 4

// ============================================================================
// Status Codes
// ============================================================================

typedef enum {
    COORD_OK = 0,                       // Success
    COORD_ERROR_NOT_INITIALIZED,        // Not initialized
    COORD_ERROR_INVALID_PARAM,          // Invalid parameter
    COORD_ERROR_FILE_NOT_FOUND,         // Calibration file not found
    COORD_ERROR_FILE_INVALID,           // Calibration file malformed
    COORD_ERROR_IO,                     // File I/O error
    COORD_ERROR_NO_MEMORY,              // Memory allocation failed
    COORD_ERROR_OUT_OF_BOUNDS,          // Pixel coordinates out of frame bounds
} coord_status_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Pixel position in camera frame.
 * Origin (0,0) is top-left corner.
 */
typedef struct {
    int32_t x;      // Horizontal pixel (0 = left)
    int32_t y;      // Vertical pixel (0 = top)
} pixel_coord_t;

/**
 * Camera parameters for coordinate mapping.
 */
typedef struct {
    uint32_t width;         // Frame width in pixels
    uint32_t height;        // Frame height in pixels
    float fov_h_deg;        // Horizontal field of view in degrees
    float fov_v_deg;        // Vertical field of view in degrees
} camera_params_t;

/**
 * Calibration point - maps a known pixel to a known angle.
 */
typedef struct {
    pixel_coord_t pixel;        // Pixel position
    servo_position_t angle;     // Corresponding servo angles
    bool valid;                 // Whether this point is set
} calibration_point_t;

/**
 * Full calibration data.
 */
typedef struct {
    // Offset corrections (applied after base mapping)
    float offset_pan_deg;       // Pan offset in degrees
    float offset_tilt_deg;      // Tilt offset in degrees

    // Scale corrections (multiplicative adjustments)
    float scale_pan;            // Pan scale factor (default 1.0)
    float scale_tilt;           // Tilt scale factor (default 1.0)

    // Camera parameters at calibration time
    camera_params_t camera;

    // Calibration points for multi-point calibration
    calibration_point_t points[COORD_MAX_CALIBRATION_POINTS];
    uint32_t num_points;

    // Metadata
    uint64_t timestamp;         // When calibration was performed
    bool valid;                 // Whether calibration is valid
} calibration_data_t;

/**
 * Mapper statistics.
 */
typedef struct {
    uint32_t map_count;         // Total mapping operations
    uint32_t out_of_bounds_count; // Coordinates outside frame
    bool calibrated;            // Whether calibration is loaded
    uint64_t uptime_ms;         // Time since initialization
} coord_stats_t;

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize coordinate mapper with camera parameters.
 *
 * @param params Camera parameters (NULL for defaults)
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_init(const camera_params_t *params);

/**
 * Map pixel coordinates to servo angles.
 * Applies calibration offsets if loaded.
 *
 * @param pixel Input pixel coordinates
 * @param angles Output servo angles
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_pixel_to_angle(pixel_coord_t pixel, servo_position_t *angles);

/**
 * Map servo angles to pixel coordinates (inverse).
 * Useful for overlay visualization.
 *
 * @param angles Input servo angles
 * @param pixel Output pixel coordinates
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_angle_to_pixel(servo_position_t angles, pixel_coord_t *pixel);

/**
 * Load calibration from file.
 *
 * @param path File path (NULL for default path)
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_load_calibration(const char *path);

/**
 * Save calibration to file.
 *
 * @param path File path (NULL for default path)
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_save_calibration(const char *path);

/**
 * Set calibration offsets directly.
 *
 * @param offset_pan Pan offset in degrees
 * @param offset_tilt Tilt offset in degrees
 */
void coord_mapper_set_offsets(float offset_pan, float offset_tilt);

/**
 * Get current calibration offsets.
 *
 * @param offset_pan Output pan offset
 * @param offset_tilt Output tilt offset
 */
void coord_mapper_get_offsets(float *offset_pan, float *offset_tilt);

/**
 * Set scale factors.
 *
 * @param scale_pan Pan scale factor (1.0 = no change)
 * @param scale_tilt Tilt scale factor (1.0 = no change)
 */
void coord_mapper_set_scales(float scale_pan, float scale_tilt);

/**
 * Get current scale factors.
 *
 * @param scale_pan Output pan scale
 * @param scale_tilt Output tilt scale
 */
void coord_mapper_get_scales(float *scale_pan, float *scale_tilt);

/**
 * Add calibration point.
 *
 * @param pixel Known pixel position
 * @param angles Known servo angles at that position
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_add_point(pixel_coord_t pixel, servo_position_t angles);

/**
 * Clear all calibration points.
 */
void coord_mapper_clear_points(void);

/**
 * Calculate calibration from recorded points.
 * Requires at least 1 point for offset, 2+ for scale.
 *
 * @return COORD_OK if calibration computed successfully
 */
coord_status_t coord_mapper_compute_calibration(void);

/**
 * Reset calibration to defaults (no offsets, scale = 1.0).
 */
void coord_mapper_reset_calibration(void);

/**
 * Check if calibration is loaded/valid.
 *
 * @return true if calibrated
 */
bool coord_mapper_is_calibrated(void);

/**
 * Get calibration data (for inspection/debugging).
 *
 * @param data Output calibration data
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_get_calibration(calibration_data_t *data);

/**
 * Update camera parameters.
 *
 * @param params New camera parameters
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_set_camera_params(const camera_params_t *params);

/**
 * Get current camera parameters.
 *
 * @param params Output camera parameters
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_get_camera_params(camera_params_t *params);

/**
 * Get mapper statistics.
 *
 * @param stats Output statistics
 * @return COORD_OK on success
 */
coord_status_t coord_mapper_get_stats(coord_stats_t *stats);

/**
 * Check if mapper is initialized.
 *
 * @return true if initialized
 */
bool coord_mapper_is_initialized(void);

/**
 * Get status name for logging.
 *
 * @param status Status code
 * @return Static string description
 */
const char *coord_status_name(coord_status_t status);

/**
 * Cleanup coordinate mapper.
 */
void coord_mapper_cleanup(void);

#endif // APIS_COORDINATE_MAPPER_H
