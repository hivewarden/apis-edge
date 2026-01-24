/**
 * Coordinate Mapper implementation.
 *
 * Converts camera pixel coordinates to servo angles for laser targeting.
 * Supports calibration with offset and scale corrections.
 */

#include "coordinate_mapper.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <errno.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#endif

#include "cJSON.h"

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static camera_params_t g_camera;
static calibration_data_t g_calibration;
static uint64_t g_init_time_ms = 0;
static uint32_t g_map_count = 0;
static uint32_t g_out_of_bounds_count = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define COORD_LOCK()   pthread_mutex_lock(&g_mutex)
#define COORD_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_coord_mutex = NULL;
#define COORD_LOCK()   do { if (g_coord_mutex) xSemaphoreTake(g_coord_mutex, portMAX_DELAY); } while(0)
#define COORD_UNLOCK() do { if (g_coord_mutex) xSemaphoreGive(g_coord_mutex); } while(0)
#endif

// ============================================================================
// Utility Functions
// ============================================================================

static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000;
}

const char *coord_status_name(coord_status_t status) {
    switch (status) {
        case COORD_OK:                  return "OK";
        case COORD_ERROR_NOT_INITIALIZED: return "NOT_INITIALIZED";
        case COORD_ERROR_INVALID_PARAM: return "INVALID_PARAM";
        case COORD_ERROR_FILE_NOT_FOUND: return "FILE_NOT_FOUND";
        case COORD_ERROR_FILE_INVALID:  return "FILE_INVALID";
        case COORD_ERROR_IO:            return "IO_ERROR";
        case COORD_ERROR_NO_MEMORY:     return "NO_MEMORY";
        case COORD_ERROR_OUT_OF_BOUNDS: return "OUT_OF_BOUNDS";
        default:                        return "UNKNOWN";
    }
}

static void reset_calibration(void) {
    memset(&g_calibration, 0, sizeof(g_calibration));
    g_calibration.offset_pan_deg = 0.0f;
    g_calibration.offset_tilt_deg = 0.0f;
    g_calibration.scale_pan = 1.0f;
    g_calibration.scale_tilt = 1.0f;
    g_calibration.valid = false;
    g_calibration.num_points = 0;
}

// ============================================================================
// Core Mapping Functions
// ============================================================================

/**
 * Map pixel to raw angle (before calibration adjustments).
 * Uses linear interpolation based on field of view.
 *
 * Pixel (0,0) = top-left = most negative pan, most positive tilt (upward clamped to 0)
 * Pixel (width,height) = bottom-right = most positive pan, most negative tilt
 */
static void pixel_to_raw_angle(pixel_coord_t pixel, servo_position_t *angles) {
    // Normalize pixel to -0.5 to +0.5 range
    float norm_x = ((float)pixel.x / (float)g_camera.width) - 0.5f;
    float norm_y = ((float)pixel.y / (float)g_camera.height) - 0.5f;

    // Map to angle range
    // Pan: left = negative, right = positive
    angles->pan_deg = norm_x * g_camera.fov_h_deg;

    // Tilt: top = 0° (horizontal), bottom = negative (downward)
    // Note: Camera top corresponds to horizontal/upward, bottom to downward
    angles->tilt_deg = -norm_y * g_camera.fov_v_deg;
}

/**
 * Apply calibration corrections to raw angles.
 */
static void apply_calibration(servo_position_t *angles) {
    angles->pan_deg = (angles->pan_deg * g_calibration.scale_pan) + g_calibration.offset_pan_deg;
    angles->tilt_deg = (angles->tilt_deg * g_calibration.scale_tilt) + g_calibration.offset_tilt_deg;
}

/**
 * Map angle to pixel (inverse of pixel_to_raw_angle).
 */
