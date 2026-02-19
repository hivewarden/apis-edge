/**
 * LED Status Controller implementation.
 *
 * Provides visual feedback for device state using RGB LED.
 * Supports Pi (GPIO), ESP32 (single LED), and test platforms.
 */

#include "led_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#endif

// ============================================================================
// GPIO Pin Definitions (from hardware spec)
// ============================================================================

#if defined(APIS_PLATFORM_PI)
#define GPIO_LED_RED    24
#define GPIO_LED_GREEN  25
#define GPIO_LED_BLUE   12
#elif defined(APIS_PLATFORM_ESP32)
#define GPIO_LED_RED    33  // Built-in red LED on ESP32-CAM
#define GPIO_LED_GREEN  -1  // Not available
#define GPIO_LED_BLUE   -1  // Not available
#endif

// ============================================================================
// Pattern Timing (in milliseconds)
// ============================================================================

#define PATTERN_TICK_MS         50      // Pattern update interval
#define ERROR_BLINK_PERIOD_MS   1000    // 1Hz blink (500ms on, 500ms off)
#define DETECTION_FLASH_MS      200     // Brief flash duration
#define BOOT_BREATHE_PERIOD_MS  2000    // 2 second breathing cycle
#define OFFLINE_BLINK_PERIOD_MS 4000    // Blink every 4 seconds
#define OFFLINE_BLINK_DURATION  100     // 100ms flash
#define AUTH_FAIL_BLINK_MS      500     // Fast red/orange blink (2Hz)

// Onboarding states
#define SETUP_PULSE_PERIOD_MS   3000    // Slow cyan pulse for AP/captive portal
#define WIFI_BLINK_PERIOD_MS    400     // Fast blink while connecting (2.5Hz)
#define UNCLAIMED_HEARTBEAT_MS  2000    // Heartbeat pattern (blink-blink-pause)
#define DISARMED_GAP_PERIOD_MS  5000    // Mostly-on cycle with brief off-gap
#define DISARMED_GAP_DURATION   200     // 200ms off-gap to distinguish from ARMED

// Hardware error states (distinct blink counts for identification)
#define HW_DOUBLE_BLINK_MS      1000    // Camera: double blink per second
#define HW_TRIPLE_BLINK_MS      1250    // Servo: triple blink per 1.25s
#define HW_QUAD_BLINK_MS        1500    // Laser: quad blink per 1.5s

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
// Bitmask of active states. Uses uint32_t so maximum 32 states supported.
// Current LED_STATE_COUNT is 14, well within this limit.
static volatile uint32_t g_active_states = 0;
static volatile uint64_t g_detection_flash_end = 0;  // Timestamp when detection flash ends
static volatile uint64_t g_pattern_start_time = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_pattern_thread;
#else
static TaskHandle_t g_pattern_task = NULL;
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(led);
#define LED_LOCK()   APIS_MUTEX_LOCK(led)
#define LED_UNLOCK() APIS_MUTEX_UNLOCK(led)

// Current LED color (for test platform tracking)
static led_color_t g_current_color = {0, 0, 0};

// Utility Functions
#include "time_util.h"

const char *led_state_name(led_state_t state) {
    switch (state) {
        case LED_STATE_OFF:             return "OFF";
        case LED_STATE_BOOT:            return "BOOT";
        case LED_STATE_SETUP:           return "SETUP";
        case LED_STATE_WIFI_CONNECTING: return "WIFI_CONNECTING";
        case LED_STATE_UNCLAIMED:       return "UNCLAIMED";
        case LED_STATE_DISARMED:        return "DISARMED";
        case LED_STATE_ARMED:           return "ARMED";
        case LED_STATE_OFFLINE:         return "OFFLINE";
        case LED_STATE_AUTH_FAILED:     return "AUTH_FAILED";
        case LED_STATE_DETECTION:       return "DETECTION";
        case LED_STATE_CAMERA_FAIL:     return "CAMERA_FAIL";
        case LED_STATE_SERVO_FAIL:      return "SERVO_FAIL";
        case LED_STATE_LASER_FAIL:      return "LASER_FAIL";
        case LED_STATE_ERROR:           return "ERROR";
        default:                        return "UNKNOWN";
    }
}

