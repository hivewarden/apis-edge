/**
 * Safety Enforcement Layer Implementation.
 *
 * Multi-layer safety system that wraps all laser commands.
 * Integrates with laser_controller, servo_controller, and button_handler.
 *
 * THREAD SAFETY / LOCKING ORDER:
 * This module acquires the safety_mutex and then may call into other modules
 * (laser_controller, servo_controller, button_handler) that have their own locks.
 *
 * Lock acquisition order (to prevent deadlock):
 * 1. safety_mutex (this module)
 * 2. laser_mutex (laser_controller)
 * 3. servo_mutex (servo_controller)
 * 4. button_mutex (button_handler)
 *
 * IMPORTANT: Other modules MUST NOT call back into safety layer functions
 * that acquire safety_mutex while holding their own locks. If callbacks are
 * needed, use a deferred callback mechanism or release locks first.
 *
 * Functions that call external modules while holding safety_mutex:
 * - enter_safe_mode_internal() -> laser_controller_off(), laser_controller_kill_switch()
 * - check_armed() -> button_handler_is_armed(), laser_controller_is_armed()
 * - check_kill_switch() -> laser_controller_is_kill_switch_engaged(), button_handler_is_emergency_stop()
 * - safety_check() -> laser_controller_get_current_on_time()
 * - safety_validate_tilt() -> servo_controller_get_position()
 * - safety_reset() -> laser_controller_reset_kill_switch(), button_handler_clear_emergency()
 */

#include "safety_layer.h"
#include "laser_controller.h"
#include "servo_controller.h"
#include "button_handler.h"

#include "log.h"

#include <string.h>
#include <stdlib.h>

// Compile-time assertion to ensure safety constant matches laser controller
// This ensures safety layer and laser controller have consistent time limits
_Static_assert(LASER_MAX_ON_TIME_MS == 10000,
    "LASER_MAX_ON_TIME_MS must be 10000ms - safety layer depends on this value");

// Define a safety-specific constant that can be used if we ever need different values
#define SAFETY_MAX_CONTINUOUS_TIME_MS LASER_MAX_ON_TIME_MS

// C7-MED-001: Auto-off timer threshold for safety_update() watchdog.
// If laser has been on continuously for this long, safety_update() forces it off.
// This is a defense-in-depth layer above the laser_controller's own 10s hardware timeout.
#define SAFETY_AUTO_OFF_THRESHOLD_MS  (LASER_MAX_ON_TIME_MS - 500)  // 9.5s, just before hardware limit

#if defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(safety);
#define SAFETY_LOCK()   APIS_MUTEX_LOCK(safety)
#define SAFETY_UNLOCK() APIS_MUTEX_UNLOCK(safety)

// Time utilities
#include "time_util.h"

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

/**
 * Copy-under-lock callback invocation macro.
 *
 * Copies the callback pointer and user_data under the safety lock, then
 * invokes outside the lock to prevent deadlock.  All three notify helpers
 * (state_change, failure, watchdog_warning) follow this identical pattern.
 *
 * @param cb_field   The ctx callback field name (e.g. state_callback)
 * @param ud_field   The ctx user_data field name (e.g. state_user_data)
 * @param cb_type    The callback typedef (e.g. safety_state_callback_t)
 * @param arg        The single argument to pass to the callback
 */
#define NOTIFY_CALLBACK(cb_field, ud_field, cb_type, arg) do { \
    SAFETY_LOCK();                                             \
    cb_type _cb = ctx.cb_field;                                \
    void *_ud = ctx.ud_field;                                  \
    SAFETY_UNLOCK();                                           \
    if (_cb) { _cb((arg), _ud); }                              \
} while (0)

static void notify_state_change(safety_state_t new_state) {
    NOTIFY_CALLBACK(state_callback, state_user_data,
                    safety_state_callback_t, new_state);
}

static void notify_failure(safety_status_t failure) {
    NOTIFY_CALLBACK(failure_callback, failure_user_data,
                    safety_failure_callback_t, failure);
}

static void notify_watchdog_warning(uint32_t remaining_ms) {
    NOTIFY_CALLBACK(watchdog_callback, watchdog_user_data,
                    safety_watchdog_callback_t, remaining_ms);
}

/**
 * Set internal state. Must be called with safety_mutex held.
 * Returns true if the state actually changed (caller should invoke
 * the state change callback AFTER releasing the lock).
 * If old_state_out is non-NULL, the previous state is written there.
 */
static bool set_state_internal(safety_state_t new_state, safety_state_t *old_state_out) {
    if (ctx.state == new_state) return false;

    safety_state_t old_state = ctx.state;
    ctx.state = new_state;
    if (old_state_out) *old_state_out = old_state;

    LOG_INFO("Safety state changed: %s -> %s",
             safety_state_name(old_state), safety_state_name(new_state));
    return true;
}

