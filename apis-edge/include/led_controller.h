/**
 * LED Status Controller for APIS Edge Device.
 *
 * Provides visual feedback for device state:
 * - Armed: Solid green
 * - Disarmed: Solid yellow
 * - Error: Blinking red (1Hz)
 * - Detection: Flash white/blue
 * - Boot: Breathing blue
 * - Offline: Orange blink overlay
 *
 * Thread-safe. Runs a background thread for patterns.
 */

#ifndef APIS_LED_CONTROLLER_H
#define APIS_LED_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>

/**
 * LED states with priority (higher = overrides lower).
 */
typedef enum {
    LED_STATE_OFF = 0,        // Priority 0 - LED off
    LED_STATE_BOOT,           // Priority 1 - Breathing blue
    LED_STATE_DISARMED,       // Priority 2 - Solid yellow
    LED_STATE_ARMED,          // Priority 3 - Solid green
    LED_STATE_OFFLINE,        // Priority 4 - Orange blink overlay
    LED_STATE_AUTH_FAILED,    // Priority 5 - Fast red/orange blink (COMM-001-6)
    LED_STATE_DETECTION,      // Priority 6 - Flash white/blue
    LED_STATE_ERROR,          // Priority 7 - Blinking red (highest)
    LED_STATE_COUNT           // Number of states
} led_state_t;

/**
 * LED color components (0-255 for each channel).
 */
typedef struct {
    uint8_t red;
    uint8_t green;
    uint8_t blue;
} led_color_t;

// Predefined colors (require C99 compound literals)
// Note: These macros use C99 compound literal syntax. If your compiler
// doesn't support C99, convert these to static const variables.
#define LED_COLOR_OFF       ((led_color_t){0, 0, 0})
#define LED_COLOR_RED       ((led_color_t){255, 0, 0})
#define LED_COLOR_GREEN     ((led_color_t){0, 255, 0})
#define LED_COLOR_BLUE      ((led_color_t){0, 0, 255})
#define LED_COLOR_YELLOW    ((led_color_t){255, 255, 0})
#define LED_COLOR_ORANGE    ((led_color_t){255, 128, 0})
#define LED_COLOR_WHITE     ((led_color_t){255, 255, 255})

/**
 * Initialize LED controller.
 * Starts background pattern thread.
 * @return 0 on success, -1 on error
 */
int led_controller_init(void);

/**
 * Set LED state.
 * Higher priority states override lower priority.
 * States persist until explicitly cleared.
 * @param state The new LED state to activate
 */
void led_controller_set_state(led_state_t state);

/**
 * Clear a specific state (when condition ends).
 * Falls back to next highest priority active state.
 * @param state The state to clear
 */
void led_controller_clear_state(led_state_t state);

/**
 * Get current active state (highest priority active state).
 * @return Current LED state
 */
led_state_t led_controller_get_state(void);

/**
 * Check if a specific state is currently active.
 * @param state The state to check
 * @return true if state is active
 */
bool led_controller_is_state_active(led_state_t state);

/**
 * Flash detection indicator briefly.
 * Non-blocking - triggers 200ms flash and returns.
 */
void led_controller_flash_detection(void);

/**
 * Get state name for logging.
 * @param state The state
 * @return Static string name
 */
const char *led_state_name(led_state_t state);

/**
 * Cleanup LED controller.
 * Stops pattern thread, turns off LED.
 */
void led_controller_cleanup(void);

/**
 * Check if LED controller is initialized.
 * @return true if initialized
 */
bool led_controller_is_initialized(void);

#endif // APIS_LED_CONTROLLER_H