// ============================================================================
// GPIO Control (Platform-specific)
// ============================================================================

#if defined(APIS_PLATFORM_PI)

static void gpio_init_pins(void) {
    // TODO: Initialize GPIO pins using /sys/class/gpio or gpiod
    // For now, this is a placeholder
    LOG_DEBUG("GPIO pins initialized (Pi)");
}

static void gpio_set_color(led_color_t color) {
    // TODO: Set GPIO pins
    // GPIO 24 (red), GPIO 25 (green), GPIO 12 (blue)
    // For PWM effects, need software PWM or pigpio
    g_current_color = color;
}

static void gpio_cleanup(void) {
    gpio_set_color(LED_COLOR_OFF);
    LOG_DEBUG("GPIO cleanup (Pi)");
}

#elif defined(APIS_PLATFORM_ESP32)

static void gpio_init_pins(void) {
    gpio_reset_pin(GPIO_LED_RED);
    gpio_set_direction(GPIO_LED_RED, GPIO_MODE_OUTPUT);
    gpio_set_level(GPIO_LED_RED, 0);  // LED off
    LOG_DEBUG("GPIO pins initialized (ESP32)");
}

static void gpio_set_color(led_color_t color) {
    // ESP32-CAM only has red LED on GPIO 33
    // Map to on/off based on any color component
    bool on = (color.red > 0 || color.green > 0 || color.blue > 0);
    gpio_set_level(GPIO_LED_RED, on ? 1 : 0);
    g_current_color = color;
}

static void gpio_cleanup(void) {
    gpio_set_level(GPIO_LED_RED, 0);
    LOG_DEBUG("GPIO cleanup (ESP32)");
}

#else // APIS_PLATFORM_TEST

static void gpio_init_pins(void) {
    LOG_DEBUG("GPIO pins initialized (test mock)");
}

static void gpio_set_color(led_color_t color) {
    // Test platform - just track the color
    if (color.red != g_current_color.red ||
        color.green != g_current_color.green ||
        color.blue != g_current_color.blue) {
        LOG_DEBUG("LED color set: R=%d G=%d B=%d", color.red, color.green, color.blue);
    }
    g_current_color = color;
}

static void gpio_cleanup(void) {
    gpio_set_color(LED_COLOR_OFF);
    LOG_DEBUG("GPIO cleanup (test mock)");
}

#endif

// ============================================================================
// Pattern Logic
// ============================================================================

static led_state_t get_highest_priority_state(void) {
    // Check detection flash first (time-limited, auto-clears)
    uint64_t now = get_time_ms();
    if (g_detection_flash_end > now) {
        return LED_STATE_DETECTION;
    }

    // Check states from highest to lowest priority
    if (g_active_states & (1 << LED_STATE_ERROR))           return LED_STATE_ERROR;
    if (g_active_states & (1 << LED_STATE_LASER_FAIL))      return LED_STATE_LASER_FAIL;
    if (g_active_states & (1 << LED_STATE_SERVO_FAIL))      return LED_STATE_SERVO_FAIL;
    if (g_active_states & (1 << LED_STATE_CAMERA_FAIL))     return LED_STATE_CAMERA_FAIL;
    if (g_active_states & (1 << LED_STATE_DETECTION))       return LED_STATE_DETECTION;
    if (g_active_states & (1 << LED_STATE_AUTH_FAILED))     return LED_STATE_AUTH_FAILED;
    if (g_active_states & (1 << LED_STATE_OFFLINE))         return LED_STATE_OFFLINE;
    if (g_active_states & (1 << LED_STATE_ARMED))           return LED_STATE_ARMED;
    if (g_active_states & (1 << LED_STATE_DISARMED))        return LED_STATE_DISARMED;
    if (g_active_states & (1 << LED_STATE_UNCLAIMED))       return LED_STATE_UNCLAIMED;
    if (g_active_states & (1 << LED_STATE_WIFI_CONNECTING)) return LED_STATE_WIFI_CONNECTING;
    if (g_active_states & (1 << LED_STATE_SETUP))           return LED_STATE_SETUP;
    if (g_active_states & (1 << LED_STATE_BOOT))            return LED_STATE_BOOT;

    return LED_STATE_OFF;
}

