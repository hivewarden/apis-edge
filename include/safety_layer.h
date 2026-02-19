/**
 * Safety Enforcement Layer for APIS Edge Device.
 *
 * Multi-layer safety system that wraps all laser commands:
 * 1. Armed state check - Unit must be armed
 * 2. Detection active check - Must have active detection
 * 3. Tilt angle validation - NEVER upward (tilt > 0°)
 * 4. Continuous time monitoring - Max 10 seconds
 * 5. Kill switch check - Must not be engaged
 * 6. Watchdog timer - Must receive heartbeat within 30s
 * 7. Brownout detection - Voltage must be stable
 *
 * SAFETY PRINCIPLE: Laser is OFF by default, must be actively enabled.
 * All checks must pass for laser to fire.
 *
 * Thread-safe. All operations are protected by mutex.
 */

#ifndef APIS_SAFETY_LAYER_H
#define APIS_SAFETY_LAYER_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Configuration Constants
// ============================================================================

// Watchdog timing
#define SAFETY_WATCHDOG_TIMEOUT_MS      30000   // 30 seconds without heartbeat
#define SAFETY_WATCHDOG_WARNING_MS      25000   // Warning at 25 seconds

// Brownout thresholds (in millivolts, if ADC available)
#define SAFETY_VOLTAGE_MIN_MV           4500    // 4.5V minimum for safe operation
#define SAFETY_VOLTAGE_WARNING_MV       4750    // 4.75V warning threshold

// Tilt safety - NEVER fire upward
#define SAFETY_TILT_MAX_DEG             0.0f    // 0° is horizontal, negative is downward

// ============================================================================
// Safety Status Codes
// ============================================================================

typedef enum {
    SAFETY_OK = 0,                      // All checks pass
    SAFETY_ERROR_NOT_INITIALIZED,       // Safety layer not initialized
    SAFETY_ERROR_NOT_ARMED,             // Unit is not armed
    SAFETY_ERROR_NO_DETECTION,          // No active detection
    SAFETY_ERROR_TILT_UPWARD,           // Tilt angle is upward (dangerous!)
    SAFETY_ERROR_TIME_EXCEEDED,         // Continuous time limit exceeded
    SAFETY_ERROR_KILL_SWITCH,           // Kill switch engaged
    SAFETY_ERROR_WATCHDOG,              // Watchdog timeout
    SAFETY_ERROR_BROWNOUT,              // Voltage too low
    SAFETY_ERROR_SAFE_MODE,             // System is in safe mode
    SAFETY_ERROR_MULTIPLE,              // Multiple safety failures
} safety_status_t;

// ============================================================================
// Safety State
// ============================================================================

typedef enum {
    SAFETY_STATE_NORMAL = 0,            // Normal operation
    SAFETY_STATE_WARNING,               // Warning state (watchdog near timeout)
    SAFETY_STATE_SAFE_MODE,             // Safe mode - requires manual reset
    SAFETY_STATE_EMERGENCY,             // Emergency stop active
} safety_state_t;

// ============================================================================
// Safety Check Flags (bitmask)
// ============================================================================

typedef enum {
    SAFETY_CHECK_ARMED          = (1 << 0),     // Check armed state
    SAFETY_CHECK_DETECTION      = (1 << 1),     // Check detection active
    SAFETY_CHECK_TILT           = (1 << 2),     // Check tilt angle
    SAFETY_CHECK_TIME           = (1 << 3),     // Check continuous time
    SAFETY_CHECK_KILL_SWITCH    = (1 << 4),     // Check kill switch
    SAFETY_CHECK_WATCHDOG       = (1 << 5),     // Check watchdog
    SAFETY_CHECK_BROWNOUT       = (1 << 6),     // Check voltage
    SAFETY_CHECK_ALL            = 0x7F,         // All checks
} safety_check_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Safety check result with details.
 */
