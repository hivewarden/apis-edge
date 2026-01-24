/**
 * Servo Controller implementation.
 *
 * Controls pan/tilt servos for laser aiming.
 * Supports Pi (GPIO PWM), ESP32 (LEDC), and test platforms.
 */

#include "servo_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
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
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define SERVO_LOCK()   pthread_mutex_lock(&g_mutex)
#define SERVO_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_servo_mutex = NULL;
static TaskHandle_t g_interpolation_task = NULL;
#define SERVO_LOCK()   do { if (g_servo_mutex) xSemaphoreTake(g_servo_mutex, portMAX_DELAY); } while(0)
#define SERVO_UNLOCK() do { if (g_servo_mutex) xSemaphoreGive(g_servo_mutex); } while(0)
#endif

// ============================================================================
// Utility Functions
// ============================================================================

static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
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

static void pwm_init(void) {
    // TODO: Initialize PWM using pigpio or /sys/class/pwm
    // For now, placeholder
    LOG_DEBUG("PWM initialized (Pi) - GPIO %d (pan), GPIO %d (tilt)",
              GPIO_SERVO_PAN, GPIO_SERVO_TILT);
}

static void pwm_set_pulse(servo_axis_t axis, uint32_t pulse_us) {
    int gpio = (axis == SERVO_AXIS_PAN) ? GPIO_SERVO_PAN : GPIO_SERVO_TILT;
    // TODO: Set actual PWM pulse width
    LOG_DEBUG("PWM set: GPIO %d = %u us", gpio, pulse_us);
    (void)gpio;
    (void)pulse_us;
}

static void pwm_cleanup(void) {
    // TODO: Cleanup PWM
    LOG_DEBUG("PWM cleanup (Pi)");
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
        LOG_DEBUG("Movement complete: pan=%.1f°, tilt=%.1f°",
                  g_current_pan_deg, g_current_tilt_deg);
    }
}

// ============================================================================
// Interpolation Thread/Task
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static void *interpolation_thread_func(void *arg) {
    (void)arg;

    LOG_DEBUG("Servo interpolation thread started");

    while (g_running) {
        SERVO_LOCK();
        if (g_is_moving) {
            update_interpolation();
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

    LOG_DEBUG("Servo interpolation task started");

    while (g_running) {
        SERVO_LOCK();
        if (g_is_moving) {
            update_interpolation();
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

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Create mutex
    if (g_servo_mutex == NULL) {
        g_servo_mutex = xSemaphoreCreateMutex();
        if (g_servo_mutex == NULL) {
            LOG_ERROR("Failed to create servo mutex");
            return SERVO_ERROR_NO_MEMORY;
        }
    }
#endif

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

    if (g_servo_mutex != NULL) {
        vSemaphoreDelete(g_servo_mutex);
        g_servo_mutex = NULL;
    }
#endif

    pwm_cleanup();

    g_initialized = false;
    LOG_INFO("Servo controller cleanup complete");
}