static led_color_t get_base_color(void) {
    // Get the underlying color when an overlay state (OFFLINE) blinks
    if (g_active_states & (1 << LED_STATE_ARMED))           return LED_COLOR_GREEN;
    if (g_active_states & (1 << LED_STATE_DISARMED))        return LED_COLOR_YELLOW;
    if (g_active_states & (1 << LED_STATE_UNCLAIMED))       return LED_COLOR_ORANGE;
    if (g_active_states & (1 << LED_STATE_WIFI_CONNECTING)) return LED_COLOR_BLUE;
    if (g_active_states & (1 << LED_STATE_SETUP))           return LED_COLOR_CYAN;
    if (g_active_states & (1 << LED_STATE_BOOT))            return LED_COLOR_BLUE;
    return LED_COLOR_OFF;
}

static led_color_t calculate_current_color(void) {
    uint64_t now = get_time_ms();
    uint64_t elapsed = now - g_pattern_start_time;

    led_state_t state = get_highest_priority_state();

    switch (state) {
        case LED_STATE_OFF:
            return LED_COLOR_OFF;

        case LED_STATE_BOOT: {
            // Breathing blue — slow fade in/out over 2 seconds
            uint32_t cycle_pos = elapsed % BOOT_BREATHE_PERIOD_MS;
            uint32_t half_period = BOOT_BREATHE_PERIOD_MS / 2;
            uint8_t brightness;

            if (cycle_pos < half_period) {
                brightness = (uint8_t)((cycle_pos * 255) / half_period);
            } else {
                brightness = (uint8_t)(((BOOT_BREATHE_PERIOD_MS - cycle_pos) * 255) / half_period);
            }

            return (led_color_t){0, 0, brightness};
        }

        case LED_STATE_SETUP: {
            // Pulsing cyan — slower than boot (3s cycle), signals "connect to me"
            uint32_t cycle_pos = elapsed % SETUP_PULSE_PERIOD_MS;
            uint32_t half = SETUP_PULSE_PERIOD_MS / 2;
            uint8_t brightness;

            if (cycle_pos < half) {
                brightness = (uint8_t)((cycle_pos * 255) / half);
            } else {
                brightness = (uint8_t)(((SETUP_PULSE_PERIOD_MS - cycle_pos) * 255) / half);
            }

            return (led_color_t){0, brightness, brightness};  // cyan
        }

        case LED_STATE_WIFI_CONNECTING: {
            // Fast blue blink (2.5Hz) — "I'm trying to connect"
            uint32_t cycle_pos = elapsed % WIFI_BLINK_PERIOD_MS;
            if (cycle_pos < (WIFI_BLINK_PERIOD_MS / 2)) {
                return LED_COLOR_BLUE;
            }
            return LED_COLOR_OFF;
        }

        case LED_STATE_UNCLAIMED: {
            // Amber heartbeat — two quick blinks then pause
            // blink(150ms) gap(150ms) blink(150ms) pause(1550ms) = 2000ms
            uint32_t cycle_pos = elapsed % UNCLAIMED_HEARTBEAT_MS;
            if (cycle_pos < 150) return LED_COLOR_ORANGE;
            if (cycle_pos < 300) return LED_COLOR_OFF;
            if (cycle_pos < 450) return LED_COLOR_ORANGE;
            return LED_COLOR_OFF;
        }

        case LED_STATE_DISARMED: {
            // Yellow with brief off-gap every 5 seconds
            // Distinguishes from ARMED (solid) on single-LED boards
            uint32_t cycle_pos = elapsed % DISARMED_GAP_PERIOD_MS;
            if (cycle_pos >= (DISARMED_GAP_PERIOD_MS - DISARMED_GAP_DURATION)) {
                return LED_COLOR_OFF;
            }
            return LED_COLOR_YELLOW;
        }

        case LED_STATE_ARMED:
            // Solid green — all systems go
            return LED_COLOR_GREEN;

        case LED_STATE_OFFLINE: {
            // Show base color with occasional orange flash
            uint32_t cycle_pos = elapsed % OFFLINE_BLINK_PERIOD_MS;
            if (cycle_pos < OFFLINE_BLINK_DURATION) {
                return LED_COLOR_ORANGE;
            }
            return get_base_color();
        }

        case LED_STATE_AUTH_FAILED: {
            // Fast red/orange alternation at 2Hz — auth problem
            uint32_t cycle_pos = elapsed % AUTH_FAIL_BLINK_MS;
            if (cycle_pos < (AUTH_FAIL_BLINK_MS / 2)) {
                return LED_COLOR_RED;
            }
            return LED_COLOR_ORANGE;
        }

        case LED_STATE_DETECTION:
            // Bright white flash — hornet detected
            return LED_COLOR_WHITE;

        case LED_STATE_CAMERA_FAIL: {
            // Double red blink per second: on(100) off(100) on(100) off(700)
            uint32_t p = elapsed % HW_DOUBLE_BLINK_MS;
            if (p < 100 || (p >= 200 && p < 300)) {
                return LED_COLOR_RED;
            }
            return LED_COLOR_OFF;
        }

        case LED_STATE_SERVO_FAIL: {
            // Triple red blink per 1.25s: on(80) off(80) x3 then pause
            uint32_t p = elapsed % HW_TRIPLE_BLINK_MS;
            if (p < 80 || (p >= 160 && p < 240) || (p >= 320 && p < 400)) {
                return LED_COLOR_RED;
            }
            return LED_COLOR_OFF;
        }

        case LED_STATE_LASER_FAIL: {
            // Quad red blink per 1.5s: on(60) off(60) x4 then pause
            uint32_t p = elapsed % HW_QUAD_BLINK_MS;
            if (p < 60 || (p >= 120 && p < 180) ||
                (p >= 240 && p < 300) || (p >= 360 && p < 420)) {
                return LED_COLOR_RED;
            }
            return LED_COLOR_OFF;
        }

        case LED_STATE_ERROR: {
            // Red blink at 1Hz — something is seriously wrong
            uint32_t cycle_pos = elapsed % ERROR_BLINK_PERIOD_MS;
            if (cycle_pos < (ERROR_BLINK_PERIOD_MS / 2)) {
                return LED_COLOR_RED;
            }
            return LED_COLOR_OFF;
        }

        default:
            return LED_COLOR_OFF;
    }
}

