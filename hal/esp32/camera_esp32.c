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
#include "psram_alloc.h"
#include "qr_scanner.h"

// Rename esp32-camera library's camera_status_t to avoid collision
// with our HAL camera_status_t enum (defined in camera.h).
// The esp32-camera library uses this internally for sensor status;
// we never use it directly (we use esp_err_t return values instead).
#define camera_status_t esp_cam_driver_status_t
#include "esp_camera.h"
#undef camera_status_t
#include "img_converters.h"
#include "esp_timer.h"
#include "rom/tjpgd.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <stdlib.h>
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
static bool g_logged_first_fb_wait = false;
static bool g_logged_first_fb_captured = false;
static bool g_logged_first_frame_ready = false;
static camera_mode_t g_current_mode = CAMERA_MODE_QVGA_GRAY;
static camera_qr_profile_t g_qr_profile = CAMERA_QR_PROFILE_SCREEN_BALANCED;
static uint16_t g_sensor_width = 320;
static uint16_t g_sensor_height = 240;
static uint16_t g_analysis_width = FRAME_WIDTH;
static uint16_t g_analysis_height = FRAME_HEIGHT;
static uint8_t *g_last_qr_frame = NULL;
static size_t g_last_qr_frame_capacity = 0;
static volatile uint32_t g_last_qr_frame_version = 0;
static uint16_t g_last_qr_width = 0;
static uint16_t g_last_qr_height = 0;

static camera_frame_callback_t g_callback = NULL;
static void *g_callback_user_data = NULL;
static TaskHandle_t g_drain_task_handle = NULL;
static volatile bool g_drain_running = false;

static bool ensure_qr_preview_capacity(size_t bytes) {
    if (bytes == 0) {
        return false;
    }
    if (g_last_qr_frame && g_last_qr_frame_capacity >= bytes) {
        return true;
    }

    uint8_t *new_buf = (uint8_t *)psram_malloc(bytes);
    if (!new_buf) {
        LOG_ERROR("Failed to allocate QR preview buffer (%zu bytes)", bytes);
        return false;
    }

    psram_free(g_last_qr_frame);
    g_last_qr_frame = new_buf;
    g_last_qr_frame_capacity = bytes;
    return true;
}

static void update_last_qr_frame(const uint8_t *gray, uint16_t width, uint16_t height) {
    size_t frame_bytes = (size_t)width * (size_t)height;
    if (!gray || !ensure_qr_preview_capacity(frame_bytes)) {
        return;
    }

    // Lock-free odd/even versioning so the HTTP debug endpoint can detect
    // concurrent writes without stalling the QR scan loop.
    g_last_qr_frame_version++;
    memcpy(g_last_qr_frame, gray, frame_bytes);
    g_last_qr_width = width;
    g_last_qr_height = height;
    g_last_qr_frame_version++;
}

static void apply_qr_sensor_tuning(camera_mode_t mode) {
    if (mode != CAMERA_MODE_VGA_GRAY &&
        mode != CAMERA_MODE_XGA_GRAY) {
        return;
    }

    sensor_t *sensor = esp_camera_sensor_get();
    if (!sensor) {
        LOG_WARN("QR sensor tuning skipped: sensor handle unavailable");
        return;
    }

    if (sensor->set_denoise) {
        sensor->set_denoise(sensor, 0);
    }

    switch (g_qr_profile) {
        case CAMERA_QR_PROFILE_SCREEN_GLARE:
            if (sensor->set_contrast) {
                sensor->set_contrast(sensor, 2);
            }
            if (sensor->set_sharpness) {
                sensor->set_sharpness(sensor, 2);
            }
            if (sensor->set_brightness) {
                sensor->set_brightness(sensor, -1);
            }
            if (sensor->set_ae_level) {
                sensor->set_ae_level(sensor, -1);
            }
            if (sensor->set_gain_ctrl) {
                sensor->set_gain_ctrl(sensor, 1);
            }
            if (sensor->set_exposure_ctrl) {
                sensor->set_exposure_ctrl(sensor, 0);
            }
            if (sensor->set_aec_value) {
                sensor->set_aec_value(sensor, 220);
            }
            break;
        case CAMERA_QR_PROFILE_SCREEN_BALANCED:
            if (sensor->set_contrast) {
                sensor->set_contrast(sensor, 2);
            }
            if (sensor->set_sharpness) {
                sensor->set_sharpness(sensor, 1);
            }
            if (sensor->set_brightness) {
                sensor->set_brightness(sensor, 0);
            }
            if (sensor->set_ae_level) {
                sensor->set_ae_level(sensor, 0);
            }
            if (sensor->set_gain_ctrl) {
                sensor->set_gain_ctrl(sensor, 1);
            }
            if (sensor->set_exposure_ctrl) {
                sensor->set_exposure_ctrl(sensor, 1);
            }
            break;
        case CAMERA_QR_PROFILE_SCREEN_BRIGHT:
            if (sensor->set_contrast) {
                sensor->set_contrast(sensor, 1);
            }
            if (sensor->set_sharpness) {
                sensor->set_sharpness(sensor, 1);
            }
            if (sensor->set_brightness) {
                sensor->set_brightness(sensor, 1);
            }
            if (sensor->set_ae_level) {
                sensor->set_ae_level(sensor, 1);
            }
            if (sensor->set_gain_ctrl) {
                sensor->set_gain_ctrl(sensor, 1);
            }
            if (sensor->set_exposure_ctrl) {
                sensor->set_exposure_ctrl(sensor, 1);
            }
            break;
        default:
            break;
    }

    LOG_INFO("Applied QR sensor tuning profile=%s",
             camera_qr_profile_name(g_qr_profile));
}

