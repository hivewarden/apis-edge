/**
 * Servo Controller implementation.
 *
 * Controls pan/tilt servos for laser aiming.
 * Supports Pi (GPIO PWM), ESP32 (LEDC), and test platforms.
 *
 * HARDWARE LIMITATIONS:
 * Position verification ("no overshooting" per AC6) cannot be fully implemented
 * with standard hobby servos that lack feedback. Standard servos are open-loop:
 * we command a position via PWM and trust the servo's internal controller.
 *
 * For true position feedback, hardware options include:
 * 1. Servo with potentiometer feedback (read via ADC)
 * 2. External encoder on the output shaft
 * 3. Servo with digital feedback protocol (e.g., Dynamixel)
 *
 * This implementation provides SOFTWARE watchdog detection:
 * - Movement timeout detection (if movement takes too long)
 * - Consecutive failure counting before triggering hardware fault
 * - On fault: laser disabled, LED set to error, callback invoked
 */

#include "servo_controller.h"
#include "log.h"
#include "platform.h"
#include "laser_controller.h"
#include "led_controller.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#endif

// ============================================================================
// GPIO Pin Definitions (from hardware spec)
// ============================================================================

#if defined(APIS_PLATFORM_PI)
#define GPIO_SERVO_PAN      18      // PWM0 capable
#define GPIO_SERVO_TILT     19      // PWM1 capable
#elif defined(APIS_PLATFORM_ESP32)
#define GPIO_SERVO_PAN      13      // Available on ESP32-CAM
#define GPIO_SERVO_TILT     15      // Available on ESP32-CAM
#define LEDC_CHANNEL_PAN    LEDC_CHANNEL_0
#define LEDC_CHANNEL_TILT   LEDC_CHANNEL_1
#define LEDC_TIMER          LEDC_TIMER_0
#define LEDC_MODE           LEDC_LOW_SPEED_MODE
#define LEDC_DUTY_RES       LEDC_TIMER_13_BIT   // 8192 levels
#endif

// ============================================================================
// Internal Constants
// ============================================================================

#define INTERPOLATION_TICK_MS   5       // Interpolation update interval
#define WATCHDOG_TIMEOUT_MS     1000    // Hardware check interval
#define POSITION_TIMEOUT_MS     200     // Max time to reach commanded position
#define POSITION_TOLERANCE_DEG  2.0f    // Acceptable position error in degrees

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static volatile bool g_hardware_ok = true;
static volatile bool g_is_moving = false;

// Current and target positions
static volatile float g_current_pan_deg = 0.0f;
static volatile float g_current_tilt_deg = SERVO_TILT_CENTER_DEG;
static volatile float g_target_pan_deg = 0.0f;
static volatile float g_target_tilt_deg = SERVO_TILT_CENTER_DEG;

// Interpolation state
static volatile int g_interp_step = 0;
static volatile int g_interp_total_steps = 0;
static volatile float g_interp_start_pan = 0.0f;
static volatile float g_interp_start_tilt = 0.0f;

// Failure detection state
static volatile uint64_t g_last_move_cmd_time_ms = 0;
static volatile bool g_awaiting_position_confirm = false;
static volatile uint32_t g_consecutive_failures = 0;
#define MAX_CONSECUTIVE_FAILURES 3  // Trigger hardware fault after this many failures

// Statistics
static volatile uint32_t g_move_count = 0;
static volatile uint32_t g_clamp_count = 0;
static volatile uint64_t g_init_time_ms = 0;

// Failure callback
static servo_failure_callback_t g_failure_callback = NULL;
static void *g_failure_user_data = NULL;

// Thread synchronization
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_interpolation_thread;
#else
static TaskHandle_t g_interpolation_task = NULL;
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(servo);
#define SERVO_LOCK()   APIS_MUTEX_LOCK(servo)
#define SERVO_UNLOCK() APIS_MUTEX_UNLOCK(servo)

// Utility Functions
#include "time_util.h"

