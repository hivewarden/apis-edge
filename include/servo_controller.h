/**
 * Servo Controller for APIS Edge Device.
 *
 * Controls pan/tilt servos for laser aiming:
 * - Pan: horizontal movement (-45° to +45°)
 * - Tilt: vertical movement (0° to -30°, never upward!)
 *
 * Features:
 * - Smooth interpolated movement
 * - Angle clamping with safety limits
 * - Home position on startup
 * - Failure detection with LED feedback
 *
 * Thread-safe. All operations are protected by mutex.
 */

#ifndef APIS_SERVO_CONTROLLER_H
#define APIS_SERVO_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Servo Axis Identifiers
// ============================================================================

typedef enum {
    SERVO_AXIS_PAN = 0,     // Horizontal axis
    SERVO_AXIS_TILT = 1,    // Vertical axis
    SERVO_AXIS_COUNT = 2
} servo_axis_t;

// ============================================================================
// Servo Status Codes
// ============================================================================

typedef enum {
    SERVO_OK = 0,                   // Success
    SERVO_ERROR_NOT_INITIALIZED,    // Servo controller not initialized
    SERVO_ERROR_INVALID_AXIS,       // Invalid axis specified
    SERVO_ERROR_ANGLE_CLAMPED,      // Angle was outside limits, clamped to safe value
    SERVO_ERROR_HARDWARE,           // Hardware failure detected
    SERVO_ERROR_NO_MEMORY,          // Memory allocation failed
    SERVO_ERROR_BUSY,               // Movement in progress
} servo_status_t;

// ============================================================================
// Configuration Constants
// ============================================================================

// Angle limits (in degrees)
#define SERVO_PAN_MIN_DEG       (-45.0f)    // Leftmost position
#define SERVO_PAN_MAX_DEG       (45.0f)     // Rightmost position
#define SERVO_PAN_CENTER_DEG    (0.0f)      // Center/home position

#define SERVO_TILT_MIN_DEG      (-30.0f)    // Maximum downward angle
#define SERVO_TILT_MAX_DEG      (0.0f)      // Horizontal (NEVER UPWARD!)
#define SERVO_TILT_CENTER_DEG   (-15.0f)    // Default rest position

// PWM Configuration (50Hz = 20ms period)
#define SERVO_PWM_FREQUENCY_HZ  50
#define SERVO_PWM_PERIOD_US     20000       // 20ms in microseconds
#define SERVO_PULSE_MIN_US      1000        // 1ms pulse = minimum angle
#define SERVO_PULSE_MAX_US      2000        // 2ms pulse = maximum angle
#define SERVO_PULSE_CENTER_US   1500        // 1.5ms pulse = center

// Movement configuration
#define SERVO_MOVE_TIME_MS      45          // Target time for full-range movement
#define SERVO_INTERPOLATION_STEPS 10        // Steps for smooth movement

// ============================================================================
// Servo Position Structure
// ============================================================================

/**
 * Represents a position with both servos.
 */
typedef struct {
    float pan_deg;      // Pan angle in degrees
    float tilt_deg;     // Tilt angle in degrees
} servo_position_t;

/**
 * Servo statistics for monitoring.
 */
typedef struct {
    uint32_t move_count;        // Total movement commands issued
    uint32_t clamp_count;       // Number of times angle was clamped
    float current_pan_deg;      // Current pan position
    float current_tilt_deg;     // Current tilt position
    bool is_moving;             // Currently in interpolated movement
    bool hardware_ok;           // Hardware status (no faults detected)
    uint64_t uptime_ms;         // Time since initialization
} servo_stats_t;

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback when servo failure is detected.
 * Called from servo context - keep handler fast!
 */
typedef void (*servo_failure_callback_t)(servo_axis_t axis, void *user_data);

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize servo controller.
 * Configures PWM pins and moves servos to home position.
 *
 * @return SERVO_OK on success, error code otherwise
 */
servo_status_t servo_controller_init(void);

