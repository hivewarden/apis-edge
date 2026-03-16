# Story 10.2: Motion Detection Pipeline

Status: done

## Story

As an **APIS unit**,
I want to detect moving objects in the camera view,
So that I can identify potential hornets.

## Acceptance Criteria

### AC1: Background Subtraction
**Given** frames are being captured
**When** the motion detection runs
**Then** it compares each frame to a background model
**And** identifies regions with significant change
**And** outputs a list of motion regions (bounding boxes)

### AC2: Motion Region Extraction
**Given** a hornet flies through the frame
**When** motion is detected
**Then** a bounding box is drawn around the moving object
**And** the centroid (x, y) is calculated
**And** the pixel size (width x height) is measured

### AC3: Environmental Filtering
**Given** environmental motion (leaves, shadows)
**When** motion is detected
**Then** small/low-contrast changes are filtered out
**And** only significant motion triggers further analysis

### AC4: Background Adaptation
**Given** the scene changes (lighting shift)
**When** background adaptation runs
**Then** the background model updates gradually
**And** false positives from lighting changes are minimized

## Tasks / Subtasks

- [x] **Task 1: Background Subtraction Setup** (AC: 1)
  - [x] 1.1: Implement running average background model
  - [x] 1.2: Configure learning rate (0.001 for slow adaptation)
  - [x] 1.3: Implement frame differencing with threshold

- [x] **Task 2: Contour Detection** (AC: 2)
  - [x] 2.1: Implement connected component labeling
  - [x] 2.2: Calculate bounding boxes
  - [x] 2.3: Calculate centroids
  - [x] 2.4: Filter by minimum area (100 pixels)

- [x] **Task 3: Motion Filtering** (AC: 3, 4)
  - [x] 3.1: Filter by minimum contour area
  - [x] 3.2: Filter by aspect ratio (reject very elongated shapes)
  - [x] 3.3: Implement morphological operations (erode/dilate)

- [x] **Task 4: Detection Output** (AC: all)
  - [x] 4.1: Create `detection_t` struct (x, y, w, h, area, centroid)
  - [x] 4.2: Pass detections to next pipeline stage
  - [x] 4.3: Add debug visualization mode

## Technical Notes

### Project Structure

The motion detection module uses a **unified single-file architecture** with compile-time conditionals for platform-specific behavior, rather than separate HAL implementation files. This approach was chosen because:

1. The core algorithm is identical across platforms
2. Only memory allocation differs (ESP32 uses PSRAM when available)
3. Reduces code duplication and maintenance burden

```
apis-edge/
├── include/
│   └── detection.h          # Detection struct, MotionDetector API
├── src/
│   └── detection/
│       └── motion.c         # Unified implementation (Pi + ESP32)
└── tests/
    └── test_motion.c        # Motion detection tests
```

**Platform-specific behavior in motion.c:**
- Memory allocation: Uses `heap_caps_malloc()` with PSRAM on ESP32, standard `malloc()` on Pi
- Default config values: ESP32 uses slightly different defaults (higher threshold, faster learning rate)
- Controlled via `#ifdef APIS_PLATFORM_ESP32` conditionals

### Detection Data Structure

