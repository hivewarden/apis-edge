/**
 * Safety Enforcement Layer Implementation.
 *
 * Multi-layer safety system that wraps all laser commands.
 * Integrates with laser_controller, servo_controller, and button_handler.
 */

#include "safety_layer.h"
#include "laser_controller.h"
#include "servo_controller.h"
#include "button_handler.h"

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
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#else
// Test platform - no hardware
#include <pthread.h>
#include <time.h>
#endif

// ============================================================================
// Mutex wrapper for thread safety
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t safety_mutex = PTHREAD_MUTEX_INITIALIZER;
#define SAFETY_LOCK()   pthread_mutex_lock(&safety_mutex)
#define SAFETY_UNLOCK() pthread_mutex_unlock(&safety_mutex)
#elif defined(APIS_PLATFORM_ESP32)
static portMUX_TYPE safety_mux = portMUX_INITIALIZER_UNLOCKED;
#define SAFETY_LOCK()   portENTER_CRITICAL(&safety_mux)
#define SAFETY_UNLOCK() portEXIT_CRITICAL(&safety_mux)
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

    // Safety state
    safety_state_t state;
    bool detection_active;
    float current_tilt_deg;
    uint32_t current_voltage_mv;

    // Watchdog
    uint64_t last_watchdog_feed;
    bool watchdog_warning_fired;

    // Callbacks
    safety_state_callback_t state_callback;
    void *state_user_data;
    safety_failure_callback_t failure_callback;
    void *failure_user_data;
    safety_watchdog_callback_t watchdog_callback;
    void *watchdog_user_data;

    // Statistics
    safety_stats_t stats;

    // Timing
    uint64_t init_time;

} safety_context_t;

static safety_context_t ctx = {0};

// ============================================================================
// Internal helpers
// ============================================================================

static void notify_state_change(safety_state_t new_state) {
    if (ctx.state_callback) {
        ctx.state_callback(new_state, ctx.state_user_data);
    }
}

static void notify_failure(safety_status_t failure) {
    if (ctx.failure_callback) {
        ctx.failure_callback(failure, ctx.failure_user_data);
    }
}

static void notify_watchdog_warning(uint32_t remaining_ms) {
    if (ctx.watchdog_callback) {
        ctx.watchdog_callback(remaining_ms, ctx.watchdog_user_data);
    }
}

static void set_state_internal(safety_state_t new_state) {
    if (ctx.state == new_state) return;

    safety_state_t old_state = ctx.state;
    ctx.state = new_state;

    log_info("Safety state changed: %s -> %s",
             safety_state_name(old_state), safety_state_name(new_state));
    notify_state_change(new_state);
}

static void enter_safe_mode_internal(void) {
    if (ctx.state == SAFETY_STATE_SAFE_MODE) return;

    ctx.stats.safe_mode_entries++;
    set_state_internal(SAFETY_STATE_SAFE_MODE);

    // Force laser off
    if (laser_controller_is_initialized()) {
        laser_controller_off();
        laser_controller_kill_switch();
    }

    log_warn("System entered SAFE MODE - manual reset required");
}

static bool check_armed(void) {
    // Check both button handler and laser controller
    if (button_handler_is_initialized()) {
        return button_handler_is_armed();
    }
    if (laser_controller_is_initialized()) {
        return laser_controller_is_armed();
    }
    return false;
}

static bool check_kill_switch(void) {
    if (laser_controller_is_initialized()) {
        return laser_controller_is_kill_switch_engaged();
    }
    if (button_handler_is_initialized()) {
        return button_handler_is_emergency_stop();
    }
    return false;
}

// ============================================================================
// Public API Implementation
// ============================================================================

safety_status_t safety_layer_init(void) {
    SAFETY_LOCK();

    if (ctx.initialized) {
        SAFETY_UNLOCK();
        return SAFETY_OK;  // Already initialized is OK
    }

    // Initialize state
    memset(&ctx, 0, sizeof(ctx));
    ctx.state = SAFETY_STATE_NORMAL;
    ctx.init_time = get_time_ms();
    ctx.last_watchdog_feed = ctx.init_time;
    ctx.current_voltage_mv = 5000;  // Assume good voltage initially

    ctx.initialized = true;

    SAFETY_UNLOCK();

    log_info("Safety layer initialized");
    return SAFETY_OK;
}