/**
 * Handle hardware failure detection.
 * This function is called when a servo failure is detected.
 * It disables the laser immediately, sets LED to error state,
 * and invokes the registered failure callback.
 *
 * @param axis The axis that failed (or SERVO_AXIS_PAN if unknown)
 * @param reason Human-readable description of the failure
 */
static void handle_hardware_failure(servo_axis_t axis, const char *reason) {
    // Only process if we haven't already flagged hardware failure
    if (!g_hardware_ok) {
        return;
    }

    LOG_ERROR("Servo hardware failure detected: %s (axis: %s)",
              reason, servo_axis_name(axis));

    // Set hardware fault flag
    g_hardware_ok = false;

    // C7-H2 fix: Copy callback pointer under lock, invoke outside
    servo_failure_callback_t cb = g_failure_callback;
    void *cb_data = g_failure_user_data;

    // C7-H1 fix: Release servo lock before calling laser/LED controller functions
    // to prevent lock ordering violation (servo_mutex -> g_mutex)
    SERVO_UNLOCK();

    // SAFETY: Immediately disable laser when servo fails
    // This is critical per AC10: "laser is immediately disabled"
    if (laser_controller_is_initialized()) {
        laser_controller_off();
        laser_controller_disarm();
        LOG_WARN("Laser disabled due to servo failure");
    }

    // Set LED to servo-specific error state per AC12: "LED indicates fault"
    if (led_controller_is_initialized()) {
        led_controller_set_state(LED_STATE_SERVO_FAIL);
        LOG_INFO("LED set to SERVO_FAIL state (triple red blink)");
    }

    // C7-H2 fix: Invoke failure callback outside the lock
    if (cb != NULL) {
        cb(axis, cb_data);
    }

    // Re-acquire the servo lock (caller expects it held)
    SERVO_LOCK();
}

const char *servo_status_name(servo_status_t status) {
    switch (status) {
        case SERVO_OK:                      return "OK";
        case SERVO_ERROR_NOT_INITIALIZED:   return "NOT_INITIALIZED";
        case SERVO_ERROR_INVALID_AXIS:      return "INVALID_AXIS";
        case SERVO_ERROR_ANGLE_CLAMPED:     return "ANGLE_CLAMPED";
        case SERVO_ERROR_HARDWARE:          return "HARDWARE_ERROR";
        case SERVO_ERROR_NO_MEMORY:         return "NO_MEMORY";
        case SERVO_ERROR_BUSY:              return "BUSY";
        default:                            return "UNKNOWN";
    }
}

const char *servo_axis_name(servo_axis_t axis) {
    switch (axis) {
        case SERVO_AXIS_PAN:  return "PAN";
        case SERVO_AXIS_TILT: return "TILT";
        default:              return "UNKNOWN";
    }
}

// ============================================================================
// Angle/PWM Conversion
// ============================================================================

float servo_controller_clamp_angle(servo_axis_t axis, float angle_deg) {
    float min_deg, max_deg;

    if (axis == SERVO_AXIS_PAN) {
        min_deg = SERVO_PAN_MIN_DEG;
        max_deg = SERVO_PAN_MAX_DEG;
    } else if (axis == SERVO_AXIS_TILT) {
        min_deg = SERVO_TILT_MIN_DEG;
        max_deg = SERVO_TILT_MAX_DEG;
    } else {
        return 0.0f;  // Invalid axis, return center
    }

    if (angle_deg < min_deg) return min_deg;
    if (angle_deg > max_deg) return max_deg;
    return angle_deg;
}

bool servo_controller_is_angle_valid(servo_axis_t axis, float angle_deg) {
    float clamped = servo_controller_clamp_angle(axis, angle_deg);
    // Use small epsilon for floating point comparison
    return fabsf(clamped - angle_deg) < 0.01f;
}

