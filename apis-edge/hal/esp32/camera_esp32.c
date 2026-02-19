/**
 * ESP32 camera implementation using esp_camera.
 *
 * Target boards:
 * - ESP32-CAM (AI-Thinker)
 * - XIAO ESP32-S3 Sense
 *
 * Note: This file is only compiled when ESP_PLATFORM is defined.
 */

#ifdef ESP_PLATFORM

#include "camera.h"
#include "log.h"

// Rename esp32-camera library's camera_status_t to avoid collision
// with our HAL camera_status_t enum (defined in camera.h).
// The esp32-camera library uses this internally for sensor status;
// we never use it directly (we use esp_err_t return values instead).
#define camera_status_t esp_cam_driver_status_t
#include "esp_camera.h"
#undef camera_status_t
#include "esp_timer.h"
#include "esp_heap_caps.h"

#include <string.h>

// =============================================================================
// Board Selection - Uncomment ONE board definition
// =============================================================================
// Supported boards:
//   - BOARD_ESP32_CAM_AITHINKER  (ESP32-CAM AI-Thinker, default)
//   - BOARD_XIAO_ESP32S3_SENSE   (Seeed XIAO ESP32-S3 Sense)
//
// To switch boards:
//   1. Uncomment the desired board below, OR
//   2. Define in CMakeLists.txt: add_definitions(-DBOARD_XIAO_ESP32S3_SENSE)
// =============================================================================

#if !defined(BOARD_ESP32_CAM_AITHINKER) && !defined(BOARD_XIAO_ESP32S3_SENSE)
#define BOARD_XIAO_ESP32S3_SENSE  // User's board
#endif

// Camera pin configuration for ESP32-CAM (AI-Thinker)
#ifdef BOARD_ESP32_CAM_AITHINKER
#define CAM_PIN_PWDN    32
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK    0
#define CAM_PIN_SIOD    26
#define CAM_PIN_SIOC    27
#define CAM_PIN_D7      35
#define CAM_PIN_D6      34
#define CAM_PIN_D5      39
#define CAM_PIN_D4      36
#define CAM_PIN_D3      21
#define CAM_PIN_D2      19
#define CAM_PIN_D1      18
#define CAM_PIN_D0      5
#define CAM_PIN_VSYNC   25
#define CAM_PIN_HREF    23
#define CAM_PIN_PCLK    22
#endif

// Camera pin configuration for XIAO ESP32-S3 Sense
#ifdef BOARD_XIAO_ESP32S3_SENSE
#define CAM_PIN_PWDN    -1
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK    10
#define CAM_PIN_SIOD    40
#define CAM_PIN_SIOC    39
#define CAM_PIN_D7      48
#define CAM_PIN_D6      11
#define CAM_PIN_D5      12
#define CAM_PIN_D4      14
#define CAM_PIN_D3      16
#define CAM_PIN_D2      18
#define CAM_PIN_D1      17
#define CAM_PIN_D0      15
#define CAM_PIN_VSYNC   38
#define CAM_PIN_HREF    47
#define CAM_PIN_PCLK    13
#endif

#define FPS_SAMPLE_INTERVAL_MS 1000

// Internal state
static bool g_is_initialized = false;
static bool g_is_open = false;
static uint32_t g_sequence = 0;
static uint32_t g_frames_captured = 0;
static uint32_t g_frames_dropped = 0;
static int64_t g_start_time_us = 0;
static int64_t g_fps_start_time_us = 0;
static uint32_t g_fps_frame_count = 0;
static float g_current_fps = 0.0f;

static camera_frame_callback_t g_callback = NULL;
static void *g_callback_user_data = NULL;

/**
 * Convert RGB565 to BGR24.
 * RGB565: RRRRRGGGGGGBBBBB (16 bits)
 */
static void rgb565_to_bgr24(const uint8_t *src, uint8_t *dst, size_t width, size_t height) {
    size_t pixel_count = width * height;

    for (size_t i = 0; i < pixel_count; i++) {
        // RGB565 is stored big-endian on ESP32
        uint16_t pixel = (src[i * 2] << 8) | src[i * 2 + 1];

        uint8_t r = (pixel >> 11) & 0x1F;
        uint8_t g = (pixel >> 5) & 0x3F;
        uint8_t b = pixel & 0x1F;

        // Scale to 8 bits and store as BGR
        dst[i * 3 + 0] = (b << 3) | (b >> 2);  // B
        dst[i * 3 + 1] = (g << 2) | (g >> 4);  // G
        dst[i * 3 + 2] = (r << 3) | (r >> 2);  // R
    }
}