/**
 * Convert grayscale to BGR24.
 *
 * Replicates each grayscale byte to all 3 channels (B=G=R=gray).
 * Sequential access pattern: reads source linearly, writes destination
 * linearly. This is critical on ESP32-S3 because PSRAM shares the MSPI
 * bus with camera DMA. Sequential access = good cache behavior (~10ms).
 * JPEG decode (fmt2rgb888) writes in MCU block order = cache thrashing (>10s).
 */
static void grayscale_to_bgr24(const uint8_t *src, uint8_t *dst, size_t pixel_count) {
    for (size_t i = 0; i < pixel_count; i++) {
        uint8_t gray = src[i];
        dst[i * 3 + 0] = gray;  // B
        dst[i * 3 + 1] = gray;  // G
        dst[i * 3 + 2] = gray;  // R
    }
}

typedef struct {
    const uint8_t *data;
    size_t size;
    size_t offset;
} jpeg_input_ctx_t;

typedef struct {
    frame_t *frame;
} jpeg_output_ctx_t;

typedef struct {
    jpeg_input_ctx_t input;
    jpeg_output_ctx_t output;
} jpeg_decode_ctx_t;

static UINT jpeg_input_func(JDEC *decoder, BYTE *buffer, UINT size) {
    jpeg_decode_ctx_t *ctx = (jpeg_decode_ctx_t *)decoder->device;
    if (ctx == NULL) {
        return 0;
    }

    size_t remaining = ctx->input.size - ctx->input.offset;
    size_t to_copy = remaining < size ? remaining : size;

    if (buffer != NULL && to_copy > 0) {
        memcpy(buffer, ctx->input.data + ctx->input.offset, to_copy);
    }

    ctx->input.offset += to_copy;
    return (UINT)to_copy;
}

static UINT jpeg_output_func(JDEC *decoder, void *bitmap, JRECT *rect) {
    jpeg_decode_ctx_t *ctx = (jpeg_decode_ctx_t *)decoder->device;
    uint8_t *src = (uint8_t *)bitmap;

    if (ctx == NULL || ctx->output.frame == NULL || rect == NULL || src == NULL) {
        return 0;
    }

    frame_t *frame = ctx->output.frame;
    uint16_t rect_width = (uint16_t)(rect->right - rect->left + 1U);
    uint16_t rect_height = (uint16_t)(rect->bottom - rect->top + 1U);

    for (uint16_t y = 0; y < rect_height; y++) {
        for (uint16_t x = 0; x < rect_width; x++) {
            uint16_t dst_x = (uint16_t)rect->left + x;
            uint16_t dst_y = (uint16_t)rect->top + y;
            size_t src_offset = ((size_t)y * rect_width + x) * 3U;
            size_t dst_offset = ((size_t)dst_y * frame->width + dst_x) * FRAME_CHANNELS;

            if (dst_x >= frame->width || dst_y >= frame->height ||
                (dst_offset + 2U) >= FRAME_SIZE) {
                continue;
            }

            frame->data[dst_offset + 0] = src[src_offset + 2];  // B
            frame->data[dst_offset + 1] = src[src_offset + 1];  // G
            frame->data[dst_offset + 2] = src[src_offset + 0];  // R
        }
    }

    return 1;
}

