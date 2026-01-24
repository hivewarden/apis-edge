/**
 * Targeting System implementation.
 *
 * Orchestrates detection -> aiming -> laser activation with sweep pattern.
 */

#include "targeting.h"
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
#include "freertos/semphr.h"
#endif

// ============================================================================
// Constants
// ============================================================================

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile target_state_t g_state = TARGET_STATE_IDLE;
static target_info_t g_current_target;
static uint64_t g_init_time = 0;

// Sweep configuration
static volatile float g_sweep_amplitude = TARGET_SWEEP_AMPLITUDE_DEG;
static volatile float g_sweep_frequency = TARGET_SWEEP_FREQUENCY_HZ;
static volatile uint64_t g_sweep_start_time = 0;

// Statistics
static volatile uint32_t g_target_count = 0;
static volatile uint32_t g_lost_count = 0;
static volatile uint32_t g_multi_target_count = 0;
static volatile uint32_t g_sweep_cycles = 0;
static volatile uint64_t g_total_track_time = 0;
static volatile uint32_t g_last_sweep_cycle = 0;

// Callbacks
static target_state_callback_t g_state_callback = NULL;
static void *g_state_callback_data = NULL;
static target_acquired_callback_t g_acquired_callback = NULL;
static void *g_acquired_callback_data = NULL;
static target_lost_callback_t g_lost_callback = NULL;
static void *g_lost_callback_data = NULL;

// Thread synchronization
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define TARGET_LOCK()   pthread_mutex_lock(&g_mutex)
#define TARGET_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_target_mutex = NULL;
#define TARGET_LOCK()   do { if (g_target_mutex) xSemaphoreTake(g_target_mutex, portMAX_DELAY); } while(0)
#define TARGET_UNLOCK() do { if (g_target_mutex) xSemaphoreGive(g_target_mutex); } while(0)
#endif

// ============================================================================
// Utility Functions
// ============================================================================

static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
}

const char *target_state_name(target_state_t state) {
    switch (state) {
        case TARGET_STATE_IDLE:       return "IDLE";
        case TARGET_STATE_ACQUIRING:  return "ACQUIRING";
        case TARGET_STATE_TRACKING:   return "TRACKING";
        case TARGET_STATE_LOST:       return "LOST";
        case TARGET_STATE_COOLDOWN:   return "COOLDOWN";
        default:                      return "UNKNOWN";
    }
}

const char *target_status_name(target_status_t status) {
    switch (status) {
        case TARGET_OK:                   return "OK";
        case TARGET_ERROR_NOT_INITIALIZED: return "NOT_INITIALIZED";
        case TARGET_ERROR_INVALID_PARAM:  return "INVALID_PARAM";
        case TARGET_ERROR_NOT_ARMED:      return "NOT_ARMED";
        case TARGET_ERROR_NO_TARGET:      return "NO_TARGET";
        case TARGET_ERROR_HARDWARE:       return "HARDWARE";
        default:                          return "UNKNOWN";
    }
}

static void set_state(target_state_t new_state) {
    if (g_state != new_state) {
        target_state_t old_state = g_state;
        g_state = new_state;
        LOG_DEBUG("Targeting state: %s -> %s",
                  target_state_name(old_state), target_state_name(new_state));

        if (g_state_callback != NULL) {
            g_state_callback(new_state, g_state_callback_data);
        }
    }
}

// ============================================================================
// Target Selection
// ============================================================================

/**
 * Select best target from detections.
 * Priority: largest bounding box area.
 */
static int select_best_target(const detection_box_t *detections, uint32_t count) {
    if (detections == NULL || count == 0) {
        return -1;
    }

    int best_idx = -1;
    int32_t best_area = TARGET_MIN_AREA_PX;

    for (uint32_t i = 0; i < count; i++) {
        int32_t area = detections[i].width * detections[i].height;
        if (area > best_area) {
            best_area = area;
            best_idx = (int)i;
        }
    }

    if (count > 1) {
        g_multi_target_count++;
        LOG_DEBUG("Multiple targets (%u), selected index %d (area %d)",
                  count, best_idx, best_area);
    }

    return best_idx;
}