static void raw_angle_to_pixel(servo_position_t angles, pixel_coord_t *pixel) {
    // Reverse calibration
    float uncal_pan = (angles.pan_deg - g_calibration.offset_pan_deg) / g_calibration.scale_pan;
    float uncal_tilt = (angles.tilt_deg - g_calibration.offset_tilt_deg) / g_calibration.scale_tilt;

    // Reverse angle to normalized
    float norm_x = uncal_pan / g_camera.fov_h_deg;
    float norm_y = -uncal_tilt / g_camera.fov_v_deg;

    // Reverse normalized to pixel
    pixel->x = (int32_t)((norm_x + 0.5f) * (float)g_camera.width);
    pixel->y = (int32_t)((norm_y + 0.5f) * (float)g_camera.height);
}

// ============================================================================
// Calibration Persistence
// ============================================================================

coord_status_t coord_mapper_load_calibration(const char *path) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (path == NULL) {
        path = COORD_CALIBRATION_PATH;
    }

    FILE *fp = fopen(path, "r");
    if (fp == NULL) {
        LOG_WARN("Calibration file not found: %s", path);
        return COORD_ERROR_FILE_NOT_FOUND;
    }

    // Read file contents
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    if (size <= 0 || size > 65536) {
        fclose(fp);
        return COORD_ERROR_FILE_INVALID;
    }

    char *content = (char *)malloc(size + 1);
    if (content == NULL) {
        fclose(fp);
        return COORD_ERROR_NO_MEMORY;
    }

    size_t read = fread(content, 1, size, fp);
    fclose(fp);
    content[read] = '\0';

    // Parse JSON
    cJSON *json = cJSON_Parse(content);
    free(content);

    if (json == NULL) {
        LOG_ERROR("Failed to parse calibration JSON");
        return COORD_ERROR_FILE_INVALID;
    }

    COORD_LOCK();

    // Read calibration values
    cJSON *item;

    item = cJSON_GetObjectItem(json, "offset_pan_deg");
    if (cJSON_IsNumber(item)) {
        g_calibration.offset_pan_deg = (float)item->valuedouble;
    }

    item = cJSON_GetObjectItem(json, "offset_tilt_deg");
    if (cJSON_IsNumber(item)) {
        g_calibration.offset_tilt_deg = (float)item->valuedouble;
    }

    item = cJSON_GetObjectItem(json, "scale_pan");
    if (cJSON_IsNumber(item)) {
        g_calibration.scale_pan = (float)item->valuedouble;
        if (g_calibration.scale_pan <= 0) g_calibration.scale_pan = 1.0f;
    }

    item = cJSON_GetObjectItem(json, "scale_tilt");
    if (cJSON_IsNumber(item)) {
        g_calibration.scale_tilt = (float)item->valuedouble;
        if (g_calibration.scale_tilt <= 0) g_calibration.scale_tilt = 1.0f;
    }

    item = cJSON_GetObjectItem(json, "timestamp");
    if (cJSON_IsNumber(item)) {
        g_calibration.timestamp = (uint64_t)item->valuedouble;
    }

    // Read camera params if present
    cJSON *camera = cJSON_GetObjectItem(json, "camera");
    if (cJSON_IsObject(camera)) {
        item = cJSON_GetObjectItem(camera, "width");
        if (cJSON_IsNumber(item)) g_calibration.camera.width = (uint32_t)item->valueint;

        item = cJSON_GetObjectItem(camera, "height");
        if (cJSON_IsNumber(item)) g_calibration.camera.height = (uint32_t)item->valueint;

        item = cJSON_GetObjectItem(camera, "fov_h_deg");
        if (cJSON_IsNumber(item)) g_calibration.camera.fov_h_deg = (float)item->valuedouble;

        item = cJSON_GetObjectItem(camera, "fov_v_deg");
        if (cJSON_IsNumber(item)) g_calibration.camera.fov_v_deg = (float)item->valuedouble;
    }

    g_calibration.valid = true;

    COORD_UNLOCK();

    cJSON_Delete(json);

    LOG_INFO("Loaded calibration: offset=(%.2f, %.2f), scale=(%.2f, %.2f)",
             g_calibration.offset_pan_deg, g_calibration.offset_tilt_deg,
             g_calibration.scale_pan, g_calibration.scale_tilt);

    return COORD_OK;
}