uint32_t servo_controller_angle_to_pwm(servo_axis_t axis, float angle_deg) {
    float min_deg, max_deg;

    if (axis == SERVO_AXIS_PAN) {
        min_deg = SERVO_PAN_MIN_DEG;
        max_deg = SERVO_PAN_MAX_DEG;
    } else if (axis == SERVO_AXIS_TILT) {
        min_deg = SERVO_TILT_MIN_DEG;
        max_deg = SERVO_TILT_MAX_DEG;
    } else {
        return SERVO_PULSE_CENTER_US;
    }

    // Clamp to valid range
    float clamped = servo_controller_clamp_angle(axis, angle_deg);

    // Linear interpolation: angle -> pulse width
    float range_deg = max_deg - min_deg;
    float normalized = (clamped - min_deg) / range_deg;  // 0.0 to 1.0

    uint32_t pulse_us = SERVO_PULSE_MIN_US +
        (uint32_t)(normalized * (SERVO_PULSE_MAX_US - SERVO_PULSE_MIN_US));

    return pulse_us;
}

float servo_controller_pwm_to_angle(servo_axis_t axis, uint32_t pulse_us) {
    float min_deg, max_deg;

    if (axis == SERVO_AXIS_PAN) {
        min_deg = SERVO_PAN_MIN_DEG;
        max_deg = SERVO_PAN_MAX_DEG;
    } else if (axis == SERVO_AXIS_TILT) {
        min_deg = SERVO_TILT_MIN_DEG;
        max_deg = SERVO_TILT_MAX_DEG;
    } else {
        return 0.0f;
    }

    // Clamp pulse to valid range
    if (pulse_us < SERVO_PULSE_MIN_US) pulse_us = SERVO_PULSE_MIN_US;
    if (pulse_us > SERVO_PULSE_MAX_US) pulse_us = SERVO_PULSE_MAX_US;

    // Linear interpolation: pulse width -> angle
    float normalized = (float)(pulse_us - SERVO_PULSE_MIN_US) /
                       (float)(SERVO_PULSE_MAX_US - SERVO_PULSE_MIN_US);

    float angle_deg = min_deg + normalized * (max_deg - min_deg);
    return angle_deg;
}

// ============================================================================
// Hardware Control (Platform-specific)
// ============================================================================

#if defined(APIS_PLATFORM_PI)

// Pi PWM via sysfs interface
// Note: Requires /sys/class/pwm/pwmchipX to be available
// On Pi 5, hardware PWM is on pwmchip2, channels 0 (GPIO18) and 1 (GPIO19)

#define PWM_CHIP_PATH "/sys/class/pwm/pwmchip2"
#define PWM_PAN_CHANNEL  0
#define PWM_TILT_CHANNEL 1

static bool g_pwm_mock_mode = false;  // Fall back to mock if sysfs unavailable

static int write_to_file(const char *path, const char *value) {
    FILE *f = fopen(path, "w");
    if (f == NULL) {
        return -1;
    }
    int result = fprintf(f, "%s", value);
    fclose(f);
    return (result > 0) ? 0 : -1;
}

static int write_uint_to_file(const char *path, uint32_t value) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%u", value);
    return write_to_file(path, buf);
}

static int pwm_export_channel(int channel) {
    char path[128];
    char export_path[128];
    char channel_str[8];

    // Check if already exported
    snprintf(path, sizeof(path), "%s/pwm%d", PWM_CHIP_PATH, channel);
    FILE *test = fopen(path, "r");
    if (test != NULL) {
        fclose(test);
        return 0;  // Already exported
    }

    // Export the channel
    snprintf(export_path, sizeof(export_path), "%s/export", PWM_CHIP_PATH);
    snprintf(channel_str, sizeof(channel_str), "%d", channel);
    return write_to_file(export_path, channel_str);
}

static int pwm_configure_channel(int channel, uint32_t period_ns) {
    char path[128];

    // Set period (20ms = 20000000 ns for 50Hz servo)
    snprintf(path, sizeof(path), "%s/pwm%d/period", PWM_CHIP_PATH, channel);
    if (write_uint_to_file(path, period_ns) != 0) {
        return -1;
    }

    // Enable the channel
    snprintf(path, sizeof(path), "%s/pwm%d/enable", PWM_CHIP_PATH, channel);
    if (write_to_file(path, "1") != 0) {
        return -1;
    }

    return 0;
}

