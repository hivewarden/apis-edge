/**
 * Raspberry Pi camera implementation using V4L2.
 *
 * Supports:
 * - USB webcams (any V4L2-compatible device)
 * - Pi Camera Module via libcamera (mapped to /dev/video0)
 *
 * Uses mmap for efficient frame capture with multiple buffers
 * to prevent frame drops.
 */

#include "camera.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <time.h>
#include <pthread.h>
#include <linux/videodev2.h>

#define NUM_BUFFERS 4
#define FPS_SAMPLE_INTERVAL_MS 1000

// Internal camera state
typedef struct {
    int fd;
    uint8_t *buffers[NUM_BUFFERS];
    size_t buffer_lengths[NUM_BUFFERS];
    uint16_t capture_width;
    uint16_t capture_height;

    // Frame tracking
    uint32_t sequence;
    uint32_t frames_captured;
    uint32_t frames_dropped;

    // FPS measurement
    uint32_t fps_frame_count;
    uint64_t fps_start_time_ms;
    float current_fps;

    // Timing
    uint64_t open_time_ms;
    uint32_t reconnect_count;

    // State
    bool is_initialized;
    bool is_open;
    uint32_t pixel_format;

    // Configuration
    apis_camera_config_t config;

    // Callback
    camera_frame_callback_t callback;
    void *callback_user_data;
} camera_state_t;

static camera_state_t g_camera = {
    .fd = -1,
    .is_initialized = false,
    .is_open = false,
};

// Mutex for thread-safe callback access
static pthread_mutex_t g_callback_mutex = PTHREAD_MUTEX_INITIALIZER;

/**
 * Get current time in milliseconds (monotonic clock).
 */
static uint64_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

/**
 * Convert YUYV to BGR24.
 * YUYV packs two pixels as Y0 U Y1 V.
 */
static void yuyv_to_bgr(const uint8_t *src, uint8_t *dst, size_t width, size_t height) {
    for (size_t i = 0; i < width * height / 2; i++) {
        int y0 = src[i * 4 + 0];
        int u  = src[i * 4 + 1];
        int y1 = src[i * 4 + 2];
        int v  = src[i * 4 + 3];

        // Convert to RGB (clamped to 0-255)
        int c0 = y0 - 16;
        int c1 = y1 - 16;
        int d = u - 128;
        int e = v - 128;

        // First pixel
        int r0 = (298 * c0 + 409 * e + 128) >> 8;
        int g0 = (298 * c0 - 100 * d - 208 * e + 128) >> 8;
        int b0 = (298 * c0 + 516 * d + 128) >> 8;

        // Second pixel
        int r1 = (298 * c1 + 409 * e + 128) >> 8;
        int g1 = (298 * c1 - 100 * d - 208 * e + 128) >> 8;
        int b1 = (298 * c1 + 516 * d + 128) >> 8;

        // Clamp and store as BGR
        dst[i * 6 + 0] = (uint8_t)(b0 < 0 ? 0 : (b0 > 255 ? 255 : b0));
        dst[i * 6 + 1] = (uint8_t)(g0 < 0 ? 0 : (g0 > 255 ? 255 : g0));
        dst[i * 6 + 2] = (uint8_t)(r0 < 0 ? 0 : (r0 > 255 ? 255 : r0));
        dst[i * 6 + 3] = (uint8_t)(b1 < 0 ? 0 : (b1 > 255 ? 255 : b1));
        dst[i * 6 + 4] = (uint8_t)(g1 < 0 ? 0 : (g1 > 255 ? 255 : g1));
        dst[i * 6 + 5] = (uint8_t)(r1 < 0 ? 0 : (r1 > 255 ? 255 : r1));
    }
}