coord_status_t coord_mapper_save_calibration(const char *path) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (path == NULL) {
        path = COORD_CALIBRATION_PATH;
    }

    cJSON *json = cJSON_CreateObject();
    if (json == NULL) {
        return COORD_ERROR_NO_MEMORY;
    }

    COORD_LOCK();

    cJSON_AddNumberToObject(json, "offset_pan_deg", g_calibration.offset_pan_deg);
    cJSON_AddNumberToObject(json, "offset_tilt_deg", g_calibration.offset_tilt_deg);
    cJSON_AddNumberToObject(json, "scale_pan", g_calibration.scale_pan);
    cJSON_AddNumberToObject(json, "scale_tilt", g_calibration.scale_tilt);
    cJSON_AddNumberToObject(json, "timestamp", (double)get_time_ms());

    cJSON *camera = cJSON_CreateObject();
    cJSON_AddNumberToObject(camera, "width", g_camera.width);
    cJSON_AddNumberToObject(camera, "height", g_camera.height);
    cJSON_AddNumberToObject(camera, "fov_h_deg", g_camera.fov_h_deg);
    cJSON_AddNumberToObject(camera, "fov_v_deg", g_camera.fov_v_deg);
    cJSON_AddItemToObject(json, "camera", camera);

    COORD_UNLOCK();

    char *str = cJSON_Print(json);
    cJSON_Delete(json);

    if (str == NULL) {
        return COORD_ERROR_NO_MEMORY;
    }

    FILE *fp = fopen(path, "w");
    if (fp == NULL) {
        free(str);
        LOG_ERROR("Failed to open calibration file for writing: %s", path);
        return COORD_ERROR_IO;
    }

    size_t written = fwrite(str, 1, strlen(str), fp);
    fclose(fp);
    free(str);

    if (written == 0) {
        return COORD_ERROR_IO;
    }

    LOG_INFO("Saved calibration to %s", path);
    return COORD_OK;
}

// ============================================================================
// Public API Implementation
// ============================================================================

coord_status_t coord_mapper_init(const camera_params_t *params) {
    if (g_initialized) {
        LOG_WARN("Coordinate mapper already initialized");
        return COORD_OK;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_coord_mutex == NULL) {
        g_coord_mutex = xSemaphoreCreateMutex();
        if (g_coord_mutex == NULL) {
            LOG_ERROR("Failed to create coordinate mapper mutex");
            return COORD_ERROR_NO_MEMORY;
        }
    }
#endif

    // Set camera parameters
    if (params != NULL) {
        g_camera = *params;
    } else {
        g_camera.width = COORD_DEFAULT_WIDTH;
        g_camera.height = COORD_DEFAULT_HEIGHT;
        g_camera.fov_h_deg = COORD_DEFAULT_FOV_H_DEG;
        g_camera.fov_v_deg = COORD_DEFAULT_FOV_V_DEG;
    }

    // Reset calibration
    reset_calibration();
    g_calibration.camera = g_camera;

    // Reset statistics
    g_map_count = 0;
    g_out_of_bounds_count = 0;
    g_init_time_ms = get_time_ms();

    g_initialized = true;

    LOG_INFO("Coordinate mapper initialized: %dx%d, FOV %.1f°x%.1f°",
             g_camera.width, g_camera.height,
             g_camera.fov_h_deg, g_camera.fov_v_deg);

    // Try to load calibration (optional, don't fail if not found)
    coord_mapper_load_calibration(NULL);

    return COORD_OK;
}

