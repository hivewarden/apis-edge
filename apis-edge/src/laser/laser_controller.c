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
#include <errno.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#else
#include "freertos/FreeRTOS.h"
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
#include "platform_mutex.h"
APIS_MUTEX_DECLARE(laser);
#define LASER_LOCK()   APIS_MUTEX_LOCK(laser)
#define LASER_UNLOCK() APIS_MUTEX_UNLOCK(laser)

// Utility Functions
#include "time_util.h"

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
        case LASER_ERROR_INVALID_PARAM:  return "INVALID_PARAM";
        default:                         return "UNKNOWN";
    }
}

/**
 * Set laser state (must be called with g_mutex held).
 * C7-CRIT-004 fix: Does NOT invoke the state callback. Instead, returns true
 * if the state changed. Caller must invoke the callback AFTER releasing the lock
 * using the copy-under-lock pattern.
 */
static bool set_state(laser_state_t new_state) {
    if (g_state != new_state) {
        laser_state_t old_state = g_state;
        (void)old_state; // used only by LOG_DEBUG
        g_state = new_state;
        LOG_DEBUG("Laser state: %s -> %s", laser_state_name(old_state), laser_state_name(new_state));
        return true;
    }
    return false;
}

// ============================================================================
// GPIO Control (Platform-specific)
// ============================================================================

#if defined(APIS_PLATFORM_PI)

#include <fcntl.h>
#include <unistd.h>

static int g_gpio_value_fd = -1;

static void gpio_init_laser(void) {
    char path[64];

    // Export GPIO pin if not already exported
    int export_fd = open("/sys/class/gpio/export", O_WRONLY);
    if (export_fd >= 0) {
        char buf[8];
        int len = snprintf(buf, sizeof(buf), "%d", GPIO_LASER_CONTROL);
        // Write may fail if already exported - that's OK
        (void)write(export_fd, buf, len);
        close(export_fd);
    }

    // Give kernel time to create the gpio directory
    usleep(50000);  // 50ms

    // Set direction to output
    snprintf(path, sizeof(path), "/sys/class/gpio/gpio%d/direction", GPIO_LASER_CONTROL);
    int dir_fd = open(path, O_WRONLY);
    if (dir_fd >= 0) {
        (void)write(dir_fd, "out", 3);
        close(dir_fd);
    } else {
        LOG_ERROR("Failed to set GPIO %d direction: %s", GPIO_LASER_CONTROL, strerror(errno));
    }

    // Open value file for fast writes (keep open for performance)
    snprintf(path, sizeof(path), "/sys/class/gpio/gpio%d/value", GPIO_LASER_CONTROL);
    g_gpio_value_fd = open(path, O_WRONLY);
    if (g_gpio_value_fd < 0) {
        LOG_ERROR("Failed to open GPIO %d value: %s", GPIO_LASER_CONTROL, strerror(errno));
    }

    // Ensure laser starts OFF
    if (g_gpio_value_fd >= 0) {
        (void)write(g_gpio_value_fd, "0", 1);
    }

    LOG_DEBUG("Laser GPIO initialized (Pi) - GPIO %d", GPIO_LASER_CONTROL);
}

static void gpio_set_laser(bool on) {
    if (g_gpio_value_fd >= 0) {
        const char *val = on ? "1" : "0";
        if (write(g_gpio_value_fd, val, 1) < 0) {
            LOG_ERROR("Failed to set GPIO %d: %s", GPIO_LASER_CONTROL, strerror(errno));
        }
    }
    g_laser_on = on;
    LOG_DEBUG("Laser GPIO set: %s", on ? "ON" : "OFF");
}

static void gpio_cleanup_laser(void) {
    // Ensure laser is OFF
    gpio_set_laser(false);

    // Close value file
    if (g_gpio_value_fd >= 0) {
        close(g_gpio_value_fd);
        g_gpio_value_fd = -1;
    }

    // Unexport GPIO (optional, but clean)
    int unexport_fd = open("/sys/class/gpio/unexport", O_WRONLY);
    if (unexport_fd >= 0) {
        char buf[8];
        int len = snprintf(buf, sizeof(buf), "%d", GPIO_LASER_CONTROL);
        (void)write(unexport_fd, buf, len);
        close(unexport_fd);
    }

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
    // C7-H5 fix: Early check without lock (double-checked locking pattern)
    if (g_initialized) {
        LOG_WARN("Laser controller already initialized");
        return LASER_OK;
    }

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(laser);

    // C7-H5 fix: Protect state initialization with the lock to prevent
    // concurrent init or use-during-init races
    LASER_LOCK();

    // Re-check under lock (another thread may have initialized concurrently)
    if (g_initialized) {
        LASER_UNLOCK();
        LOG_WARN("Laser controller already initialized");
        return LASER_OK;
    }

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

    LASER_UNLOCK();

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
        // Log that activation was blocked - detection should still be counted by caller
        LOG_INFO("Laser activation blocked: unit disarmed (detection still counted for statistics)");
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

    bool state_changed = set_state(LASER_STATE_ACTIVE);

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(LASER_STATE_ACTIVE, cb_data);
    }

    LOG_INFO("Laser activated");
    return LASER_OK;
}

void laser_controller_off(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    bool state_changed = false;
    laser_state_t new_state = g_state;

    if (g_laser_on) {
        turn_off_internal();

        if (g_armed && !g_kill_switch) {
            state_changed = set_state(LASER_STATE_COOLDOWN);
            new_state = LASER_STATE_COOLDOWN;
        } else if (g_kill_switch) {
            state_changed = set_state(LASER_STATE_EMERGENCY_STOP);
            new_state = LASER_STATE_EMERGENCY_STOP;
        } else {
            state_changed = set_state(LASER_STATE_OFF);
            new_state = LASER_STATE_OFF;
        }
    }

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(new_state, cb_data);
    }
}

