/**
 * Laser Controller for APIS Edge Device.
 *
 * Controls laser activation with safety limits:
 * - Maximum continuous on-time (10 seconds)
 * - Cooldown period between activations (5 seconds)
 * - Kill switch integration for emergency stop
 * - Armed/disarmed state respect
 *
 * SAFETY: Laser can NEVER fire if:
 * - Unit is not armed
 * - Kill switch is engaged
 * - In cooldown period
 * - Max continuous time exceeded
 *
 * Thread-safe. All operations are protected by mutex.
 */

#ifndef APIS_LASER_CONTROLLER_H
#define APIS_LASER_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Configuration Constants
// ============================================================================

// Timing limits
#define LASER_MAX_ON_TIME_MS        10000   // 10 seconds max continuous
#define LASER_COOLDOWN_MS           5000    // 5 seconds cooldown
#define LASER_PULSE_MIN_MS          50      // Minimum pulse duration

// GPIO Configuration
#if defined(APIS_PLATFORM_PI)
#define GPIO_LASER_CONTROL          23      // GPIO pin for MOSFET gate
#elif defined(APIS_PLATFORM_ESP32)
#define GPIO_LASER_CONTROL          4       // Available GPIO on ESP32-CAM
#else
// Test platform - define a placeholder value (not actually used in mock GPIO)
#define GPIO_LASER_CONTROL          0
#endif

// ============================================================================
// Status Codes
// ============================================================================

typedef enum {
    LASER_OK = 0,                   // Success
    LASER_ERROR_NOT_INITIALIZED,    // Not initialized
    LASER_ERROR_NOT_ARMED,          // Unit is not armed
    LASER_ERROR_COOLDOWN,           // In cooldown period
    LASER_ERROR_MAX_TIME,           // Max on-time reached
    LASER_ERROR_KILL_SWITCH,        // Kill switch engaged
    LASER_ERROR_HARDWARE,           // Hardware fault
    LASER_ERROR_INVALID_PARAM,      // Invalid parameter (e.g., NULL pointer)
} laser_status_t;

// ============================================================================
// Laser State
// ============================================================================

typedef enum {
    LASER_STATE_OFF = 0,            // Laser is off
    LASER_STATE_ARMED,              // Ready to fire (armed but not active)
    LASER_STATE_ACTIVE,             // Laser is on
    LASER_STATE_COOLDOWN,           // Cooling down after use
    LASER_STATE_EMERGENCY_STOP,     // Kill switch engaged
    LASER_STATE_ERROR,              // Hardware error
} laser_state_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Laser activation event for logging.
 */
typedef struct {
    uint64_t timestamp;             // When laser was activated
    uint32_t duration_ms;           // How long it was on
    bool safety_timeout;            // Was it cut off by timeout?
} laser_event_t;

/**
 * Laser statistics.
 */
typedef struct {
    uint32_t activation_count;      // Total activations
    uint32_t safety_timeout_count;  // Times cut off by timeout
    uint32_t cooldown_block_count;  // Times blocked by cooldown
    uint32_t kill_switch_count;     // Times kill switch engaged
    uint32_t total_on_time_ms;      // Cumulative on-time
    uint64_t last_activation;       // Timestamp of last activation
    uint64_t uptime_ms;             // Time since initialization
} laser_stats_t;

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback when laser state changes.
 */
typedef void (*laser_state_callback_t)(laser_state_t new_state, void *user_data);

/**
 * Callback when safety timeout occurs.
 */
typedef void (*laser_timeout_callback_t)(uint32_t duration_ms, void *user_data);

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize laser controller.
 * Laser starts OFF and DISARMED.
 *
 * @return LASER_OK on success
 */
laser_status_t laser_controller_init(void);

/**
 * Turn laser ON.
 * Requires: armed, not in cooldown, kill switch not engaged.
 *
 * @return LASER_OK on success, error code if blocked
 */
laser_status_t laser_controller_on(void);

/**
 * Turn laser OFF immediately.
 * Always succeeds (safe operation).
 */
void laser_controller_off(void);

/**
 * Arm the laser system.
 * Allows laser to be activated when conditions are met.
 */
void laser_controller_arm(void);

/**
 * Disarm the laser system.
 * Turns off laser immediately and prevents activation.
 */
void laser_controller_disarm(void);

/**
 * Check if laser system is armed.
 *
 * @return true if armed
 */
bool laser_controller_is_armed(void);

/**
 * Check if laser is currently active (on).
 *
 * @return true if on
 */
bool laser_controller_is_active(void);

/**
 * Get current laser state.
 *
 * @return Current state
 */
laser_state_t laser_controller_get_state(void);

/**
 * Engage kill switch (emergency stop).
 * Immediately turns off laser and prevents re-activation.
 * Must be explicitly reset.
 */
void laser_controller_kill_switch(void);

/**
 * Reset kill switch.
 * Only works if kill switch was engaged.
 * System returns to disarmed state.
 */
void laser_controller_reset_kill_switch(void);

/**
 * Check if kill switch is engaged.
 *
 * @return true if engaged
 */
bool laser_controller_is_kill_switch_engaged(void);

/**
 * Check if in cooldown period.
 *
 * @return true if in cooldown
 */
bool laser_controller_is_in_cooldown(void);

/**
 * Get remaining cooldown time.
 *
 * @return Remaining cooldown in milliseconds (0 if not in cooldown)
 */
uint32_t laser_controller_get_cooldown_remaining(void);

/**
 * Get remaining on-time before safety timeout.
 *
 * @return Remaining time in milliseconds (0 if not active)
 */
uint32_t laser_controller_get_on_time_remaining(void);

/**
 * Get current on-time (how long laser has been on).
 *
 * @return On-time in milliseconds (0 if not active)
 */
uint32_t laser_controller_get_current_on_time(void);

/**
 * Update laser controller (call periodically).
 * Checks for timeout and manages cooldown state.
 * Should be called at least every 50ms when laser is active.
 */
void laser_controller_update(void);

/**
 * Set state change callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void laser_controller_set_state_callback(laser_state_callback_t callback, void *user_data);

/**
 * Set timeout callback.
 * Called when safety timeout cuts off laser.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void laser_controller_set_timeout_callback(laser_timeout_callback_t callback, void *user_data);

/**
 * Get laser statistics.
 *
 * @param stats Output statistics structure
 * @return LASER_OK on success
 */
laser_status_t laser_controller_get_stats(laser_stats_t *stats);

/**
 * Check if laser controller is initialized.
 *
 * @return true if initialized
 */
bool laser_controller_is_initialized(void);

/**
 * Get state name for logging.
 *
 * @param state State value
 * @return Static string name
 */
const char *laser_state_name(laser_state_t state);

/**
 * Get status name for logging.
 *
 * @param status Status code
 * @return Static string name
 */
const char *laser_status_name(laser_status_t status);

/**
 * Cleanup laser controller.
 * Turns off laser and releases resources.
 */
void laser_controller_cleanup(void);

#endif // APIS_LASER_CONTROLLER_H