camera_status_t camera_init(const apis_camera_config_t *config) {
    if (g_is_initialized) {
        return CAMERA_OK;
    }

    // ESP32 uses compile-time pin configuration and fixed VGA resolution
    // Runtime config values are not applied - warn if they differ from defaults
    if (config != NULL) {
        if (config->width != 640 || config->height != 480) {
            LOG_WARN("ESP32 ignores runtime config: using fixed 640x480 (requested %dx%d)",
                     config->width, config->height);
        }
        if (config->fps != 10 && config->fps != 0) {
            LOG_WARN("ESP32 ignores runtime fps config: hardware-controlled (requested %d fps)",
                     config->fps);
        }
    }

    // Use ESP-IDF's camera_config_t for hardware configuration
    // Note: This is distinct from APIS apis_camera_config_t in config.h
    camera_config_t esp_cam_config = {
        .pin_pwdn = CAM_PIN_PWDN,
        .pin_reset = CAM_PIN_RESET,
        .pin_xclk = CAM_PIN_XCLK,
        .pin_sccb_sda = CAM_PIN_SIOD,
        .pin_sccb_scl = CAM_PIN_SIOC,
        .pin_d7 = CAM_PIN_D7,
        .pin_d6 = CAM_PIN_D6,
        .pin_d5 = CAM_PIN_D5,
        .pin_d4 = CAM_PIN_D4,
        .pin_d3 = CAM_PIN_D3,
        .pin_d2 = CAM_PIN_D2,
        .pin_d1 = CAM_PIN_D1,
        .pin_d0 = CAM_PIN_D0,
        .pin_vsync = CAM_PIN_VSYNC,
        .pin_href = CAM_PIN_HREF,
        .pin_pclk = CAM_PIN_PCLK,

        .xclk_freq_hz = 20000000,
        .ledc_timer = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,

        .pixel_format = PIXFORMAT_RGB565,
        .frame_size = FRAMESIZE_VGA,       // 640x480
        .jpeg_quality = 12,
        .fb_count = 2,
        .fb_location = CAMERA_FB_IN_PSRAM, // Use PSRAM if available
        .grab_mode = CAMERA_GRAB_LATEST,
    };

    esp_err_t err = esp_camera_init(&esp_cam_config);
    if (err != ESP_OK) {
        LOG_ERROR("esp_camera_init failed: 0x%x", err);
        return CAMERA_ERROR_OPEN_FAILED;
    }

    g_is_initialized = true;
    LOG_INFO("ESP32 camera initialized");
    return CAMERA_OK;
}