/**
 * Calculate centroid from detection box.
 */
static pixel_coord_t box_to_centroid(const detection_box_t *box) {
    pixel_coord_t centroid;
    centroid.x = box->x + box->width / 2;
    centroid.y = box->y + box->height / 2;
    return centroid;
}

// ============================================================================
// Sweep Pattern
// ============================================================================

/**
 * Calculate sweep offset based on time.
 * Returns sinusoidal offset in degrees.
 */
static float calculate_sweep_offset(uint64_t time_ms) {
    // Time since sweep started
    uint64_t elapsed = time_ms - g_sweep_start_time;

    // Calculate phase (0 to 2π over one cycle)
    float period_ms = 1000.0f / g_sweep_frequency;
    float phase = (float)(elapsed % (uint64_t)period_ms) / period_ms * 2.0f * (float)M_PI;

    // Count cycles for statistics
    uint32_t current_cycle = (uint32_t)(elapsed / (uint64_t)period_ms);
    if (current_cycle > g_last_sweep_cycle) {
        g_sweep_cycles += (current_cycle - g_last_sweep_cycle);
        g_last_sweep_cycle = current_cycle;
    }

    // Sinusoidal offset
    return g_sweep_amplitude * sinf(phase);
}

/**
 * Apply sweep pattern to target position.
 */
static servo_position_t apply_sweep(servo_position_t base, uint64_t time_ms) {
    float offset = calculate_sweep_offset(time_ms);

    servo_position_t swept;
    swept.pan_deg = base.pan_deg + offset;
    swept.tilt_deg = base.tilt_deg;  // Only horizontal sweep

    // Clamp to safe limits
    swept.pan_deg = servo_controller_clamp_angle(SERVO_AXIS_PAN, swept.pan_deg);
    swept.tilt_deg = servo_controller_clamp_angle(SERVO_AXIS_TILT, swept.tilt_deg);

    return swept;
}

// ============================================================================
// Public API Implementation
// ============================================================================

target_status_t targeting_init(void) {
    if (g_initialized) {
        LOG_WARN("Targeting system already initialized");
        return TARGET_OK;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_target_mutex == NULL) {
        g_target_mutex = xSemaphoreCreateMutex();
        if (g_target_mutex == NULL) {
            LOG_ERROR("Failed to create targeting mutex");
            return TARGET_ERROR_HARDWARE;
        }
    }
#endif

    // Reset state
    g_state = TARGET_STATE_IDLE;
    memset(&g_current_target, 0, sizeof(g_current_target));
    g_init_time = get_time_ms();

    // Reset configuration
    g_sweep_amplitude = TARGET_SWEEP_AMPLITUDE_DEG;
    g_sweep_frequency = TARGET_SWEEP_FREQUENCY_HZ;
    g_sweep_start_time = 0;
    g_last_sweep_cycle = 0;

    // Reset statistics
    g_target_count = 0;
    g_lost_count = 0;
    g_multi_target_count = 0;
    g_sweep_cycles = 0;
    g_total_track_time = 0;

    g_initialized = true;
    LOG_INFO("Targeting system initialized");

    return TARGET_OK;
}