static void pwm_init(void) {
    uint32_t period_ns = SERVO_PWM_PERIOD_US * 1000;  // Convert us to ns

    // Try to initialize hardware PWM
    if (pwm_export_channel(PWM_PAN_CHANNEL) != 0 ||
        pwm_export_channel(PWM_TILT_CHANNEL) != 0) {
        LOG_WARN("PWM sysfs export failed - running in mock mode. "
                 "Ensure dtoverlay=pwm-2chan is in /boot/config.txt");
        g_pwm_mock_mode = true;
    } else if (pwm_configure_channel(PWM_PAN_CHANNEL, period_ns) != 0 ||
               pwm_configure_channel(PWM_TILT_CHANNEL, period_ns) != 0) {
        LOG_WARN("PWM configuration failed - running in mock mode");
        g_pwm_mock_mode = true;
    } else {
        g_pwm_mock_mode = false;
        LOG_INFO("PWM initialized (Pi sysfs) - channels %d (pan), %d (tilt)",
                 PWM_PAN_CHANNEL, PWM_TILT_CHANNEL);
    }

    if (g_pwm_mock_mode) {
        LOG_DEBUG("PWM mock mode active - GPIO %d (pan), GPIO %d (tilt)",
                  GPIO_SERVO_PAN, GPIO_SERVO_TILT);
    }
}

static void pwm_set_pulse(servo_axis_t axis, uint32_t pulse_us) {
    if (g_pwm_mock_mode) {
        // Mock mode: just log
        LOG_DEBUG("PWM (mock): %s = %u us", servo_axis_name(axis), pulse_us);
        return;
    }

    int channel = (axis == SERVO_AXIS_PAN) ? PWM_PAN_CHANNEL : PWM_TILT_CHANNEL;
    char path[128];
    uint32_t duty_ns = pulse_us * 1000;  // Convert us to ns

    snprintf(path, sizeof(path), "%s/pwm%d/duty_cycle", PWM_CHIP_PATH, channel);
    if (write_uint_to_file(path, duty_ns) != 0) {
        LOG_WARN("Failed to set PWM duty cycle for channel %d", channel);
    }
}

static void pwm_cleanup(void) {
    if (!g_pwm_mock_mode) {
        char path[128];

        // Disable channels
        snprintf(path, sizeof(path), "%s/pwm%d/enable", PWM_CHIP_PATH, PWM_PAN_CHANNEL);
        write_to_file(path, "0");
        snprintf(path, sizeof(path), "%s/pwm%d/enable", PWM_CHIP_PATH, PWM_TILT_CHANNEL);
        write_to_file(path, "0");

        LOG_INFO("PWM cleanup (Pi sysfs)");
    } else {
        LOG_DEBUG("PWM cleanup (mock mode)");
    }
}

#elif defined(APIS_PLATFORM_ESP32)

static void pwm_init(void) {
    // Configure LEDC timer
    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_MODE,
        .duty_resolution = LEDC_DUTY_RES,
        .timer_num = LEDC_TIMER,
        .freq_hz = SERVO_PWM_FREQUENCY_HZ,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&timer_conf);

    // Configure pan channel
    ledc_channel_config_t pan_conf = {
        .gpio_num = GPIO_SERVO_PAN,
        .speed_mode = LEDC_MODE,
        .channel = LEDC_CHANNEL_PAN,
        .timer_sel = LEDC_TIMER,
        .duty = 0,
        .hpoint = 0
    };
    ledc_channel_config(&pan_conf);

    // Configure tilt channel
    ledc_channel_config_t tilt_conf = {
        .gpio_num = GPIO_SERVO_TILT,
        .speed_mode = LEDC_MODE,
        .channel = LEDC_CHANNEL_TILT,
        .timer_sel = LEDC_TIMER,
        .duty = 0,
        .hpoint = 0
    };
    ledc_channel_config(&tilt_conf);

    LOG_DEBUG("PWM initialized (ESP32)");
}

