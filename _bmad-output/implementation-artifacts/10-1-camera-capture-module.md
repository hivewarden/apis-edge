# Story 10.1: Camera Capture Module

Status: done

## Story

As an **APIS unit**,
I want to capture video frames from the camera,
So that I can analyze them for hornet detection.

## Acceptance Criteria

### AC1: Camera Initialization
**Given** the unit starts up
**When** the camera module initializes
**Then** it opens the camera device (USB webcam or Pi Camera)
**And** configures resolution to 640x480 (VGA)
**And** sets frame rate to 10 FPS minimum

### AC2: Frame Capture Loop
**Given** the camera is initialized
**When** the capture loop runs
**Then** frames are captured at ≥5 FPS consistently
**And** each frame is timestamped
**And** frames are passed to the detection pipeline (or callback)

### AC3: Camera Failure Handling
**Given** the camera fails to initialize
**When** startup occurs
**Then** the error is logged with specific message
**And** retry attempts occur every 30 seconds
**And** status is reported (for LED indicator in later story)

### AC4: Camera Disconnect Recovery
**Given** the camera disconnects mid-operation
**When** the capture fails
**Then** the system attempts reconnection
**And** logs the disconnection event
**And** alerts are queued for server notification (later story)

## Tasks / Subtasks

- [ ] **Task 1: Project Setup** (AC: all)
  - [ ] 1.1: Create `apis-edge/` C project structure with HAL
  - [ ] 1.2: Create `CMakeLists.txt` build configuration
  - [ ] 1.3: Create `README.md` with setup instructions for Pi and ESP32
  - [ ] 1.4: Create `config.h` with compile-time defaults
  - [ ] 1.5: Create `config.c` runtime config loader (parses config.yaml)
  - [ ] 1.6: Create `main.c` entry point with signal handling

- [ ] **Task 2: HAL Camera Abstraction** (AC: 1)
  - [ ] 2.1: Create `hal/camera.h` with abstract camera interface
  - [ ] 2.2: Create `hal/pi/camera_pi.c` for V4L2/libcamera
  - [ ] 2.3: Create `hal/esp32/camera_esp32.c` for esp_camera
  - [ ] 2.4: Implement platform detection in CMake

- [ ] **Task 3: Frame Capture Implementation** (AC: 1, 2)
  - [ ] 3.1: Implement resolution configuration (640x480 default)
  - [ ] 3.2: Implement frame rate configuration (10 FPS target)
  - [ ] 3.3: Add frame timestamping (milliseconds since boot)
  - [ ] 3.4: Implement ring buffer (2-3 frames to prevent blocking)
  - [ ] 3.5: Add FPS measurement and logging

- [ ] **Task 4: Error Handling & Recovery** (AC: 3, 4)
  - [ ] 4.1: Implement camera initialization retry logic (30s interval)
  - [ ] 4.2: Implement disconnect detection
  - [ ] 4.3: Implement automatic reconnection
  - [ ] 4.4: Add structured logging for all camera events

- [ ] **Task 5: Test Program & Verification** (AC: all)
  - [ ] 5.1: Create `test_camera.c` standalone test program
  - [ ] 5.2: Add FPS measurement display
  - [ ] 5.3: Add frame save capability (for debugging)
  - [ ] 5.4: Test on Pi with V4L2 USB webcam
  - [ ] 5.5: Cross-compile and test on ESP32-CAM (if hardware available)

## Technical Notes

### Project Structure

```
apis-edge/
├── CMakeLists.txt              # Top-level build config
├── README.md
├── config.yaml                 # Runtime config (Pi only, ESP32 uses NVS)
├── include/
│   ├── config.h                # Configuration structures
│   ├── frame.h                 # Frame data structure
│   ├── log.h                   # Logging macros
│   └── platform.h              # Platform detection
├── src/
│   ├── main.c                  # Entry point
│   ├── config.c                # Config loader
│   └── log.c                   # Logging implementation
├── hal/
│   ├── camera.h                # Abstract camera interface
│   ├── pi/
│   │   ├── CMakeLists.txt
│   │   └── camera_pi.c         # V4L2/libcamera implementation
│   └── esp32/
│       ├── CMakeLists.txt
│       └── camera_esp32.c      # esp_camera implementation
├── detection/                  # Story 10.2+
├── storage/                    # Story 10.4+
├── platforms/
│   ├── pi/
│   │   └── CMakeLists.txt      # Pi-specific build
│   └── esp32/
│       └── CMakeLists.txt      # ESP-IDF component
└── tests/
    └── test_camera.c
```

