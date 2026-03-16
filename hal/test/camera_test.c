/**
 * Test Platform Camera HAL Stub
 *
 * Provides no-op camera functions for the test platform so that
 * camera-dependent test binaries can link. The test_camera test
 * will report "no valid frames" but won't crash.
 */

#include "camera.h"
#include <string.h>

static bool g_initialized = false;
static bool g_open = false;
static camera_frame_callback_t g_callback = NULL;
static void *g_callback_data = NULL;

camera_status_t camera_init(const apis_camera_config_t *config) {
    (void)config;
    g_initialized = true;
    return CAMERA_OK;
}

camera_status_t camera_open(void) {
    if (!g_initialized) return CAMERA_ERROR_NOT_FOUND;
    g_open = true;
    return CAMERA_OK;
}

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    (void)timeout_ms;
    if (!g_open) return CAMERA_ERROR_READ_FAILED;
    if (!frame) return CAMERA_ERROR_READ_FAILED;

    /* Generate a synthetic test frame */
    memset(frame->data, 128, FRAME_SIZE);
    frame->width = FRAME_WIDTH;
    frame->height = FRAME_HEIGHT;
    frame->valid = true;
    frame->timestamp_ms = 0;
    frame->sequence = 0;

    if (g_callback) {
        g_callback(frame, g_callback_data);
    }

    return CAMERA_OK;
}

bool camera_is_open(void) {
    return g_open;
}

float camera_get_fps(void) {
    return 0.0f;
}

void camera_get_stats(camera_stats_t *stats) {
    if (stats) {
        memset(stats, 0, sizeof(*stats));
    }
}

void camera_close(void) {
    g_open = false;
    g_initialized = false;
    g_callback = NULL;
    g_callback_data = NULL;
}

const char *camera_status_str(camera_status_t status) {
    switch (status) {
        case CAMERA_OK:                 return "OK";
        case CAMERA_ERROR_NOT_FOUND:    return "NOT_FOUND";
        case CAMERA_ERROR_OPEN_FAILED:  return "OPEN_FAILED";
        case CAMERA_ERROR_CONFIG_FAILED: return "CONFIG_FAILED";
        case CAMERA_ERROR_READ_FAILED:  return "READ_FAILED";
        case CAMERA_ERROR_DISCONNECTED: return "DISCONNECTED";
        case CAMERA_ERROR_NO_MEMORY:    return "NO_MEMORY";
        default:                        return "UNKNOWN";
    }
}

void camera_set_callback(camera_frame_callback_t callback, void *user_data) {
    g_callback = callback;
    g_callback_data = user_data;
}

void camera_drain_start(void) { }
void camera_drain_stop(void) { }