static void pwm_set_pulse(servo_axis_t axis, uint32_t pulse_us) {
    ledc_channel_t channel = (axis == SERVO_AXIS_PAN) ?
                             LEDC_CHANNEL_PAN : LEDC_CHANNEL_TILT;

    // Convert pulse width to duty cycle
    // LEDC_DUTY_RES = 13 bits = 8192 levels
    // Period = 20000us, so duty = (pulse_us / 20000) * 8192
    uint32_t duty = (pulse_us * 8192) / SERVO_PWM_PERIOD_US;

    ledc_set_duty(LEDC_MODE, channel, duty);
    ledc_update_duty(LEDC_MODE, channel);
}

static void pwm_cleanup(void) {
    ledc_stop(LEDC_MODE, LEDC_CHANNEL_PAN, 0);
    ledc_stop(LEDC_MODE, LEDC_CHANNEL_TILT, 0);
    LOG_DEBUG("PWM cleanup (ESP32)");
}

#else // APIS_PLATFORM_TEST

static uint32_t g_test_pan_pulse_us = SERVO_PULSE_CENTER_US;
static uint32_t g_test_tilt_pulse_us = SERVO_PULSE_CENTER_US;

static void pwm_init(void) {
    g_test_pan_pulse_us = SERVO_PULSE_CENTER_US;
    g_test_tilt_pulse_us = SERVO_PULSE_CENTER_US;
    LOG_DEBUG("PWM initialized (test mock)");
}

static void pwm_set_pulse(servo_axis_t axis, uint32_t pulse_us) {
    if (axis == SERVO_AXIS_PAN) {
        g_test_pan_pulse_us = pulse_us;
    } else if (axis == SERVO_AXIS_TILT) {
        g_test_tilt_pulse_us = pulse_us;
    }
    LOG_DEBUG("PWM set: %s = %u us", servo_axis_name(axis), pulse_us);
}

static void pwm_cleanup(void) {
    LOG_DEBUG("PWM cleanup (test mock)");
}

#endif

// ============================================================================
// Internal Movement Functions
// ============================================================================

static void apply_position(float pan_deg, float tilt_deg) {
    uint32_t pan_pulse = servo_controller_angle_to_pwm(SERVO_AXIS_PAN, pan_deg);
    uint32_t tilt_pulse = servo_controller_angle_to_pwm(SERVO_AXIS_TILT, tilt_deg);

    pwm_set_pulse(SERVO_AXIS_PAN, pan_pulse);
    pwm_set_pulse(SERVO_AXIS_TILT, tilt_pulse);

    g_current_pan_deg = pan_deg;
    g_current_tilt_deg = tilt_deg;
}

static void update_interpolation(void) {
    if (!g_is_moving || g_interp_step >= g_interp_total_steps) {
        if (g_is_moving && g_interp_step >= g_interp_total_steps) {
            // Movement complete - mark for position confirmation
            g_awaiting_position_confirm = true;
            g_last_move_cmd_time_ms = get_time_ms();
            g_consecutive_failures = 0;  // Reset on successful completion
        }
        g_is_moving = false;
        return;
    }

    g_interp_step++;
    float t = (float)g_interp_step / (float)g_interp_total_steps;

    // Linear interpolation (could use easing for smoother motion)
    float pan_deg = g_interp_start_pan + t * (g_target_pan_deg - g_interp_start_pan);
    float tilt_deg = g_interp_start_tilt + t * (g_target_tilt_deg - g_interp_start_tilt);

    apply_position(pan_deg, tilt_deg);

    if (g_interp_step >= g_interp_total_steps) {
        g_is_moving = false;
        g_awaiting_position_confirm = false;  // Position reached
        LOG_DEBUG("Movement complete: pan=%.1f°, tilt=%.1f°",
                  g_current_pan_deg, g_current_tilt_deg);
    }
}

/**
 * Check for hardware failures based on timing and position.
 * This implements a watchdog that detects when:
 * 1. Movement takes too long to complete
 * 2. Position never stabilizes after command
 *
 * Note: True position feedback requires ADC reading of servo potentiometer
 * or encoder hardware. This software watchdog detects gross failures.
 */