safety_status_t safety_check_all(safety_result_t *result) {
    return safety_check(SAFETY_CHECK_ALL, result);
}

safety_status_t safety_check(uint32_t checks, safety_result_t *result) {
    if (!ctx.initialized) {
        if (result) {
            memset(result, 0, sizeof(safety_result_t));
            result->status = SAFETY_ERROR_NOT_INITIALIZED;
        }
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    SAFETY_LOCK();

    ctx.stats.checks_performed++;

    safety_result_t local_result = {0};
    local_result.status = SAFETY_OK;
    local_result.failed_checks = 0;

    // Populate current values
    local_result.current_tilt_deg = ctx.current_tilt_deg;
    local_result.voltage_mv = ctx.current_voltage_mv;
    local_result.is_armed = check_armed();
    local_result.has_detection = ctx.detection_active;
    local_result.kill_switch_engaged = check_kill_switch();

    // Calculate watchdog remaining
    uint64_t now = get_time_ms();
    uint64_t elapsed = now - ctx.last_watchdog_feed;
    if (elapsed >= SAFETY_WATCHDOG_TIMEOUT_MS) {
        local_result.watchdog_remaining_ms = 0;
    } else {
        local_result.watchdog_remaining_ms = SAFETY_WATCHDOG_TIMEOUT_MS - (uint32_t)elapsed;
    }

    // Get laser on-time
    if (laser_controller_is_initialized()) {
        local_result.continuous_time_ms = laser_controller_get_current_on_time();
    }

    // Check safe mode first
    if (ctx.state == SAFETY_STATE_SAFE_MODE) {
        local_result.status = SAFETY_ERROR_SAFE_MODE;
        local_result.failed_checks = SAFETY_CHECK_ALL;
        ctx.stats.checks_failed++;
        goto done;
    }

    // Perform requested checks
    if (checks & SAFETY_CHECK_ARMED) {
        if (!local_result.is_armed) {
            local_result.failed_checks |= SAFETY_CHECK_ARMED;
            ctx.stats.armed_failures++;
            log_debug("Safety check failed: not armed");
        }
    }

    if (checks & SAFETY_CHECK_DETECTION) {
        if (!local_result.has_detection) {
            local_result.failed_checks |= SAFETY_CHECK_DETECTION;
            ctx.stats.detection_failures++;
            log_debug("Safety check failed: no active detection");
        }
    }

    if (checks & SAFETY_CHECK_TILT) {
        if (ctx.current_tilt_deg > SAFETY_TILT_MAX_DEG) {
            local_result.failed_checks |= SAFETY_CHECK_TILT;
            ctx.stats.tilt_failures++;
            log_warn("Safety check failed: tilt angle %.1f° is UPWARD (max %.1f°)",
                     ctx.current_tilt_deg, SAFETY_TILT_MAX_DEG);
        }
    }

    if (checks & SAFETY_CHECK_TIME) {
        if (local_result.continuous_time_ms >= LASER_MAX_ON_TIME_MS) {
            local_result.failed_checks |= SAFETY_CHECK_TIME;
            ctx.stats.time_failures++;
            log_debug("Safety check failed: time limit exceeded (%u ms)",
                      local_result.continuous_time_ms);
        }
    }

    if (checks & SAFETY_CHECK_KILL_SWITCH) {
        if (local_result.kill_switch_engaged) {
            local_result.failed_checks |= SAFETY_CHECK_KILL_SWITCH;
            ctx.stats.kill_switch_failures++;
            log_debug("Safety check failed: kill switch engaged");
        }
    }

    if (checks & SAFETY_CHECK_WATCHDOG) {
        if (local_result.watchdog_remaining_ms == 0) {
            local_result.failed_checks |= SAFETY_CHECK_WATCHDOG;
            ctx.stats.watchdog_failures++;
            log_error("Safety check failed: watchdog timeout");
        }
    }

    if (checks & SAFETY_CHECK_BROWNOUT) {
        if (ctx.current_voltage_mv > 0 && ctx.current_voltage_mv < SAFETY_VOLTAGE_MIN_MV) {
            local_result.failed_checks |= SAFETY_CHECK_BROWNOUT;
            ctx.stats.brownout_failures++;
            log_error("Safety check failed: brownout (%u mV < %u mV)",
                      ctx.current_voltage_mv, SAFETY_VOLTAGE_MIN_MV);
        }
    }

    // Determine overall status
    if (local_result.failed_checks == 0) {
        local_result.status = SAFETY_OK;
        ctx.stats.checks_passed++;
    } else {
        // Count failed checks to determine primary error
        int fail_count = 0;
        for (int i = 0; i < 7; i++) {
            if (local_result.failed_checks & (1 << i)) fail_count++;
        }

        if (fail_count > 1) {
            local_result.status = SAFETY_ERROR_MULTIPLE;
        } else if (local_result.failed_checks & SAFETY_CHECK_ARMED) {
            local_result.status = SAFETY_ERROR_NOT_ARMED;
        } else if (local_result.failed_checks & SAFETY_CHECK_DETECTION) {
            local_result.status = SAFETY_ERROR_NO_DETECTION;
        } else if (local_result.failed_checks & SAFETY_CHECK_TILT) {
            local_result.status = SAFETY_ERROR_TILT_UPWARD;
        } else if (local_result.failed_checks & SAFETY_CHECK_TIME) {
            local_result.status = SAFETY_ERROR_TIME_EXCEEDED;
        } else if (local_result.failed_checks & SAFETY_CHECK_KILL_SWITCH) {
            local_result.status = SAFETY_ERROR_KILL_SWITCH;
        } else if (local_result.failed_checks & SAFETY_CHECK_WATCHDOG) {
            local_result.status = SAFETY_ERROR_WATCHDOG;
        } else if (local_result.failed_checks & SAFETY_CHECK_BROWNOUT) {
            local_result.status = SAFETY_ERROR_BROWNOUT;
        }

        ctx.stats.checks_failed++;
        notify_failure(local_result.status);
    }

done:
    if (result) {
        memcpy(result, &local_result, sizeof(safety_result_t));
    }

    SAFETY_UNLOCK();
    return local_result.status;
}

void safety_feed_watchdog(void) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();
    ctx.last_watchdog_feed = get_time_ms();
    ctx.watchdog_warning_fired = false;

    // Clear warning state if we were in it
    if (ctx.state == SAFETY_STATE_WARNING) {
        set_state_internal(SAFETY_STATE_NORMAL);
    }
    SAFETY_UNLOCK();
}

