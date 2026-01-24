/**
 * Laser Controller implementation.
 *
 * Controls laser activation with safety limits.
 * Supports Pi (GPIO), ESP32 (GPIO), and test platforms.
 */

#include "laser_controller.h"
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
#include "freertos/semphr.h"
#include "driver/gpio.h"
#endif

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile laser_state_t g_state = LASER_STATE_OFF;
static volatile bool g_armed = false;
static volatile bool g_kill_switch = false;
static volatile bool g_laser_on = false;

// Timing
static volatile uint64_t g_activation_time = 0;     // When laser turned on
static volatile uint64_t g_deactivation_time = 0;   // When laser turned off
static volatile uint64_t g_init_time = 0;

// Statistics
static volatile uint32_t g_activation_count = 0;
static volatile uint32_t g_safety_timeout_count = 0;
static volatile uint32_t g_cooldown_block_count = 0;
static volatile uint32_t g_kill_switch_count = 0;
static volatile uint32_t g_total_on_time_ms = 0;
static volatile uint64_t g_last_activation = 0;

// Callbacks
static laser_state_callback_t g_state_callback = NULL;
static void *g_state_callback_data = NULL;
static laser_timeout_callback_t g_timeout_callback = NULL;
static void *g_timeout_callback_data = NULL;

// Thread synchronization
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define LASER_LOCK()   pthread_mutex_lock(&g_mutex)
#define LASER_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_laser_mutex = NULL;
#define LASER_LOCK()   do { if (g_laser_mutex) xSemaphoreTake(g_laser_mutex, portMAX_DELAY); } while(0)
#define LASER_UNLOCK() do { if (g_laser_mutex) xSemaphoreGive(g_laser_mutex); } while(0)
#endif

// ============================================================================
// Utility Functions
// ============================================================================

static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
}

const char *laser_state_name(laser_state_t state) {
    switch (state) {
        case LASER_STATE_OFF:            return "OFF";
        case LASER_STATE_ARMED:          return "ARMED";
        case LASER_STATE_ACTIVE:         return "ACTIVE";
        case LASER_STATE_COOLDOWN:       return "COOLDOWN";
        case LASER_STATE_EMERGENCY_STOP: return "EMERGENCY_STOP";
        case LASER_STATE_ERROR:          return "ERROR";
        default:                         return "UNKNOWN";
    }
}

const char *laser_status_name(laser_status_t status) {
    switch (status) {
        case LASER_OK:                   return "OK";
        case LASER_ERROR_NOT_INITIALIZED: return "NOT_INITIALIZED";
        case LASER_ERROR_NOT_ARMED:      return "NOT_ARMED";
        case LASER_ERROR_COOLDOWN:       return "COOLDOWN";
        case LASER_ERROR_MAX_TIME:       return "MAX_TIME";
        case LASER_ERROR_KILL_SWITCH:    return "KILL_SWITCH";
        case LASER_ERROR_HARDWARE:       return "HARDWARE";
        default:                         return "UNKNOWN";
    }
}

static void set_state(laser_state_t new_state) {
    if (g_state != new_state) {
        laser_state_t old_state = g_state;
        g_state = new_state;
        LOG_DEBUG("Laser state: %s -> %s", laser_state_name(old_state), laser_state_name(new_state));

        if (g_state_callback != NULL) {
            g_state_callback(new_state, g_state_callback_data);
        }
    }
}

// ============================================================================
// GPIO Control (Platform-specific)
// ============================================================================

#if defined(APIS_PLATFORM_PI)

static void gpio_init_laser(void) {
    // TODO: Initialize GPIO using /sys/class/gpio or gpiod
    LOG_DEBUG("Laser GPIO initialized (Pi) - GPIO %d", GPIO_LASER_CONTROL);
}

static void gpio_set_laser(bool on) {
    // TODO: Set actual GPIO
    // echo 1/0 > /sys/class/gpio/gpio23/value
    g_laser_on = on;
    LOG_DEBUG("Laser GPIO set: %s", on ? "ON" : "OFF");
}