static bool decode_jpeg_to_analysis_frame(const camera_fb_t *fb, frame_t *frame) {
    JDEC decoder;
    jpeg_decode_ctx_t decode_ctx = {
        .input = {
            .data = fb->buf,
            .size = fb->len,
            .offset = 0,
        },
        .output = {
            .frame = frame,
        },
    };
    BYTE *workspace = NULL;
    uint8_t scale = 0;
    JRESULT result;

    if (fb == NULL || frame == NULL || fb->buf == NULL || fb->len == 0) {
        return false;
    }

    workspace = malloc(4096);
    if (workspace == NULL) {
        return false;
    }

    result = jd_prepare(&decoder, jpeg_input_func, workspace, 4096, &decode_ctx);
    if (result != JDR_OK) {
        free(workspace);
        LOG_ERROR("jd_prepare failed: %d", result);
        return false;
    }

    if (decoder.width > FRAME_WIDTH || decoder.height > FRAME_HEIGHT) {
        scale = 1;
    }

    frame->width = (uint16_t)((decoder.width + ((1U << scale) - 1U)) >> scale);
    frame->height = (uint16_t)((decoder.height + ((1U << scale) - 1U)) >> scale);
    if (frame->width > FRAME_WIDTH || frame->height > FRAME_HEIGHT) {
        free(workspace);
        LOG_ERROR("JPEG decode output %ux%u exceeds analysis buffer %ux%u",
                  frame->width, frame->height, FRAME_WIDTH, FRAME_HEIGHT);
        return false;
    }

    result = jd_decomp(&decoder, jpeg_output_func, scale);
    free(workspace);

    if (result != JDR_OK) {
        LOG_ERROR("jd_decomp failed: %d", result);
        return false;
    }

    return true;
}

