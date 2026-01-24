/**
 * Physical Button Handler for APIS Edge Device.
 *
 * Handles the arm/disarm button with:
 * - Hardware debounce (50ms)
 * - Short press (<1s): Toggle armed state
 * - Long press (>3s): Emergency stop
 * - Rapid toggle protection (2s undo window)
 * - Optional buzzer feedback
 *
 * Integrates with:
 * - Laser controller for arm/disarm and emergency stop
 * - LED controller for status indication
 *
 * Thread-safe. Uses interrupt-driven detection with mutex protection.
 */

#ifndef APIS_BUTTON_HANDLER_H
#define APIS_BUTTON_HANDLER_H

#include <stdint.h>
#include <stdbool.h>

// ============================================================================
// Configuration Constants
// ============================================================================

// Timing thresholds
#define BUTTON_DEBOUNCE_MS          50      // Minimum time between state changes
#define BUTTON_SHORT_PRESS_MAX_MS   1000    // Maximum duration for short press
#define BUTTON_LONG_PRESS_MS        3000    // Duration for long press (emergency)
#define BUTTON_UNDO_WINDOW_MS       2000    // Window to undo accidental toggle

// GPIO Configuration
#if defined(APIS_PLATFORM_PI)
#define GPIO_BUTTON_PIN             17      // GPIO pin for button (with pull-up)
#define GPIO_BUZZER_PIN             27      // GPIO pin for buzzer (optional)
#elif defined(APIS_PLATFORM_ESP32)
#define GPIO_BUTTON_PIN             0       // Boot button on ESP32
#define GPIO_BUZZER_PIN             2       // Available GPIO for buzzer
#endif

// Buzzer tones (frequency in Hz, duration in ms)
#define BUZZER_ARM_FREQ             1000    // Higher pitch for arm
#define BUZZER_ARM_DURATION_MS      100     // Short beep
#define BUZZER_DISARM_FREQ          500     // Lower pitch for disarm
#define BUZZER_DISARM_DURATION_MS   200     // Longer beep
#define BUZZER_EMERGENCY_FREQ       2000    // Urgent tone for emergency
#define BUZZER_EMERGENCY_DURATION_MS 500    // Long beep

// ============================================================================
// Status Codes
// ============================================================================

typedef enum {
    BUTTON_OK = 0,                  // Success
    BUTTON_ERROR_NOT_INITIALIZED,   // Not initialized
    BUTTON_ERROR_INVALID_PARAM,     // Invalid parameter
    BUTTON_ERROR_HARDWARE,          // Hardware error (GPIO access failed)
    BUTTON_ERROR_ALREADY_INIT,      // Already initialized
} button_status_t;

// ============================================================================
// Button State
// ============================================================================

typedef enum {
    BUTTON_STATE_RELEASED = 0,      // Button is not pressed
    BUTTON_STATE_PRESSED,           // Button is currently pressed
    BUTTON_STATE_HELD,              // Button held beyond long press threshold
} button_state_t;

// ============================================================================
// System Mode (for armed state integration)
// ============================================================================

typedef enum {
    SYSTEM_MODE_DISARMED = 0,       // System is disarmed (safe)
    SYSTEM_MODE_ARMED,              // System is armed (active)
    SYSTEM_MODE_EMERGENCY_STOP,     // Emergency stop engaged
} system_mode_t;

// ============================================================================
// Button Event Types
// ============================================================================

typedef enum {
    BUTTON_EVENT_NONE = 0,          // No event
    BUTTON_EVENT_SHORT_PRESS,       // Quick press and release
    BUTTON_EVENT_LONG_PRESS,        // Held for 3+ seconds
    BUTTON_EVENT_UNDO,              // Rapid toggle (undo previous)
} button_event_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Button handler statistics.
 */
typedef struct {
    uint32_t short_press_count;     // Total short presses
    uint32_t long_press_count;      // Total long presses (emergency stops)
    uint32_t undo_count;            // Times rapid toggle undid previous action
    uint32_t debounce_reject_count; // Presses rejected by debounce
    uint32_t arm_count;             // Times system was armed
    uint32_t disarm_count;          // Times system was disarmed
    uint32_t emergency_count;       // Emergency stop activations
    uint64_t uptime_ms;             // Time since initialization
} button_stats_t;