static void gpio_cleanup_laser(void) {
    gpio_set_laser(false);
    LOG_DEBUG("Laser GPIO cleanup (Pi)");
}

#elif defined(APIS_PLATFORM_ESP32)

static void gpio_init_laser(void) {
    gpio_reset_pin(GPIO_LASER_CONTROL);
    gpio_set_direction(GPIO_LASER_CONTROL, GPIO_MODE_OUTPUT);
    gpio_set_level(GPIO_LASER_CONTROL, 0);  // Laser off
    LOG_DEBUG("Laser GPIO initialized (ESP32)");
}

static void gpio_set_laser(bool on) {
    gpio_set_level(GPIO_LASER_CONTROL, on ? 1 : 0);
    g_laser_on = on;
}

static void gpio_cleanup_laser(void) {
    gpio_set_level(GPIO_LASER_CONTROL, 0);
    LOG_DEBUG("Laser GPIO cleanup (ESP32)");
}

#else // APIS_PLATFORM_TEST

static void gpio_init_laser(void) {
    g_laser_on = false;
    LOG_DEBUG("Laser GPIO initialized (test mock)");
}

static void gpio_set_laser(bool on) {
    g_laser_on = on;
    LOG_DEBUG("Laser GPIO set: %s", on ? "ON" : "OFF");
}

static void gpio_cleanup_laser(void) {
    g_laser_on = false;
    LOG_DEBUG("Laser GPIO cleanup (test mock)");
}

#endif

// ============================================================================
// Internal Functions
// ============================================================================

static void turn_off_internal(void) {
    if (g_laser_on) {
        uint64_t now = get_time_ms();
        uint32_t on_duration = (uint32_t)(now - g_activation_time);

        gpio_set_laser(false);
        g_deactivation_time = now;
        g_total_on_time_ms += on_duration;

        LOG_DEBUG("Laser off after %u ms", on_duration);
    }
}

static bool is_in_cooldown(void) {
    if (g_deactivation_time == 0) {
        return false;
    }

    uint64_t now = get_time_ms();
    uint64_t cooldown_end = g_deactivation_time + LASER_COOLDOWN_MS;

    return now < cooldown_end;
}

static uint32_t get_cooldown_remaining_internal(void) {
    if (g_deactivation_time == 0) {
        return 0;
    }

    uint64_t now = get_time_ms();
    uint64_t cooldown_end = g_deactivation_time + LASER_COOLDOWN_MS;

    if (now >= cooldown_end) {
        return 0;
    }

    return (uint32_t)(cooldown_end - now);
}

// ============================================================================
// Public API Implementation
// ============================================================================

laser_status_t laser_controller_init(void) {
    if (g_initialized) {
        LOG_WARN("Laser controller already initialized");
        return LASER_OK;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_laser_mutex == NULL) {
        g_laser_mutex = xSemaphoreCreateMutex();
        if (g_laser_mutex == NULL) {
            LOG_ERROR("Failed to create laser mutex");
            return LASER_ERROR_HARDWARE;
        }
    }
#endif

    gpio_init_laser();

    // Reset state
    g_state = LASER_STATE_OFF;
    g_armed = false;
    g_kill_switch = false;
    g_laser_on = false;
    g_activation_time = 0;
    g_deactivation_time = 0;
    g_init_time = get_time_ms();

    // Reset statistics
    g_activation_count = 0;
    g_safety_timeout_count = 0;
    g_cooldown_block_count = 0;
    g_kill_switch_count = 0;
    g_total_on_time_ms = 0;
    g_last_activation = 0;

    g_initialized = true;
    LOG_INFO("Laser controller initialized");

    return LASER_OK;
}