camera_status_t camera_init(const apis_camera_config_t *config) {
    if (g_is_initialized) {
        return CAMERA_OK;
    }

    // Runtime config is advisory on ESP32; the active install profile chooses
    // the real sensor mode and analysis surface through camera_reconfigure().
    if (config != NULL) {
        if (config->width != FRAME_WIDTH || config->height != FRAME_HEIGHT) {
            LOG_WARN("ESP32 ignores runtime config: using install-profile analysis surface %dx%d (requested %dx%d)",
                     FRAME_WIDTH, FRAME_HEIGHT,
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

        // 16MHz XCLK enables psram_mode in the esp_camera driver (ESP32-S3).
        // psram_mode=true: DMA writes directly into PSRAM frame buffers,
        // eliminating the intermediate DMA→SRAM→PSRAM copy that cam_task does
        // at 20MHz. This avoids MSPI bus starvation when WiFi DMA is active.
        //
        // The OV3660 PLL is tuned for 16MHz XCLK:
        //   VGA non-JPEG: 8MHz SYSCLK, 8MHz PCLK → ~4.44 FPS
        //   QVGA non-JPEG: 16MHz SYSCLK, 8MHz PCLK → ~10.25 FPS
        // 4.44 FPS at VGA = ~225ms per frame — plenty of time for cam_task.
        .xclk_freq_hz = 16000000,
        .ledc_timer = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,

        // GRAYSCALE avoids JPEG decode entirely. JPEG decode (fmt2rgb888)
        // writes 921KB to PSRAM in MCU block order, causing catastrophic
        // cache thrashing on the MSPI bus (>10s CPU stall → INT WDT reset).
        // Grayscale at QVGA: 76KB per frame, converted to BGR with a
        // sequential loop that the PSRAM cache handles well.
        //
        // Espressif recommends fb_count > 1 only for JPEG. For raw/grayscale
        // capture with WiFi enabled, keep a single frame buffer so the driver
        // acquires on demand instead of running the DMA pipeline continuously.
        .pixel_format = PIXFORMAT_GRAYSCALE,
        .frame_size = FRAMESIZE_QVGA,
        .jpeg_quality = 10,                // Ignored for grayscale
        .fb_count = 1,
        .fb_location = CAMERA_FB_IN_PSRAM,
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
    };

    esp_err_t err = esp_camera_init(&esp_cam_config);
    if (err != ESP_OK) {
        LOG_ERROR("esp_camera_init failed: 0x%x", err);
        return CAMERA_ERROR_OPEN_FAILED;
    }

    // Drain initial frame buffers to prevent FB-OVF during the gap between
    // camera init and capture loop start. DMA starts immediately on init but
    // nobody calls fb_get() until run_capture_loop() — if both buffers fill
    // up, DMA overflows and corrupts WiFi driver memory (FB-OVF crash).
    for (int i = 0; i < esp_cam_config.fb_count; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            esp_camera_fb_return(fb);
        }
    }

    g_is_initialized = true;
    g_current_mode = CAMERA_MODE_QVGA_GRAY;
    g_sensor_width = 320;
    g_sensor_height = 240;
    g_analysis_width = 320;
    g_analysis_height = 240;
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

    // Stop the startup drain task before regular capture begins.
    camera_drain_stop();

    g_is_open = true;
    g_sequence = 0;
    g_frames_captured = 0;
    g_frames_dropped = 0;
    g_start_time_us = esp_timer_get_time();
    g_fps_start_time_us = g_start_time_us;
    g_fps_frame_count = 0;
    g_current_fps = 0.0f;
    g_logged_first_fb_wait = false;
    g_logged_first_fb_captured = false;
    g_logged_first_frame_ready = false;

    LOG_INFO("ESP32 camera opened");
    return CAMERA_OK;
}

camera_status_t camera_read_capture(frame_t *frame,
                                    camera_jpeg_frame_t *jpeg_frame,
                                    uint32_t timeout_ms) {
    (void)timeout_ms;  // ESP32 camera is synchronous

    if (!g_is_open) {
        return CAMERA_ERROR_READ_FAILED;
    }

    if (frame == NULL) {
        return CAMERA_ERROR_READ_FAILED;
    }

    // Skip frame_init() — it does memset(frame->data, 0, FRAME_SIZE) which
    // zeroes 921KB of PSRAM. This causes MSPI bus starvation while camera
    // DMA is active (TG1WDT_SYS_RST crash). The pixel data is fully
    // overwritten by JPEG decode or RGB565 conversion below, so the
    // memset is redundant. Just initialize metadata fields.
    frame->timestamp_ms = 0;
    frame->sequence = 0;
    frame->width = g_analysis_width;
    frame->height = g_analysis_height;
    frame->valid = false;
    if (jpeg_frame != NULL) {
        jpeg_frame->size = 0;
        jpeg_frame->width = 0;
        jpeg_frame->height = 0;
        jpeg_frame->valid = false;
    }

    if (!g_logged_first_fb_wait) {
        LOG_INFO("Awaiting first camera frame from driver");
        g_logged_first_fb_wait = true;
    }

    // Capture frame
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        LOG_ERROR("esp_camera_fb_get failed");
        g_frames_dropped++;
        return CAMERA_ERROR_READ_FAILED;
    }

    if (!g_logged_first_fb_captured) {
        LOG_INFO("First camera fb received: %ux%u format=%d len=%zu",
                 fb->width, fb->height, fb->format, (size_t)fb->len);
        g_logged_first_fb_captured = true;
    }

    size_t pixel_count = (size_t)fb->width * (size_t)fb->height;
    size_t max_pixels = (size_t)FRAME_WIDTH * (size_t)FRAME_HEIGHT;
    if (fb->format == PIXFORMAT_GRAYSCALE && pixel_count > max_pixels) {
        LOG_ERROR("Frame too large for buffer: %dx%d exceeds %dx%d",
                  fb->width, fb->height, FRAME_WIDTH, FRAME_HEIGHT);
        esp_camera_fb_return(fb);
        g_frames_dropped++;
        return CAMERA_ERROR_READ_FAILED;
    }

    // Convert camera pixel format to BGR24 (frame_t format).
    // GRAYSCALE is the primary path — avoids JPEG decode entirely.
    if (fb->format == PIXFORMAT_GRAYSCALE) {
        // Verify buffer size
        if (fb->len < pixel_count) {
            LOG_ERROR("Short grayscale frame: got %zu bytes, need %zu",
                      (size_t)fb->len, (size_t)pixel_count);
            esp_camera_fb_return(fb);
            g_frames_dropped++;
            return CAMERA_ERROR_READ_FAILED;
        }
        // Feed raw grayscale to QR scanner BEFORE BGR expansion.
        // 307KB PSRAM→PSRAM memcpy while holding fb (one DMA buffer locked).
        // This avoids the 921KB BGR→gray conversion in qr_scanner_scan_frame()
        // which causes MSPI bus starvation and crashes.
        if (qr_scanner_is_initialized()) {
            qr_scanner_feed_grayscale(fb->buf, fb->width, fb->height);
        }

        // Sequential grayscale → BGR conversion. Perfect cache behavior:
        // reads source linearly (307KB), writes destination linearly (921KB).
        // No MSPI bus contention — total time ~10ms vs >10s for JPEG decode.
        grayscale_to_bgr24(fb->buf, frame->data, pixel_count);
        frame->width = fb->width;
        frame->height = fb->height;
        esp_camera_fb_return(fb);
        fb = NULL;
    } else if (fb->format == PIXFORMAT_JPEG) {
        if (jpeg_frame != NULL && jpeg_frame->data != NULL) {
            if (fb->len > jpeg_frame->capacity) {
                LOG_WARN("JPEG frame %zu exceeds caller capacity %zu; skipping raw copy",
                         (size_t)fb->len, jpeg_frame->capacity);
            }
            else {
                memcpy(jpeg_frame->data, fb->buf, fb->len);
                jpeg_frame->size = fb->len;
                jpeg_frame->width = fb->width;
                jpeg_frame->height = fb->height;
                jpeg_frame->valid = true;
            }
        }

        if (!decode_jpeg_to_analysis_frame(fb, frame)) {
            LOG_ERROR("JPEG decode failed (len=%zu)", (size_t)fb->len);
            esp_camera_fb_return(fb);
            g_frames_dropped++;
            return CAMERA_ERROR_READ_FAILED;
        }
        esp_camera_fb_return(fb);
        fb = NULL;
    } else {
        // Fallback: copy raw data
        size_t copy_size = fb->len < FRAME_SIZE ? fb->len : FRAME_SIZE;
        memcpy(frame->data, fb->buf, copy_size);
        frame->width = fb->width;
        frame->height = fb->height;
        esp_camera_fb_return(fb);
        fb = NULL;
    }

    // Set frame metadata
    frame->timestamp_ms = (uint32_t)((esp_timer_get_time() - g_start_time_us) / 1000);
    frame->sequence = g_sequence++;
    frame->valid = true;

    if (!g_logged_first_frame_ready) {
        LOG_INFO("First converted frame ready for pipeline");
        g_logged_first_frame_ready = true;
    }

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

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    return camera_read_capture(frame, NULL, timeout_ms);
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

camera_status_t camera_reconfigure(camera_mode_t mode) {
    // Stop drain task if running (prevents concurrent fb_get)
    camera_drain_stop();

    // Deinit current camera (stops DMA, frees camera buffers)
    if (g_is_initialized) {
        esp_camera_deinit();
        g_is_initialized = false;
        g_is_open = false;
    }

    // Configure new mode
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
        .xclk_freq_hz = 16000000,
        .ledc_timer = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,
        .pixel_format = PIXFORMAT_GRAYSCALE,
        .jpeg_quality = 10,
        .fb_location = CAMERA_FB_IN_PSRAM,
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
    };

    switch (mode) {
        case CAMERA_MODE_QVGA_GRAY:
            esp_cam_config.frame_size = FRAMESIZE_QVGA;  // 320x240
            esp_cam_config.fb_count = 1;                   // ~77KB
            esp_cam_config.pixel_format = PIXFORMAT_GRAYSCALE;
            esp_cam_config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
            break;
        case CAMERA_MODE_VGA_GRAY:
            esp_cam_config.frame_size = FRAMESIZE_VGA;    // 640x480
            esp_cam_config.fb_count = 1;                   // ~307KB
            esp_cam_config.pixel_format = PIXFORMAT_GRAYSCALE;
            esp_cam_config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
            break;
        case CAMERA_MODE_XGA_GRAY:
            esp_cam_config.frame_size = FRAMESIZE_XGA;    // 1024x768
            esp_cam_config.fb_count = 1;                  // ~786KB
            esp_cam_config.pixel_format = PIXFORMAT_GRAYSCALE;
            esp_cam_config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
            break;
        case CAMERA_MODE_HD_JPEG:
            esp_cam_config.frame_size = FRAMESIZE_HD;     // 1280x720
            esp_cam_config.fb_count = 2;
            esp_cam_config.pixel_format = PIXFORMAT_JPEG;
            esp_cam_config.jpeg_quality = 12;
            esp_cam_config.grab_mode = CAMERA_GRAB_LATEST;
            break;
        default:
            LOG_ERROR("camera_reconfigure: invalid mode=%d", (int)mode);
            return CAMERA_ERROR_CONFIG_FAILED;
    }

    esp_err_t err = esp_camera_init(&esp_cam_config);
    if (err != ESP_OK) {
        LOG_ERROR("camera_reconfigure: esp_camera_init failed: 0x%x", err);
        return CAMERA_ERROR_OPEN_FAILED;
    }

    // Drain initial frames to prevent FB-OVF
    for (int i = 0; i < esp_cam_config.fb_count; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            esp_camera_fb_return(fb);
        }
    }

    g_is_initialized = true;
    g_is_open = false;  // Caller must call camera_open() if needed
    g_current_mode = mode;
    apply_qr_sensor_tuning(mode);
    switch (mode) {
        case CAMERA_MODE_QVGA_GRAY:
            g_sensor_width = 320;
            g_sensor_height = 240;
            g_analysis_width = 320;
            g_analysis_height = 240;
            LOG_INFO("Camera reconfigured to QVGA_GRAY (320x240, 1 fb)");
            break;
        case CAMERA_MODE_VGA_GRAY:
            g_sensor_width = 640;
            g_sensor_height = 480;
            g_analysis_width = 640;
            g_analysis_height = 480;
            LOG_INFO("Camera reconfigured to VGA_GRAY (640x480, 1 fb)");
            break;
        case CAMERA_MODE_XGA_GRAY:
            g_sensor_width = 1024;
            g_sensor_height = 768;
            g_analysis_width = 1024;
            g_analysis_height = 768;
            LOG_INFO("Camera reconfigured to XGA_GRAY (1024x768, 1 fb)");
            break;
        case CAMERA_MODE_HD_JPEG:
            g_sensor_width = 1280;
            g_sensor_height = 720;
            g_analysis_width = FRAME_WIDTH;
            g_analysis_height = FRAME_HEIGHT;
            LOG_INFO("Camera reconfigured to HD_JPEG (1280x720 sensor, %ux%u analysis)",
                     FRAME_WIDTH, FRAME_HEIGHT);
            break;
        default:
            break;
    }
    return CAMERA_OK;
}