### Build System

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.16)
project(apis-edge C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Platform detection
if(ESP_PLATFORM)
    set(APIS_PLATFORM "esp32")
else()
    set(APIS_PLATFORM "pi")
endif()

message(STATUS "Building for platform: ${APIS_PLATFORM}")

# Common sources
set(COMMON_SOURCES
    src/main.c
    src/config.c
    src/log.c
)

# Platform-specific HAL
if(APIS_PLATFORM STREQUAL "pi")
    list(APPEND COMMON_SOURCES hal/pi/camera_pi.c)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(V4L2 REQUIRED libv4l2)
    pkg_check_modules(YAML REQUIRED yaml-0.1)
elseif(APIS_PLATFORM STREQUAL "esp32")
    list(APPEND COMMON_SOURCES hal/esp32/camera_esp32.c)
endif()

add_executable(apis-edge ${COMMON_SOURCES})

target_include_directories(apis-edge PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/hal
)

# Pi-specific linking
if(APIS_PLATFORM STREQUAL "pi")
    target_link_libraries(apis-edge
        ${V4L2_LIBRARIES}
        ${YAML_LIBRARIES}
        pthread
    )
    target_include_directories(apis-edge PRIVATE
        ${V4L2_INCLUDE_DIRS}
        ${YAML_INCLUDE_DIRS}
    )
endif()
```

### Pi Build Dependencies

```bash
# Install on Raspberry Pi OS
sudo apt-get install -y \
    build-essential \
    cmake \
    libv4l-dev \
    libyaml-dev \
    v4l-utils
```

### Frame Data Structure

```c
// include/frame.h
#ifndef APIS_FRAME_H
#define APIS_FRAME_H

#include <stdint.h>
#include <stdbool.h>

#define FRAME_WIDTH  640
#define FRAME_HEIGHT 480
#define FRAME_CHANNELS 3  // BGR
#define FRAME_SIZE (FRAME_WIDTH * FRAME_HEIGHT * FRAME_CHANNELS)

/**
 * A captured video frame with metadata.
 *
 * Memory layout: BGR interleaved (same as OpenCV default)
 * Total size: 640 * 480 * 3 = 921,600 bytes (~900KB)
 */
typedef struct {
    uint8_t data[FRAME_SIZE];   // BGR pixel data
    uint32_t timestamp_ms;       // Milliseconds since boot
    uint32_t sequence;           // Frame number since start
    uint16_t width;
    uint16_t height;
    bool valid;                  // False if capture failed
} frame_t;

/**
 * Initialize a frame structure.
 */
static inline void frame_init(frame_t *frame) {
    frame->timestamp_ms = 0;
    frame->sequence = 0;
    frame->width = FRAME_WIDTH;
    frame->height = FRAME_HEIGHT;
    frame->valid = false;
}

#endif // APIS_FRAME_H
```

### HAL Camera Interface

```c
// hal/camera.h
#ifndef APIS_HAL_CAMERA_H
#define APIS_HAL_CAMERA_H

#include "frame.h"
#include "config.h"
#include <stdbool.h>

/**
 * Camera status codes.
 */
typedef enum {
    CAMERA_OK = 0,
    CAMERA_ERROR_NOT_FOUND,
    CAMERA_ERROR_OPEN_FAILED,
    CAMERA_ERROR_CONFIG_FAILED,
    CAMERA_ERROR_READ_FAILED,
    CAMERA_ERROR_DISCONNECTED,
} camera_status_t;

/**
 * Camera state structure (opaque to callers).
 * Platform-specific implementation defines internals.
 */
typedef struct camera_state camera_state_t;

/**
 * Initialize the camera subsystem.
 * Must be called before any other camera functions.
 *
 * @param config Camera configuration
 * @return CAMERA_OK on success
 */
camera_status_t camera_init(const camera_config_t *config);

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
 * @param timeout_ms Maximum wait time (0 = no wait)
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
 *
 * @return Current FPS (0 if not measuring)
 */
float camera_get_fps(void);

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

#endif // APIS_HAL_CAMERA_H
```

### Pi Camera Implementation (V4L2)

```c
// hal/pi/camera_pi.c
/**
 * Raspberry Pi camera implementation using V4L2.
 *
 * Supports:
 * - USB webcams (any V4L2-compatible device)
 * - Pi Camera Module via libcamera (mapped to /dev/video0)
 */

#include "camera.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

#define NUM_BUFFERS 4

// Internal state
struct camera_state {
    int fd;
    uint8_t *buffers[NUM_BUFFERS];
    size_t buffer_lengths[NUM_BUFFERS];
    uint32_t sequence;
    uint32_t frame_count;
    uint64_t start_time_ms;
    bool is_open;
    camera_config_t config;
};

static struct camera_state g_camera = {
    .fd = -1,
    .is_open = false
};

// Get current time in milliseconds
static uint32_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

camera_status_t camera_init(const camera_config_t *config) {
    if (config == NULL) {
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    memset(&g_camera, 0, sizeof(g_camera));
    g_camera.fd = -1;
    g_camera.config = *config;

    LOG_INFO("Camera initialized (device: %s, %dx%d @ %d fps)",
             config->device_path, config->width, config->height, config->fps);

    return CAMERA_OK;
}

camera_status_t camera_open(void) {
    if (g_camera.is_open) {
        return CAMERA_OK;
    }

    // Open device
    g_camera.fd = open(g_camera.config.device_path, O_RDWR);
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
        return CAMERA_ERROR_OPEN_FAILED;
    }

    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
        LOG_ERROR("Device doesn't support video capture");
        close(g_camera.fd);
        return CAMERA_ERROR_OPEN_FAILED;
    }

    // Set format
    struct v4l2_format fmt = {0};
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width = g_camera.config.width;
    fmt.fmt.pix.height = g_camera.config.height;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_BGR24;  // BGR for OpenCV compat
    fmt.fmt.pix.field = V4L2_FIELD_NONE;

    if (ioctl(g_camera.fd, VIDIOC_S_FMT, &fmt) < 0) {
        // Try YUYV fallback (more common)
        fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
        if (ioctl(g_camera.fd, VIDIOC_S_FMT, &fmt) < 0) {
            LOG_ERROR("VIDIOC_S_FMT failed: %s", strerror(errno));
            close(g_camera.fd);
            return CAMERA_ERROR_CONFIG_FAILED;
        }
        LOG_WARN("Using YUYV format (will convert to BGR)");
    }

    // Set frame rate
    struct v4l2_streamparm parm = {0};
    parm.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    parm.parm.capture.timeperframe.numerator = 1;
    parm.parm.capture.timeperframe.denominator = g_camera.config.fps;

    if (ioctl(g_camera.fd, VIDIOC_S_PARM, &parm) < 0) {
        LOG_WARN("Failed to set frame rate (may use default)");
    }

    // Request buffers
    struct v4l2_requestbuffers req = {0};
    req.count = NUM_BUFFERS;
    req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;

    if (ioctl(g_camera.fd, VIDIOC_REQBUFS, &req) < 0) {
        LOG_ERROR("VIDIOC_REQBUFS failed: %s", strerror(errno));
        close(g_camera.fd);
        return CAMERA_ERROR_CONFIG_FAILED;
    }

    // Map buffers
    for (int i = 0; i < NUM_BUFFERS; i++) {
        struct v4l2_buffer buf = {0};
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (ioctl(g_camera.fd, VIDIOC_QUERYBUF, &buf) < 0) {
            LOG_ERROR("VIDIOC_QUERYBUF failed");
            camera_close();
            return CAMERA_ERROR_CONFIG_FAILED;
        }

        g_camera.buffer_lengths[i] = buf.length;
        g_camera.buffers[i] = mmap(NULL, buf.length,
                                    PROT_READ | PROT_WRITE,
                                    MAP_SHARED, g_camera.fd, buf.m.offset);

        if (g_camera.buffers[i] == MAP_FAILED) {
            LOG_ERROR("mmap failed");
            camera_close();
            return CAMERA_ERROR_CONFIG_FAILED;
        }
    }

    // Queue buffers
    for (int i = 0; i < NUM_BUFFERS; i++) {
        struct v4l2_buffer buf = {0};
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (ioctl(g_camera.fd, VIDIOC_QBUF, &buf) < 0) {
            LOG_ERROR("VIDIOC_QBUF failed");
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

    g_camera.is_open = true;
    g_camera.sequence = 0;
    g_camera.frame_count = 0;
    g_camera.start_time_ms = get_time_ms();

    LOG_INFO("Camera opened successfully");
    return CAMERA_OK;
}

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    if (!g_camera.is_open || frame == NULL) {
        return CAMERA_ERROR_READ_FAILED;
    }

    frame_init(frame);

    // Wait for frame with timeout
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
            return CAMERA_ERROR_READ_FAILED;  // Interrupted
        }
        LOG_ERROR("select failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    if (r == 0) {
        return CAMERA_ERROR_READ_FAILED;  // Timeout
    }

    // Dequeue buffer
    struct v4l2_buffer buf = {0};
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;

    if (ioctl(g_camera.fd, VIDIOC_DQBUF, &buf) < 0) {
        LOG_ERROR("VIDIOC_DQBUF failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    // Copy frame data
    size_t copy_size = buf.bytesused < FRAME_SIZE ? buf.bytesused : FRAME_SIZE;
    memcpy(frame->data, g_camera.buffers[buf.index], copy_size);

    frame->timestamp_ms = get_time_ms();
    frame->sequence = g_camera.sequence++;
    frame->width = FRAME_WIDTH;
    frame->height = FRAME_HEIGHT;
    frame->valid = true;

    g_camera.frame_count++;

    // Re-queue buffer
    if (ioctl(g_camera.fd, VIDIOC_QBUF, &buf) < 0) {
        LOG_ERROR("VIDIOC_QBUF failed: %s", strerror(errno));
        return CAMERA_ERROR_DISCONNECTED;
    }

    return CAMERA_OK;
}

bool camera_is_open(void) {
    return g_camera.is_open;
}

float camera_get_fps(void) {
    if (!g_camera.is_open || g_camera.frame_count < 2) {
        return 0.0f;
    }

    uint32_t elapsed = get_time_ms() - g_camera.start_time_ms;
    if (elapsed == 0) {
        return 0.0f;
    }

    return (float)g_camera.frame_count * 1000.0f / (float)elapsed;
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
        case CAMERA_OK:               return "OK";
        case CAMERA_ERROR_NOT_FOUND:  return "Camera not found";
        case CAMERA_ERROR_OPEN_FAILED: return "Failed to open camera";
        case CAMERA_ERROR_CONFIG_FAILED: return "Configuration failed";
        case CAMERA_ERROR_READ_FAILED: return "Read failed";
        case CAMERA_ERROR_DISCONNECTED: return "Camera disconnected";
        default: return "Unknown error";
    }
}
```

### ESP32 Camera Implementation (stub)

```c
// hal/esp32/camera_esp32.c
/**
 * ESP32 camera implementation using esp_camera.
 *
 * Target boards:
 * - ESP32-CAM (AI-Thinker)
 * - XIAO ESP32-S3 Sense
 */

#include "camera.h"
#include "log.h"

#ifdef ESP_PLATFORM
#include "esp_camera.h"
#include "esp_timer.h"

// Camera pin configuration for ESP32-CAM (AI-Thinker)
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

static bool g_is_open = false;
static uint32_t g_sequence = 0;
static uint32_t g_frame_count = 0;
static int64_t g_start_time_us = 0;

camera_status_t camera_init(const camera_config_t *config) {
    (void)config;  // ESP32 uses compile-time pin config

    camera_config_t cam_config = {
        .pin_pwdn = CAM_PIN_PWDN,
        .pin_reset = CAM_PIN_RESET,
        .pin_xclk = CAM_PIN_XCLK,
        .pin_sscb_sda = CAM_PIN_SIOD,
        .pin_sscb_scl = CAM_PIN_SIOC,
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

        .pixel_format = PIXFORMAT_RGB565,  // Convert to BGR in read
        .frame_size = FRAMESIZE_VGA,       // 640x480
        .jpeg_quality = 12,
        .fb_count = 2,
        .grab_mode = CAMERA_GRAB_LATEST,
    };

    esp_err_t err = esp_camera_init(&cam_config);
    if (err != ESP_OK) {
        LOG_ERROR("esp_camera_init failed: 0x%x", err);
        return CAMERA_ERROR_OPEN_FAILED;
    }

    LOG_INFO("ESP32 camera initialized");
    return CAMERA_OK;
}

camera_status_t camera_open(void) {
    g_is_open = true;
    g_sequence = 0;
    g_frame_count = 0;
    g_start_time_us = esp_timer_get_time();
    return CAMERA_OK;
}

camera_status_t camera_read(frame_t *frame, uint32_t timeout_ms) {
    (void)timeout_ms;  // ESP32 camera is synchronous

    if (!g_is_open) {
        return CAMERA_ERROR_READ_FAILED;
    }

    frame_init(frame);

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        LOG_ERROR("esp_camera_fb_get failed");
        return CAMERA_ERROR_READ_FAILED;
    }

    // Convert RGB565 to BGR24 (TODO: optimize with assembly)
    // For now, simplified placeholder
    size_t copy_size = fb->len < FRAME_SIZE ? fb->len : FRAME_SIZE;
    memcpy(frame->data, fb->buf, copy_size);

    frame->timestamp_ms = (uint32_t)(esp_timer_get_time() / 1000);
    frame->sequence = g_sequence++;
    frame->valid = true;

    g_frame_count++;

    esp_camera_fb_return(fb);
    return CAMERA_OK;
}