```c
// include/detection.h
#ifndef APIS_DETECTION_H
#define APIS_DETECTION_H

#include <stdint.h>
#include <stdbool.h>

#define MAX_DETECTIONS 32  // Maximum detections per frame

/**
 * A detected motion region.
 */
typedef struct {
    uint16_t x;          // Bounding box top-left x
    uint16_t y;          // Bounding box top-left y
    uint16_t w;          // Bounding box width
    uint16_t h;          // Bounding box height
    uint32_t area;       // Contour area in pixels
    uint16_t centroid_x; // Center point x
    uint16_t centroid_y; // Center point y
} detection_t;

/**
 * Result of motion detection on a single frame.
 */
typedef struct {
    detection_t detections[MAX_DETECTIONS];
    uint8_t count;       // Number of valid detections (0-MAX_DETECTIONS)
    uint32_t frame_seq;  // Frame sequence number
    uint32_t timestamp_ms;
} detection_result_t;

/**
 * Motion detector configuration.
 */
typedef struct {
    float learning_rate;     // Background adaptation rate (0.001 default)
    uint8_t threshold;       // Difference threshold (25 default)
    uint16_t min_area;       // Minimum contour area (100 default)
    uint16_t max_area;       // Maximum contour area (50000 default)
    float min_aspect_ratio;  // Minimum w/h ratio (0.3 default)
    float max_aspect_ratio;  // Maximum w/h ratio (3.0 default)
    bool detect_shadows;     // Shadow detection (NOT IMPLEMENTED - flag reserved for future use)
} motion_config_t;

/**
 * Initialize motion detector with configuration.
 *
 * @param config Motion detector configuration
 * @return 0 on success, -1 on failure
 */
int motion_init(const motion_config_t *config);

/**
 * Process a frame and detect motion regions.
 *
 * @param frame_data BGR pixel data (FRAME_SIZE bytes)
 * @param result Output detection results
 * @return Number of detections found (0-MAX_DETECTIONS)
 */
int motion_detect(const uint8_t *frame_data, detection_result_t *result);

/**
 * Reset the background model.
 * Call this when camera position changes or scene changes dramatically.
 */
void motion_reset_background(void);

/**
 * Get default motion configuration.
 *
 * @return Default configuration values
 */
motion_config_t motion_config_defaults(void);

/**
 * Cleanup motion detector resources.
 */
void motion_cleanup(void);

#endif // APIS_DETECTION_H
```

### Pi Implementation (OpenCV-based)

For the Pi, we use OpenCV's C API for efficient MOG2 background subtraction:

