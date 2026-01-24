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
#include <pthread.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
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

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static volatile uint32_t g_active_states = 0;  // Bitmask of active states
static volatile uint64_t g_detection_flash_end = 0;  // Timestamp when detection flash ends
static volatile uint64_t g_pattern_start_time = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_pattern_thread;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define LED_LOCK()   pthread_mutex_lock(&g_mutex)
#define LED_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_led_mutex = NULL;
static TaskHandle_t g_pattern_task = NULL;
#define LED_LOCK()   do { if (g_led_mutex) xSemaphoreTake(g_led_mutex, portMAX_DELAY); } while(0)
#define LED_UNLOCK() do { if (g_led_mutex) xSemaphoreGive(g_led_mutex); } while(0)
#endif

// Current LED color (for test platform tracking)
static led_color_t g_current_color = {0, 0, 0};

// ============================================================================
// Utility Functions
// ============================================================================

static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
}

const char *led_state_name(led_state_t state) {
    switch (state) {
        case LED_STATE_OFF:       return "OFF";
        case LED_STATE_BOOT:      return "BOOT";
        case LED_STATE_DISARMED:  return "DISARMED";
        case LED_STATE_ARMED:     return "ARMED";
        case LED_STATE_OFFLINE:   return "OFFLINE";
        case LED_STATE_DETECTION: return "DETECTION";
        case LED_STATE_ERROR:     return "ERROR";
        default:                  return "UNKNOWN";
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
    // Check detection flash first (time-limited)
    uint64_t now = get_time_ms();
    if (g_detection_flash_end > now) {
        return LED_STATE_DETECTION;
    }

    // Check states from highest to lowest priority
    if (g_active_states & (1 << LED_STATE_ERROR))     return LED_STATE_ERROR;
    if (g_active_states & (1 << LED_STATE_DETECTION)) return LED_STATE_DETECTION;
    if (g_active_states & (1 << LED_STATE_OFFLINE))   return LED_STATE_OFFLINE;
    if (g_active_states & (1 << LED_STATE_ARMED))     return LED_STATE_ARMED;
    if (g_active_states & (1 << LED_STATE_DISARMED))  return LED_STATE_DISARMED;
    if (g_active_states & (1 << LED_STATE_BOOT))      return LED_STATE_BOOT;

    return LED_STATE_OFF;
}

static led_color_t get_base_color(void) {
    // Get the base color for the current armed/disarmed state
    if (g_active_states & (1 << LED_STATE_ARMED))    return LED_COLOR_GREEN;
    if (g_active_states & (1 << LED_STATE_DISARMED)) return LED_COLOR_YELLOW;
    if (g_active_states & (1 << LED_STATE_BOOT))     return LED_COLOR_BLUE;
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
            // Breathing blue effect
            uint32_t cycle_pos = elapsed % BOOT_BREATHE_PERIOD_MS;
            uint32_t half_period = BOOT_BREATHE_PERIOD_MS / 2;
            uint8_t brightness;

            if (cycle_pos < half_period) {
                // Fade in
                brightness = (uint8_t)((cycle_pos * 255) / half_period);
            } else {
                // Fade out
                brightness = (uint8_t)(((BOOT_BREATHE_PERIOD_MS - cycle_pos) * 255) / half_period);
            }

            return (led_color_t){0, 0, brightness};
        }

        case LED_STATE_DISARMED:
            return LED_COLOR_YELLOW;

        case LED_STATE_ARMED:
            return LED_COLOR_GREEN;

        case LED_STATE_OFFLINE: {
            // Show base color with occasional orange blink
            uint32_t cycle_pos = elapsed % OFFLINE_BLINK_PERIOD_MS;
            if (cycle_pos < OFFLINE_BLINK_DURATION) {
                return LED_COLOR_ORANGE;
            }
            return get_base_color();
        }

        case LED_STATE_DETECTION:
            return LED_COLOR_WHITE;

        case LED_STATE_ERROR: {
            // Blinking red at 1Hz
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

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Create mutex
    if (g_led_mutex == NULL) {
        g_led_mutex = xSemaphoreCreateMutex();
        if (g_led_mutex == NULL) {
            LOG_ERROR("Failed to create LED mutex");
            return -1;
        }
    }
#endif

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
    g_pattern_task = NULL;

    if (g_led_mutex != NULL) {
        vSemaphoreDelete(g_led_mutex);
        g_led_mutex = NULL;
    }
#endif

    gpio_cleanup();

    g_active_states = 0;
    g_initialized = false;
    LOG_INFO("LED controller cleanup complete");
}

bool led_controller_is_initialized(void) {
    return g_initialized;
}
