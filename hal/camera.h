/**
 * Hardware Abstraction Layer - Camera Interface
 *
 * Platform-independent camera API.
 * Implementations in hal/pi/camera_pi.c and hal/esp32/camera_esp32.c
 */

#ifndef APIS_HAL_CAMERA_H
#define APIS_HAL_CAMERA_H

#include "frame.h"
#include "config.h"
#include <stdbool.h>
#include <stdint.h>

/**
 * Camera operating mode for reconfiguration.
 * Used to switch between QR scanning and detection phases.
 */
typedef enum {
    CAMERA_MODE_QVGA_GRAY,  // 320x240 grayscale, fb_count=1 (QR scanning, ~77KB)
    CAMERA_MODE_VGA_GRAY,   // 640x480 grayscale, fb_count=1 (high-detail mode)
    CAMERA_MODE_XGA_GRAY,   // 1024x768 grayscale, fb_count=1 (high-detail QR scan)
    CAMERA_MODE_HD_JPEG,    // 1280x720 JPEG sensor, 640x360 analysis surface
} camera_mode_t;

typedef enum {
    CAMERA_QR_PROFILE_SCREEN_GLARE = 0,
    CAMERA_QR_PROFILE_SCREEN_BALANCED,
    CAMERA_QR_PROFILE_SCREEN_BRIGHT,
} camera_qr_profile_t;

/**
 * Camera status codes.
 */
typedef enum {
    CAMERA_OK = 0,
    CAMERA_ERROR_NOT_FOUND,       // Camera device not found
    CAMERA_ERROR_OPEN_FAILED,     // Failed to open device
    CAMERA_ERROR_CONFIG_FAILED,   // Configuration error
    CAMERA_ERROR_READ_FAILED,     // Frame read timeout or error
    CAMERA_ERROR_DISCONNECTED,    // Camera disconnected mid-operation
    CAMERA_ERROR_NO_MEMORY,       // Failed to allocate buffers
} camera_status_t;

/**
 * Camera statistics for monitoring.
 */
typedef struct {
    uint32_t frames_captured;     // Total frames since open
    uint32_t frames_dropped;      // Frames dropped (buffer overrun)
    float current_fps;            // Measured FPS
    uint32_t uptime_s;            // Seconds since open
    uint32_t reconnect_count;     // Number of reconnections
} camera_stats_t;

typedef struct {
    uint8_t *data;
    size_t capacity;
    size_t size;
    uint16_t width;
    uint16_t height;
    bool valid;
} camera_jpeg_frame_t;

/**
 * Initialize the camera subsystem.
 * Must be called before any other camera functions.
 *
 * @param config Camera configuration
 * @return CAMERA_OK on success
 */
camera_status_t camera_init(const apis_camera_config_t *config);

/**
 * Open the camera and start streaming.
 *
 * @return CAMERA_OK on success
 */
camera_status_t camera_open(void);

/**
 * Read a single frame from the camera.
 * Blocks until frame is available or timeout.
 *
 * @param frame Output frame structure (must be pre-allocated)
 * @param timeout_ms Maximum wait time (0 = no wait, blocks if no frame ready)
 * @return CAMERA_OK on success, CAMERA_ERROR_READ_FAILED on timeout
 */
camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms);

camera_status_t camera_read_capture(frame_t *frame,
                                    camera_jpeg_frame_t *jpeg_frame,
                                    uint32_t timeout_ms);

/**
 * Check if camera is currently open and streaming.
 *
 * @return true if camera is ready
 */
bool camera_is_open(void);

/**
 * Get measured frames per second.
 * Calculated over the last few seconds of operation.
 *
 * @return Current FPS (0 if not measuring)
 */
float camera_get_fps(void);

/**
 * Get camera statistics.
 *
 * @param stats Output statistics structure
 */
void camera_get_stats(camera_stats_t *stats);

/**
 * Reconfigure camera to a different mode (resolution/buffer count).
 *
 * On ESP32: deinits camera, changes config, reinits. Stops drain task first.
 * On Pi/test: no-op (returns CAMERA_OK).
 *
 * @param mode Target camera mode
 * @return CAMERA_OK on success
 */
camera_status_t camera_reconfigure(camera_mode_t mode);

/**
 * Lightweight camera read for QR scanning phase (ESP32 only).
 *
 * Gets a QVGA grayscale frame, feeds it directly to qr_scanner via
 * qr_scanner_feed_grayscale(), and returns the frame buffer immediately.
 * No BGR conversion, no frame_t allocation needed.
 *
 * On Pi/test: no-op (returns CAMERA_OK).
 *
 * @param timeout_ms Maximum wait time for frame
 * @return CAMERA_OK on success
 */
camera_status_t camera_read_qr(uint32_t timeout_ms);

void camera_set_qr_profile(camera_qr_profile_t profile);
camera_qr_profile_t camera_get_qr_profile(void);
const char *camera_qr_profile_name(camera_qr_profile_t profile);

/**
 * Copy the most recent QR-scanning grayscale frame into a caller buffer.
 *
 * This is a debug/operator-feedback path used during onboarding so the
 * current camera framing can be inspected without leaving QR mode.
 *
 * If dst is NULL, the function reports the required byte count only.
 *
 * @param dst Destination buffer for raw 8-bit grayscale pixels (optional)
 * @param capacity Size of destination buffer in bytes
 * @param width Output frame width (optional)
 * @param height Output frame height (optional)
 * @return Number of grayscale bytes copied or required, 0 if no preview exists
 */
size_t camera_copy_last_qr_frame(uint8_t *dst, size_t capacity,
                                 uint16_t *width, uint16_t *height);

/**
 * Close camera and release resources.
 */
void camera_close(void);

/**
 * Get human-readable error message.
 *
 * @param status Status code
 * @return Static string description
 */
const char *camera_status_str(camera_status_t status);

/**
 * Set frame callback for asynchronous processing.
 * If set, callback is invoked after each successful frame capture.
 *
 * @param callback Function pointer (NULL to disable)
 * @param user_data User data passed to callback
 */
typedef void (*camera_frame_callback_t)(const frame_t *frame, void *user_data);
void camera_set_callback(camera_frame_callback_t callback, void *user_data);

/**
 * Start background frame drain task (ESP32 only).
 *
 * On ESP32, esp_camera_init() starts DMA immediately. If nobody calls
 * camera_read() for >200ms, frame buffers overflow (FB-OVF) and DMA
 * may corrupt memory. Call this after camera_init() and before any long
 * operations (WiFi init). Call camera_drain_stop() before camera_read().
 *
 * No-op on non-ESP32 platforms.
 */
void camera_drain_start(void);

/**
 * Stop background frame drain task.
 * Must be called before camera_read() to avoid concurrent fb_get().
 */
void camera_drain_stop(void);

#endif // APIS_HAL_CAMERA_H