coord_status_t coord_mapper_pixel_to_angle(pixel_coord_t pixel, servo_position_t *angles) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (angles == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();

    // Bounds check
    bool out_of_bounds = false;
    if (pixel.x < 0 || pixel.x >= (int32_t)g_camera.width ||
        pixel.y < 0 || pixel.y >= (int32_t)g_camera.height) {
        out_of_bounds = true;
        g_out_of_bounds_count++;
    }

    // Compute raw angle
    pixel_to_raw_angle(pixel, angles);

    // Apply calibration
    apply_calibration(angles);

    // Clamp to safe servo limits
    angles->pan_deg = servo_controller_clamp_angle(SERVO_AXIS_PAN, angles->pan_deg);
    angles->tilt_deg = servo_controller_clamp_angle(SERVO_AXIS_TILT, angles->tilt_deg);

    g_map_count++;

    COORD_UNLOCK();

    if (out_of_bounds) {
        return COORD_ERROR_OUT_OF_BOUNDS;
    }

    return COORD_OK;
}

coord_status_t coord_mapper_angle_to_pixel(servo_position_t angles, pixel_coord_t *pixel) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (pixel == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();
    raw_angle_to_pixel(angles, pixel);
    COORD_UNLOCK();

    return COORD_OK;
}

void coord_mapper_set_offsets(float offset_pan, float offset_tilt) {
    if (!g_initialized) return;

    COORD_LOCK();
    g_calibration.offset_pan_deg = offset_pan;
    g_calibration.offset_tilt_deg = offset_tilt;
    g_calibration.valid = true;
    COORD_UNLOCK();

    LOG_DEBUG("Calibration offsets set: pan=%.2f°, tilt=%.2f°", offset_pan, offset_tilt);
}

void coord_mapper_get_offsets(float *offset_pan, float *offset_tilt) {
    if (!g_initialized) {
        if (offset_pan) *offset_pan = 0.0f;
        if (offset_tilt) *offset_tilt = 0.0f;
        return;
    }

    COORD_LOCK();
    if (offset_pan) *offset_pan = g_calibration.offset_pan_deg;
    if (offset_tilt) *offset_tilt = g_calibration.offset_tilt_deg;
    COORD_UNLOCK();
}

void coord_mapper_set_scales(float scale_pan, float scale_tilt) {
    if (!g_initialized) return;

    // Validate scales (must be positive)
    if (scale_pan <= 0) scale_pan = 1.0f;
    if (scale_tilt <= 0) scale_tilt = 1.0f;

    COORD_LOCK();
    g_calibration.scale_pan = scale_pan;
    g_calibration.scale_tilt = scale_tilt;
    COORD_UNLOCK();

    LOG_DEBUG("Calibration scales set: pan=%.3f, tilt=%.3f", scale_pan, scale_tilt);
}

void coord_mapper_get_scales(float *scale_pan, float *scale_tilt) {
    if (!g_initialized) {
        if (scale_pan) *scale_pan = 1.0f;
        if (scale_tilt) *scale_tilt = 1.0f;
        return;
    }

    COORD_LOCK();
    if (scale_pan) *scale_pan = g_calibration.scale_pan;
    if (scale_tilt) *scale_tilt = g_calibration.scale_tilt;
    COORD_UNLOCK();
}

coord_status_t coord_mapper_add_point(pixel_coord_t pixel, servo_position_t angles) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    COORD_LOCK();

    if (g_calibration.num_points >= COORD_MAX_CALIBRATION_POINTS) {
        COORD_UNLOCK();
        LOG_WARN("Maximum calibration points reached");
        return COORD_ERROR_INVALID_PARAM;
    }

    uint32_t idx = g_calibration.num_points;
    g_calibration.points[idx].pixel = pixel;
    g_calibration.points[idx].angle = angles;
    g_calibration.points[idx].valid = true;
    g_calibration.num_points++;

    COORD_UNLOCK();

    LOG_DEBUG("Added calibration point %u: pixel(%d,%d) -> angle(%.1f,%.1f)",
              idx, pixel.x, pixel.y, angles.pan_deg, angles.tilt_deg);

    return COORD_OK;
}