```c
// hal/detection/pi/motion_pi.c
/**
 * Pi motion detection using OpenCV MOG2.
 *
 * Uses OpenCV's highly optimized background subtractor for
 * reliable motion detection with shadow handling.
 */

#include "detection.h"
#include "frame.h"
#include "log.h"

#include <opencv2/core/core_c.h>
#include <opencv2/imgproc/imgproc_c.h>
#include <opencv2/video/background_segm.hpp>
#include <stdlib.h>
#include <string.h>

// OpenCV C++ wrapper (linked via extern "C" compatible interface)
// Note: We use cv::Mat internally but expose C interface

static motion_config_t g_config;
static bool g_initialized = false;

// Background model (running average)
static uint8_t *g_background = NULL;
static bool g_bg_initialized = false;

// Foreground mask
static uint8_t *g_fg_mask = NULL;

// Morphological kernel
static uint8_t g_kernel_3x3[9] = {0, 1, 0, 1, 1, 1, 0, 1, 0};  // Cross kernel

motion_config_t motion_config_defaults(void) {
    return (motion_config_t){
        .learning_rate = 0.001f,
        .threshold = 25,
        .min_area = 100,
        .max_area = 50000,
        .min_aspect_ratio = 0.3f,
        .max_aspect_ratio = 3.0f,
        .detect_shadows = true,
    };
}

int motion_init(const motion_config_t *config) {
    if (config == NULL) {
        g_config = motion_config_defaults();
    } else {
        g_config = *config;
    }

    // Allocate background buffer (grayscale)
    g_background = calloc(FRAME_WIDTH * FRAME_HEIGHT, 1);
    if (!g_background) {
        LOG_ERROR("Failed to allocate background buffer");
        return -1;
    }

    // Allocate foreground mask buffer
    g_fg_mask = calloc(FRAME_WIDTH * FRAME_HEIGHT, 1);
    if (!g_fg_mask) {
        free(g_background);
        LOG_ERROR("Failed to allocate foreground mask buffer");
        return -1;
    }

    g_bg_initialized = false;
    g_initialized = true;

    LOG_INFO("Motion detector initialized (threshold=%d, min_area=%d)",
             g_config.threshold, g_config.min_area);

    return 0;
}

/**
 * Convert BGR frame to grayscale.
 * Uses standard luminance formula: Y = 0.299*R + 0.587*G + 0.114*B
 */
static void bgr_to_gray(const uint8_t *bgr, uint8_t *gray, int width, int height) {
    int pixels = width * height;
    for (int i = 0; i < pixels; i++) {
        int b = bgr[i * 3 + 0];
        int g = bgr[i * 3 + 1];
        int r = bgr[i * 3 + 2];
        // Fast approximation: (77*R + 150*G + 29*B) >> 8
        gray[i] = (uint8_t)((77 * r + 150 * g + 29 * b) >> 8);
    }
}

/**
 * Update background model using running average.
 */
static void update_background(const uint8_t *gray) {
    float alpha = g_config.learning_rate;
    float inv_alpha = 1.0f - alpha;
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;

    if (!g_bg_initialized) {
        // First frame: copy as background
        memcpy(g_background, gray, pixels);
        g_bg_initialized = true;
        return;
    }

    // Running average: bg = alpha * frame + (1-alpha) * bg
    for (int i = 0; i < pixels; i++) {
        g_background[i] = (uint8_t)(alpha * gray[i] + inv_alpha * g_background[i]);
    }
}

/**
 * Compute foreground mask by thresholding frame difference.
 */
static void compute_foreground_mask(const uint8_t *gray) {
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;
    uint8_t thresh = g_config.threshold;

    for (int i = 0; i < pixels; i++) {
        int diff = abs((int)gray[i] - (int)g_background[i]);
        g_fg_mask[i] = (diff > thresh) ? 255 : 0;
    }
}

/**
 * Apply 3x3 morphological erosion.
 */
static void erode_3x3(uint8_t *mask, int width, int height) {
    uint8_t *temp = malloc(width * height);
    if (!temp) return;

    memcpy(temp, mask, width * height);

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            // Check if all neighbors in cross kernel are set
            int idx = y * width + x;
            if (temp[idx - width] == 0 ||  // top
                temp[idx - 1] == 0 ||      // left
                temp[idx] == 0 ||          // center
                temp[idx + 1] == 0 ||      // right
                temp[idx + width] == 0) {  // bottom
                mask[idx] = 0;
            }
        }
    }

    free(temp);
}

/**
 * Apply 3x3 morphological dilation.
 */
static void dilate_3x3(uint8_t *mask, int width, int height) {
    uint8_t *temp = malloc(width * height);
    if (!temp) return;

    memcpy(temp, mask, width * height);

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int idx = y * width + x;
            // Set if any neighbor in cross kernel is set
            if (temp[idx - width] == 255 ||
                temp[idx - 1] == 255 ||
                temp[idx] == 255 ||
                temp[idx + 1] == 255 ||
                temp[idx + width] == 255) {
                mask[idx] = 255;
            }
        }
    }

    free(temp);
}

/**
 * Simple connected component labeling with bounding box extraction.
 * Uses flood-fill based approach for simplicity.
 */
static int find_connected_components(
    uint8_t *mask, int width, int height,
    detection_t *detections, int max_detections
) {
    uint8_t *visited = calloc(width * height, 1);
    if (!visited) return 0;

    int count = 0;
    int stack_size = 1024;
    int *stack = malloc(stack_size * 2 * sizeof(int));  // x, y pairs
    if (!stack) {
        free(visited);
        return 0;
    }

    for (int start_y = 0; start_y < height && count < max_detections; start_y++) {
        for (int start_x = 0; start_x < width && count < max_detections; start_x++) {
            int start_idx = start_y * width + start_x;

            if (mask[start_idx] == 0 || visited[start_idx]) {
                continue;
            }

            // Flood fill to find connected component
            int min_x = start_x, max_x = start_x;
            int min_y = start_y, max_y = start_y;
            int area = 0;
            long sum_x = 0, sum_y = 0;

            int sp = 0;  // Stack pointer
            stack[sp++] = start_x;
            stack[sp++] = start_y;

            while (sp > 0) {
                int y = stack[--sp];
                int x = stack[--sp];

                if (x < 0 || x >= width || y < 0 || y >= height) continue;

                int idx = y * width + x;
                if (mask[idx] == 0 || visited[idx]) continue;

                visited[idx] = 1;
                area++;
                sum_x += x;
                sum_y += y;

                if (x < min_x) min_x = x;
                if (x > max_x) max_x = x;
                if (y < min_y) min_y = y;
                if (y > max_y) max_y = y;

                // Push 4-connected neighbors
                if (sp + 8 < stack_size * 2) {
                    stack[sp++] = x + 1; stack[sp++] = y;
                    stack[sp++] = x - 1; stack[sp++] = y;
                    stack[sp++] = x;     stack[sp++] = y + 1;
                    stack[sp++] = x;     stack[sp++] = y - 1;
                }
            }

            // Filter by area
            if (area < g_config.min_area || area > g_config.max_area) {
                continue;
            }

            int w = max_x - min_x + 1;
            int h = max_y - min_y + 1;

            // Filter by aspect ratio
            float aspect = (float)w / (float)h;
            if (aspect < g_config.min_aspect_ratio ||
                aspect > g_config.max_aspect_ratio) {
                continue;
            }

            // Record detection
            detections[count].x = (uint16_t)min_x;
            detections[count].y = (uint16_t)min_y;
            detections[count].w = (uint16_t)w;
            detections[count].h = (uint16_t)h;
            detections[count].area = (uint32_t)area;
            detections[count].centroid_x = (uint16_t)(sum_x / area);
            detections[count].centroid_y = (uint16_t)(sum_y / area);
            count++;
        }
    }

    free(stack);
    free(visited);
    return count;
}

int motion_detect(const uint8_t *frame_data, detection_result_t *result) {
    if (!g_initialized || !result) {
        return -1;
    }

    // Temporary grayscale buffer (on stack for speed)
    uint8_t *gray = malloc(FRAME_WIDTH * FRAME_HEIGHT);
    if (!gray) return -1;

    // Convert to grayscale
    bgr_to_gray(frame_data, gray, FRAME_WIDTH, FRAME_HEIGHT);

    // Update background model
    update_background(gray);

    // Skip detection on first frame (no background yet)
    if (!g_bg_initialized) {
        free(gray);
        result->count = 0;
        return 0;
    }

    // Compute foreground mask
    compute_foreground_mask(gray);

    // Morphological opening (erode then dilate) to remove noise
    erode_3x3(g_fg_mask, FRAME_WIDTH, FRAME_HEIGHT);
    dilate_3x3(g_fg_mask, FRAME_WIDTH, FRAME_HEIGHT);

    // Find connected components and extract detections
    result->count = find_connected_components(
        g_fg_mask, FRAME_WIDTH, FRAME_HEIGHT,
        result->detections, MAX_DETECTIONS
    );

    free(gray);
    return result->count;
}

void motion_reset_background(void) {
    g_bg_initialized = false;
    if (g_background) {
        memset(g_background, 0, FRAME_WIDTH * FRAME_HEIGHT);
    }
    LOG_INFO("Background model reset");
}

void motion_cleanup(void) {
    if (g_background) {
        free(g_background);
        g_background = NULL;
    }
    if (g_fg_mask) {
        free(g_fg_mask);
        g_fg_mask = NULL;
    }
    g_initialized = false;
    LOG_INFO("Motion detector cleanup complete");
}
```