/**
 * Enter safe mode (internal, must be called with safety_mutex held).
 *
 * LOCKING NOTE: This function calls laser_controller_off() and
 * laser_controller_kill_switch() while holding safety_mutex.
 * Per the locking order documented at file top:
 * - safety_mutex is acquired BEFORE laser_mutex
 * - laser_controller functions will acquire their own lock internally
 *
 * This is safe as long as laser_controller callbacks (if any) do NOT
 * call back into safety layer functions that acquire safety_mutex.
 * The laser_controller module should be designed to avoid such callbacks,
 * or use deferred/async notification patterns if feedback is needed.
 */
/**
 * Enter safe mode (internal, must be called with safety_mutex held).
 * Returns true if state actually changed to SAFE_MODE (caller should
 * invoke state change callback after releasing the lock).
 */
static bool enter_safe_mode_internal(void) {
    if (ctx.state == SAFETY_STATE_SAFE_MODE) return false;

    ctx.stats.safe_mode_entries++;
    bool changed = set_state_internal(SAFETY_STATE_SAFE_MODE, NULL);

    // Force laser off - these calls acquire laser_mutex internally
    // Safe per documented lock ordering (safety -> laser)
    if (laser_controller_is_initialized()) {
        laser_controller_off();
        laser_controller_kill_switch();
    }

    LOG_WARN("System entered SAFE MODE - manual reset required");
    return changed;
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
    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(safety);
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

    LOG_INFO("Safety layer initialized");
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
            LOG_DEBUG("Safety check failed: not armed");
        }
    }

    if (checks & SAFETY_CHECK_DETECTION) {
        if (!local_result.has_detection) {
            local_result.failed_checks |= SAFETY_CHECK_DETECTION;
            ctx.stats.detection_failures++;
            LOG_DEBUG("Safety check failed: no active detection");
        }
    }

    if (checks & SAFETY_CHECK_TILT) {
        if (ctx.current_tilt_deg > SAFETY_TILT_MAX_DEG) {
            local_result.failed_checks |= SAFETY_CHECK_TILT;
            ctx.stats.tilt_failures++;
            LOG_WARN("Safety check failed: tilt angle %.1f° is UPWARD (max %.1f°)",
                     ctx.current_tilt_deg, SAFETY_TILT_MAX_DEG);
        }
    }

    if (checks & SAFETY_CHECK_TIME) {
        if (local_result.continuous_time_ms >= LASER_MAX_ON_TIME_MS) {
            local_result.failed_checks |= SAFETY_CHECK_TIME;
            ctx.stats.time_failures++;
            LOG_DEBUG("Safety check failed: time limit exceeded (%u ms)",
                      local_result.continuous_time_ms);
        }
    }

    if (checks & SAFETY_CHECK_KILL_SWITCH) {
        if (local_result.kill_switch_engaged) {
            local_result.failed_checks |= SAFETY_CHECK_KILL_SWITCH;
            ctx.stats.kill_switch_failures++;
            LOG_DEBUG("Safety check failed: kill switch engaged");
        }
    }

    if (checks & SAFETY_CHECK_WATCHDOG) {
        if (local_result.watchdog_remaining_ms == 0) {
            local_result.failed_checks |= SAFETY_CHECK_WATCHDOG;
            ctx.stats.watchdog_failures++;
            LOG_ERROR("Safety check failed: watchdog timeout");
        }
    }

    if (checks & SAFETY_CHECK_BROWNOUT) {
        if (ctx.current_voltage_mv > 0 && ctx.current_voltage_mv < SAFETY_VOLTAGE_MIN_MV) {
            local_result.failed_checks |= SAFETY_CHECK_BROWNOUT;
            ctx.stats.brownout_failures++;
            LOG_ERROR("Safety check failed: brownout (%u mV < %u mV)",
                      ctx.current_voltage_mv, SAFETY_VOLTAGE_MIN_MV);
        }
    }

    // Determine overall status
    bool should_notify_failure = false;
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
        should_notify_failure = true;
    }

done:
    if (result) {
        memcpy(result, &local_result, sizeof(safety_result_t));
    }

    SAFETY_UNLOCK();

    // C7-CRIT-001 fix: Invoke failure callback AFTER releasing safety_mutex
    // to prevent deadlock (notify_failure() acquires safety_mutex internally
    // to copy the callback pointer)
    if (should_notify_failure) {
        notify_failure(local_result.status);
    }

    return local_result.status;
}