void laser_controller_arm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    if (g_kill_switch) {
        LASER_UNLOCK();
        LOG_WARN("Cannot arm: kill switch engaged");
        return;
    }

    bool state_changed = false;
    if (!g_armed) {
        g_armed = true;
        state_changed = set_state(LASER_STATE_ARMED);
        LOG_INFO("Laser armed");
    }

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(LASER_STATE_ARMED, cb_data);
    }
}

void laser_controller_disarm(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    // SAFETY-001-3 fix: Set g_armed = false FIRST, then turn off laser
    // This prevents a race condition where another thread could see g_armed=true
    // but laser_on=false, and attempt to re-enable the laser before disarm completes.
    // By setting g_armed=false first (while holding the lock), any concurrent
    // laser_controller_on() call will fail the armed check and return NOT_ARMED.
    g_armed = false;

    // Now safely turn off the laser - any concurrent activation attempts
    // will be rejected because g_armed is already false
    if (g_laser_on) {
        turn_off_internal();
    }

    bool state_changed = set_state(LASER_STATE_OFF);

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(LASER_STATE_OFF, cb_data);
    }

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

    bool state_changed = set_state(LASER_STATE_EMERGENCY_STOP);

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(LASER_STATE_EMERGENCY_STOP, cb_data);
    }

    LOG_WARN("KILL SWITCH ENGAGED - laser emergency stop");
}

void laser_controller_reset_kill_switch(void) {
    if (!g_initialized) return;

    LASER_LOCK();

    bool state_changed = false;
    if (g_kill_switch) {
        g_kill_switch = false;
        state_changed = set_state(LASER_STATE_OFF);
        LOG_INFO("Kill switch reset");
    }

    // C7-CRIT-004 fix: Copy callback under lock, invoke outside
    laser_state_callback_t cb = NULL;
    void *cb_data = NULL;
    if (state_changed && g_state_callback != NULL) {
        cb = g_state_callback;
        cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    if (cb) {
        cb(LASER_STATE_OFF, cb_data);
    }
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

    // Local copies of callback for safe invocation outside lock
    // SAFETY-001-7 fix: Copy callback pointer and user_data under lock before invoking
    // This prevents use-after-free if another thread clears the callback while we're calling it
    laser_timeout_callback_t timeout_cb = NULL;
    void *timeout_cb_data = NULL;
    uint32_t timeout_duration = 0;
    bool should_invoke_timeout = false;

    // C7-CRIT-004 fix: Track state changes for deferred callback invocation
    bool any_state_changed = false;
    laser_state_t final_new_state = g_state;

    // Check for safety timeout
    if (g_laser_on) {
        uint64_t now = get_time_ms();
        uint64_t elapsed = now - g_activation_time;

        if (elapsed >= LASER_MAX_ON_TIME_MS) {
            LOG_WARN("SAFETY TIMEOUT: laser on for %lu ms, forcing off", (unsigned long)elapsed);

            // Log safety timeout as a persistent event for statistics
            // Note: event_logger is for detection events; safety timeouts are tracked via stats
            LOG_INFO("LASER_SAFETY_EVENT: type=timeout, duration_ms=%lu, reason=max_on_time_exceeded",
                     (unsigned long)elapsed);

            timeout_duration = (uint32_t)elapsed;
            turn_off_internal();
            g_safety_timeout_count++;

            if (set_state(LASER_STATE_COOLDOWN)) {
                any_state_changed = true;
                final_new_state = LASER_STATE_COOLDOWN;
            }

            // Copy callback pointer under lock to prevent use-after-free
            if (g_timeout_callback != NULL) {
                timeout_cb = g_timeout_callback;
                timeout_cb_data = g_timeout_callback_data;
                should_invoke_timeout = true;
            }
        }
    }

    // Update cooldown state
    if (g_state == LASER_STATE_COOLDOWN && !is_in_cooldown()) {
        if (g_armed && !g_kill_switch) {
            if (set_state(LASER_STATE_ARMED)) {
                any_state_changed = true;
                final_new_state = LASER_STATE_ARMED;
            }
        } else if (g_kill_switch) {
            if (set_state(LASER_STATE_EMERGENCY_STOP)) {
                any_state_changed = true;
                final_new_state = LASER_STATE_EMERGENCY_STOP;
            }
        } else {
            if (set_state(LASER_STATE_OFF)) {
                any_state_changed = true;
                final_new_state = LASER_STATE_OFF;
            }
        }
    }

    // C7-CRIT-004 fix: Copy state callback under lock for invocation outside
    laser_state_callback_t state_cb = NULL;
    void *state_cb_data = NULL;
    if (any_state_changed && g_state_callback != NULL) {
        state_cb = g_state_callback;
        state_cb_data = g_state_callback_data;
    }

    LASER_UNLOCK();

    // Invoke state callback outside lock
    if (state_cb) {
        state_cb(final_new_state, state_cb_data);
    }

    // Invoke timeout callback outside lock using local copy
    // This is safe because we copied the function pointer while holding the lock
    if (should_invoke_timeout && timeout_cb != NULL) {
        timeout_cb(timeout_duration, timeout_cb_data);
    }
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
        return LASER_ERROR_INVALID_PARAM;
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

    /* Mutex cleanup handled by platform_mutex lifecycle */

    g_initialized = false;
    LOG_INFO("Laser controller cleanup complete");
}