uint32_t safety_get_watchdog_remaining(void) {
    if (!ctx.initialized) return 0;

    SAFETY_LOCK();
    uint64_t now = get_time_ms();
    uint64_t elapsed = now - ctx.last_watchdog_feed;
    uint32_t remaining = 0;

    if (elapsed < SAFETY_WATCHDOG_TIMEOUT_MS) {
        remaining = SAFETY_WATCHDOG_TIMEOUT_MS - (uint32_t)elapsed;
    }
    SAFETY_UNLOCK();

    return remaining;
}

bool safety_is_watchdog_warning(void) {
    if (!ctx.initialized) return false;

    SAFETY_LOCK();
    uint64_t now = get_time_ms();
    uint64_t elapsed = now - ctx.last_watchdog_feed;
    bool warning = (elapsed >= SAFETY_WATCHDOG_WARNING_MS);
    SAFETY_UNLOCK();

    return warning;
}

void safety_update(void) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();

    uint64_t now = get_time_ms();
    uint64_t elapsed = now - ctx.last_watchdog_feed;

    // Check watchdog timeout
    if (elapsed >= SAFETY_WATCHDOG_TIMEOUT_MS) {
        if (ctx.state != SAFETY_STATE_SAFE_MODE) {
            log_error("Watchdog timeout - entering safe mode");
            enter_safe_mode_internal();
        }
    }
    // Check watchdog warning
    else if (elapsed >= SAFETY_WATCHDOG_WARNING_MS) {
        if (!ctx.watchdog_warning_fired) {
            ctx.watchdog_warning_fired = true;
            uint32_t remaining = SAFETY_WATCHDOG_TIMEOUT_MS - (uint32_t)elapsed;
            log_warn("Watchdog warning - %u ms remaining", remaining);
            notify_watchdog_warning(remaining);

            if (ctx.state == SAFETY_STATE_NORMAL) {
                set_state_internal(SAFETY_STATE_WARNING);
            }
        }
    }

    // Check brownout
    if (ctx.current_voltage_mv > 0 && ctx.current_voltage_mv < SAFETY_VOLTAGE_MIN_MV) {
        if (ctx.state != SAFETY_STATE_SAFE_MODE) {
            log_error("Brownout detected (%u mV) - entering safe mode", ctx.current_voltage_mv);
            enter_safe_mode_internal();
        }
    }

    SAFETY_UNLOCK();
}

