/**
 * Physical Button Handler Implementation.
 *
 * Handles debounce, short/long press detection, and system mode transitions.
 * Integrates with laser controller and LED controller for feedback.
 */

#include "button_handler.h"
#include "laser_controller.h"
#include "led_controller.h"
#include "log.h"

#include <string.h>
#include <stdlib.h>

#if defined(APIS_PLATFORM_PI)
/* pthread.h pulled in by platform_mutex.h */
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
/* pthread.h pulled in by platform_mutex.h */
#include <time.h>
#endif

// ============================================================================
// Mutex wrapper for thread safety
// ============================================================================

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(button);
#define BUTTON_LOCK()   APIS_MUTEX_LOCK(button)
#define BUTTON_UNLOCK() APIS_MUTEX_UNLOCK(button)

// Time utilities
#include "time_util.h"

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
    // TODO: Implement real GPIO reading using pigpio or gpiod library
    // Current stub always returns false (button not pressed)
    // Pi hardware button support will be added in a future story
    #warning "Pi GPIO button input not implemented - using stub"
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
    // TODO: Implement real GPIO init using pigpio or gpiod library
    // Pi hardware GPIO support will be added in a future story
    #warning "Pi GPIO button init not implemented - using stub"
    LOG_INFO("Button GPIO initialized (pin %d) - STUB", GPIO_BUTTON_PIN);
#elif defined(APIS_PLATFORM_ESP32)
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_INPUT,
        .pin_bit_mask = (1ULL << GPIO_BUTTON_PIN),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io_conf);
    LOG_INFO("Button GPIO initialized (pin %d)", GPIO_BUTTON_PIN);
#else
    LOG_INFO("Button GPIO initialized (test mode)");
#endif
}

static void gpio_init_buzzer(void) {
    if (!ctx.buzzer_enabled) return;

#if defined(APIS_PLATFORM_PI)
    // TODO: Implement real PWM buzzer using pigpio or gpiod library
    // Pi hardware buzzer support will be added in a future story
    #warning "Pi GPIO buzzer init not implemented - using stub"
    LOG_INFO("Buzzer GPIO initialized (pin %d) - STUB", GPIO_BUZZER_PIN);
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
    LOG_INFO("Buzzer GPIO initialized (pin %d)", GPIO_BUZZER_PIN);
#else
    LOG_INFO("Buzzer initialized (test mode)");
#endif
}

/**
 * Play a buzzer tone for the specified duration.
 *
 * NOTE: On ESP32, this function BLOCKS the calling task for the duration.
 * For emergency (500ms) or disarm (200ms) tones, this may cause missed
 * button events if called from a time-critical context. Consider calling
 * from a non-critical task or implementing non-blocking timer-based buzzer
 * in the future if this becomes problematic.
 */
static void buzzer_tone(uint32_t frequency_hz, uint32_t duration_ms) {
    if (!ctx.buzzer_enabled) return;

#if defined(APIS_PLATFORM_PI)
    // Real Pi implementation would generate PWM tone
    LOG_DEBUG("Buzzer: %u Hz for %u ms", frequency_hz, duration_ms);
#elif defined(APIS_PLATFORM_ESP32)
    // NOTE: vTaskDelay blocks the calling task. For long durations (emergency
    // tone = 500ms), button events may be missed. This is acceptable for MVP
    // since emergency stop already engaged when buzzer plays.
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_1, frequency_hz);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 128); // 50% duty
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
    vTaskDelay(pdMS_TO_TICKS(duration_ms));
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
#else
    LOG_DEBUG("Buzzer: %u Hz for %u ms (simulated)", frequency_hz, duration_ms);
#endif
}

// ============================================================================
// Internal helpers
// ============================================================================

// C7-H3 fix: These notify helpers are now only called from contexts that have
// already released the button_mutex. The callers copy callback pointers under
// lock, release the lock, then call these with the copied pointers.

static void invoke_event_callback(button_event_callback_t cb, void *user_data, button_event_t event) {
    if (cb) {
        cb(event, user_data);
    }
}

static void invoke_mode_callback(mode_change_callback_t cb, void *user_data,
                                  system_mode_t old_mode, system_mode_t new_mode) {
    if (cb) {
        cb(old_mode, new_mode, user_data);
    }
}

