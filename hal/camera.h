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