void coord_mapper_clear_points(void) {
    if (!g_initialized) return;

    COORD_LOCK();
    for (uint32_t i = 0; i < COORD_MAX_CALIBRATION_POINTS; i++) {
        g_calibration.points[i].valid = false;
    }
    g_calibration.num_points = 0;
    COORD_UNLOCK();

    LOG_DEBUG("Calibration points cleared");
}

coord_status_t coord_mapper_compute_calibration(void) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    COORD_LOCK();

    if (g_calibration.num_points < 1) {
        COORD_UNLOCK();
        LOG_WARN("Need at least 1 calibration point");
        return COORD_ERROR_INVALID_PARAM;
    }

    // Simple single-point calibration: compute offset
    // Expected angle = pixel_to_raw_angle(pixel)
    // Actual angle = recorded angle
    // Offset = actual - expected

    calibration_point_t *p = &g_calibration.points[0];
    servo_position_t expected;
    pixel_to_raw_angle(p->pixel, &expected);

    g_calibration.offset_pan_deg = p->angle.pan_deg - expected.pan_deg;
    g_calibration.offset_tilt_deg = p->angle.tilt_deg - expected.tilt_deg;

    // If we have 2+ points, could compute scale as well
    // For now, just use offsets from first point
    g_calibration.scale_pan = 1.0f;
    g_calibration.scale_tilt = 1.0f;

    g_calibration.timestamp = get_time_ms();
    g_calibration.valid = true;

    COORD_UNLOCK();

    LOG_INFO("Calibration computed: offset=(%.2f, %.2f)",
             g_calibration.offset_pan_deg, g_calibration.offset_tilt_deg);

    return COORD_OK;
}

void coord_mapper_reset_calibration(void) {
    if (!g_initialized) return;

    COORD_LOCK();
    reset_calibration();
    COORD_UNLOCK();

    LOG_INFO("Calibration reset to defaults");
}

bool coord_mapper_is_calibrated(void) {
    if (!g_initialized) return false;

    COORD_LOCK();
    bool valid = g_calibration.valid;
    COORD_UNLOCK();

    return valid;
}

coord_status_t coord_mapper_get_calibration(calibration_data_t *data) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (data == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();
    *data = g_calibration;
    COORD_UNLOCK();

    return COORD_OK;
}

coord_status_t coord_mapper_set_camera_params(const camera_params_t *params) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (params == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();
    g_camera = *params;
    COORD_UNLOCK();

    LOG_INFO("Camera params updated: %dx%d, FOV %.1f°x%.1f°",
             params->width, params->height, params->fov_h_deg, params->fov_v_deg);

    return COORD_OK;
}

coord_status_t coord_mapper_get_camera_params(camera_params_t *params) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (params == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();
    *params = g_camera;
    COORD_UNLOCK();

    return COORD_OK;
}

coord_status_t coord_mapper_get_stats(coord_stats_t *stats) {
    if (!g_initialized) {
        return COORD_ERROR_NOT_INITIALIZED;
    }

    if (stats == NULL) {
        return COORD_ERROR_INVALID_PARAM;
    }

    COORD_LOCK();
    stats->map_count = g_map_count;
    stats->out_of_bounds_count = g_out_of_bounds_count;
    stats->calibrated = g_calibration.valid;
    stats->uptime_ms = get_time_ms() - g_init_time_ms;
    COORD_UNLOCK();

    return COORD_OK;
}

bool coord_mapper_is_initialized(void) {
    return g_initialized;
}

void coord_mapper_cleanup(void) {
    if (!g_initialized) return;

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_coord_mutex != NULL) {
        vSemaphoreDelete(g_coord_mutex);
        g_coord_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("Coordinate mapper cleanup complete");
}