// ============================================================================
// Callback Types
// ============================================================================

/**
 * Callback when button event occurs.
 */
typedef void (*button_event_callback_t)(button_event_t event, void *user_data);

/**
 * Callback when system mode changes.
 */
typedef void (*mode_change_callback_t)(system_mode_t old_mode, system_mode_t new_mode, void *user_data);

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize button handler.
 * Sets up GPIO input with pull-up, enables interrupt.
 *
 * @param enable_buzzer Enable buzzer feedback (false if no buzzer connected)
 * @return BUTTON_OK on success
 */
button_status_t button_handler_init(bool enable_buzzer);

/**
 * Process button state (call periodically).
 * Checks for press events, handles debounce.
 * Should be called at least every 20ms.
 */
void button_handler_update(void);

/**
 * Get current button state.
 *
 * @return Current button state (pressed/released/held)
 */
button_state_t button_handler_get_button_state(void);

/**
 * Get current system mode.
 *
 * @return Current system mode (armed/disarmed/emergency)
 */
system_mode_t button_handler_get_system_mode(void);

/**
 * Check if system is armed.
 *
 * @return true if armed
 */
bool button_handler_is_armed(void);

/**
 * Check if emergency stop is engaged.
 *
 * @return true if emergency stop active
 */
bool button_handler_is_emergency_stop(void);

/**
 * Manually set system mode.
 * Used for external control (HTTP API, etc.).
 *
 * @param mode New mode to set
 * @return BUTTON_OK on success
 */
button_status_t button_handler_set_mode(system_mode_t mode);

/**
 * Manually arm the system.
 * Convenience function for button_handler_set_mode(SYSTEM_MODE_ARMED).
 *
 * @return BUTTON_OK on success
 */
button_status_t button_handler_arm(void);

/**
 * Manually disarm the system.
 * Convenience function for button_handler_set_mode(SYSTEM_MODE_DISARMED).
 *
 * @return BUTTON_OK on success
 */
button_status_t button_handler_disarm(void);

/**
 * Trigger emergency stop.
 * Same as long button press.
 *
 * @return BUTTON_OK on success
 */
button_status_t button_handler_emergency_stop(void);

/**
 * Clear emergency stop and return to disarmed.
 * Requires explicit re-arm afterward.
 *
 * @return BUTTON_OK on success
 */
button_status_t button_handler_clear_emergency(void);

/**
 * Play buzzer tone (if enabled).
 *
 * @param frequency_hz Frequency in Hz
 * @param duration_ms Duration in milliseconds
 */
void button_handler_buzzer(uint32_t frequency_hz, uint32_t duration_ms);

/**
 * Enable or disable buzzer feedback.
 *
 * @param enable true to enable buzzer
 */
void button_handler_set_buzzer_enabled(bool enable);

/**
 * Check if buzzer is enabled.
 *
 * @return true if buzzer enabled
 */
bool button_handler_is_buzzer_enabled(void);

/**
 * Set button event callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void button_handler_set_event_callback(button_event_callback_t callback, void *user_data);

/**
 * Set mode change callback.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
void button_handler_set_mode_callback(mode_change_callback_t callback, void *user_data);

/**
 * Get button handler statistics.
 *
 * @param stats Output statistics structure
 * @return BUTTON_OK on success
 */
button_status_t button_handler_get_stats(button_stats_t *stats);

/**
 * Check if button handler is initialized.
 *
 * @return true if initialized
 */
bool button_handler_is_initialized(void);

/**
 * Get button state name for logging.
 *
 * @param state Button state value
 * @return Static string name
 */
const char *button_state_name(button_state_t state);

/**
 * Get system mode name for logging.
 *
 * @param mode System mode value
 * @return Static string name
 */
const char *system_mode_name(system_mode_t mode);

/**
 * Get event name for logging.
 *
 * @param event Button event value
 * @return Static string name
 */
const char *button_event_name(button_event_t event);

/**
 * Get status name for logging.
 *
 * @param status Status code
 * @return Static string name
 */
const char *button_status_name(button_status_t status);

/**
 * Cleanup button handler.
 * Releases GPIO resources.
 */
void button_handler_cleanup(void);

#endif // APIS_BUTTON_HANDLER_H