static void check_hardware_watchdog(void) {
    if (!g_hardware_ok) {
        return;  // Already in fault state
    }

    // Check for movement timeout
    if (g_is_moving && g_last_move_cmd_time_ms > 0) {
        uint64_t elapsed = get_time_ms() - g_last_move_cmd_time_ms;
        if (elapsed > (SERVO_MOVE_TIME_MS * 4)) {  // Allow 4x expected time
            g_consecutive_failures++;
            LOG_WARN("Servo movement timeout: %llu ms (expected ~%d ms), failure count: %u",
                     (unsigned long long)elapsed, SERVO_MOVE_TIME_MS, g_consecutive_failures);

            if (g_consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
                handle_hardware_failure(SERVO_AXIS_PAN, "Movement timeout exceeded");
            }
        }
    }
}

// ============================================================================
// Interpolation Thread/Task
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static void *interpolation_thread_func(void *arg) {
    (void)arg;
    static uint32_t watchdog_counter = 0;

    LOG_DEBUG("Servo interpolation thread started");

    while (g_running) {
        SERVO_LOCK();
        if (g_is_moving) {
            update_interpolation();
        }

        // Run hardware watchdog check periodically (every ~100ms)
        watchdog_counter++;
        if (watchdog_counter >= (100 / INTERPOLATION_TICK_MS)) {
            check_hardware_watchdog();
            watchdog_counter = 0;
        }
        SERVO_UNLOCK();

        apis_sleep_ms(INTERPOLATION_TICK_MS);
    }

    LOG_DEBUG("Servo interpolation thread exiting");
    return NULL;
}

#else // ESP32

static void interpolation_task_func(void *arg) {
    (void)arg;
    static uint32_t watchdog_counter = 0;

    LOG_DEBUG("Servo interpolation task started");

    while (g_running) {
        SERVO_LOCK();
        if (g_is_moving) {
            update_interpolation();
        }

        // Run hardware watchdog check periodically (every ~100ms)
        watchdog_counter++;
        if (watchdog_counter >= (100 / INTERPOLATION_TICK_MS)) {
            check_hardware_watchdog();
            watchdog_counter = 0;
        }
        SERVO_UNLOCK();

        vTaskDelay(pdMS_TO_TICKS(INTERPOLATION_TICK_MS));
    }

    LOG_DEBUG("Servo interpolation task exiting");
    g_interpolation_task = NULL;
    vTaskDelete(NULL);
}

#endif

// ============================================================================
// Public API Implementation
// ============================================================================

servo_status_t servo_controller_init(void) {
    if (g_initialized) {
        LOG_WARN("Servo controller already initialized");
        return SERVO_OK;
    }

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(servo);

    // Initialize PWM hardware
    pwm_init();

    // Reset state
    g_move_count = 0;
    g_clamp_count = 0;
    g_hardware_ok = true;
    g_is_moving = false;
    g_init_time_ms = get_time_ms();

    // Move to home position
    g_current_pan_deg = SERVO_PAN_CENTER_DEG;
    g_current_tilt_deg = SERVO_TILT_CENTER_DEG;
    g_target_pan_deg = SERVO_PAN_CENTER_DEG;
    g_target_tilt_deg = SERVO_TILT_CENTER_DEG;

    apply_position(g_current_pan_deg, g_current_tilt_deg);

    // Start interpolation thread
    g_running = true;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    if (pthread_create(&g_interpolation_thread, NULL, interpolation_thread_func, NULL) != 0) {
        LOG_ERROR("Failed to create servo interpolation thread");
        g_running = false;
        return SERVO_ERROR_NO_MEMORY;
    }
#else
    xTaskCreate(interpolation_task_func, "servo_interp", 2048, NULL, 5, &g_interpolation_task);
#endif

    g_initialized = true;
    LOG_INFO("Servo controller initialized (home position: pan=%.1f°, tilt=%.1f°)",
             g_current_pan_deg, g_current_tilt_deg);

    return SERVO_OK;
}