laser_status_t laser_controller_on(void) {
    if (!g_initialized) {
        return LASER_ERROR_NOT_INITIALIZED;
    }

    LASER_LOCK();

    // Safety checks
    if (g_kill_switch) {
        LASER_UNLOCK();
        LOG_WARN("Laser blocked: kill switch engaged");
        return LASER_ERROR_KILL_SWITCH;
    }

    if (!g_armed) {
        LASER_UNLOCK();
        LOG_WARN("Laser blocked: not armed");
        return LASER_ERROR_NOT_ARMED;
    }

    if (is_in_cooldown()) {
        g_cooldown_block_count++;
        LASER_UNLOCK();
        LOG_WARN("Laser blocked: in cooldown (%u ms remaining)",
                 get_cooldown_remaining_internal());
        return LASER_ERROR_COOLDOWN;
    }

    // Already on?
    if (g_laser_on) {
        LASER_UNLOCK();
        return LASER_OK;
    }

    // Turn on
    g_activation_time = get_time_ms();
    g_last_activation = g_activation_time;
    gpio_set_laser(true);
    g_activation_count++;

    set_state(LASER_STATE_ACTIVE);

    LASER_UNLOCK();

    LOG_INFO("Laser activated");
    return LASER_OK;
}

void laser_controller_off(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    if (g_laser_on) {
        turn_off_internal();

        if (g_armed && !g_kill_switch) {
            set_state(LASER_STATE_COOLDOWN);
        } else if (g_kill_switch) {
            set_state(LASER_STATE_EMERGENCY_STOP);
        } else {
            set_state(LASER_STATE_OFF);
        }
    }

    LASER_UNLOCK();
}

void laser_controller_arm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    if (g_kill_switch) {
        LASER_UNLOCK();
        LOG_WARN("Cannot arm: kill switch engaged");
        return;
    }

    if (!g_armed) {
        g_armed = true;
        set_state(LASER_STATE_ARMED);
        LOG_INFO("Laser armed");
    }

    LASER_UNLOCK();
}

void laser_controller_disarm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Turn off laser first if active
    if (g_laser_on) {
        turn_off_internal();
    }

    g_armed = false;
    set_state(LASER_STATE_OFF);

    LASER_UNLOCK();

    LOG_INFO("Laser disarmed");
}

bool laser_controller_is_armed(void) {
    if (!g_initialized) return false;

    LASER_LOCK();
    bool armed = g_armed;
    LASER_UNLOCK();

    return armed;
}

bool laser_controller_is_active(void) {
    if (!g_initialized) return false;

    LASER_LOCK();
    bool active = g_laser_on;
    LASER_UNLOCK();

    return active;
}

laser_state_t laser_controller_get_state(void) {
    if (!g_initialized) return LASER_STATE_OFF;

    LASER_LOCK();
    laser_state_t state = g_state;
    LASER_UNLOCK();

    return state;
}

void laser_controller_kill_switch(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Immediately turn off laser
    if (g_laser_on) {
        turn_off_internal();
    }

    g_kill_switch = true;
    g_armed = false;
    g_kill_switch_count++;

    set_state(LASER_STATE_EMERGENCY_STOP);

    LASER_UNLOCK();

    LOG_WARN("KILL SWITCH ENGAGED - laser emergency stop");
}

void laser_controller_reset_kill_switch(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    if (g_kill_switch) {
        g_kill_switch = false;
        set_state(LASER_STATE_OFF);
        LOG_INFO("Kill switch reset");
    }

    LASER_UNLOCK();
}

bool laser_controller_is_kill_switch_engaged(void) {
    if (!g_initialized) return false;

    LASER_LOCK();
    bool engaged = g_kill_switch;
    LASER_UNLOCK();

    return engaged;
}

bool laser_controller_is_in_cooldown(void) {
    if (!g_initialized) return false;

    LASER_LOCK();
    bool cooldown = is_in_cooldown();
    LASER_UNLOCK();

    return cooldown;
}

uint32_t laser_controller_get_cooldown_remaining(void) {
    if (!g_initialized) return 0;

    LASER_LOCK();
    uint32_t remaining = get_cooldown_remaining_internal();
    LASER_UNLOCK();

    return remaining;
}