bool camera_is_open(void) {
    return g_is_open;
}

float camera_get_fps(void) {
    if (!g_is_open || g_frame_count < 2) {
        return 0.0f;
    }

    int64_t elapsed_us = esp_timer_get_time() - g_start_time_us;
    if (elapsed_us == 0) {
        return 0.0f;
    }

    return (float)g_frame_count * 1000000.0f / (float)elapsed_us;
}

void camera_close(void) {
    esp_camera_deinit();
    g_is_open = false;
    LOG_INFO("ESP32 camera closed");
}

const char *camera_status_str(camera_status_t status) {
    switch (status) {
        case CAMERA_OK:               return "OK";
        case CAMERA_ERROR_NOT_FOUND:  return "Camera not found";
        case CAMERA_ERROR_OPEN_FAILED: return "Failed to open camera";
        case CAMERA_ERROR_CONFIG_FAILED: return "Configuration failed";
        case CAMERA_ERROR_READ_FAILED: return "Read failed";
        case CAMERA_ERROR_DISCONNECTED: return "Camera disconnected";
        default: return "Unknown error";
    }
}

#endif // ESP_PLATFORM
```

### Configuration

```c
// include/config.h
#ifndef APIS_CONFIG_H
#define APIS_CONFIG_H

#include <stdint.h>
#include <stdbool.h>