servo_status_t servo_controller_move(servo_position_t position) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    servo_status_t result = SERVO_OK;

    SERVO_LOCK();

    // Clamp angles to safe limits
    float clamped_pan = servo_controller_clamp_angle(SERVO_AXIS_PAN, position.pan_deg);
    float clamped_tilt = servo_controller_clamp_angle(SERVO_AXIS_TILT, position.tilt_deg);

    if (clamped_pan != position.pan_deg || clamped_tilt != position.tilt_deg) {
        g_clamp_count++;
        LOG_WARN("Angle clamped: requested (%.1f, %.1f) -> (%.1f, %.1f)",
                 position.pan_deg, position.tilt_deg, clamped_pan, clamped_tilt);
        result = SERVO_ERROR_ANGLE_CLAMPED;
    }

    // Set up interpolation
    g_interp_start_pan = g_current_pan_deg;
    g_interp_start_tilt = g_current_tilt_deg;
    g_target_pan_deg = clamped_pan;
    g_target_tilt_deg = clamped_tilt;
    g_interp_step = 0;
    g_interp_total_steps = SERVO_MOVE_TIME_MS / INTERPOLATION_TICK_MS;
    if (g_interp_total_steps < 1) g_interp_total_steps = 1;

    g_move_count++;
    g_is_moving = true;

    LOG_DEBUG("Movement started: (%.1f, %.1f) -> (%.1f, %.1f) in %d steps",
              g_interp_start_pan, g_interp_start_tilt,
              g_target_pan_deg, g_target_tilt_deg, g_interp_total_steps);

    SERVO_UNLOCK();

    return result;
}

servo_status_t servo_controller_move_axis(servo_axis_t axis, float angle_deg) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    if (axis >= SERVO_AXIS_COUNT) {
        return SERVO_ERROR_INVALID_AXIS;
    }

    servo_position_t pos;

    SERVO_LOCK();
    pos.pan_deg = g_current_pan_deg;
    pos.tilt_deg = g_current_tilt_deg;
    SERVO_UNLOCK();

    if (axis == SERVO_AXIS_PAN) {
        pos.pan_deg = angle_deg;
    } else {
        pos.tilt_deg = angle_deg;
    }

    return servo_controller_move(pos);
}

servo_status_t servo_controller_move_immediate(servo_position_t position) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    servo_status_t result = SERVO_OK;

    SERVO_LOCK();

    // Stop any ongoing interpolation
    g_is_moving = false;

    // Clamp angles
    float clamped_pan = servo_controller_clamp_angle(SERVO_AXIS_PAN, position.pan_deg);
    float clamped_tilt = servo_controller_clamp_angle(SERVO_AXIS_TILT, position.tilt_deg);

    if (clamped_pan != position.pan_deg || clamped_tilt != position.tilt_deg) {
        g_clamp_count++;
        result = SERVO_ERROR_ANGLE_CLAMPED;
    }

    // Apply immediately
    apply_position(clamped_pan, clamped_tilt);
    g_target_pan_deg = clamped_pan;
    g_target_tilt_deg = clamped_tilt;
    g_move_count++;

    LOG_DEBUG("Immediate move: pan=%.1f°, tilt=%.1f°", clamped_pan, clamped_tilt);

    SERVO_UNLOCK();

    return result;
}

servo_status_t servo_controller_home(void) {
    servo_position_t home = {
        .pan_deg = SERVO_PAN_CENTER_DEG,
        .tilt_deg = SERVO_TILT_CENTER_DEG
    };
    LOG_INFO("Returning to home position");
    return servo_controller_move(home);
}

servo_status_t servo_controller_get_position(servo_position_t *position) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    if (position == NULL) {
        return SERVO_ERROR_INVALID_AXIS;
    }

    SERVO_LOCK();
    position->pan_deg = g_current_pan_deg;
    position->tilt_deg = g_current_tilt_deg;
    SERVO_UNLOCK();

    return SERVO_OK;
}

bool servo_controller_is_moving(void) {
    if (!g_initialized) return false;

    SERVO_LOCK();
    bool moving = g_is_moving;
    SERVO_UNLOCK();

    return moving;
}