uint32_t laser_controller_get_on_time_remaining(void) {
    if (!g_initialized) return 0;

    LASER_LOCK();

    if (!g_laser_on) {
        LASER_UNLOCK();
        return 0;
    }

    uint64_t now = get_time_ms();
    uint64_t elapsed = now - g_activation_time;

    uint32_t remaining = 0;
    if (elapsed < LASER_MAX_ON_TIME_MS) {
        remaining = (uint32_t)(LASER_MAX_ON_TIME_MS - elapsed);
    }

    LASER_UNLOCK();

    return remaining;
}

uint32_t laser_controller_get_current_on_time(void) {
    if (!g_initialized) return 0;

    LASER_LOCK();

    if (!g_laser_on) {
        LASER_UNLOCK();
        return 0;
    }

    uint64_t now = get_time_ms();
    uint32_t on_time = (uint32_t)(now - g_activation_time);

    LASER_UNLOCK();

    return on_time;
}

void laser_controller_update(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Check for safety timeout
    if (g_laser_on) {
        uint64_t now = get_time_ms();
        uint64_t elapsed = now - g_activation_time;

        if (elapsed >= LASER_MAX_ON_TIME_MS) {
            LOG_WARN("SAFETY TIMEOUT: laser on for %lu ms, forcing off", (unsigned long)elapsed);

            uint32_t duration = (uint32_t)elapsed;
            turn_off_internal();
            g_safety_timeout_count++;

            set_state(LASER_STATE_COOLDOWN);

            // Invoke timeout callback
            if (g_timeout_callback != NULL) {
                LASER_UNLOCK();
                g_timeout_callback(duration, g_timeout_callback_data);
                LASER_LOCK();
            }
        }
    }

    // Update cooldown state
    if (g_state == LASER_STATE_COOLDOWN && !is_in_cooldown()) {
        if (g_armed && !g_kill_switch) {
            set_state(LASER_STATE_ARMED);
        } else if (g_kill_switch) {
            set_state(LASER_STATE_EMERGENCY_STOP);
        } else {
            set_state(LASER_STATE_OFF);
        }
    }

    LASER_UNLOCK();
}

void laser_controller_set_state_callback(laser_state_callback_t callback, void *user_data) {
    LASER_LOCK();
    g_state_callback = callback;
    g_state_callback_data = user_data;
    LASER_UNLOCK();
}

void laser_controller_set_timeout_callback(laser_timeout_callback_t callback, void *user_data) {
    LASER_LOCK();
    g_timeout_callback = callback;
    g_timeout_callback_data = user_data;
    LASER_UNLOCK();
}

laser_status_t laser_controller_get_stats(laser_stats_t *stats) {
    if (!g_initialized) {
        return LASER_ERROR_NOT_INITIALIZED;
    }

    if (stats == NULL) {
        return LASER_ERROR_HARDWARE;
    }

    LASER_LOCK();

    stats->activation_count = g_activation_count;
    stats->safety_timeout_count = g_safety_timeout_count;
    stats->cooldown_block_count = g_cooldown_block_count;
    stats->kill_switch_count = g_kill_switch_count;
    stats->total_on_time_ms = g_total_on_time_ms;
    stats->last_activation = g_last_activation;
    stats->uptime_ms = get_time_ms() - g_init_time;

    LASER_UNLOCK();

    return LASER_OK;
}

bool laser_controller_is_initialized(void) {
    return g_initialized;
}

void laser_controller_cleanup(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // Turn off laser
    if (g_laser_on) {
        turn_off_internal();
    }

    gpio_cleanup_laser();

    g_armed = false;
    g_kill_switch = false;

    LASER_UNLOCK();

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_laser_mutex != NULL) {
        vSemaphoreDelete(g_laser_mutex);
        g_laser_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("Laser controller cleanup complete");
}