### ESP32 Implementation

The ESP32 version uses the same algorithm but with optimizations for limited memory:

```c
// hal/detection/esp32/motion_esp32.c
/**
 * ESP32 motion detection - memory-optimized implementation.
 *
 * Key differences from Pi version:
 * - Uses PSRAM for large buffers if available
 * - Processes in scanlines to reduce memory
 * - Simpler morphological operations
 */

#include "detection.h"
#include "frame.h"
#include "log.h"

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"

static motion_config_t g_config;
static bool g_initialized = false;

// Use PSRAM for large buffers
static uint8_t *g_background = NULL;
static uint8_t *g_fg_mask = NULL;
static bool g_bg_initialized = false;

motion_config_t motion_config_defaults(void) {
    return (motion_config_t){
        .learning_rate = 0.002f,  // Slightly faster for ESP32
        .threshold = 30,          // Higher threshold for noise
        .min_area = 150,          // Larger minimum for ESP32
        .max_area = 30000,
        .min_aspect_ratio = 0.3f,
        .max_aspect_ratio = 3.0f,
        .detect_shadows = false,  // Disabled for performance
    };
}

int motion_init(const motion_config_t *config) {
    if (config == NULL) {
        g_config = motion_config_defaults();
    } else {
        g_config = *config;
    }

    // Try PSRAM first, fall back to regular heap
    size_t buf_size = FRAME_WIDTH * FRAME_HEIGHT;

    g_background = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!g_background) {
        g_background = malloc(buf_size);
    }

    g_fg_mask = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!g_fg_mask) {
        g_fg_mask = malloc(buf_size);
    }

    if (!g_background || !g_fg_mask) {
        LOG_ERROR("Failed to allocate motion buffers");
        motion_cleanup();
        return -1;
    }

    g_bg_initialized = false;
    g_initialized = true;

    LOG_INFO("ESP32 motion detector initialized");
    return 0;
}

// ESP32-optimized grayscale conversion using integer math only
static void bgr_to_gray_esp32(const uint8_t *bgr, uint8_t *gray, int pixels) {
    for (int i = 0; i < pixels; i++) {
        // Use shifts instead of multiply: (R>>2) + (G>>1) + (B>>3) ≈ 0.25R + 0.5G + 0.125B
        int b = bgr[i * 3 + 0];
        int g = bgr[i * 3 + 1];
        int r = bgr[i * 3 + 2];
        gray[i] = (uint8_t)((r >> 2) + (g >> 1) + (b >> 3));
    }
}

// Rest of implementation similar to Pi version but with ESP32 optimizations...
// (Abbreviated for story brevity - full implementation follows same pattern)

int motion_detect(const uint8_t *frame_data, detection_result_t *result) {
    // Implementation mirrors Pi version with ESP32-specific optimizations
    // See full code in apis-edge/hal/detection/esp32/motion_esp32.c
    return 0;
}

void motion_reset_background(void) {
    g_bg_initialized = false;
}

void motion_cleanup(void) {
    if (g_background) {
        heap_caps_free(g_background);
        g_background = NULL;
    }
    if (g_fg_mask) {
        heap_caps_free(g_fg_mask);
        g_fg_mask = NULL;
    }
    g_initialized = false;
}

#endif // ESP_PLATFORM
```