target_status_t targeting_process_detections(const detection_box_t *detections, uint32_t count) {
    if (!g_initialized) {
        return TARGET_ERROR_NOT_INITIALIZED;
    }

    TARGET_LOCK();

    uint64_t now = get_time_ms();

    // Select best target
    int best_idx = select_best_target(detections, count);

    if (best_idx < 0) {
        // No valid targets
        if (g_current_target.active) {
            // Was tracking, now lost
            uint64_t since_last = now - g_current_target.last_seen;

            if (since_last > TARGET_LOST_TIMEOUT_MS) {
                // Target lost
                uint32_t track_duration = (uint32_t)(now - g_current_target.first_seen);
                g_total_track_time += track_duration;
                g_lost_count++;

                LOG_INFO("Target lost after %u ms", track_duration);

                // Deactivate laser
                laser_controller_off();

                // Return to home
                servo_controller_home();

                g_current_target.active = false;
                set_state(TARGET_STATE_LOST);

                // Invoke callback
                if (g_lost_callback != NULL) {
                    TARGET_UNLOCK();
                    g_lost_callback(track_duration, g_lost_callback_data);
                    TARGET_LOCK();
                }

                set_state(TARGET_STATE_IDLE);
            }
        }

        TARGET_UNLOCK();
        return TARGET_OK;
    }

    // We have a valid target
    const detection_box_t *det = &detections[best_idx];
    pixel_coord_t centroid = box_to_centroid(det);

    // Convert to servo angles
    servo_position_t target_angle;
    coord_mapper_pixel_to_angle(centroid, &target_angle);

    bool new_target = !g_current_target.active;

    if (new_target) {
        // New target acquired
        g_current_target.first_seen = now;
        g_target_count++;
        g_sweep_start_time = now;
        g_last_sweep_cycle = 0;

        LOG_INFO("Target acquired at pixel (%d, %d) -> angle (%.1f, %.1f)",
                 centroid.x, centroid.y, target_angle.pan_deg, target_angle.tilt_deg);

        set_state(TARGET_STATE_ACQUIRING);
    }

    // Update target info
    g_current_target.centroid = centroid;
    g_current_target.target_angle = target_angle;
    g_current_target.area = det->width * det->height;
    g_current_target.last_seen = now;
    g_current_target.active = true;

    // Apply sweep pattern
    g_current_target.sweep_angle = apply_sweep(target_angle, now);

    // Move servos
    servo_controller_move(g_current_target.sweep_angle);

    // Activate laser if armed
    if (laser_controller_is_armed()) {
        if (!laser_controller_is_active() && !laser_controller_is_in_cooldown()) {
            laser_controller_on();
        }

        if (g_state != TARGET_STATE_TRACKING) {
            set_state(TARGET_STATE_TRACKING);
        }
    }

    // Invoke acquired callback for new targets
    if (new_target && g_acquired_callback != NULL) {
        TARGET_UNLOCK();
        g_acquired_callback(&g_current_target, g_acquired_callback_data);
        TARGET_LOCK();
    }

    TARGET_UNLOCK();
    return TARGET_OK;
}

void targeting_update(void) {
    if (!g_initialized) return;

    TARGET_LOCK();

    uint64_t now = get_time_ms();

    // Update laser controller
    laser_controller_update();

    // Check for lost target
    if (g_current_target.active) {
        uint64_t since_last = now - g_current_target.last_seen;

        if (since_last > TARGET_LOST_TIMEOUT_MS) {
            // Target lost
            uint32_t track_duration = (uint32_t)(now - g_current_target.first_seen);
            g_total_track_time += track_duration;
            g_lost_count++;

            LOG_INFO("Target lost (timeout) after %u ms", track_duration);

            laser_controller_off();
            servo_controller_home();

            g_current_target.active = false;
            set_state(TARGET_STATE_LOST);

            if (g_lost_callback != NULL) {
                TARGET_UNLOCK();
                g_lost_callback(track_duration, g_lost_callback_data);
                TARGET_LOCK();
            }

            set_state(TARGET_STATE_IDLE);
        } else {
            // Still tracking - update sweep
            g_current_target.sweep_angle = apply_sweep(g_current_target.target_angle, now);
            servo_controller_move(g_current_target.sweep_angle);
        }
    }

    // Update state based on cooldown
    if (g_state == TARGET_STATE_TRACKING && laser_controller_is_in_cooldown()) {
        set_state(TARGET_STATE_COOLDOWN);
    } else if (g_state == TARGET_STATE_COOLDOWN && !laser_controller_is_in_cooldown()) {
        if (g_current_target.active) {
            set_state(TARGET_STATE_TRACKING);
            // Re-activate laser
            laser_controller_on();
        } else {
            set_state(TARGET_STATE_IDLE);
        }
    }

    TARGET_UNLOCK();
}

target_status_t targeting_get_current_target(target_info_t *target) {
    if (!g_initialized) {
        return TARGET_ERROR_NOT_INITIALIZED;
    }

    if (target == NULL) {
        return TARGET_ERROR_INVALID_PARAM;
    }

    TARGET_LOCK();
    *target = g_current_target;
    TARGET_UNLOCK();

    return TARGET_OK;
}