typedef struct {
    safety_status_t status;             // Overall status
    uint32_t failed_checks;             // Bitmask of failed checks
    float current_tilt_deg;             // Current tilt angle
    uint32_t continuous_time_ms;        // Current continuous laser time
    uint32_t watchdog_remaining_ms;     // Time until watchdog expires
    uint32_t voltage_mv;                // Current voltage (0 if unavailable)
    bool is_armed;                      // Armed state
    bool has_detection;                 // Detection active
    bool kill_switch_engaged;           // Kill switch state
} safety_result_t;

/**
 * Safety statistics.
 */
typedef struct {
    uint32_t checks_performed;          // Total safety checks
    uint32_t checks_passed;             // Checks that passed
    uint32_t checks_failed;             // Checks that failed
    uint32_t armed_failures;            // Armed check failures
    uint32_t detection_failures;        // Detection check failures
    uint32_t tilt_failures;             // Tilt check failures (upward rejection)
    uint32_t time_failures;             // Time limit failures
    uint32_t kill_switch_failures;      // Kill switch check failures
    uint32_t watchdog_failures;         // Watchdog timeouts
    uint32_t brownout_failures;         // Brownout detections
    uint32_t safe_mode_entries;         // Times entered safe mode
    uint64_t uptime_ms;                 // Time since initialization
} safety_stats_t;

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback when safety state changes.
 */
typedef void (*safety_state_callback_t)(safety_state_t new_state, void *user_data);

/**
 * Callback when safety check fails.
 */
typedef void (*safety_failure_callback_t)(safety_status_t failure, void *user_data);

/**
 * Callback when watchdog is about to expire.
 */
typedef void (*safety_watchdog_callback_t)(uint32_t remaining_ms, void *user_data);

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize safety layer.
 * Starts watchdog timer.
 *
 * @return SAFETY_OK on success
 */
safety_status_t safety_layer_init(void);

/**
 * Perform all safety checks before laser activation.
 * This is the main safety gate - call before any laser_controller_on().
 *
 * @param result Output result with details (can be NULL)
 * @return SAFETY_OK if all checks pass
 */
safety_status_t safety_check_all(safety_result_t *result);

/**
 * Perform specific safety checks.
 *
 * @param checks Bitmask of checks to perform
 * @param result Output result with details (can be NULL)
 * @return SAFETY_OK if specified checks pass
 */
safety_status_t safety_check(uint32_t checks, safety_result_t *result);

/**
 * Feed the watchdog timer (reset countdown).
 * Call this regularly from main processing loop.
 */
void safety_feed_watchdog(void);

/**
 * Get current watchdog remaining time.
 *
 * @return Remaining time in milliseconds
 */
uint32_t safety_get_watchdog_remaining(void);

/**
 * Check if watchdog is about to expire.
 *
 * @return true if within warning threshold
 */
bool safety_is_watchdog_warning(void);

/**
 * Update safety layer (call periodically).
 * Checks watchdog, updates brownout status.
 * Should be called at least every 100ms.
 */
void safety_update(void);

/**
 * Set current detection state.
 * Call this when detection starts/stops.
 *
 * @param active true if detection is active
 */
void safety_set_detection_active(bool active);

/**
 * Check if detection is active.
 *
 * @return true if detection active
 */
bool safety_is_detection_active(void);

/**
 * Set current tilt angle for safety validation.
 * Call this before laser activation with target tilt.
 *
 * @param tilt_deg Tilt angle in degrees (negative = downward)
 * @return SAFETY_OK if angle is safe, SAFETY_ERROR_TILT_UPWARD if not
 */
safety_status_t safety_validate_tilt(float tilt_deg);

/**
 * Get current safety state.
 *
 * @return Current state
 */
safety_state_t safety_get_state(void);

/**
 * Check if system is in safe mode.
 *
 * @return true if in safe mode
 */
bool safety_is_safe_mode(void);