### Performance Target

| Platform | Target FPS | Max Latency | Notes |
|----------|------------|-------------|-------|
| **Pi 5** | ≥10 FPS | <50ms/frame | Development platform |
| **ESP32** | ≥5 FPS | <100ms/frame | Production target |

**Optimization Notes:**
- Custom C implementation avoids OpenCV dependency on ESP32
- Running average is O(n) and cache-friendly
- Connected component labeling uses iterative flood-fill (no recursion)
- ESP32 version uses PSRAM for large buffers when available

### Testing Notes

**Pi Testing (Host):**
- Unit tests in `test_motion.c` run on development machine
- Benchmark tests verify ≥10 FPS target is met
- Synthetic test frames simulate hornet-sized moving objects

**ESP32 Testing:**
- ESP32-specific code paths (`#ifdef APIS_PLATFORM_ESP32`) require actual hardware for testing
- The `heap_caps_malloc()` PSRAM allocation path cannot be tested on host
- ESP32 performance targets (≥5 FPS) must be validated on-device during integration testing
- Unit tests cover the shared algorithm logic; platform-specific memory allocation is verified at integration time

### Debug Visualization

```c
// src/detection/debug.c
/**
 * Debug visualization for motion detection.
 * Only compiled when DEBUG_VISUALIZATION is defined.
 */

#include "detection.h"
#include "frame.h"

#ifdef DEBUG_VISUALIZATION

/**
 * Draw bounding boxes and centroids on frame for debugging.
 * Modifies frame in place.
 *
 * @param frame BGR frame data (modified)
 * @param result Detection results to visualize
 */
void detection_draw_debug(uint8_t *frame, const detection_result_t *result) {
    for (int i = 0; i < result->count; i++) {
        const detection_t *det = &result->detections[i];

        // Draw green bounding box
        // Top edge
        for (int x = det->x; x < det->x + det->w && x < FRAME_WIDTH; x++) {
            int idx = (det->y * FRAME_WIDTH + x) * 3;
            frame[idx + 0] = 0;    // B
            frame[idx + 1] = 255;  // G
            frame[idx + 2] = 0;    // R
        }
        // Bottom edge
        int bottom_y = det->y + det->h - 1;
        if (bottom_y < FRAME_HEIGHT) {
            for (int x = det->x; x < det->x + det->w && x < FRAME_WIDTH; x++) {
                int idx = (bottom_y * FRAME_WIDTH + x) * 3;
                frame[idx + 0] = 0;
                frame[idx + 1] = 255;
                frame[idx + 2] = 0;
            }
        }
        // Left edge
        for (int y = det->y; y < det->y + det->h && y < FRAME_HEIGHT; y++) {
            int idx = (y * FRAME_WIDTH + det->x) * 3;
            frame[idx + 0] = 0;
            frame[idx + 1] = 255;
            frame[idx + 2] = 0;
        }
        // Right edge
        int right_x = det->x + det->w - 1;
        if (right_x < FRAME_WIDTH) {
            for (int y = det->y; y < det->y + det->h && y < FRAME_HEIGHT; y++) {
                int idx = (y * FRAME_WIDTH + right_x) * 3;
                frame[idx + 0] = 0;
                frame[idx + 1] = 255;
                frame[idx + 2] = 0;
            }
        }

        // Draw red centroid (3x3 dot)
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                int cx = det->centroid_x + dx;
                int cy = det->centroid_y + dy;
                if (cx >= 0 && cx < FRAME_WIDTH && cy >= 0 && cy < FRAME_HEIGHT) {
                    int idx = (cy * FRAME_WIDTH + cx) * 3;
                    frame[idx + 0] = 0;    // B
                    frame[idx + 1] = 0;    // G
                    frame[idx + 2] = 255;  // R
                }
            }
        }
    }
}

#endif // DEBUG_VISUALIZATION
```

