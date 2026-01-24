/**
 * Physical Button Handler Implementation.
 *
 * Handles debounce, short/long press detection, and system mode transitions.
 * Integrates with laser controller and LED controller for feedback.
 */

#include "button_handler.h"
#include "laser_controller.h"
#include "led_controller.h"
// Note: Use LOG_DEBUG, LOG_INFO, LOG_WARN, LOG_ERROR macros from log.h
#include "log.h"

// Alias log macros to lowercase for convenience
#define log_debug(...) LOG_DEBUG(__VA_ARGS__)
#define log_info(...)  LOG_INFO(__VA_ARGS__)
#define log_warn(...)  LOG_WARN(__VA_ARGS__)
#define log_error(...) LOG_ERROR(__VA_ARGS__)

#include <string.h>
#include <stdlib.h>

#if defined(APIS_PLATFORM_PI)
#include <pthread.h>
#include <time.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
// Note: Would use pigpio or gpiod in real implementation
#elif defined(APIS_PLATFORM_ESP32)
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#else
// Test platform - no hardware
#include <pthread.h>
#include <time.h>
#endif

// ============================================================================
// Mutex wrapper for thread safety
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t button_mutex = PTHREAD_MUTEX_INITIALIZER;
#define BUTTON_LOCK()   pthread_mutex_lock(&button_mutex)
#define BUTTON_UNLOCK() pthread_mutex_unlock(&button_mutex)
#elif defined(APIS_PLATFORM_ESP32)
static portMUX_TYPE button_mux = portMUX_INITIALIZER_UNLOCKED;
#define BUTTON_LOCK()   portENTER_CRITICAL(&button_mux)
#define BUTTON_UNLOCK() portEXIT_CRITICAL(&button_mux)
#endif

// ============================================================================
// Time utilities
// ============================================================================

static uint64_t get_time_ms(void) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
#elif defined(APIS_PLATFORM_ESP32)
    return (uint64_t)(esp_timer_get_time() / 1000);
#endif
}

// ============================================================================
// Internal state
// ============================================================================

typedef struct {
    bool initialized;
    bool buzzer_enabled;

    // Button state
    button_state_t button_state;
    bool raw_button_pressed;         // Raw GPIO reading (debounced)
    uint64_t press_start_time;       // When button was first pressed
    uint64_t last_release_time;      // When button was last released
    uint64_t last_debounce_time;     // Time of last state change

    // System mode
    system_mode_t system_mode;
    system_mode_t previous_mode;     // For undo functionality
    uint64_t last_mode_change_time;  // For undo window

    // Callbacks
    button_event_callback_t event_callback;
    void *event_user_data;
    mode_change_callback_t mode_callback;
    void *mode_user_data;

    // Statistics
    button_stats_t stats;

    // Timing
    uint64_t init_time;

    // Test mode state (for simulation)
#if defined(APIS_PLATFORM_TEST)
    bool simulated_pressed;
#endif
} button_context_t;

static button_context_t ctx = {0};

// ============================================================================
// GPIO Functions (platform-specific)
// ============================================================================

static bool gpio_read_button(void) {
#if defined(APIS_PLATFORM_PI)
    // Real Pi implementation would use pigpio or gpiod
    // For now, return false (not pressed)
    return false;
#elif defined(APIS_PLATFORM_ESP32)
    // Read GPIO with pull-up (LOW = pressed)
    return gpio_get_level(GPIO_BUTTON_PIN) == 0;
#else
    // Test mode - use simulated state
    return ctx.simulated_pressed;
#endif
}

static void gpio_init_button(void) {
#if defined(APIS_PLATFORM_PI)
    // Real Pi implementation would configure GPIO
    log_info("Button GPIO initialized (pin %d)", GPIO_BUTTON_PIN);
#elif defined(APIS_PLATFORM_ESP32)
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_INPUT,
        .pin_bit_mask = (1ULL << GPIO_BUTTON_PIN),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io_conf);
    log_info("Button GPIO initialized (pin %d)", GPIO_BUTTON_PIN);
