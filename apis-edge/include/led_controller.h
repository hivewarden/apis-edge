/**
 * LED Status Controller for Hive Warden Edge Device.
 *
 * Visual feedback at a glance — what the LED means:
 *
 * ┌──────────────────┬────────────────────┬─────────────────────────────────┐
 * │ State            │ RGB LED            │ Single LED (ESP32-CAM)          │
 * ├──────────────────┼────────────────────┼─────────────────────────────────┤
 * │ BOOT             │ Breathing blue     │ Slow blink (1Hz)               │
 * │ SETUP            │ Pulsing cyan       │ Double-blink, 3s cycle         │
 * │ WIFI_CONNECTING  │ Fast blue blink    │ Very fast blink (2.5Hz)        │
 * │ UNCLAIMED        │ Amber heartbeat    │ Heartbeat (blink-blink-pause)  │
 * │ DISARMED         │ Yellow, brief gap  │ Mostly on, brief off/5s        │
 * │ ARMED            │ Solid green        │ Solid on                       │
 * │ OFFLINE          │ Orange flash/4s    │ Brief flash every 4s           │
 * │ AUTH_FAILED      │ Red/orange 2Hz     │ Fast blink (2Hz)               │
 * │ DETECTION        │ White flash 200ms  │ Flash 200ms                    │
 * │ CAMERA_FAIL      │ Double red blink   │ Double blink, 1s cycle         │
 * │ SERVO_FAIL       │ Triple red blink   │ Triple blink, 1.25s cycle      │
 * │ LASER_FAIL       │ Red-orange 3.3Hz   │ Quad blink, 1.5s cycle         │
 * │ ERROR            │ Red blink 1Hz      │ Blink 1Hz                      │
 * └──────────────────┴────────────────────┴─────────────────────────────────┘
 *
 * Priority: ERROR > LASER_FAIL > SERVO_FAIL > CAMERA_FAIL > DETECTION
 *           > AUTH_FAILED > OFFLINE > ARMED > DISARMED > UNCLAIMED
 *           > WIFI_CONNECTING > SETUP > BOOT > OFF
 *
 * Higher-priority states override lower ones. Multiple states can be
 * active simultaneously — the LED always shows the most important one.
 *
 * Thread-safe. Runs a background thread/task for pattern updates.
 */

#ifndef APIS_LED_CONTROLLER_H
#define APIS_LED_CONTROLLER_H

#include <stdint.h>
#include <stdbool.h>

/**
 * LED states (bit positions in active-states bitmask).
 * Priority is NOT determined by enum value — it's set in the
 * get_highest_priority_state() function in the implementation.
 */
typedef enum {
    LED_STATE_OFF = 0,          // LED off
    LED_STATE_BOOT,             // Breathing blue — hardware initializing
    LED_STATE_SETUP,            // Pulsing cyan — AP mode, captive portal active
    LED_STATE_WIFI_CONNECTING,  // Fast blue blink — connecting to saved WiFi
    LED_STATE_UNCLAIMED,        // Amber heartbeat — WiFi OK, waiting for QR claim
    LED_STATE_DISARMED,         // Yellow with brief gap — detection paused by user
    LED_STATE_ARMED,            // Solid green — actively monitoring for hornets
    LED_STATE_OFFLINE,          // Orange blink overlay — server unreachable
    LED_STATE_AUTH_FAILED,      // Red/orange alternating 2Hz — auth/API key error
    LED_STATE_DETECTION,        // White flash 200ms — hornet detected!
    LED_STATE_CAMERA_FAIL,      // Double red blink — camera not working
    LED_STATE_SERVO_FAIL,       // Triple red blink — servo not responding
    LED_STATE_LASER_FAIL,       // Red-orange fast alternating — laser fault
    LED_STATE_ERROR,            // Red blink 1Hz — fatal/general error (highest)
    LED_STATE_COUNT             // Number of states (max 32 for bitmask)
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
#define LED_COLOR_CYAN      ((led_color_t){0, 255, 255})

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

/**
 * Get a human-readable summary of all active LED states.
 * Writes comma-separated state names (e.g. "ARMED,OFFLINE").
 * @param buf Buffer to write into
 * @param buf_len Buffer length
 * @return Number of active states
 */
int led_controller_active_summary(char *buf, int buf_len);

#endif // APIS_LED_CONTROLLER_H