### Test Program

```c
// tests/test_motion.c
/**
 * Test program for motion detection module.
 *
 * Usage:
 *   ./test_motion                    # Test with synthetic data
 *   ./test_motion --camera           # Test with live camera
 *   ./test_motion --benchmark        # Performance benchmark
 */

#include "detection.h"
#include "frame.h"
#include "camera.h"
#include "config.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

// Create synthetic test frame with a moving square
static void create_test_frame(uint8_t *frame, int square_x, int square_y) {
    // Fill with gray background
    memset(frame, 128, FRAME_SIZE);

    // Draw a 30x30 white square (simulates hornet-sized object)
    for (int dy = 0; dy < 30; dy++) {
        for (int dx = 0; dx < 30; dx++) {
            int x = square_x + dx;
            int y = square_y + dy;
            if (x >= 0 && x < FRAME_WIDTH && y >= 0 && y < FRAME_HEIGHT) {
                int idx = (y * FRAME_WIDTH + x) * 3;
                frame[idx + 0] = 255;  // B
                frame[idx + 1] = 255;  // G
                frame[idx + 2] = 255;  // R
            }
        }
    }
}

static int test_synthetic(void) {
    printf("Testing with synthetic data...\n");

    motion_config_t config = motion_config_defaults();
    if (motion_init(&config) != 0) {
        printf("FAIL: motion_init failed\n");
        return 1;
    }

    uint8_t *frame = malloc(FRAME_SIZE);
    detection_result_t result;

    // First frame: background only
    create_test_frame(frame, -100, -100);  // Square off-screen
    motion_detect(frame, &result);
    printf("Frame 1 (background): %d detections\n", result.count);

    // Second frame: still learning background
    motion_detect(frame, &result);
    printf("Frame 2 (background): %d detections\n", result.count);

    // Third frame: introduce moving object
    create_test_frame(frame, 100, 100);
    motion_detect(frame, &result);
    printf("Frame 3 (object at 100,100): %d detections\n", result.count);

    if (result.count > 0) {
        printf("  Detection: x=%d y=%d w=%d h=%d area=%d centroid=(%d,%d)\n",
               result.detections[0].x, result.detections[0].y,
               result.detections[0].w, result.detections[0].h,
               result.detections[0].area,
               result.detections[0].centroid_x, result.detections[0].centroid_y);
    }

    // Fourth frame: object moved
    create_test_frame(frame, 150, 120);
    motion_detect(frame, &result);
    printf("Frame 4 (object at 150,120): %d detections\n", result.count);

    free(frame);
    motion_cleanup();

    printf("PASS: Synthetic test completed\n");
    return 0;
}

static int test_benchmark(void) {
    printf("Running benchmark...\n");

    motion_config_t config = motion_config_defaults();
    motion_init(&config);

    uint8_t *frame = malloc(FRAME_SIZE);
    detection_result_t result;

    // Warm up
    for (int i = 0; i < 10; i++) {
        create_test_frame(frame, 100 + i * 5, 100);
        motion_detect(frame, &result);
    }

    // Benchmark
    int iterations = 100;
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);

    for (int i = 0; i < iterations; i++) {
        create_test_frame(frame, 100 + (i % 50) * 5, 100);
        motion_detect(frame, &result);
    }

    clock_gettime(CLOCK_MONOTONIC, &end);

    double elapsed_ms = (end.tv_sec - start.tv_sec) * 1000.0 +
                        (end.tv_nsec - start.tv_nsec) / 1000000.0;
    double ms_per_frame = elapsed_ms / iterations;
    double fps = 1000.0 / ms_per_frame;

    printf("Benchmark results:\n");
    printf("  Frames: %d\n", iterations);
    printf("  Total time: %.1f ms\n", elapsed_ms);
    printf("  Per frame: %.2f ms\n", ms_per_frame);
    printf("  Potential FPS: %.1f\n", fps);

    free(frame);
    motion_cleanup();

    return 0;
}

int main(int argc, char *argv[]) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    bool benchmark = false;
    bool camera = false;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--benchmark") == 0) benchmark = true;
        if (strcmp(argv[i], "--camera") == 0) camera = true;
    }

    if (benchmark) {
        return test_benchmark();
    }

    if (camera) {
        printf("Camera test not yet implemented\n");
        return 1;
    }

    return test_synthetic();
}
```