// ============================================================================
// Pattern Thread
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static void *pattern_thread_func(void *arg) {
    (void)arg;

    LOG_DEBUG("LED pattern thread started");

    while (g_running) {
        LED_LOCK();
        led_color_t color = calculate_current_color();
        gpio_set_color(color);
        LED_UNLOCK();

        apis_sleep_ms(PATTERN_TICK_MS);
    }

    // Turn off LED when stopping
    gpio_set_color(LED_COLOR_OFF);

    LOG_DEBUG("LED pattern thread exiting");
    return NULL;
}

#else // ESP32

static void pattern_task_func(void *arg) {
    (void)arg;

    LOG_DEBUG("LED pattern task started");

    while (g_running) {
        LED_LOCK();
        led_color_t color = calculate_current_color();
        gpio_set_color(color);
        LED_UNLOCK();

        vTaskDelay(pdMS_TO_TICKS(PATTERN_TICK_MS));
    }

    gpio_set_color(LED_COLOR_OFF);
    LOG_DEBUG("LED pattern task exiting");

    // Signal that we're done before deleting
    g_pattern_task = NULL;
    vTaskDelete(NULL);
}

#endif

// ============================================================================
// Public API
// ============================================================================

int led_controller_init(void) {
    if (g_initialized) {
        LOG_WARN("LED controller already initialized");
        return 0;
    }

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(led);

    gpio_init_pins();

    g_active_states = 0;
    g_detection_flash_end = 0;
    g_pattern_start_time = get_time_ms();
    g_running = true;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    if (pthread_create(&g_pattern_thread, NULL, pattern_thread_func, NULL) != 0) {
        LOG_ERROR("Failed to create LED pattern thread");
        g_running = false;
        return -1;
    }
#else
    xTaskCreate(pattern_task_func, "led_pattern", 2048, NULL, 5, &g_pattern_task);
#endif

    g_initialized = true;
    LOG_INFO("LED controller initialized");
    return 0;
}