/**
 * Camera configuration.
 */
typedef struct {
    char device_path[64];    // e.g., "/dev/video0"
    uint16_t width;
    uint16_t height;
    uint8_t fps;
    float focus_distance;    // Pi Camera only (meters)
} camera_config_t;

/**
 * Storage configuration.
 */
typedef struct {
    char data_dir[128];
    char clips_dir[128];
    char db_path[128];
} storage_config_t;

/**
 * Logging configuration.
 */
typedef struct {
    char level[16];          // "DEBUG", "INFO", "WARN", "ERROR"
    char file_path[128];
    bool json_format;
} logging_config_t;

/**
 * Top-level configuration.
 */
typedef struct {
    camera_config_t camera;
    storage_config_t storage;
    logging_config_t logging;
} config_t;

/**
 * Load configuration from YAML file.
 * Falls back to defaults if file not found.
 *
 * @param path Path to config.yaml (NULL for default)
 * @return Pointer to static config (do not free)
 */
const config_t *config_load(const char *path);

/**
 * Get default configuration values.
 *
 * @return Pointer to static default config
 */
const config_t *config_defaults(void);

#endif // APIS_CONFIG_H
```

### Config Loader

```c
// src/config.c
#include "config.h"
#include "log.h"
#include <string.h>
#include <stdio.h>