#else
    log_info("Button GPIO initialized (test mode)");
#endif
}

static void gpio_init_buzzer(void) {
    if (!ctx.buzzer_enabled) return;

#if defined(APIS_PLATFORM_PI)
    // Real Pi implementation would configure PWM for buzzer
    log_info("Buzzer GPIO initialized (pin %d)", GPIO_BUZZER_PIN);
#elif defined(APIS_PLATFORM_ESP32)
    // Configure LEDC for PWM buzzer
    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_1,
        .duty_resolution = LEDC_TIMER_8_BIT,
        .freq_hz = 1000,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer_conf);

    ledc_channel_config_t channel_conf = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER_1,
        .intr_type = LEDC_INTR_DISABLE,
        .gpio_num = GPIO_BUZZER_PIN,
        .duty = 0,
        .hpoint = 0,
    };
    ledc_channel_config(&channel_conf);
    log_info("Buzzer GPIO initialized (pin %d)", GPIO_BUZZER_PIN);
#else
    log_info("Buzzer initialized (test mode)");
#endif
}

static void buzzer_tone(uint32_t frequency_hz, uint32_t duration_ms) {
    if (!ctx.buzzer_enabled) return;

#if defined(APIS_PLATFORM_PI)
    // Real Pi implementation would generate PWM tone
    log_debug("Buzzer: %u Hz for %u ms", frequency_hz, duration_ms);
#elif defined(APIS_PLATFORM_ESP32)
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_1, frequency_hz);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 128); // 50% duty
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
    vTaskDelay(pdMS_TO_TICKS(duration_ms));
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
#else
    log_debug("Buzzer: %u Hz for %u ms (simulated)", frequency_hz, duration_ms);
#endif
}

// ============================================================================
// Internal helpers
// ============================================================================

static void notify_event(button_event_t event) {
    if (ctx.event_callback) {
        ctx.event_callback(event, ctx.event_user_data);
    }
}

static void notify_mode_change(system_mode_t old_mode, system_mode_t new_mode) {
    if (ctx.mode_callback) {
        ctx.mode_callback(old_mode, new_mode, ctx.mode_user_data);
    }
}

static void update_led_for_mode(system_mode_t mode) {
    if (!led_controller_is_initialized()) return;

    switch (mode) {
        case SYSTEM_MODE_ARMED:
            led_controller_clear_state(LED_STATE_DISARMED);
            led_controller_clear_state(LED_STATE_ERROR);
            led_controller_set_state(LED_STATE_ARMED);
            break;

        case SYSTEM_MODE_DISARMED:
            led_controller_clear_state(LED_STATE_ARMED);
            led_controller_clear_state(LED_STATE_ERROR);
            led_controller_set_state(LED_STATE_DISARMED);
            break;

        case SYSTEM_MODE_EMERGENCY_STOP:
            led_controller_clear_state(LED_STATE_ARMED);
            led_controller_clear_state(LED_STATE_DISARMED);
            led_controller_set_state(LED_STATE_ERROR);
            break;
    }
}

static void update_laser_for_mode(system_mode_t mode) {
    if (!laser_controller_is_initialized()) return;

    switch (mode) {
        case SYSTEM_MODE_ARMED:
            laser_controller_reset_kill_switch();
            laser_controller_arm();
            break;

        case SYSTEM_MODE_DISARMED:
            laser_controller_disarm();
            break;

        case SYSTEM_MODE_EMERGENCY_STOP:
            laser_controller_kill_switch();
            break;
    }
}