void safety_feed_watchdog(void) {
    if (!ctx.initialized) return;

    bool state_changed = false;
    safety_state_t new_state = SAFETY_STATE_NORMAL;

    SAFETY_LOCK();
    ctx.last_watchdog_feed = get_time_ms();
    ctx.watchdog_warning_fired = false;

    // Clear warning state if we were in it
    if (ctx.state == SAFETY_STATE_WARNING) {
        state_changed = set_state_internal(SAFETY_STATE_NORMAL, NULL);
        new_state = SAFETY_STATE_NORMAL;
    }
    SAFETY_UNLOCK();

    // C7-CRIT-003 fix: Invoke state change callback outside the lock
    if (state_changed) {
        notify_state_change(new_state);
    }
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

    // Track deferred callbacks to invoke outside the lock
    bool should_notify_safe_mode = false;
    bool should_notify_watchdog_warning = false;
    uint32_t watchdog_remaining_ms = 0;
    bool should_notify_warning_state = false;
    bool should_notify_brownout_safe_mode = false;

    SAFETY_LOCK();

    uint64_t now = get_time_ms();
    uint64_t elapsed = now - ctx.last_watchdog_feed;

    // Check watchdog timeout
    if (elapsed >= SAFETY_WATCHDOG_TIMEOUT_MS) {
        if (ctx.state != SAFETY_STATE_SAFE_MODE) {
            LOG_ERROR("Watchdog timeout - entering safe mode");
            should_notify_safe_mode = enter_safe_mode_internal();
        }
    }
    // Check watchdog warning
    else if (elapsed >= SAFETY_WATCHDOG_WARNING_MS) {
        if (!ctx.watchdog_warning_fired) {
            ctx.watchdog_warning_fired = true;
            watchdog_remaining_ms = SAFETY_WATCHDOG_TIMEOUT_MS - (uint32_t)elapsed;
            LOG_WARN("Watchdog warning - %u ms remaining", watchdog_remaining_ms);
            // C7-CRIT-002 fix: Defer watchdog warning callback to after unlock
            should_notify_watchdog_warning = true;

            if (ctx.state == SAFETY_STATE_NORMAL) {
                should_notify_warning_state = set_state_internal(SAFETY_STATE_WARNING, NULL);
            }
        }
    }

    // C7-MED-001: Auto-off timer - force laser off if on too long continuously.
    // Defense-in-depth: laser_controller has its own 10s hardware timeout, but
    // this safety layer check fires slightly earlier (9.5s) as an additional guard.
    if (laser_controller_is_initialized() && laser_controller_is_active()) {
        uint32_t on_time = laser_controller_get_current_on_time();
        if (on_time >= SAFETY_AUTO_OFF_THRESHOLD_MS) {
            LOG_WARN("Safety auto-off: laser on for %u ms (threshold %u ms), forcing off",
                     on_time, SAFETY_AUTO_OFF_THRESHOLD_MS);
            safety_laser_off();
            ctx.stats.time_failures++;
        }
    }

    // Check brownout
    if (ctx.current_voltage_mv > 0 && ctx.current_voltage_mv < SAFETY_VOLTAGE_MIN_MV) {
        if (ctx.state != SAFETY_STATE_SAFE_MODE) {
            LOG_ERROR("Brownout detected (%u mV) - entering safe mode", ctx.current_voltage_mv);
            should_notify_brownout_safe_mode = enter_safe_mode_internal();
        }
    }

    SAFETY_UNLOCK();

    // C7-CRIT-002 fix: Invoke watchdog warning callback outside the lock
    if (should_notify_watchdog_warning) {
        notify_watchdog_warning(watchdog_remaining_ms);
    }

    // C7-CRIT-003 fix: Invoke state change callbacks outside the lock
    if (should_notify_safe_mode) {
        notify_state_change(SAFETY_STATE_SAFE_MODE);
    }
    if (should_notify_warning_state) {
        notify_state_change(SAFETY_STATE_WARNING);
    }
    if (should_notify_brownout_safe_mode) {
        notify_state_change(SAFETY_STATE_SAFE_MODE);
    }
}