camera_status_t camera_init(const apis_camera_config_t *config) {
    if (config == NULL) {
        LOG_ERROR("Camera config is NULL");
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    // Reset state
    memset(&g_camera, 0, sizeof(g_camera));
    g_camera.fd = -1;
    g_camera.config = *config;
    g_camera.is_initialized = true;

    LOG_INFO("Camera initialized (device: %s, %dx%d @ %d fps)",
             config->device_path, config->width, config->height, config->fps);

    return CAMERA_OK;
}

camera_status_t camera_open(void) {
    if (!g_camera.is_initialized) {
        LOG_ERROR("Camera not initialized");
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    if (g_camera.is_open) {
        LOG_DEBUG("Camera already open");
        return CAMERA_OK;
    }

    // Open device
    g_camera.fd = open(g_camera.config.device_path, O_RDWR | O_NONBLOCK);
    if (g_camera.fd < 0) {
        LOG_ERROR("Failed to open %s: %s",
                  g_camera.config.device_path, strerror(errno));
        return CAMERA_ERROR_NOT_FOUND;
    }

    // Query capabilities
    struct v4l2_capability cap;
    if (ioctl(g_camera.fd, VIDIOC_QUERYCAP, &cap) < 0) {
        LOG_ERROR("VIDIOC_QUERYCAP failed: %s", strerror(errno));
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_OPEN_FAILED;
    }

    LOG_DEBUG("Camera: %s, driver: %s", cap.card, cap.driver);

    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
        LOG_ERROR("Device doesn't support video capture");
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_OPEN_FAILED;
    }

    if (!(cap.capabilities & V4L2_CAP_STREAMING)) {
        LOG_ERROR("Device doesn't support streaming");
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_OPEN_FAILED;
    }

    // Try to set BGR24 format first
    struct v4l2_format fmt = {0};
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width = g_camera.config.width;
    fmt.fmt.pix.height = g_camera.config.height;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_BGR24;
    fmt.fmt.pix.field = V4L2_FIELD_NONE;

    if (ioctl(g_camera.fd, VIDIOC_S_FMT, &fmt) < 0) {
        // Try YUYV fallback (more common)
        LOG_DEBUG("BGR24 not supported, trying YUYV");
        fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
        if (ioctl(g_camera.fd, VIDIOC_S_FMT, &fmt) < 0) {
            LOG_ERROR("VIDIOC_S_FMT failed: %s", strerror(errno));
            close(g_camera.fd);
            g_camera.fd = -1;
            return CAMERA_ERROR_CONFIG_FAILED;
        }
        LOG_INFO("Using YUYV format (will convert to BGR)");
    }

    g_camera.pixel_format = fmt.fmt.pix.pixelformat;
    g_camera.capture_width = (uint16_t)fmt.fmt.pix.width;
    g_camera.capture_height = (uint16_t)fmt.fmt.pix.height;

    size_t capture_pixels = (size_t)g_camera.capture_width * (size_t)g_camera.capture_height;
    size_t frame_pixels = (size_t)FRAME_WIDTH * (size_t)FRAME_HEIGHT;
    if (capture_pixels > frame_pixels) {
        LOG_ERROR("Camera negotiated %ux%u which exceeds frame buffer %dx%d",
                  g_camera.capture_width, g_camera.capture_height, FRAME_WIDTH, FRAME_HEIGHT);
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    // Log actual format
    LOG_INFO("Format: %dx%d, pixelformat: %c%c%c%c",
             g_camera.capture_width, g_camera.capture_height,
             (fmt.fmt.pix.pixelformat >> 0) & 0xFF,
             (fmt.fmt.pix.pixelformat >> 8) & 0xFF,
             (fmt.fmt.pix.pixelformat >> 16) & 0xFF,
             (fmt.fmt.pix.pixelformat >> 24) & 0xFF);

    // Set frame rate
    struct v4l2_streamparm parm = {0};
    parm.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    parm.parm.capture.timeperframe.numerator = 1;
    parm.parm.capture.timeperframe.denominator = g_camera.config.fps;

    if (ioctl(g_camera.fd, VIDIOC_S_PARM, &parm) < 0) {
        LOG_WARN("Failed to set frame rate (may use camera default)");
    }

    // Request buffers
    struct v4l2_requestbuffers req = {0};
    req.count = NUM_BUFFERS;
    req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;

    if (ioctl(g_camera.fd, VIDIOC_REQBUFS, &req) < 0) {
        LOG_ERROR("VIDIOC_REQBUFS failed: %s", strerror(errno));
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    if (req.count < 2) {
        LOG_ERROR("Insufficient buffer memory");
        close(g_camera.fd);
        g_camera.fd = -1;
        return CAMERA_ERROR_NO_MEMORY;
    }

    LOG_DEBUG("Allocated %d buffers", req.count);

    // Map buffers
    for (unsigned int i = 0; i < req.count && i < NUM_BUFFERS; i++) {
        struct v4l2_buffer buf = {0};
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (ioctl(g_camera.fd, VIDIOC_QUERYBUF, &buf) < 0) {
            LOG_ERROR("VIDIOC_QUERYBUF failed for buffer %d", i);
            camera_close();
            return CAMERA_ERROR_CONFIG_FAILED;
        }

        g_camera.buffer_lengths[i] = buf.length;
        g_camera.buffers[i] = mmap(NULL, buf.length,
                                    PROT_READ | PROT_WRITE,
                                    MAP_SHARED, g_camera.fd, buf.m.offset);

        if (g_camera.buffers[i] == MAP_FAILED) {
            LOG_ERROR("mmap failed for buffer %d: %s", i, strerror(errno));
            camera_close();
            return CAMERA_ERROR_NO_MEMORY;
        }
    }

    // Queue all buffers
    for (unsigned int i = 0; i < req.count && i < NUM_BUFFERS; i++) {
        struct v4l2_buffer buf = {0};
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (ioctl(g_camera.fd, VIDIOC_QBUF, &buf) < 0) {
            LOG_ERROR("VIDIOC_QBUF failed for buffer %d", i);
            camera_close();
            return CAMERA_ERROR_CONFIG_FAILED;
        }
    }

    // Start streaming
    enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (ioctl(g_camera.fd, VIDIOC_STREAMON, &type) < 0) {
        LOG_ERROR("VIDIOC_STREAMON failed: %s", strerror(errno));
        camera_close();
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    // Initialize state
    g_camera.is_open = true;
    g_camera.sequence = 0;
    g_camera.frames_captured = 0;
    g_camera.frames_dropped = 0;
    g_camera.fps_frame_count = 0;
    g_camera.fps_start_time_ms = get_time_ms();
    g_camera.open_time_ms = g_camera.fps_start_time_ms;
    g_camera.current_fps = 0.0f;

    LOG_INFO("Camera opened successfully");
    return CAMERA_OK;
}

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    if (!g_camera.is_open) {
        LOG_ERROR("Camera not open");
        return CAMERA_ERROR_READ_FAILED;
    }

    if (frame == NULL) {
        LOG_ERROR("Frame pointer is NULL");
        return CAMERA_ERROR_READ_FAILED;
    }

    frame_init(frame);

    // Wait for frame with select
    fd_set fds;
    FD_ZERO(&fds);
    FD_SET(g_camera.fd, &fds);

    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;

    int r = select(g_camera.fd + 1, &fds, NULL, NULL,
                   timeout_ms > 0 ? &tv : NULL);

    if (r < 0) {
        if (errno == EINTR) {
            return CAMERA_ERROR_READ_FAILED;
        }
        LOG_ERROR("select failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    if (r == 0) {
        // Timeout
        return CAMERA_ERROR_READ_FAILED;
    }

    // Dequeue buffer
    struct v4l2_buffer buf = {0};
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;

    if (ioctl(g_camera.fd, VIDIOC_DQBUF, &buf) < 0) {
        if (errno == EAGAIN) {
            return CAMERA_ERROR_READ_FAILED;
        }
        LOG_ERROR("VIDIOC_DQBUF failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    size_t capture_pixels = (size_t)g_camera.capture_width * (size_t)g_camera.capture_height;
    size_t frame_pixels = (size_t)FRAME_WIDTH * (size_t)FRAME_HEIGHT;
    if (capture_pixels > frame_pixels) {
        LOG_ERROR("Frame dimensions %ux%u exceed frame buffer bounds",
                  g_camera.capture_width, g_camera.capture_height);
        g_camera.frames_dropped++;
        (void)ioctl(g_camera.fd, VIDIOC_QBUF, &buf);
        return CAMERA_ERROR_READ_FAILED;
    }

    // Convert/copy frame data
    if (g_camera.pixel_format == V4L2_PIX_FMT_BGR24) {
        size_t expected_bytes = capture_pixels * FRAME_CHANNELS;
        if (buf.bytesused < expected_bytes) {
            LOG_ERROR("Short BGR frame: got %u bytes, need %zu",
                      buf.bytesused, expected_bytes);
            g_camera.frames_dropped++;
            (void)ioctl(g_camera.fd, VIDIOC_QBUF, &buf);
            return CAMERA_ERROR_READ_FAILED;
        }

        // Direct copy
        memcpy(frame->data, g_camera.buffers[buf.index], expected_bytes);
    } else if (g_camera.pixel_format == V4L2_PIX_FMT_YUYV) {
        size_t required_input_bytes = capture_pixels * 2;
        if (buf.bytesused < required_input_bytes) {
            LOG_ERROR("Short YUYV frame: got %u bytes, need %zu",
                      buf.bytesused, required_input_bytes);
            g_camera.frames_dropped++;
            (void)ioctl(g_camera.fd, VIDIOC_QBUF, &buf);
            return CAMERA_ERROR_READ_FAILED;
        }

        // Convert YUYV to BGR
        yuyv_to_bgr(g_camera.buffers[buf.index], frame->data,
                    g_camera.capture_width, g_camera.capture_height);
    } else {
        // Unknown format - just copy raw data
        size_t copy_size = buf.bytesused < FRAME_SIZE ? buf.bytesused : FRAME_SIZE;
        memcpy(frame->data, g_camera.buffers[buf.index], copy_size);
    }

    // Set frame metadata
    frame->timestamp_ms = (uint32_t)(get_time_ms() - g_camera.open_time_ms);
    frame->sequence = g_camera.sequence++;
    frame->width = g_camera.capture_width;
    frame->height = g_camera.capture_height;
    frame->valid = true;

    g_camera.frames_captured++;
    g_camera.fps_frame_count++;

    // Update FPS measurement
    uint64_t now = get_time_ms();
    uint64_t elapsed = now - g_camera.fps_start_time_ms;
    if (elapsed >= FPS_SAMPLE_INTERVAL_MS) {
        g_camera.current_fps = (float)g_camera.fps_frame_count * 1000.0f / (float)elapsed;
        g_camera.fps_frame_count = 0;
        g_camera.fps_start_time_ms = now;
    }

    // Re-queue buffer
    if (ioctl(g_camera.fd, VIDIOC_QBUF, &buf) < 0) {
        LOG_ERROR("VIDIOC_QBUF failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    // Invoke callback if set (thread-safe access)
    pthread_mutex_lock(&g_callback_mutex);
    camera_frame_callback_t cb = g_camera.callback;
    void *cb_data = g_camera.callback_user_data;
    pthread_mutex_unlock(&g_callback_mutex);

    if (cb) {
        cb(frame, cb_data);
    }

    return CAMERA_OK;
}

bool camera_is_open(void) {
    return g_camera.is_open;
}

float camera_get_fps(void) {
    return g_camera.current_fps;
}

void camera_get_stats(camera_stats_t *stats) {
    if (stats == NULL) return;

    stats->frames_captured = g_camera.frames_captured;
    stats->frames_dropped = g_camera.frames_dropped;
    stats->current_fps = g_camera.current_fps;
    stats->reconnect_count = g_camera.reconnect_count;

    if (g_camera.is_open) {
        stats->uptime_s = (uint32_t)((get_time_ms() - g_camera.open_time_ms) / 1000);
    } else {
        stats->uptime_s = 0;
    }
}

void camera_close(void) {
    if (g_camera.fd >= 0) {
        // Stop streaming
        enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        ioctl(g_camera.fd, VIDIOC_STREAMOFF, &type);

        // Unmap buffers
        for (int i = 0; i < NUM_BUFFERS; i++) {
            if (g_camera.buffers[i] && g_camera.buffers[i] != MAP_FAILED) {
                munmap(g_camera.buffers[i], g_camera.buffer_lengths[i]);
                g_camera.buffers[i] = NULL;
            }
        }

        close(g_camera.fd);
        g_camera.fd = -1;
    }

    g_camera.is_open = false;
    LOG_INFO("Camera closed");
}

const char *camera_status_str(camera_status_t status) {
    switch (status) {
        case CAMERA_OK:                return "OK";
        case CAMERA_ERROR_NOT_FOUND:   return "Camera not found";
        case CAMERA_ERROR_OPEN_FAILED: return "Failed to open camera";
        case CAMERA_ERROR_CONFIG_FAILED: return "Configuration failed";
        case CAMERA_ERROR_READ_FAILED: return "Read failed or timeout";
        case CAMERA_ERROR_DISCONNECTED: return "Camera disconnected";
        case CAMERA_ERROR_NO_MEMORY:   return "Memory allocation failed";
        default: return "Unknown error";
    }
}

void camera_set_callback(camera_frame_callback_t callback, void *user_data) {
    pthread_mutex_lock(&g_callback_mutex);
    g_camera.callback = callback;
    g_camera.callback_user_data = user_data;
    pthread_mutex_unlock(&g_callback_mutex);
}