static void set_mode_internal(system_mode_t new_mode, bool play_buzzer) {
    if (ctx.system_mode == new_mode) return;

    system_mode_t old_mode = ctx.system_mode;
    ctx.previous_mode = old_mode;
    ctx.system_mode = new_mode;
    ctx.last_mode_change_time = get_time_ms();

    // Update statistics
    switch (new_mode) {
        case SYSTEM_MODE_ARMED:
            ctx.stats.arm_count++;
            break;
        case SYSTEM_MODE_DISARMED:
            ctx.stats.disarm_count++;
            break;
        case SYSTEM_MODE_EMERGENCY_STOP:
            ctx.stats.emergency_count++;
            break;
    }

    // Update LED and laser
    update_led_for_mode(new_mode);
    update_laser_for_mode(new_mode);

    // Audio feedback
    if (play_buzzer && ctx.buzzer_enabled) {
        switch (new_mode) {
            case SYSTEM_MODE_ARMED:
                buzzer_tone(BUZZER_ARM_FREQ, BUZZER_ARM_DURATION_MS);
                break;
            case SYSTEM_MODE_DISARMED:
                buzzer_tone(BUZZER_DISARM_FREQ, BUZZER_DISARM_DURATION_MS);
                break;
            case SYSTEM_MODE_EMERGENCY_STOP:
                buzzer_tone(BUZZER_EMERGENCY_FREQ, BUZZER_EMERGENCY_DURATION_MS);
                break;
        }
    }

    log_info("Mode changed: %s -> %s", system_mode_name(old_mode), system_mode_name(new_mode));
    notify_mode_change(old_mode, new_mode);
}

static void handle_short_press(void) {
    ctx.stats.short_press_count++;
    uint64_t now = get_time_ms();

    // Check for undo (rapid toggle within undo window)
    if (now - ctx.last_mode_change_time < BUTTON_UNDO_WINDOW_MS &&
        ctx.system_mode != SYSTEM_MODE_EMERGENCY_STOP) {
        // Undo - revert to previous mode
        ctx.stats.undo_count++;
        set_mode_internal(ctx.previous_mode, true);
        notify_event(BUTTON_EVENT_UNDO);
        log_info("Rapid toggle - undoing previous action");
        return;
    }

    // Handle based on current mode
    switch (ctx.system_mode) {
        case SYSTEM_MODE_DISARMED:
            // Toggle to armed
            set_mode_internal(SYSTEM_MODE_ARMED, true);
            break;

        case SYSTEM_MODE_ARMED:
            // Toggle to disarmed
            set_mode_internal(SYSTEM_MODE_DISARMED, true);
            break;

        case SYSTEM_MODE_EMERGENCY_STOP:
            // Clear emergency and go to disarmed
            set_mode_internal(SYSTEM_MODE_DISARMED, true);
            log_info("Emergency stop cleared by button press");
            break;
    }

    notify_event(BUTTON_EVENT_SHORT_PRESS);
}

static void handle_long_press(void) {
    ctx.stats.long_press_count++;

    // Emergency stop regardless of current mode
    set_mode_internal(SYSTEM_MODE_EMERGENCY_STOP, true);
    notify_event(BUTTON_EVENT_LONG_PRESS);
    log_warn("Emergency stop activated by long press");
}

// ============================================================================
// Public API Implementation
// ============================================================================

button_status_t button_handler_init(bool enable_buzzer) {
    BUTTON_LOCK();

    if (ctx.initialized) {
        BUTTON_UNLOCK();
        return BUTTON_ERROR_ALREADY_INIT;
    }

    // Initialize state
    memset(&ctx, 0, sizeof(ctx));
    ctx.buzzer_enabled = enable_buzzer;
    ctx.system_mode = SYSTEM_MODE_DISARMED;
    ctx.init_time = get_time_ms();

    // Initialize GPIO
    gpio_init_button();
    gpio_init_buzzer();

    ctx.initialized = true;

    BUTTON_UNLOCK();

    log_info("Button handler initialized (buzzer: %s)", enable_buzzer ? "enabled" : "disabled");
    return BUTTON_OK;
}