camera_status_t camera_read_qr(uint32_t timeout_ms) {
    (void)timeout_ms;

    if (!g_is_initialized) {
        return CAMERA_ERROR_READ_FAILED;
    }
    if (!qr_scanner_is_initialized()) {
        LOG_ERROR("camera_read_qr: QR scanner is not initialized");
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        return CAMERA_ERROR_READ_FAILED;
    }

    if (fb->format != PIXFORMAT_GRAYSCALE) {
        LOG_ERROR("camera_read_qr: unexpected pixel format %d", (int)fb->format);
        esp_camera_fb_return(fb);
        return CAMERA_ERROR_READ_FAILED;
    }

    // Feed raw grayscale directly to QR scanner — no BGR conversion needed.
    // At QVGA this is a 76KB copy, much lighter than VGA's 307KB.
    qr_scanner_status_t qr_status =
        qr_scanner_feed_grayscale(fb->buf, fb->width, fb->height);
    if (qr_status != QR_SCANNER_OK) {
        LOG_ERROR("camera_read_qr: qr_scanner_feed_grayscale failed: %s",
                  qr_scanner_status_str(qr_status));
        esp_camera_fb_return(fb);
        return CAMERA_ERROR_READ_FAILED;
    }

    update_last_qr_frame(fb->buf, (uint16_t)fb->width, (uint16_t)fb->height);

    esp_camera_fb_return(fb);
    return CAMERA_OK;
}