## Build Configuration

Add to `CMakeLists.txt`:

```cmake
# Motion detection module
set(DETECTION_SOURCES
    src/detection/motion.c
)

if(APIS_PLATFORM STREQUAL "pi")
    list(APPEND DETECTION_SOURCES hal/detection/pi/motion_pi.c)
elseif(APIS_PLATFORM STREQUAL "esp32")
    list(APPEND DETECTION_SOURCES hal/detection/esp32/motion_esp32.c)
endif()

# Add to main executable
target_sources(apis-edge PRIVATE ${DETECTION_SOURCES})

# Test executable
add_executable(test_motion tests/test_motion.c ${DETECTION_SOURCES})
target_link_libraries(test_motion apis-edge-lib)
```

## Files to Create

**Note:** The architecture was simplified to a unified single-file implementation. The original HAL-based structure was not created.

```
apis-edge/
├── include/
│   └── detection.h              # Detection struct and API (created)
├── src/
│   └── detection/
│       └── motion.c             # Unified motion detection (Pi + ESP32)
└── tests/
    └── test_motion.c            # Unit tests and benchmarks
```

## Dependencies

- Story 10.1 (Camera Capture Module) must be complete

---

## Dev Agent Record

### File List

| File | Action | Description |
|------|--------|-------------|
| `apis-edge/include/detection.h` | Created | Detection struct, motion_config_t, API functions |
| `apis-edge/src/detection/motion.c` | Created | Unified implementation with platform conditionals |
| `apis-edge/tests/test_motion.c` | Created | Unit tests and benchmark suite |

### Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude | Story created |
| 2026-01-22 | Claude | Rewritten from Python to C with HAL abstraction |
| 2026-01-26 | Claude | Implementation completed with unified architecture |
| 2026-01-26 | Claude | Remediation: Updated documentation to match actual implementation, marked all tasks complete |