void button_handler_update(void) {
    if (!ctx.initialized) return;

    BUTTON_LOCK();

    uint64_t now = get_time_ms();
    bool raw_pressed = gpio_read_button();

    // Debounce logic
    if (raw_pressed != ctx.raw_button_pressed) {
        if (now - ctx.last_debounce_time >= BUTTON_DEBOUNCE_MS) {
            ctx.raw_button_pressed = raw_pressed;
            ctx.last_debounce_time = now;

            if (raw_pressed) {
                // Button just pressed
                ctx.button_state = BUTTON_STATE_PRESSED;
                ctx.press_start_time = now;
                log_debug("Button pressed");
            } else {
                // Button just released
                uint64_t press_duration = now - ctx.press_start_time;

                if (ctx.button_state == BUTTON_STATE_HELD) {
                    // Was already handled as long press
                    log_debug("Button released after long press");
                } else if (press_duration < BUTTON_SHORT_PRESS_MAX_MS) {
                    // Short press
                    log_debug("Short press detected (%lu ms)", (unsigned long)press_duration);
                    handle_short_press();
                }
                // Else: medium press (between 1s and 3s) - ignored

                ctx.button_state = BUTTON_STATE_RELEASED;
                ctx.last_release_time = now;
            }
        } else {
            // Debounce rejected
            ctx.stats.debounce_reject_count++;
        }
    }

    // Check for long press while still pressed
    if (ctx.button_state == BUTTON_STATE_PRESSED && ctx.raw_button_pressed) {
        uint64_t press_duration = now - ctx.press_start_time;
        if (press_duration >= BUTTON_LONG_PRESS_MS) {
            ctx.button_state = BUTTON_STATE_HELD;
            log_debug("Long press detected (%lu ms)", (unsigned long)press_duration);
            handle_long_press();
        }
    }

    BUTTON_UNLOCK();
}

button_state_t button_handler_get_button_state(void) {
    BUTTON_LOCK();
    button_state_t state = ctx.button_state;
    BUTTON_UNLOCK();
    return state;
}

system_mode_t button_handler_get_system_mode(void) {
    BUTTON_LOCK();
    system_mode_t mode = ctx.system_mode;
    BUTTON_UNLOCK();
    return mode;
}

bool button_handler_is_armed(void) {
    return button_handler_get_system_mode() == SYSTEM_MODE_ARMED;
}

bool button_handler_is_emergency_stop(void) {
    return button_handler_get_system_mode() == SYSTEM_MODE_EMERGENCY_STOP;
}

button_status_t button_handler_set_mode(system_mode_t mode) {
    if (!ctx.initialized) return BUTTON_ERROR_NOT_INITIALIZED;

    BUTTON_LOCK();
    set_mode_internal(mode, true);
    BUTTON_UNLOCK();

    return BUTTON_OK;
}

button_status_t button_handler_arm(void) {
    return button_handler_set_mode(SYSTEM_MODE_ARMED);
}

button_status_t button_handler_disarm(void) {
    return button_handler_set_mode(SYSTEM_MODE_DISARMED);
}

button_status_t button_handler_emergency_stop(void) {
    return button_handler_set_mode(SYSTEM_MODE_EMERGENCY_STOP);
}

button_status_t button_handler_clear_emergency(void) {
    if (!ctx.initialized) return BUTTON_ERROR_NOT_INITIALIZED;

    BUTTON_LOCK();

    if (ctx.system_mode == SYSTEM_MODE_EMERGENCY_STOP) {
        set_mode_internal(SYSTEM_MODE_DISARMED, true);
        log_info("Emergency stop cleared");
    }

    BUTTON_UNLOCK();
    return BUTTON_OK;
}

void button_handler_buzzer(uint32_t frequency_hz, uint32_t duration_ms) {
    if (!ctx.initialized) return;
    buzzer_tone(frequency_hz, duration_ms);
}

void button_handler_set_buzzer_enabled(bool enable) {
    BUTTON_LOCK();
    ctx.buzzer_enabled = enable;
    BUTTON_UNLOCK();
    log_info("Buzzer %s", enable ? "enabled" : "disabled");
}