#ifdef APIS_PLATFORM_PI
#include <yaml.h>
#endif

// Default configuration
static config_t g_config = {
    .camera = {
        .device_path = "/dev/video0",
        .width = 640,
        .height = 480,
        .fps = 10,
        .focus_distance = 1.5f,
    },
    .storage = {
        .data_dir = "./data",
        .clips_dir = "./data/clips",
        .db_path = "./data/detections.db",
    },
    .logging = {
        .level = "INFO",
        .file_path = "./logs/apis.log",
        .json_format = true,
    },
};

const config_t *config_defaults(void) {
    return &g_config;
}

#ifdef APIS_PLATFORM_PI
// YAML parsing for Pi (ESP32 uses NVS)
const config_t *config_load(const char *path) {
    if (path == NULL) {
        path = "config.yaml";
    }

    FILE *file = fopen(path, "r");
    if (!file) {
        LOG_WARN("Config file not found: %s (using defaults)", path);
        return &g_config;
    }

    yaml_parser_t parser;
    yaml_event_t event;

    if (!yaml_parser_initialize(&parser)) {
        fclose(file);
        return &g_config;
    }

    yaml_parser_set_input_file(&parser, file);

    // Simple state machine for YAML parsing
    char current_section[32] = "";
    char current_key[32] = "";
    bool expecting_value = false;

    while (1) {
        if (!yaml_parser_parse(&parser, &event)) {
            break;
        }

        if (event.type == YAML_STREAM_END_EVENT) {
            yaml_event_delete(&event);
            break;
        }

        if (event.type == YAML_SCALAR_EVENT) {
            const char *value = (const char *)event.data.scalar.value;

            if (!expecting_value) {
                // This is a key
                if (strcmp(value, "camera") == 0 ||
                    strcmp(value, "storage") == 0 ||
                    strcmp(value, "logging") == 0) {
                    strncpy(current_section, value, sizeof(current_section) - 1);
                } else {
                    strncpy(current_key, value, sizeof(current_key) - 1);
                    expecting_value = true;
                }
            } else {
                // This is a value
                if (strcmp(current_section, "camera") == 0) {
                    if (strcmp(current_key, "device_path") == 0) {
                        strncpy(g_config.camera.device_path, value,
                                sizeof(g_config.camera.device_path) - 1);
                    } else if (strcmp(current_key, "width") == 0) {
                        g_config.camera.width = (uint16_t)atoi(value);
                    } else if (strcmp(current_key, "height") == 0) {
                        g_config.camera.height = (uint16_t)atoi(value);
                    } else if (strcmp(current_key, "fps") == 0) {
                        g_config.camera.fps = (uint8_t)atoi(value);
                    }
                } else if (strcmp(current_section, "storage") == 0) {
                    if (strcmp(current_key, "data_dir") == 0) {
                        strncpy(g_config.storage.data_dir, value,
                                sizeof(g_config.storage.data_dir) - 1);
                    } else if (strcmp(current_key, "clips_dir") == 0) {
                        strncpy(g_config.storage.clips_dir, value,
                                sizeof(g_config.storage.clips_dir) - 1);
                    } else if (strcmp(current_key, "db_path") == 0) {
                        strncpy(g_config.storage.db_path, value,
                                sizeof(g_config.storage.db_path) - 1);
                    }
                } else if (strcmp(current_section, "logging") == 0) {
                    if (strcmp(current_key, "level") == 0) {
                        strncpy(g_config.logging.level, value,
                                sizeof(g_config.logging.level) - 1);
                    } else if (strcmp(current_key, "file") == 0) {
                        strncpy(g_config.logging.file_path, value,
                                sizeof(g_config.logging.file_path) - 1);
                    }
                }
                expecting_value = false;
            }
        }

        yaml_event_delete(&event);
    }

    yaml_parser_delete(&parser);
    fclose(file);

    LOG_INFO("Loaded config from %s", path);
    return &g_config;
}
#else
// ESP32: Use compile-time defaults (NVS in future story)
const config_t *config_load(const char *path) {
    (void)path;
    return &g_config;
}
#endif
```

### Logging

```c
// include/log.h
#ifndef APIS_LOG_H
#define APIS_LOG_H