void safety_set_detection_active(bool active) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();
    ctx.detection_active = active;
    SAFETY_UNLOCK();

    log_debug("Detection active: %s", active ? "true" : "false");
}

bool safety_is_detection_active(void) {
    if (!ctx.initialized) return false;

    SAFETY_LOCK();
    bool active = ctx.detection_active;
    SAFETY_UNLOCK();

    return active;
}

safety_status_t safety_validate_tilt(float tilt_deg) {
    if (!ctx.initialized) return SAFETY_ERROR_NOT_INITIALIZED;

    SAFETY_LOCK();
    ctx.current_tilt_deg = tilt_deg;

    safety_status_t status = SAFETY_OK;
    if (tilt_deg > SAFETY_TILT_MAX_DEG) {
        status = SAFETY_ERROR_TILT_UPWARD;
        ctx.stats.tilt_failures++;
        log_warn("Tilt validation FAILED: %.1f° exceeds maximum %.1f° (UPWARD REJECTED)",
                 tilt_deg, SAFETY_TILT_MAX_DEG);
    }
    SAFETY_UNLOCK();

    return status;
}

safety_state_t safety_get_state(void) {
    SAFETY_LOCK();
    safety_state_t state = ctx.state;
    SAFETY_UNLOCK();
    return state;
}

bool safety_is_safe_mode(void) {
    return safety_get_state() == SAFETY_STATE_SAFE_MODE;
}

void safety_enter_safe_mode(void) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();
    enter_safe_mode_internal();
    SAFETY_UNLOCK();
}

safety_status_t safety_reset(void) {
    if (!ctx.initialized) return SAFETY_ERROR_NOT_INITIALIZED;

    SAFETY_LOCK();

    if (ctx.state != SAFETY_STATE_SAFE_MODE) {
        SAFETY_UNLOCK();
        return SAFETY_OK;  // Already not in safe mode
    }

    // Reset watchdog
    ctx.last_watchdog_feed = get_time_ms();
    ctx.watchdog_warning_fired = false;

    // Reset laser controller kill switch
    if (laser_controller_is_initialized()) {
        laser_controller_reset_kill_switch();
    }

    // Clear emergency stop on button handler
    if (button_handler_is_initialized()) {
        button_handler_clear_emergency();
    }

    set_state_internal(SAFETY_STATE_NORMAL);
    log_info("Safety layer reset - system returned to normal state (remains disarmed)");

    SAFETY_UNLOCK();
    return SAFETY_OK;
}

void safety_set_voltage(uint32_t voltage_mv) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();
    ctx.current_voltage_mv = voltage_mv;
    SAFETY_UNLOCK();
}

uint32_t safety_get_voltage(void) {
    SAFETY_LOCK();
    uint32_t voltage = ctx.current_voltage_mv;
    SAFETY_UNLOCK();
    return voltage;
}

bool safety_is_voltage_warning(void) {
    SAFETY_LOCK();
    bool warning = (ctx.current_voltage_mv > 0 &&
                    ctx.current_voltage_mv < SAFETY_VOLTAGE_WARNING_MV);
    SAFETY_UNLOCK();
    return warning;
}