static void update_led_for_mode(system_mode_t mode) {
    if (!led_controller_is_initialized()) return;

    switch (mode) {
        case SYSTEM_MODE_ARMED:
            led_controller_clear_state(LED_STATE_DISARMED);
            led_controller_clear_state(LED_STATE_ERROR);
            led_controller_clear_state(LED_STATE_CAMERA_FAIL);
            led_controller_clear_state(LED_STATE_SERVO_FAIL);
            led_controller_clear_state(LED_STATE_LASER_FAIL);
            led_controller_set_state(LED_STATE_ARMED);
            break;

        case SYSTEM_MODE_DISARMED:
            led_controller_clear_state(LED_STATE_ARMED);
            led_controller_clear_state(LED_STATE_ERROR);
            led_controller_clear_state(LED_STATE_CAMERA_FAIL);
            led_controller_clear_state(LED_STATE_SERVO_FAIL);
            led_controller_clear_state(LED_STATE_LASER_FAIL);
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

/**
 * Deferred actions collected during set_mode_internal.
 * These are invoked AFTER releasing the button_mutex.
 */
typedef struct {
    bool mode_changed;
    system_mode_t old_mode;
    system_mode_t new_mode;
    mode_change_callback_t mode_cb;
    void *mode_cb_data;
    bool play_buzzer;
    bool buzzer_enabled;
    uint32_t buzzer_freq;
    uint32_t buzzer_duration_ms;
} deferred_mode_actions_t;

/**
 * Set mode internal - must be called with button_mutex held.
 * Collects deferred actions (callbacks, buzzer) into 'deferred' struct.
 * Caller must release the lock and then call flush_deferred_mode_actions().
 */
static void set_mode_internal(system_mode_t new_mode, bool play_buzzer,
                               deferred_mode_actions_t *deferred) {
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

    // Update LED and laser (these have their own mutexes, safe to call under our lock
    // as long as no reverse lock ordering exists)
    update_led_for_mode(new_mode);
    update_laser_for_mode(new_mode);

    // C7-H3 + C7-H6 fix: Collect deferred actions (buzzer + callbacks)
    // to be invoked after releasing the button_mutex
    if (deferred) {
        deferred->mode_changed = true;
        deferred->old_mode = old_mode;
        deferred->new_mode = new_mode;
        deferred->mode_cb = ctx.mode_callback;
        deferred->mode_cb_data = ctx.mode_user_data;
        deferred->play_buzzer = play_buzzer;
        deferred->buzzer_enabled = ctx.buzzer_enabled;

        if (play_buzzer && ctx.buzzer_enabled) {
            switch (new_mode) {
                case SYSTEM_MODE_ARMED:
                    deferred->buzzer_freq = BUZZER_ARM_FREQ;
                    deferred->buzzer_duration_ms = BUZZER_ARM_DURATION_MS;
                    break;
                case SYSTEM_MODE_DISARMED:
                    deferred->buzzer_freq = BUZZER_DISARM_FREQ;
                    deferred->buzzer_duration_ms = BUZZER_DISARM_DURATION_MS;
                    break;
                case SYSTEM_MODE_EMERGENCY_STOP:
                    deferred->buzzer_freq = BUZZER_EMERGENCY_FREQ;
                    deferred->buzzer_duration_ms = BUZZER_EMERGENCY_DURATION_MS;
                    break;
            }
        }
    }

    LOG_INFO("Mode changed: %s -> %s", system_mode_name(old_mode), system_mode_name(new_mode));
}

/**
 * Flush deferred mode actions AFTER releasing the button_mutex.
 * Handles buzzer tone and mode change callback outside the lock.
 */
static void flush_deferred_mode_actions(const deferred_mode_actions_t *deferred) {
    if (!deferred || !deferred->mode_changed) return;

    // C7-H6 fix: Play buzzer outside the lock to avoid blocking under mutex
    if (deferred->play_buzzer && deferred->buzzer_enabled && deferred->buzzer_freq > 0) {
        buzzer_tone(deferred->buzzer_freq, deferred->buzzer_duration_ms);
    }

    // C7-H3 fix: Invoke mode callback outside the lock
    invoke_mode_callback(deferred->mode_cb, deferred->mode_cb_data,
                         deferred->old_mode, deferred->new_mode);
}

/**
 * Deferred event actions collected inside the lock.
 */
typedef struct {
    button_event_t event;
    button_event_callback_t event_cb;
    void *event_cb_data;
    deferred_mode_actions_t mode_actions;
} deferred_button_actions_t;

static void handle_short_press(deferred_button_actions_t *actions) {
    ctx.stats.short_press_count++;
    uint64_t now = get_time_ms();

    memset(&actions->mode_actions, 0, sizeof(actions->mode_actions));

    // Check for undo (rapid toggle within undo window)
    if (now - ctx.last_mode_change_time < BUTTON_UNDO_WINDOW_MS &&
        ctx.system_mode != SYSTEM_MODE_EMERGENCY_STOP) {
        // Undo - revert to previous mode
        ctx.stats.undo_count++;
        set_mode_internal(ctx.previous_mode, true, &actions->mode_actions);
        actions->event = BUTTON_EVENT_UNDO;
        actions->event_cb = ctx.event_callback;
        actions->event_cb_data = ctx.event_user_data;
        LOG_INFO("Rapid toggle - undoing previous action");
        return;
    }

    // Handle based on current mode
    switch (ctx.system_mode) {
        case SYSTEM_MODE_DISARMED:
            // Toggle to armed
            set_mode_internal(SYSTEM_MODE_ARMED, true, &actions->mode_actions);
            break;

        case SYSTEM_MODE_ARMED:
            // Toggle to disarmed
            set_mode_internal(SYSTEM_MODE_DISARMED, true, &actions->mode_actions);
            break;

        case SYSTEM_MODE_EMERGENCY_STOP:
            // Clear emergency and go to disarmed
            set_mode_internal(SYSTEM_MODE_DISARMED, true, &actions->mode_actions);
            LOG_INFO("Emergency stop cleared by button press");
            break;
    }

    actions->event = BUTTON_EVENT_SHORT_PRESS;
    actions->event_cb = ctx.event_callback;
    actions->event_cb_data = ctx.event_user_data;
}

static void handle_long_press(deferred_button_actions_t *actions) {
    ctx.stats.long_press_count++;

    memset(&actions->mode_actions, 0, sizeof(actions->mode_actions));

    // Emergency stop regardless of current mode
    set_mode_internal(SYSTEM_MODE_EMERGENCY_STOP, true, &actions->mode_actions);
    actions->event = BUTTON_EVENT_LONG_PRESS;
    actions->event_cb = ctx.event_callback;
    actions->event_cb_data = ctx.event_user_data;
    LOG_WARN("Emergency stop activated by long press");
}

/**
 * Flush all deferred button actions (mode change + event callback) outside the lock.
 */
static void flush_deferred_button_actions(const deferred_button_actions_t *actions) {
    if (!actions) return;
    flush_deferred_mode_actions(&actions->mode_actions);
    if (actions->event != BUTTON_EVENT_NONE) {
        invoke_event_callback(actions->event_cb, actions->event_cb_data, actions->event);
    }
}

// ============================================================================
// Public API Implementation
// ============================================================================

button_status_t button_handler_init(bool enable_buzzer) {
    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(button);
    BUTTON_LOCK();

    if (ctx.initialized) {
        BUTTON_UNLOCK();
        return BUTTON_ERROR_ALREADY_INIT;
    }

    // Initialize state - save buzzer setting before clearing
    // (memset clears entire context while lock is held, which is safe
    // because we verified not initialized)
    memset(&ctx, 0, sizeof(ctx));
    ctx.buzzer_enabled = enable_buzzer;
    ctx.system_mode = SYSTEM_MODE_DISARMED;
    ctx.init_time = get_time_ms();

    // Initialize GPIO
    gpio_init_button();
    gpio_init_buzzer();

    ctx.initialized = true;

    BUTTON_UNLOCK();

    LOG_INFO("Button handler initialized (buzzer: %s)", enable_buzzer ? "enabled" : "disabled");
    return BUTTON_OK;
}

void button_handler_update(void) {
    if (!ctx.initialized) return;

    // C7-H3 fix: Collect deferred actions under lock, flush after unlock
    deferred_button_actions_t deferred_actions;
    memset(&deferred_actions, 0, sizeof(deferred_actions));
    bool has_deferred = false;

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
                LOG_DEBUG("Button pressed");
            } else {
                // Button just released
                uint64_t press_duration = now - ctx.press_start_time;

                if (ctx.button_state == BUTTON_STATE_HELD) {
                    // Was already handled as long press
                    LOG_DEBUG("Button released after long press");
                } else if (press_duration < BUTTON_SHORT_PRESS_MAX_MS) {
                    // Short press
                    LOG_DEBUG("Short press detected (%lu ms)", (unsigned long)press_duration);
                    handle_short_press(&deferred_actions);
                    has_deferred = true;
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
            LOG_DEBUG("Long press detected (%lu ms)", (unsigned long)press_duration);
            handle_long_press(&deferred_actions);
            has_deferred = true;
        }
    }

    BUTTON_UNLOCK();

    // C7-H3 + C7-H6 fix: Flush deferred actions (callbacks, buzzer) outside the lock
    if (has_deferred) {
        flush_deferred_button_actions(&deferred_actions);
    }
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

    deferred_mode_actions_t deferred;
    memset(&deferred, 0, sizeof(deferred));

    BUTTON_LOCK();
    set_mode_internal(mode, true, &deferred);
    BUTTON_UNLOCK();

    // C7-H3 + C7-H6 fix: Flush deferred actions outside the lock
    flush_deferred_mode_actions(&deferred);

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

    deferred_mode_actions_t deferred;
    memset(&deferred, 0, sizeof(deferred));

    BUTTON_LOCK();

    if (ctx.system_mode == SYSTEM_MODE_EMERGENCY_STOP) {
        set_mode_internal(SYSTEM_MODE_DISARMED, true, &deferred);
        LOG_INFO("Emergency stop cleared");
    }

    BUTTON_UNLOCK();

    // C7-H3 + C7-H6 fix: Flush deferred actions outside the lock
    flush_deferred_mode_actions(&deferred);

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
    LOG_INFO("Buzzer %s", enable ? "enabled" : "disabled");
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

    // Release GPIO resources
#if defined(APIS_PLATFORM_PI)
    // Pi: Would release pigpio/gpiod resources here
    LOG_DEBUG("Button GPIO cleanup (Pi - stub)");
#elif defined(APIS_PLATFORM_ESP32)
    // ESP32: Reset GPIO pins to default state
    gpio_reset_pin(GPIO_BUTTON_PIN);
    if (ctx.buzzer_enabled) {
        ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
        gpio_reset_pin(GPIO_BUZZER_PIN);
    }
    LOG_DEBUG("Button and buzzer GPIO cleanup complete");
#endif

    ctx.initialized = false;
    LOG_INFO("Button handler cleanup complete");

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