/**
 * Move to specified position.
 * Uses smooth interpolation over SERVO_MOVE_TIME_MS.
 * Angles outside limits are clamped to safe values.
 *
 * @param position Target position (pan and tilt in degrees)
 * @return SERVO_OK on success, SERVO_ERROR_ANGLE_CLAMPED if clamped
 */
servo_status_t servo_controller_move(servo_position_t position);

/**
 * Move single axis to specified angle.
 * Uses smooth interpolation.
 *
 * @param axis Which axis to move (SERVO_AXIS_PAN or SERVO_AXIS_TILT)
 * @param angle_deg Target angle in degrees
 * @return SERVO_OK on success
 */
servo_status_t servo_controller_move_axis(servo_axis_t axis, float angle_deg);

/**
 * Move immediately without interpolation.
 * Use for emergency positioning.
 *
 * @param position Target position
 * @return SERVO_OK on success
 */
servo_status_t servo_controller_move_immediate(servo_position_t position);

/**
 * Move to home/center position.
 * Pan: 0° (center), Tilt: -15° (slight downward)
 *
 * @return SERVO_OK on success
 */
servo_status_t servo_controller_home(void);

/**
 * Get current servo position.
 *
 * @param position Output position structure
 * @return SERVO_OK on success
 */
servo_status_t servo_controller_get_position(servo_position_t *position);

/**
 * Check if servos are currently moving (interpolation in progress).
 *
 * @return true if movement in progress
 */
bool servo_controller_is_moving(void);

/**
 * Get servo statistics.
 *
 * @param stats Output statistics structure
 * @return SERVO_OK on success
 */
servo_status_t servo_controller_get_stats(servo_stats_t *stats);

/**
 * Set failure callback.
 * Called when hardware failure is detected.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void servo_controller_set_failure_callback(servo_failure_callback_t callback, void *user_data);

/**
 * Clamp angle to safe limits for given axis.
 * Does not move servo, just returns clamped value.
 *
 * @param axis Which axis
 * @param angle_deg Input angle
 * @return Clamped angle within limits
 */
float servo_controller_clamp_angle(servo_axis_t axis, float angle_deg);

/**
 * Check if angle is within limits for given axis.
 *
 * @param axis Which axis
 * @param angle_deg Angle to check
 * @return true if within limits
 */
bool servo_controller_is_angle_valid(servo_axis_t axis, float angle_deg);

/**
 * Convert angle to PWM pulse width.
 *
 * @param axis Which axis
 * @param angle_deg Angle in degrees
 * @return Pulse width in microseconds
 */
uint32_t servo_controller_angle_to_pwm(servo_axis_t axis, float angle_deg);

/**
 * Convert PWM pulse width to angle.
 *
 * @param axis Which axis
 * @param pulse_us Pulse width in microseconds
 * @return Angle in degrees
 */
float servo_controller_pwm_to_angle(servo_axis_t axis, uint32_t pulse_us);

/**
 * Check if servo controller is initialized.
 *
 * @return true if initialized
 */
bool servo_controller_is_initialized(void);

/**
 * Check if hardware is functioning properly.
 *
 * @return true if no faults detected
 */
bool servo_controller_is_hardware_ok(void);

/**
 * Run self-test sequence.
 * Moves servos through full range of motion to verify operation.
 * Takes ~1-2 seconds to complete. Optional but recommended on startup.
 *
 * @return SERVO_OK if all positions reached, error code otherwise
 */
servo_status_t servo_controller_self_test(void);

/**
 * Get status name for logging.
 *
 * @param status Status code
 * @return Static string description
 */
const char *servo_status_name(servo_status_t status);

/**
 * Get axis name for logging.
 *
 * @param axis Axis identifier
 * @return Static string name
 */
const char *servo_axis_name(servo_axis_t axis);

/**
 * Cleanup servo controller.
 * Stops any movement and releases resources.
 */
void servo_controller_cleanup(void);

#endif // APIS_SERVO_CONTROLLER_H