void camera_set_qr_profile(camera_qr_profile_t profile) {
    if (profile == g_qr_profile) {
        return;
    }

    g_qr_profile = profile;
    if (g_is_initialized &&
        (g_current_mode == CAMERA_MODE_VGA_GRAY || g_current_mode == CAMERA_MODE_XGA_GRAY)) {
        apply_qr_sensor_tuning(g_current_mode);
    }
}

camera_qr_profile_t camera_get_qr_profile(void) {
    return g_qr_profile;
}

const char *camera_qr_profile_name(camera_qr_profile_t profile) {
    switch (profile) {
        case CAMERA_QR_PROFILE_SCREEN_GLARE:
            return "screen_glare";
        case CAMERA_QR_PROFILE_SCREEN_BALANCED:
            return "screen_balanced";
        case CAMERA_QR_PROFILE_SCREEN_BRIGHT:
            return "screen_bright";
        default:
            return "unknown";
    }
}

size_t camera_copy_last_qr_frame(uint8_t *dst, size_t capacity,
                                 uint16_t *width, uint16_t *height) {
    for (int attempt = 0; attempt < 3; attempt++) {
        uint32_t before = g_last_qr_frame_version;
        if (before == 0 || (before & 1U) != 0U || !g_last_qr_frame) {
            return 0;
        }

        uint16_t local_width = g_last_qr_width;
        uint16_t local_height = g_last_qr_height;
        size_t needed = (size_t)local_width * (size_t)local_height;
        if (needed == 0) {
            return 0;
        }

        if (width) *width = local_width;
        if (height) *height = local_height;

        if (!dst) {
            return needed;
        }
        if (capacity < needed) {
            return 0;
        }

        memcpy(dst, g_last_qr_frame, needed);

        uint32_t after = g_last_qr_frame_version;
        if (before == after && (after & 1U) == 0U) {
            return needed;
        }
    }

    return 0;
}