bool targeting_is_tracking(void) {
    if (!g_initialized) return false;

    TARGET_LOCK();
    bool tracking = g_current_target.active;
    TARGET_UNLOCK();

    return tracking;
}

target_state_t targeting_get_state(void) {
    if (!g_initialized) return TARGET_STATE_IDLE;

    TARGET_LOCK();
    target_state_t state = g_state;
    TARGET_UNLOCK();

    return state;
}

void targeting_cancel(void) {
    if (!g_initialized) return;

    TARGET_LOCK();

    if (g_current_target.active) {
        uint32_t track_duration = (uint32_t)(get_time_ms() - g_current_target.first_seen);
        g_total_track_time += track_duration;

        LOG_INFO("Targeting cancelled after %u ms", track_duration);
    }

    laser_controller_off();
    servo_controller_home();

    g_current_target.active = false;
    set_state(TARGET_STATE_IDLE);

    TARGET_UNLOCK();
}

void targeting_set_sweep_amplitude(float amplitude_deg) {
    if (amplitude_deg < 0.0f) amplitude_deg = 0.0f;
    if (amplitude_deg > 45.0f) amplitude_deg = 45.0f;

    TARGET_LOCK();
    g_sweep_amplitude = amplitude_deg;
    TARGET_UNLOCK();

    LOG_DEBUG("Sweep amplitude set to %.1f°", amplitude_deg);
}

float targeting_get_sweep_amplitude(void) {
    TARGET_LOCK();
    float amp = g_sweep_amplitude;
    TARGET_UNLOCK();
    return amp;
}

void targeting_set_sweep_frequency(float frequency_hz) {
    if (frequency_hz < 0.5f) frequency_hz = 0.5f;
    if (frequency_hz > 5.0f) frequency_hz = 5.0f;

    TARGET_LOCK();
    g_sweep_frequency = frequency_hz;
    TARGET_UNLOCK();

    LOG_DEBUG("Sweep frequency set to %.1f Hz", frequency_hz);
}

float targeting_get_sweep_frequency(void) {
    TARGET_LOCK();
    float freq = g_sweep_frequency;
    TARGET_UNLOCK();
    return freq;
}

void targeting_set_state_callback(target_state_callback_t callback, void *user_data) {
    TARGET_LOCK();
    g_state_callback = callback;
    g_state_callback_data = user_data;
    TARGET_UNLOCK();
}

void targeting_set_acquired_callback(target_acquired_callback_t callback, void *user_data) {
    TARGET_LOCK();
    g_acquired_callback = callback;
    g_acquired_callback_data = user_data;
    TARGET_UNLOCK();
}

void targeting_set_lost_callback(target_lost_callback_t callback, void *user_data) {
    TARGET_LOCK();
    g_lost_callback = callback;
    g_lost_callback_data = user_data;
    TARGET_UNLOCK();
}

target_status_t targeting_get_stats(target_stats_t *stats) {
    if (!g_initialized) {
        return TARGET_ERROR_NOT_INITIALIZED;
    }

    if (stats == NULL) {
        return TARGET_ERROR_INVALID_PARAM;
    }

    TARGET_LOCK();

    stats->target_count = g_target_count;
    stats->lost_count = g_lost_count;
    stats->multi_target_count = g_multi_target_count;
    stats->sweep_cycles = g_sweep_cycles;
    stats->total_track_time_ms = g_total_track_time;
    stats->uptime_ms = get_time_ms() - g_init_time;

    TARGET_UNLOCK();

    return TARGET_OK;
}

bool targeting_is_initialized(void) {
    return g_initialized;
}

void targeting_cleanup(void) {
    if (!g_initialized) return;

    TARGET_LOCK();

    // Cancel any active tracking
    if (g_current_target.active) {
        laser_controller_off();
        servo_controller_home();
        g_current_target.active = false;
    }

    TARGET_UNLOCK();

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_target_mutex != NULL) {
        vSemaphoreDelete(g_target_mutex);
        g_target_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("Targeting system cleanup complete");
}