bool safety_is_brownout(void) {
    SAFETY_LOCK();
    bool brownout = (ctx.current_voltage_mv > 0 &&
                     ctx.current_voltage_mv < SAFETY_VOLTAGE_MIN_MV);
    SAFETY_UNLOCK();
    return brownout;
}

void safety_set_state_callback(safety_state_callback_t callback, void *user_data) {
    SAFETY_LOCK();
    ctx.state_callback = callback;
    ctx.state_user_data = user_data;
    SAFETY_UNLOCK();
}

void safety_set_failure_callback(safety_failure_callback_t callback, void *user_data) {
    SAFETY_LOCK();
    ctx.failure_callback = callback;
    ctx.failure_user_data = user_data;
    SAFETY_UNLOCK();
}

void safety_set_watchdog_callback(safety_watchdog_callback_t callback, void *user_data) {
    SAFETY_LOCK();
    ctx.watchdog_callback = callback;
    ctx.watchdog_user_data = user_data;
    SAFETY_UNLOCK();
}

safety_status_t safety_get_stats(safety_stats_t *stats) {
    if (!ctx.initialized) return SAFETY_ERROR_NOT_INITIALIZED;
    if (!stats) return SAFETY_ERROR_NOT_INITIALIZED;  // Treating as invalid param

    SAFETY_LOCK();
    memcpy(stats, &ctx.stats, sizeof(safety_stats_t));
    stats->uptime_ms = get_time_ms() - ctx.init_time;
    SAFETY_UNLOCK();

    return SAFETY_OK;
}

bool safety_is_initialized(void) {
    return ctx.initialized;
}

const char *safety_state_name(safety_state_t state) {
    switch (state) {
        case SAFETY_STATE_NORMAL:    return "NORMAL";
        case SAFETY_STATE_WARNING:   return "WARNING";
        case SAFETY_STATE_SAFE_MODE: return "SAFE_MODE";
        case SAFETY_STATE_EMERGENCY: return "EMERGENCY";
        default:                     return "UNKNOWN";
    }
}

const char *safety_status_name(safety_status_t status) {
    switch (status) {
        case SAFETY_OK:                     return "OK";
        case SAFETY_ERROR_NOT_INITIALIZED:  return "NOT_INITIALIZED";
        case SAFETY_ERROR_NOT_ARMED:        return "NOT_ARMED";
        case SAFETY_ERROR_NO_DETECTION:     return "NO_DETECTION";
        case SAFETY_ERROR_TILT_UPWARD:      return "TILT_UPWARD";
        case SAFETY_ERROR_TIME_EXCEEDED:    return "TIME_EXCEEDED";
        case SAFETY_ERROR_KILL_SWITCH:      return "KILL_SWITCH";
        case SAFETY_ERROR_WATCHDOG:         return "WATCHDOG";
        case SAFETY_ERROR_BROWNOUT:         return "BROWNOUT";
        case SAFETY_ERROR_SAFE_MODE:        return "SAFE_MODE";
        case SAFETY_ERROR_MULTIPLE:         return "MULTIPLE";
        default:                            return "UNKNOWN";
    }
}

const char *safety_check_name(safety_check_t check) {
    switch (check) {
        case SAFETY_CHECK_ARMED:        return "ARMED";
        case SAFETY_CHECK_DETECTION:    return "DETECTION";
        case SAFETY_CHECK_TILT:         return "TILT";
        case SAFETY_CHECK_TIME:         return "TIME";
        case SAFETY_CHECK_KILL_SWITCH:  return "KILL_SWITCH";
        case SAFETY_CHECK_WATCHDOG:     return "WATCHDOG";
        case SAFETY_CHECK_BROWNOUT:     return "BROWNOUT";
        case SAFETY_CHECK_ALL:          return "ALL";
        default:                        return "UNKNOWN";
    }
}

void safety_cleanup(void) {
    SAFETY_LOCK();

    if (!ctx.initialized) {
        SAFETY_UNLOCK();
        return;
    }

    // Force safe mode on cleanup
    if (laser_controller_is_initialized()) {
        laser_controller_off();
        laser_controller_kill_switch();
    }

    ctx.initialized = false;
    log_info("Safety layer cleanup complete");

    SAFETY_UNLOCK();
}