#include <stdio.h>

typedef enum {
    LOG_LEVEL_DEBUG = 0,
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARN,
    LOG_LEVEL_ERROR,
} log_level_t;

void log_init(const char *file_path, log_level_t level, bool json_format);
void log_write(log_level_t level, const char *file, int line, const char *fmt, ...);

#define LOG_DEBUG(fmt, ...) log_write(LOG_LEVEL_DEBUG, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_INFO(fmt, ...)  log_write(LOG_LEVEL_INFO, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_WARN(fmt, ...)  log_write(LOG_LEVEL_WARN, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) log_write(LOG_LEVEL_ERROR, __FILE__, __LINE__, fmt, ##__VA_ARGS__)

#endif // APIS_LOG_H
```

### Main Entry Point

```c
// src/main.c
/**
 * APIS Edge Device - Main Entry Point
 *
 * Orchestrates camera capture, motion detection, and clip recording.
 */

#include "config.h"
#include "frame.h"
#include "log.h"
#include "camera.h"

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <stdbool.h>
#include <sys/stat.h>
#include <errno.h>

#ifdef APIS_PLATFORM_PI
#include <unistd.h>
#endif

static volatile bool g_running = true;

static void signal_handler(int sig) {
    (void)sig;
    g_running = false;
}

static void setup_directories(const config_t *config) {
    mkdir(config->storage.data_dir, 0755);
    mkdir(config->storage.clips_dir, 0755);

    // Create log directory
    char log_dir[128];
    snprintf(log_dir, sizeof(log_dir), "%s", config->logging.file_path);
    char *last_slash = strrchr(log_dir, '/');
    if (last_slash) {
        *last_slash = '\0';
        mkdir(log_dir, 0755);
    }
}