camera_status_t camera_open(void) {
    if (!g_is_initialized) {
        LOG_ERROR("Camera not initialized");
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    if (g_is_open) {
        return CAMERA_OK;
    }

    g_is_open = true;
    g_sequence = 0;
    g_frames_captured = 0;
    g_frames_dropped = 0;
    g_start_time_us = esp_timer_get_time();
    g_fps_start_time_us = g_start_time_us;
    g_fps_frame_count = 0;
    g_current_fps = 0.0f;

    LOG_INFO("ESP32 camera opened");
    return CAMERA_OK;
}

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    (void)timeout_ms;  // ESP32 camera is synchronous

    if (!g_is_open) {
        return CAMERA_ERROR_READ_FAILED;
    }

    if (frame == NULL) {
        return CAMERA_ERROR_READ_FAILED;
    }

    frame_init(frame);

    // Capture frame
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        LOG_ERROR("esp_camera_fb_get failed");
        g_frames_dropped++;
        return CAMERA_ERROR_READ_FAILED;
    }

    // Verify dimensions
    if (fb->width != FRAME_WIDTH || fb->height != FRAME_HEIGHT) {
        LOG_WARN("Unexpected frame size: %dx%d (expected %dx%d)",
                 fb->width, fb->height, FRAME_WIDTH, FRAME_HEIGHT);
    }

    size_t pixel_count = (size_t)fb->width * (size_t)fb->height;
    size_t max_pixels = (size_t)FRAME_WIDTH * (size_t)FRAME_HEIGHT;
    if (pixel_count > max_pixels) {
        LOG_ERROR("Frame too large for buffer: %dx%d exceeds %dx%d",
                  fb->width, fb->height, FRAME_WIDTH, FRAME_HEIGHT);
        esp_camera_fb_return(fb);
        g_frames_dropped++;
        return CAMERA_ERROR_READ_FAILED;
    }

    // Convert RGB565 to BGR24
    if (fb->format == PIXFORMAT_RGB565) {
        size_t required_input_bytes = pixel_count * 2;
        if ((size_t)fb->len < required_input_bytes) {
            LOG_ERROR("Short RGB565 frame: got %zu bytes, need %zu", (size_t)fb->len, required_input_bytes);
            esp_camera_fb_return(fb);
            g_frames_dropped++;
            return CAMERA_ERROR_READ_FAILED;
        }
        rgb565_to_bgr24(fb->buf, frame->data, fb->width, fb->height);
    } else {
        // Fallback: copy raw data (may not be correct format)
        size_t copy_size = fb->len < FRAME_SIZE ? fb->len : FRAME_SIZE;
        memcpy(frame->data, fb->buf, copy_size);
    }

    // Set frame metadata
    frame->timestamp_ms = (uint32_t)((esp_timer_get_time() - g_start_time_us) / 1000);
    frame->sequence = g_sequence++;
    frame->width = fb->width;
    frame->height = fb->height;
    frame->valid = true;

    // Return frame buffer
    esp_camera_fb_return(fb);

    g_frames_captured++;
    g_fps_frame_count++;

    // Update FPS measurement
    int64_t now_us = esp_timer_get_time();
    int64_t elapsed_us = now_us - g_fps_start_time_us;
    if (elapsed_us >= FPS_SAMPLE_INTERVAL_MS * 1000) {
        g_current_fps = (float)g_fps_frame_count * 1000000.0f / (float)elapsed_us;
        g_fps_frame_count = 0;
        g_fps_start_time_us = now_us;
    }

    // Invoke callback if set.
    // Copy function pointer and user data to local variables before invoking
    // to prevent a race condition if camera_set_callback() is called from
    // another thread between the NULL check and the invocation.
    camera_frame_callback_t cb = g_callback;
    void *cb_data = g_callback_user_data;
    if (cb) {
        cb(frame, cb_data);
    }

    return CAMERA_OK;
}

bool camera_is_open(void) {
    return g_is_open;
}

float camera_get_fps(void) {
    return g_current_fps;
}

void camera_get_stats(camera_stats_t *stats) {
    if (stats == NULL) return;

    stats->frames_captured = g_frames_captured;
    stats->frames_dropped = g_frames_dropped;
    stats->current_fps = g_current_fps;
    stats->reconnect_count = 0;

    if (g_is_open) {
        stats->uptime_s = (uint32_t)((esp_timer_get_time() - g_start_time_us) / 1000000);
    } else {
        stats->uptime_s = 0;
    }
}

void camera_close(void) {
    if (g_is_initialized) {
        esp_camera_deinit();
        g_is_initialized = false;
    }
    g_is_open = false;
    LOG_INFO("ESP32 camera closed");
}

const char *camera_status_str(camera_status_t status) {
    switch (status) {
        case CAMERA_OK:                return "OK";
        case CAMERA_ERROR_NOT_FOUND:   return "Camera not found";
        case CAMERA_ERROR_OPEN_FAILED: return "Failed to open camera";
        case CAMERA_ERROR_CONFIG_FAILED: return "Configuration failed";
        case CAMERA_ERROR_READ_FAILED: return "Read failed";
        case CAMERA_ERROR_DISCONNECTED: return "Camera disconnected";
        case CAMERA_ERROR_NO_MEMORY:   return "Memory allocation failed";
        default: return "Unknown error";
    }
}

void camera_set_callback(camera_frame_callback_t callback, void *user_data) {
    // S8-H6 fix: Set user_data BEFORE the function pointer, and use a memory
    // barrier to ensure ordering. On dual-core ESP32, without a barrier another
    // core could see the new callback pointer but stale user_data.
    g_callback_user_data = user_data;
    __sync_synchronize();  // Full memory barrier
    g_callback = callback;
}

#endif // ESP_PLATFORM