servo_status_t servo_controller_get_stats(servo_stats_t *stats) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    if (stats == NULL) {
        return SERVO_ERROR_INVALID_AXIS;
    }

    SERVO_LOCK();
    stats->move_count = g_move_count;
    stats->clamp_count = g_clamp_count;
    stats->current_pan_deg = g_current_pan_deg;
    stats->current_tilt_deg = g_current_tilt_deg;
    stats->is_moving = g_is_moving;
    stats->hardware_ok = g_hardware_ok;
    stats->uptime_ms = get_time_ms() - g_init_time_ms;
    SERVO_UNLOCK();

    return SERVO_OK;
}

void servo_controller_set_failure_callback(servo_failure_callback_t callback, void *user_data) {
    SERVO_LOCK();
    g_failure_callback = callback;
    g_failure_user_data = user_data;
    SERVO_UNLOCK();
}

bool servo_controller_is_initialized(void) {
    return g_initialized;
}

bool servo_controller_is_hardware_ok(void) {
    return g_initialized && g_hardware_ok;
}

servo_status_t servo_controller_self_test(void) {
    if (!g_initialized) {
        return SERVO_ERROR_NOT_INITIALIZED;
    }

    LOG_INFO("Starting servo self-test sequence...");

    servo_status_t status;
    servo_position_t test_positions[] = {
        // Test pan limits
        {SERVO_PAN_MIN_DEG, SERVO_TILT_CENTER_DEG},   // Pan left
        {SERVO_PAN_MAX_DEG, SERVO_TILT_CENTER_DEG},   // Pan right
        {SERVO_PAN_CENTER_DEG, SERVO_TILT_CENTER_DEG}, // Pan center

        // Test tilt limits
        {SERVO_PAN_CENTER_DEG, SERVO_TILT_MIN_DEG},   // Tilt down (max)
        {SERVO_PAN_CENTER_DEG, SERVO_TILT_MAX_DEG},   // Tilt up (min, horizontal)
        {SERVO_PAN_CENTER_DEG, SERVO_TILT_CENTER_DEG}, // Tilt center

        // Return home
        {SERVO_PAN_CENTER_DEG, SERVO_TILT_CENTER_DEG}
    };

    int num_positions = sizeof(test_positions) / sizeof(test_positions[0]);

    for (int i = 0; i < num_positions; i++) {
        status = servo_controller_move(test_positions[i]);
        if (status != SERVO_OK && status != SERVO_ERROR_ANGLE_CLAMPED) {
            LOG_ERROR("Self-test failed at position %d: %s",
                      i, servo_status_name(status));
            return status;
        }

        // Wait for movement to complete
        int wait_count = 0;
        while (servo_controller_is_moving() && wait_count < 20) {
            apis_sleep_ms(10);
            wait_count++;
        }

        if (servo_controller_is_moving()) {
            LOG_ERROR("Self-test failed: movement timeout at position %d", i);
            return SERVO_ERROR_HARDWARE;
        }

        // Check hardware status
        if (!g_hardware_ok) {
            LOG_ERROR("Self-test failed: hardware fault detected at position %d", i);
            return SERVO_ERROR_HARDWARE;
        }

        LOG_DEBUG("Self-test position %d OK: pan=%.1f°, tilt=%.1f°",
                  i, test_positions[i].pan_deg, test_positions[i].tilt_deg);
    }

    LOG_INFO("Servo self-test completed successfully");
    return SERVO_OK;
}

void servo_controller_cleanup(void) {
    if (!g_initialized) return;

    g_running = false;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_join(g_interpolation_thread, NULL);
#else
    // ESP32: Wait for task to finish
    for (int i = 0; i < 10 && g_interpolation_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(INTERPOLATION_TICK_MS + 10));
    }
    g_interpolation_task = NULL;

    /* Mutex cleanup handled by platform_mutex lifecycle */
#endif

    pwm_cleanup();

    g_initialized = false;
    LOG_INFO("Servo controller cleanup complete");
}