void camera_close(void) {
    camera_drain_stop();
    if (g_is_initialized) {
        esp_camera_deinit();
        g_is_initialized = false;
    }
    psram_free(g_last_qr_frame);
    g_last_qr_frame = NULL;
    g_last_qr_frame_capacity = 0;
    g_last_qr_frame_version = 0;
    g_last_qr_width = 0;
    g_last_qr_height = 0;
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

// --------------------------------------------------------------------------
// Camera drain task — prevents FB-OVF between camera_init and camera_read.
//
// esp_camera_init() starts DMA immediately. If nobody calls fb_get() for
// >200ms, both frame buffers fill and DMA overflows. On ESP32-S3, FB-OVF
// can corrupt WiFi driver memory (DMA writes to stale buffer addresses).
//
// The drain task runs at low priority, continuously calling fb_get/fb_return
// to keep buffers available for DMA. It runs between camera_init() in
// app_main() and the first camera_read() in run_capture_loop().
// --------------------------------------------------------------------------

static void camera_drain_task(void *pvParameters) {
    (void)pvParameters;
    while (g_drain_running) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            esp_camera_fb_return(fb);
        }
        // fb_get() already blocks until next frame (~100ms at 10fps).
        // No extra delay needed — just yield to let other tasks run.
        taskYIELD();
    }
    g_drain_task_handle = NULL;
    vTaskDelete(NULL);
}

void camera_drain_start(void) {
    if (g_drain_task_handle != NULL || !g_is_initialized) {
        return;
    }
    g_drain_running = true;
    // Pin to CPU1 — WiFi driver runs on CPU0. At priority 1 on CPU0,
    // WiFi's priority-23 RF calibration starves the drain task for >100ms,
    // causing FB-OVF. On CPU1 the drain task runs uncontested.
    BaseType_t task_created = xTaskCreatePinnedToCore(camera_drain_task, "cam_drain",
                                                      4096, NULL, 5,
                                                      &g_drain_task_handle, 1);
    if (task_created != pdPASS) {
        g_drain_running = false;
        g_drain_task_handle = NULL;
        LOG_ERROR("Failed to start camera drain task");
        return;
    }
    LOG_INFO("Camera drain task started (CPU1)");
}

void camera_drain_stop(void) {
    if (!g_drain_running && g_drain_task_handle == NULL) {
        return;
    }
    g_drain_running = false;
    // Wait briefly for task to exit gracefully (it checks g_drain_running
    // each iteration). fb_get() blocks on a semaphore so the task may not
    // see the flag until the next frame arrives (~100ms at 10fps).
    for (int i = 0; i < 30 && g_drain_task_handle != NULL; i++) {
        vTaskDelay(1);
    }
    // If task didn't exit, force-delete it. This can happen if fb_get()
    // is permanently blocked (e.g. camera DMA stalled after FB-OVF).
    if (g_drain_task_handle != NULL) {
        LOG_WARN("Drain task did not exit gracefully — force deleting");
        vTaskDelete(g_drain_task_handle);
        g_drain_task_handle = NULL;
    }
    LOG_INFO("Camera drain task stopped");
}

#endif // ESP_PLATFORM