int main(int argc, char *argv[]) {
    (void)argc;
    (void)argv;

    // Load configuration
    const config_t *config = config_load(NULL);

    // Initialize logging
    log_level_t level = LOG_LEVEL_INFO;
    if (strcmp(config->logging.level, "DEBUG") == 0) level = LOG_LEVEL_DEBUG;
    else if (strcmp(config->logging.level, "WARN") == 0) level = LOG_LEVEL_WARN;
    else if (strcmp(config->logging.level, "ERROR") == 0) level = LOG_LEVEL_ERROR;

    log_init(config->logging.file_path, level, config->logging.json_format);

    // Setup directories
    setup_directories(config);

    LOG_INFO("APIS Edge starting...");

    // Setup signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // Initialize camera
    camera_status_t status = camera_init(&config->camera);
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera init failed: %s", camera_status_str(status));
        return 1;
    }

    // Open camera
    status = camera_open();
    if (status != CAMERA_OK) {
        LOG_ERROR("Camera open failed: %s", camera_status_str(status));
        return 1;
    }

    LOG_INFO("Camera opened: %dx%d", FRAME_WIDTH, FRAME_HEIGHT);

    // Allocate frame buffer
    frame_t *frame = malloc(sizeof(frame_t));
    if (!frame) {
        LOG_ERROR("Failed to allocate frame buffer");
        camera_close();
        return 1;
    }

    // Main loop
    uint32_t last_fps_log = 0;

    while (g_running) {
        status = camera_read(frame, 1000);  // 1 second timeout

        if (status == CAMERA_ERROR_READ_FAILED) {
            continue;  // Timeout, try again
        }

        if (status == CAMERA_ERROR_DISCONNECTED) {
            LOG_ERROR("Camera disconnected, attempting reconnect...");
            camera_close();

            // Retry loop
            for (int i = 0; i < 10 && g_running; i++) {
                sleep(3);
                if (camera_open() == CAMERA_OK) {
                    LOG_INFO("Camera reconnected");
                    break;
                }
            }
            continue;
        }

        if (status != CAMERA_OK || !frame->valid) {
            LOG_WARN("Frame capture failed");
            continue;
        }

        // Log FPS every 5 seconds
        if (frame->timestamp_ms - last_fps_log > 5000) {
            LOG_INFO("FPS: %.1f, Frame: %u", camera_get_fps(), frame->sequence);
            last_fps_log = frame->timestamp_ms;
        }

        // TODO: Story 10.2 - Pass to motion detector
        // TODO: Story 10.3 - Size filter and hover detection
        // TODO: Story 10.4 - Log detection events
        // TODO: Story 10.5 - Record clips
    }

    // Cleanup
    free(frame);
    camera_close();
    LOG_INFO("APIS Edge stopped");

    return 0;
}
```

### Test Program

```c
// tests/test_camera.c
/**
 * Test program for APIS camera module.
 *
 * Usage:
 *   ./test_camera              # Run for 10 seconds
 *   ./test_camera --duration 5 # Run for 5 seconds
 *   ./test_camera --save       # Save frames to disk
 */

#include "config.h"
#include "frame.h"
#include "log.h"
#include "camera.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef APIS_PLATFORM_PI
#include <unistd.h>
#endif

static uint32_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

// Simple PPM file writer (no external dependencies)
static void save_frame_ppm(const frame_t *frame, const char *filename) {
    FILE *f = fopen(filename, "wb");
    if (!f) return;

    fprintf(f, "P6\n%d %d\n255\n", frame->width, frame->height);

    // Convert BGR to RGB
    for (int i = 0; i < FRAME_SIZE; i += 3) {
        fputc(frame->data[i + 2], f);  // R
        fputc(frame->data[i + 1], f);  // G
        fputc(frame->data[i + 0], f);  // B
    }

    fclose(f);
}