bool button_handler_is_buzzer_enabled(void) {
    BUTTON_LOCK();
    bool enabled = ctx.buzzer_enabled;
    BUTTON_UNLOCK();
    return enabled;
}

void button_handler_set_event_callback(button_event_callback_t callback, void *user_data) {
    BUTTON_LOCK();
    ctx.event_callback = callback;
    ctx.event_user_data = user_data;
    BUTTON_UNLOCK();
}

void button_handler_set_mode_callback(mode_change_callback_t callback, void *user_data) {
    BUTTON_LOCK();
    ctx.mode_callback = callback;
    ctx.mode_user_data = user_data;
    BUTTON_UNLOCK();
}

button_status_t button_handler_get_stats(button_stats_t *stats) {
    if (!ctx.initialized) return BUTTON_ERROR_NOT_INITIALIZED;
    if (!stats) return BUTTON_ERROR_INVALID_PARAM;

    BUTTON_LOCK();
    memcpy(stats, &ctx.stats, sizeof(button_stats_t));
    stats->uptime_ms = get_time_ms() - ctx.init_time;
    BUTTON_UNLOCK();

    return BUTTON_OK;
}

bool button_handler_is_initialized(void) {
    return ctx.initialized;
}

const char *button_state_name(button_state_t state) {
    switch (state) {
        case BUTTON_STATE_RELEASED: return "RELEASED";
        case BUTTON_STATE_PRESSED:  return "PRESSED";
        case BUTTON_STATE_HELD:     return "HELD";
        default:                    return "UNKNOWN";
    }
}

const char *system_mode_name(system_mode_t mode) {
    switch (mode) {
        case SYSTEM_MODE_DISARMED:       return "DISARMED";
        case SYSTEM_MODE_ARMED:          return "ARMED";
        case SYSTEM_MODE_EMERGENCY_STOP: return "EMERGENCY_STOP";
        default:                         return "UNKNOWN";
    }
}

const char *button_event_name(button_event_t event) {
    switch (event) {
        case BUTTON_EVENT_NONE:        return "NONE";
        case BUTTON_EVENT_SHORT_PRESS: return "SHORT_PRESS";
        case BUTTON_EVENT_LONG_PRESS:  return "LONG_PRESS";
        case BUTTON_EVENT_UNDO:        return "UNDO";
        default:                       return "UNKNOWN";
    }
}

const char *button_status_name(button_status_t status) {
    switch (status) {
        case BUTTON_OK:                     return "OK";
        case BUTTON_ERROR_NOT_INITIALIZED:  return "NOT_INITIALIZED";
        case BUTTON_ERROR_INVALID_PARAM:    return "INVALID_PARAM";
        case BUTTON_ERROR_HARDWARE:         return "HARDWARE";
        case BUTTON_ERROR_ALREADY_INIT:     return "ALREADY_INIT";
        default:                            return "UNKNOWN";
    }
}

void button_handler_cleanup(void) {
    BUTTON_LOCK();

    if (!ctx.initialized) {
        BUTTON_UNLOCK();
        return;
    }

    // Ensure system is disarmed on cleanup
    if (ctx.system_mode != SYSTEM_MODE_DISARMED) {
        update_laser_for_mode(SYSTEM_MODE_DISARMED);
    }

    ctx.initialized = false;
    log_info("Button handler cleanup complete");

    BUTTON_UNLOCK();
}

// ============================================================================
// Test-only functions
// ============================================================================

#if defined(APIS_PLATFORM_TEST)

/**
 * Simulate button press (test mode only).
 */
void button_handler_test_simulate_press(bool pressed) {
    BUTTON_LOCK();
    ctx.simulated_pressed = pressed;
    BUTTON_UNLOCK();
}

/**
 * Get press start time (test mode only).
 */
uint64_t button_handler_test_get_press_start(void) {
    BUTTON_LOCK();
    uint64_t start = ctx.press_start_time;
    BUTTON_UNLOCK();
    return start;
}

#endif // APIS_PLATFORM_TEST