void led_controller_set_state(led_state_t state) {
    if (!g_initialized || state >= LED_STATE_COUNT) return;

    LED_LOCK();
    uint32_t old_states = g_active_states;
    g_active_states |= (1 << state);

    if (g_active_states != old_states) {
        LOG_DEBUG("LED state set: %s (active: 0x%02x)", led_state_name(state), g_active_states);
    }
    LED_UNLOCK();
}

void led_controller_clear_state(led_state_t state) {
    if (!g_initialized || state >= LED_STATE_COUNT) return;

    LED_LOCK();
    uint32_t old_states = g_active_states;
    g_active_states &= ~(1 << state);

    if (g_active_states != old_states) {
        LOG_DEBUG("LED state cleared: %s (active: 0x%02x)", led_state_name(state), g_active_states);
    }
    LED_UNLOCK();
}

led_state_t led_controller_get_state(void) {
    if (!g_initialized) return LED_STATE_OFF;

    LED_LOCK();
    led_state_t state = get_highest_priority_state();
    LED_UNLOCK();

    return state;
}

bool led_controller_is_state_active(led_state_t state) {
    if (!g_initialized || state >= LED_STATE_COUNT) return false;

    LED_LOCK();
    bool active = (g_active_states & (1 << state)) != 0;
    LED_UNLOCK();

    return active;
}

void led_controller_flash_detection(void) {
    if (!g_initialized) return;

    LED_LOCK();
    // Note: Detection flash is time-limited and uses g_detection_flash_end timestamp
    // rather than the g_active_states bitmask. This is intentional:
    // - Detection is a brief event (200ms) that auto-clears
    // - led_controller_is_state_active(LED_STATE_DETECTION) will return false
    // - led_controller_get_state() will return LED_STATE_DETECTION during the flash
    // This avoids needing explicit clear_state() calls for detection events.
    g_detection_flash_end = get_time_ms() + DETECTION_FLASH_MS;
    LOG_DEBUG("LED detection flash triggered");
    LED_UNLOCK();
}

void led_controller_cleanup(void) {
    if (!g_initialized) return;

    g_running = false;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_join(g_pattern_thread, NULL);
#else
    // ESP32: Wait for task to finish (max 500ms)
    // Task checks g_running every PATTERN_TICK_MS (50ms)
    for (int i = 0; i < 10 && g_pattern_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(PATTERN_TICK_MS + 10));
    }
    // Add safety delay after task signals completion (sets g_pattern_task = NULL)
    // to ensure the task has fully terminated before we delete the semaphore.
    // vTaskDelete(NULL) may still be executing even after g_pattern_task is NULL.
    vTaskDelay(pdMS_TO_TICKS(PATTERN_TICK_MS));
    g_pattern_task = NULL;

    /* Mutex cleanup handled by platform_mutex lifecycle */
#endif

    gpio_cleanup();

    g_active_states = 0;
    g_initialized = false;
    LOG_INFO("LED controller cleanup complete");
}

int led_controller_active_summary(char *buf, int buf_len) {
    if (!buf || buf_len < 1) return 0;
    buf[0] = '\0';

    if (!g_initialized) {
        snprintf(buf, (size_t)buf_len, "NOT_INITIALIZED");
        return 0;
    }

    LED_LOCK();
    uint32_t states = g_active_states;
    LED_UNLOCK();

    int count = 0;
    int offset = 0;

    for (int i = 1; i < LED_STATE_COUNT; i++) {
        if (states & (1 << i)) {
            const char *name = led_state_name((led_state_t)i);
            int written;
            if (count > 0) {
                written = snprintf(buf + offset, (size_t)(buf_len - offset), ",%s", name);
            } else {
                written = snprintf(buf + offset, (size_t)(buf_len - offset), "%s", name);
            }
            if (written > 0 && offset + written < buf_len) {
                offset += written;
            }
            count++;
        }
    }

    if (count == 0) {
        snprintf(buf, (size_t)buf_len, "OFF");
    }

    return count;
}

bool led_controller_is_initialized(void) {
    return g_initialized;
}