int main(int argc, char *argv[]) {
    int duration = 10;
    bool save_frames = false;

    // Parse arguments
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--duration") == 0 && i + 1 < argc) {
            duration = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--save") == 0) {
            save_frames = true;
        }
    }

    // Initialize
    log_init(NULL, LOG_LEVEL_INFO, false);

    const config_t *config = config_defaults();

    printf("Opening camera (%s)...\n", config->camera.device_path);

    camera_status_t status = camera_init(&config->camera);
    if (status != CAMERA_OK) {
        printf("ERROR: Camera init failed: %s\n", camera_status_str(status));
        return 1;
    }

    status = camera_open();
    if (status != CAMERA_OK) {
        printf("ERROR: Failed to open camera: %s\n", camera_status_str(status));
        return 1;
    }

    printf("Camera opened: %dx%d\n", FRAME_WIDTH, FRAME_HEIGHT);
    printf("Running for %d seconds...\n", duration);

    frame_t *frame = malloc(sizeof(frame_t));
    if (!frame) {
        printf("ERROR: Failed to allocate frame\n");
        camera_close();
        return 1;
    }

    uint32_t start_time = get_time_ms();
    uint32_t frame_count = 0;
    uint32_t duration_ms = duration * 1000;

    while (get_time_ms() - start_time < duration_ms) {
        status = camera_read(frame, 1000);

        if (status != CAMERA_OK || !frame->valid) {
            printf("\nWARNING: Failed to read frame\n");
            continue;
        }

        frame_count++;
        float fps = (float)frame_count * 1000.0f / (float)(get_time_ms() - start_time);

        printf("\rFrame %u: %.1f FPS", frame->sequence, fps);
        fflush(stdout);

        if (save_frames && frame_count % 30 == 0) {
            char filename[64];
            snprintf(filename, sizeof(filename), "frame_%04u.ppm", frame_count);
            save_frame_ppm(frame, filename);
            printf(" [Saved %s]", filename);
        }
    }

    uint32_t elapsed = get_time_ms() - start_time;

    printf("\n\nResults:\n");
    printf("  Total frames: %u\n", frame_count);
    printf("  Duration: %.1f s\n", (float)elapsed / 1000.0f);
    printf("  Average FPS: %.1f\n", (float)frame_count * 1000.0f / (float)elapsed);

    free(frame);
    camera_close();

    return 0;
}
```

### Config File

```yaml
# config.yaml
camera:
  device_path: /dev/video0  # USB webcam or Pi Camera (via libcamera)
  width: 640
  height: 480
  fps: 10
  focus_distance: 1.5       # Pi Camera only (meters)

storage:
  data_dir: ./data
  clips_dir: ./data/clips
  db_path: ./data/detections.db

logging:
  level: INFO
  file: ./logs/apis.log
  format: json
```

### Hardware Setup Reference

See `docs/hardware-specification.md`:
- **Section 4.5 Step 6**: Pi Camera ribbon cable connection
- **Section 10.2**: Pi Camera Module 3 specs and focus lock
- **Section 10.3**: USB webcam fallback

### Pi 5 Camera Notes

1. **Cable**: Pi 5 needs a 22-pin to 15-pin adapter cable (NOT Pi 4 cable)
2. **No raspi-config needed**: Modern Pi OS enables camera by default
3. **Test with**: `libcamera-hello -t 5000`
4. **V4L2 access**: Pi Camera appears at `/dev/video0` via libcamera

### Memory Considerations

- Frame size at 640x480 BGR: `640 x 480 x 3 = 921,600 bytes (~900KB)`
- Buffer of 3 frames: ~2.7MB
- Rolling buffer for clips (20 frames): ~18MB
- **Total camera memory footprint: ~25MB** (acceptable for Pi 5 with 8GB, tight for ESP32 with 520KB SRAM)

**ESP32 Memory Strategy:**
- Use PSRAM for frame buffers (if available)
- Process frames immediately, don't buffer
- Use JPEG compression for storage

### Common Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| Camera not found | "Failed to open" | Check ribbon cable (Pi), try different USB port |
| Low FPS | <5 FPS | Reduce resolution, check CPU load |
| Permission denied | Can't access /dev/video0 | Add user to `video` group: `sudo usermod -aG video $USER` |
| V4L2 format error | VIDIOC_S_FMT failed | Camera may not support BGR24, code falls back to YUYV |

## Files to Create

```
apis-edge/
├── CMakeLists.txt
├── README.md
├── config.yaml
├── include/
│   ├── config.h
│   ├── frame.h
│   ├── log.h
│   └── platform.h
├── src/
│   ├── main.c
│   ├── config.c
│   └── log.c
├── hal/
│   ├── camera.h
│   ├── pi/
│   │   ├── CMakeLists.txt
│   │   └── camera_pi.c
│   └── esp32/
│       ├── CMakeLists.txt
│       └── camera_esp32.c
├── detection/              # Story 10.2+
├── storage/                # Story 10.4+
├── logs/                   # Created at runtime
├── data/                   # Created at runtime
└── tests/
    └── test_camera.c
```

## Testing Requirements

1. **Pi Camera Test**: Capture 100 frames, verify ≥5 FPS
2. **USB Camera Test**: Same test with USB webcam
3. **Disconnect Test**: Unplug camera mid-capture, verify recovery
4. **Build Test**: Verify CMake builds without errors

## Dependencies

- None (this is the first story in Epic 10)

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude | Story created for Epic 10 kickoff |
| 2026-01-22 | Claude | Rewritten from Python to C with HAL abstraction |