/**
 * Enter safe mode manually.
 * Laser is disabled, requires manual reset.
 */
void safety_enter_safe_mode(void);

/**
 * Reset from safe mode.
 * System returns to normal, but remains disarmed.
 * Watchdog timer is reset to full timeout.
 * Kill switch on laser controller is reset.
 * Emergency stop on button handler is cleared.
 *
 * @return SAFETY_OK on success
 */
safety_status_t safety_reset(void);

/**
 * Set current voltage reading (if ADC available).
 *
 * @param voltage_mv Voltage in millivolts
 */
void safety_set_voltage(uint32_t voltage_mv);

/**
 * Get current voltage reading.
 *
 * @return Voltage in millivolts (0 if unavailable)
 */
uint32_t safety_get_voltage(void);

/**
 * Check if voltage is in warning range.
 *
 * @return true if voltage is low (warning)
 */
bool safety_is_voltage_warning(void);

/**
 * Check if voltage is critically low (brownout).
 *
 * @return true if brownout detected
 */
bool safety_is_brownout(void);

/**
 * Set state change callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void safety_set_state_callback(safety_state_callback_t callback, void *user_data);

/**
 * Set failure callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void safety_set_failure_callback(safety_failure_callback_t callback, void *user_data);

/**
 * Set watchdog warning callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void safety_set_watchdog_callback(safety_watchdog_callback_t callback, void *user_data);

/**
 * Get safety statistics.
 *
 * @param stats Output statistics structure
 * @return SAFETY_OK on success
 */
safety_status_t safety_get_stats(safety_stats_t *stats);

/**
 * Check if safety layer is initialized.
 *
 * @return true if initialized
 */
bool safety_is_initialized(void);

/**
 * Get state name for logging.
 *
 * @param state State value
 * @return Static string name
 */
const char *safety_state_name(safety_state_t state);

/**
 * Get status name for logging.
 *
 * @param status Status code
 * @return Static string name
 */
const char *safety_status_name(safety_status_t status);

/**
 * Get check name for logging.
 *
 * @param check Check flag (single bit)
 * @return Static string name
 */
const char *safety_check_name(safety_check_t check);

/**
 * Cleanup safety layer.
 * Forces laser off and enters safe mode.
 */
void safety_cleanup(void);

// ============================================================================
// Laser Command Wrappers - Wraps ALL laser commands with safety checks
// ============================================================================

/**
 * Safe laser activation.
 * Wraps laser_controller_on() with full safety check.
 * This is the ONLY function that should be used to turn the laser on.
 *
 * On failure: Laser remains OFF, reason is logged, no error shown to user.
 *
 * @return SAFETY_OK if laser activated, error code if blocked (silent)
 */
safety_status_t safety_laser_on(void);

/**
 * Safe laser deactivation.
 * Turns off laser immediately - always succeeds (safe operation).
 *
 * @return SAFETY_OK always
 */
safety_status_t safety_laser_off(void);

/**
 * Safe laser activation with duration hint.
 * Activates laser after performing all safety checks. Duration is capped at max safe time.
 *
 * IMPORTANT: This function only INITIATES laser activation. It does NOT automatically
 * turn off the laser after the duration. The caller MUST:
 * 1. Call safety_update() periodically during laser operation
 * 2. Call safety_laser_off() when the desired duration has elapsed
 *
 * The duration_ms parameter is used only for logging and validation - actual timing
 * must be managed by the caller.
 *
 * @param duration_ms Desired activation duration in milliseconds (for logging/capping)
 * @return SAFETY_OK if laser activated, error code if blocked by safety checks
 */
safety_status_t safety_laser_activate(uint32_t duration_ms);

/**
 * @deprecated Use safety_laser_activate() instead.
 * This alias exists for backward compatibility but will be removed in a future version.
 */
#define safety_laser_pulse(duration_ms) safety_laser_activate(duration_ms)

#endif // APIS_SAFETY_LAYER_H