void safety_set_detection_active(bool active) {
    if (!ctx.initialized) return;

    SAFETY_LOCK();
    ctx.detection_active = active;
    SAFETY_UNLOCK();

    LOG_DEBUG("Detection active: %s", active ? "true" : "false");
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

    // First, verify against actual servo position if servo controller is available
    // This ensures we're not trusting potentially incorrect caller-provided values
    if (servo_controller_is_initialized()) {
        servo_position_t actual_pos;
        if (servo_controller_get_position(&actual_pos) == SERVO_OK) {
            // Check actual servo tilt position - trust hardware over software
            if (actual_pos.tilt_deg > SAFETY_TILT_MAX_DEG) {
                ctx.stats.tilt_failures++;
                LOG_ERROR("Tilt validation FAILED: ACTUAL servo position %.1f° is UPWARD (max %.1f°)",
                          actual_pos.tilt_deg, SAFETY_TILT_MAX_DEG);
                SAFETY_UNLOCK();
                return SAFETY_ERROR_TILT_UPWARD;
            }
        }
    }

    // Store the requested tilt for tracking
    ctx.current_tilt_deg = tilt_deg;

    safety_status_t status = SAFETY_OK;
    if (tilt_deg > SAFETY_TILT_MAX_DEG) {
        status = SAFETY_ERROR_TILT_UPWARD;
        ctx.stats.tilt_failures++;
        LOG_WARN("Tilt validation FAILED: %.1f° exceeds maximum %.1f° (UPWARD REJECTED)",
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
    bool changed = enter_safe_mode_internal();
    SAFETY_UNLOCK();

    // C7-CRIT-003 fix: Invoke state change callback outside the lock
    if (changed) {
        notify_state_change(SAFETY_STATE_SAFE_MODE);
    }
}

safety_status_t safety_reset(void) {
    if (!ctx.initialized) return SAFETY_ERROR_NOT_INITIALIZED;

    bool state_changed = false;

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

    state_changed = set_state_internal(SAFETY_STATE_NORMAL, NULL);
    LOG_INFO("Safety layer reset - system returned to normal state (remains disarmed)");

    SAFETY_UNLOCK();

    // C7-CRIT-003 fix: Invoke state change callback outside the lock
    if (state_changed) {
        notify_state_change(SAFETY_STATE_NORMAL);
    }

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
    SAFETY_LOCK();
    bool initialized = ctx.initialized;
    SAFETY_UNLOCK();
    return initialized;
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

// ============================================================================
// Laser Command Wrappers - These wrap ALL laser commands with safety checks
// ============================================================================

safety_status_t safety_laser_on(void) {
    if (!ctx.initialized) {
        LOG_WARN("safety_laser_on: safety layer not initialized");
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // Perform all safety checks
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);

    if (status != SAFETY_OK) {
        // Silent enforcement - laser stays off, failure logged internally
        LOG_DEBUG("safety_laser_on: blocked by safety check (%s)",
                  safety_status_name(status));
        return status;
    }

    // All checks passed - attempt laser activation
    if (!laser_controller_is_initialized()) {
        LOG_WARN("safety_laser_on: laser controller not initialized");
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    laser_status_t laser_status = laser_controller_on();
    if (laser_status != LASER_OK) {
        LOG_DEBUG("safety_laser_on: laser_controller_on failed (%s)",
                  laser_status_name(laser_status));
        return SAFETY_ERROR_NOT_INITIALIZED;  // Map laser errors to safety error
    }

    LOG_DEBUG("safety_laser_on: laser activated safely");
    return SAFETY_OK;
}

safety_status_t safety_laser_off(void) {
    // Turning laser off is always safe - no checks needed
    if (laser_controller_is_initialized()) {
        laser_controller_off();
    }
    LOG_DEBUG("safety_laser_off: laser deactivated");
    return SAFETY_OK;
}

safety_status_t safety_laser_activate(uint32_t duration_ms) {
    if (!ctx.initialized) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // Cap duration to maximum safe on-time
    if (duration_ms > LASER_MAX_ON_TIME_MS) {
        duration_ms = LASER_MAX_ON_TIME_MS;
        LOG_WARN("safety_laser_activate: duration capped to %u ms", duration_ms);
    }

    // Perform all safety checks
    safety_result_t result;
    safety_status_t status = safety_check_all(&result);

    if (status != SAFETY_OK) {
        LOG_DEBUG("safety_laser_activate: blocked by safety check (%s)",
                  safety_status_name(status));
        return status;
    }

    // All checks passed - activate laser
    if (!laser_controller_is_initialized()) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    laser_status_t laser_status = laser_controller_on();
    if (laser_status != LASER_OK) {
        return SAFETY_ERROR_NOT_INITIALIZED;
    }

    // IMPORTANT: This function only INITIATES laser activation.
    // Caller is responsible for:
    // 1. Calling safety_update() periodically during operation
    // 2. Calling safety_laser_off() when duration has elapsed
    // The duration_ms parameter is used for logging/validation only.
    LOG_DEBUG("safety_laser_activate: laser activated (requested duration %u ms)", duration_ms);
    return SAFETY_OK;
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
    LOG_INFO("Safety layer cleanup complete");

    SAFETY_UNLOCK();
}
