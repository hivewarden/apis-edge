/**
 * Targeting System for APIS Edge Device.
 *
 * Orchestrates detection -> aiming -> laser activation.
 * Features:
 * - Sweep pattern around target (±10° at 2Hz)
 * - Multi-target prioritization (largest first)
 * - Smooth tracking updates
 * - Automatic deactivation when target lost
 *
 * Integrates:
 * - Servo controller for aiming
 * - Coordinate mapper for pixel->angle conversion
 * - Laser controller for activation
 *
 * Thread-safe. All operations are protected by mutex.
 */

#ifndef APIS_TARGETING_H
#define APIS_TARGETING_H

#include "coordinate_mapper.h"
#include "servo_controller.h"
#include "laser_controller.h"
#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Configuration Constants
// ============================================================================

// Sweep pattern
#define TARGET_SWEEP_AMPLITUDE_DEG  10.0f       // ±10° sweep
#define TARGET_SWEEP_FREQUENCY_HZ   2.0f        // 2 sweeps per second
#define TARGET_SWEEP_PERIOD_MS      500         // 1/2 Hz = 500ms

// Tracking
#define TARGET_MAX_TARGETS          10          // Max simultaneous detections
#define TARGET_LOST_TIMEOUT_MS      500         // Time before target considered lost
#define TARGET_MIN_AREA_PX          100         // Minimum bounding box area

// ============================================================================
// Status Codes
// ============================================================================

typedef enum {
    TARGET_OK = 0,                  // Success
    TARGET_ERROR_NOT_INITIALIZED,   // Not initialized
    TARGET_ERROR_INVALID_PARAM,     // Invalid parameter
    TARGET_ERROR_NOT_ARMED,         // System not armed
    TARGET_ERROR_NO_TARGET,         // No valid target
    TARGET_ERROR_HARDWARE,          // Hardware error
} target_status_t;

// ============================================================================
// Targeting State
// ============================================================================

typedef enum {
    TARGET_STATE_IDLE = 0,          // No active tracking
    TARGET_STATE_ACQUIRING,         // Aiming at target
    TARGET_STATE_TRACKING,          // Tracking with sweep
    TARGET_STATE_LOST,              // Target was lost
    TARGET_STATE_COOLDOWN,          // Waiting for cooldown
} target_state_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Detection bounding box from vision system.
 */
typedef struct {
    int32_t x;          // Left edge
    int32_t y;          // Top edge
    int32_t width;      // Box width
    int32_t height;     // Box height
    float confidence;   // Detection confidence (0.0-1.0)
    uint32_t id;        // Tracking ID (optional)
} detection_box_t;

/**
 * Current target information.
 */
typedef struct {
    pixel_coord_t centroid;         // Center of target
    servo_position_t target_angle;  // Aimed servo position
    servo_position_t sweep_angle;   // Current sweep position
    int32_t area;                   // Bounding box area
    uint64_t first_seen;            // When first detected
    uint64_t last_seen;             // Last update time
    bool active;                    // Currently tracked
} target_info_t;

/**
 * Targeting statistics.
 */
typedef struct {
    uint32_t target_count;          // Total targets acquired
    uint32_t lost_count;            // Targets lost
    uint32_t multi_target_count;    // Times multiple targets seen
    uint32_t sweep_cycles;          // Complete sweep cycles
    uint64_t total_track_time_ms;   // Cumulative tracking time
    uint64_t uptime_ms;             // Time since initialization
} target_stats_t;

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback when target state changes.
 */
typedef void (*target_state_callback_t)(target_state_t new_state, void *user_data);

/**
 * Callback when target acquired.
 */
typedef void (*target_acquired_callback_t)(const target_info_t *target, void *user_data);

/**
 * Callback when target lost.
 */
typedef void (*target_lost_callback_t)(uint32_t track_duration_ms, void *user_data);

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize targeting system.
 * Requires servo, coordinate mapper, and laser controllers to be initialized.
 *
 * @return TARGET_OK on success
 */
target_status_t targeting_init(void);

/**
 * Process detections from vision system.
 * Call this each frame with all current detections.
 * System will select best target and update tracking.
 *
 * @param detections Array of detection boxes
 * @param count Number of detections
 * @return TARGET_OK on success
 */
target_status_t targeting_process_detections(const detection_box_t *detections, uint32_t count);

/**
 * Update targeting loop (call periodically).
 * Updates sweep pattern and checks for lost targets.
 * Should be called at least every 50ms.
 */
void targeting_update(void);

/**
 * Get current target information.
 *
 * @param target Output target info (may be inactive)
 * @return TARGET_OK on success
 */
target_status_t targeting_get_current_target(target_info_t *target);

/**
 * Check if actively tracking a target.
 *
 * @return true if tracking
 */
bool targeting_is_tracking(void);

/**
 * Get current targeting state.
 *
 * @return Current state
 */
target_state_t targeting_get_state(void);

/**
 * Cancel current tracking and return to idle.
 * Laser will be deactivated and servos return home.
 */
void targeting_cancel(void);

/**
 * Set sweep amplitude.
 *
 * @param amplitude_deg Sweep amplitude in degrees (0-45)
 */
void targeting_set_sweep_amplitude(float amplitude_deg);

/**
 * Get current sweep amplitude.
 *
 * @return Sweep amplitude in degrees
 */
float targeting_get_sweep_amplitude(void);

/**
 * Set sweep frequency.
 *
 * @param frequency_hz Sweep frequency in Hz (0.5-5.0)
 */
void targeting_set_sweep_frequency(float frequency_hz);

/**
 * Get current sweep frequency.
 *
 * @return Sweep frequency in Hz
 */
float targeting_get_sweep_frequency(void);

/**
 * Set state change callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void targeting_set_state_callback(target_state_callback_t callback, void *user_data);

/**
 * Set target acquired callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void targeting_set_acquired_callback(target_acquired_callback_t callback, void *user_data);

/**
 * Set target lost callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void targeting_set_lost_callback(target_lost_callback_t callback, void *user_data);

/**
 * Get targeting statistics.
 *
 * @param stats Output statistics
 * @return TARGET_OK on success
 */
target_status_t targeting_get_stats(target_stats_t *stats);

/**
 * Check if targeting system is initialized.
 *
 * @return true if initialized
 */
bool targeting_is_initialized(void);

/**
 * Get state name for logging.
 *
 * @param state State value
 * @return Static string name
 */
const char *target_state_name(target_state_t state);

/**
 * Get status name for logging.
 *
 * @param status Status value
 * @return Static string name
 */
const char *target_status_name(target_status_t status);

/**
 * Cleanup targeting system.
 */
void targeting_cleanup(void);

#endif // APIS_TARGETING_H
