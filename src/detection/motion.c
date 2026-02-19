/**
 * Motion Detection - Shared Implementation
 *
 * Pure C implementation of background subtraction and connected component
 * analysis. Works on both Pi and ESP32 platforms without external dependencies.
 *
 * THREAD SAFETY (C7-MED-003):
 * This module is NOT thread-safe. All functions use static global buffers
 * (g_background, g_fg_mask, g_gray, g_visited, g_stack) without mutex protection.
 * By design, motion_detect() is called from a single detection pipeline thread.
 * Callers MUST NOT invoke motion_detect() concurrently from multiple threads.
 * If concurrent access is ever needed, add a mutex around motion_detect() calls.
 *
 * Algorithm:
 * 1. Convert BGR to grayscale
 * 2. Update running average background model
 * 3. Threshold frame difference to get foreground mask
 * 4. Apply morphological opening (erode then dilate) to reduce noise
 * 5. Find connected components and extract bounding boxes
 * 6. Filter by area and aspect ratio
 */

#include "detection.h"
#include "frame.h"
#include "log.h"
#include "platform.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>

// Module state
static motion_config_t g_config;
static bool g_initialized = false;

// Background model (grayscale, running average stored as float internally)
static float *g_background_float = NULL;  // Float for precision during updates
static uint8_t *g_background = NULL;      // Integer version for comparison
static bool g_bg_initialized = false;
static uint32_t g_frame_count = 0;

// Foreground mask buffer
static uint8_t *g_fg_mask = NULL;

// Temporary grayscale buffer
static uint8_t *g_gray = NULL;

// Connected component labeling buffers
static uint8_t *g_visited = NULL;
static int *g_stack = NULL;
static int g_stack_size = 8192;  // Increased from 2048 to handle larger regions

/**
 * Allocate buffer with standard malloc.
 * On ESP32 with CONFIG_SPIRAM_USE_MALLOC, allocations > 16KB are
 * automatically routed to PSRAM by the ESP-IDF heap allocator.
 */
static void *alloc_buffer(size_t size) {
    return malloc(size);
}

/**
 * Free buffer. On ESP32, PSRAM-allocated buffers must not be freed
 * while camera DMA is active (PSRAM heap spinlock deadlock).
 * Callers must stop camera DMA before calling motion_cleanup().
 */
static void free_buffer(void *ptr) {
    free(ptr);
}

motion_config_t motion_config_defaults(void) {
    return (motion_config_t){
        .learning_rate = 0.001f,      // Slow adaptation (1000 frames to fully update)
        .threshold = 25,              // ~10% brightness change
        .min_area = 100,              // Minimum blob size
        .max_area = 50000,            // Maximum blob size
        .min_aspect_ratio = 0.3f,     // Reject very tall/thin shapes
        .max_aspect_ratio = 3.0f,     // Reject very wide/flat shapes
        .detect_shadows = true,
    };
}

motion_status_t motion_init(const motion_config_t *config) {
    // Apply configuration
    if (config == NULL) {
        g_config = motion_config_defaults();
    } else {
        g_config = *config;
    }

    // Validate configuration
    if (g_config.learning_rate <= 0.0f || g_config.learning_rate > 1.0f) {
        LOG_WARN("Invalid learning rate %.4f, using 0.001", g_config.learning_rate);
        g_config.learning_rate = 0.001f;
    }
    if (g_config.threshold < 1 || g_config.threshold > 254) {
        LOG_WARN("Invalid threshold %d, using 25", g_config.threshold);
        g_config.threshold = 25;
    }

    // Issue 5: Warn if shadow detection is enabled (not yet implemented)
    if (g_config.detect_shadows) {
        LOG_WARN("detect_shadows=true but shadow detection not implemented; flag ignored");
    }

    size_t pixels = FRAME_WIDTH * FRAME_HEIGHT;

    if (g_initialized) {
        // Buffers already allocated (e.g., pre-allocated before camera DMA
        // on ESP32 to avoid PSRAM heap spinlock deadlock). Just reset state
        // with new config. Skip memset — the background model rebuilds from
        // scratch (g_bg_initialized=false) and large PSRAM memsets cause MSPI
        // bus starvation when camera DMA is active (INT WDT crash).
        g_bg_initialized = false;
        g_frame_count = 0;
        LOG_INFO("Motion detector reconfigured (threshold=%d, min_area=%d, max_area=%d)",
                 g_config.threshold, g_config.min_area, g_config.max_area);
        return MOTION_OK;
    }

    // C7-LOW-003: Log total memory requirement upfront so developers can verify
    // it fits within available RAM (especially on ESP32 without PSRAM).
    size_t total_needed = pixels * sizeof(float) + pixels * 4 +
                          (size_t)g_stack_size * 2 * sizeof(int);
    LOG_INFO("Motion detection buffer allocation: %zu bytes total "
             "(bg_float=%zu, bg+mask+gray+visited=%zu, stack=%zu)",
             total_needed, pixels * sizeof(float), pixels * 4,
             (size_t)g_stack_size * 2 * sizeof(int));

    // Allocate buffers. On ESP32 with CONFIG_SPIRAM_USE_MALLOC, large
    // allocations (> CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL = 16KB) are
    // automatically routed to PSRAM by the heap allocator.
    g_background_float = alloc_buffer(pixels * sizeof(float));
    g_background = alloc_buffer(pixels);
    g_fg_mask = alloc_buffer(pixels);
    g_gray = alloc_buffer(pixels);
    g_visited = alloc_buffer(pixels);
    g_stack = alloc_buffer(g_stack_size * 2 * sizeof(int));

    if (!g_background_float || !g_background || !g_fg_mask ||
        !g_gray || !g_visited || !g_stack) {
        LOG_ERROR("Failed to allocate motion detection buffers");
        motion_cleanup();
        return MOTION_ERROR_NO_MEMORY;
    }

    // Initialize buffers
    memset(g_background_float, 0, pixels * sizeof(float));
    memset(g_background, 0, pixels);
    memset(g_fg_mask, 0, pixels);

    g_bg_initialized = false;
    g_frame_count = 0;
    g_initialized = true;

    LOG_INFO("Motion detector initialized (threshold=%d, min_area=%d, max_area=%d)",
             g_config.threshold, g_config.min_area, g_config.max_area);

    return MOTION_OK;
}

/**
 * Convert BGR frame to grayscale.
 * Uses standard luminance formula: Y = 0.299*R + 0.587*G + 0.114*B
 * Implemented with integer math for speed.
 */
static void bgr_to_gray(const uint8_t *bgr, uint8_t *gray) {
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;

    for (int i = 0; i < pixels; i++) {
        int b = bgr[i * 3 + 0];
        int g = bgr[i * 3 + 1];
        int r = bgr[i * 3 + 2];
        // Fast approximation: (77*R + 150*G + 29*B) >> 8 ≈ 0.299R + 0.587G + 0.114B
        gray[i] = (uint8_t)((77 * r + 150 * g + 29 * b) >> 8);
    }
}

/**
 * Update background model using exponential moving average.
 *
 * Formula: bg_new = alpha * frame + (1-alpha) * bg_old
 *
 * For the first few frames, use faster learning to establish initial background.
 */
static void update_background(const uint8_t *gray) {
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;

    if (!g_bg_initialized) {
        // First frame: copy as background
        for (int i = 0; i < pixels; i++) {
            g_background_float[i] = (float)gray[i];
            g_background[i] = gray[i];
        }
        g_bg_initialized = true;
        LOG_DEBUG("Background model initialized from first frame");
        return;
    }

    // Use faster learning rate for first 100 frames
    float alpha = g_config.learning_rate;
    if (g_frame_count < 100) {
        alpha = 0.05f;  // 5% learning rate for quick initialization
    }
    float inv_alpha = 1.0f - alpha;

    // Update running average
    for (int i = 0; i < pixels; i++) {
        g_background_float[i] = alpha * (float)gray[i] + inv_alpha * g_background_float[i];
        g_background[i] = (uint8_t)(g_background_float[i] + 0.5f);  // Round
    }
}

/**
 * Compute foreground mask by thresholding absolute difference.
 */
static void compute_foreground_mask(const uint8_t *gray) {
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;
    uint8_t thresh = g_config.threshold;

    for (int i = 0; i < pixels; i++) {
        int diff = (int)gray[i] - (int)g_background[i];
        if (diff < 0) diff = -diff;  // abs()
        g_fg_mask[i] = (diff > thresh) ? 255 : 0;
    }

    // Issue 6: Explicitly zero border pixels since morphological operations
    // skip them. This prevents inconsistent edge detections.
    int width = FRAME_WIDTH;
    int height = FRAME_HEIGHT;

    // Top and bottom rows
    for (int x = 0; x < width; x++) {
        g_fg_mask[x] = 0;                           // Top row
        g_fg_mask[(height - 1) * width + x] = 0;   // Bottom row
    }

    // Left and right columns (excluding corners already zeroed)
    for (int y = 1; y < height - 1; y++) {
        g_fg_mask[y * width] = 0;                  // Left column
        g_fg_mask[y * width + (width - 1)] = 0;   // Right column
    }
}

/**
 * Apply 3x3 morphological erosion using cross kernel.
 * Erosion removes isolated pixels and shrinks blobs.
 */
static void erode_3x3(void) {
    int width = FRAME_WIDTH;
    int height = FRAME_HEIGHT;

    // Use visited buffer as temporary storage
    memcpy(g_visited, g_fg_mask, width * height);

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int idx = y * width + x;
            // Cross kernel: keep pixel only if center and 4-neighbors are all set
            if (g_visited[idx - width] == 0 ||  // top
                g_visited[idx - 1] == 0 ||      // left
                g_visited[idx] == 0 ||          // center
                g_visited[idx + 1] == 0 ||      // right
                g_visited[idx + width] == 0) {  // bottom
                g_fg_mask[idx] = 0;
            }
        }
    }
}

/**
 * Apply 3x3 morphological dilation using cross kernel.
 * Dilation fills small holes and expands blobs.
 */
static void dilate_3x3(void) {
    int width = FRAME_WIDTH;
    int height = FRAME_HEIGHT;

    // Use visited buffer as temporary storage
    memcpy(g_visited, g_fg_mask, width * height);

    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int idx = y * width + x;
            // Cross kernel: set pixel if any of center or 4-neighbors is set
            if (g_visited[idx - width] == 255 ||
                g_visited[idx - 1] == 255 ||
                g_visited[idx] == 255 ||
                g_visited[idx + 1] == 255 ||
                g_visited[idx + width] == 255) {
                g_fg_mask[idx] = 255;
            }
        }
    }
}

/**
 * Find connected components using iterative flood-fill.
 * Extracts bounding boxes and centroids for each component.
 *
 * @param detections Output array for detections
 * @param max_detections Maximum number to find
 * @return Number of detections found
 */
static int find_connected_components(detection_t *detections, int max_detections) {
    int width = FRAME_WIDTH;
    int height = FRAME_HEIGHT;
    int count = 0;
    static bool stack_overflow_warned = false;  // Warn once per session

    // Clear visited buffer
    memset(g_visited, 0, width * height);

    for (int start_y = 0; start_y < height && count < max_detections; start_y++) {
        for (int start_x = 0; start_x < width && count < max_detections; start_x++) {
            int start_idx = start_y * width + start_x;

            // Skip if not foreground or already visited
            if (g_fg_mask[start_idx] == 0 || g_visited[start_idx]) {
                continue;
            }

            // Initialize component bounds
            int min_x = start_x, max_x = start_x;
            int min_y = start_y, max_y = start_y;
            int area = 0;
            long sum_x = 0, sum_y = 0;
            // C7-MED-004: Track whether this component had a stack overflow,
            // meaning its area/bounds may be incomplete (partial flood fill)
            bool component_truncated = false;

            // Iterative flood fill using stack
            int sp = 0;  // Stack pointer
            int max_stack_entries = g_stack_size * 2;  // Each entry is 2 ints (x, y)

            // Issue 1 fix: Mark start pixel as visited BEFORE pushing to prevent duplicates
            g_visited[start_idx] = 1;
            g_stack[sp++] = start_x;
            g_stack[sp++] = start_y;

            while (sp > 0) {
                int y = g_stack[--sp];
                int x = g_stack[--sp];

                int idx = y * width + x;

                // Update stats for this pixel (already marked visited when pushed)
                area++;
                sum_x += x;
                sum_y += y;

                // Update bounding box
                if (x < min_x) min_x = x;
                if (x > max_x) max_x = x;
                if (y < min_y) min_y = y;
                if (y > max_y) max_y = y;

                // Push 4-connected neighbors
                // Issue 1 & 2 fix: Mark as visited BEFORE pushing and add defensive checks
                int neighbors[4][2] = {{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}};
                for (int n = 0; n < 4; n++) {
                    int nx = neighbors[n][0];
                    int ny = neighbors[n][1];

                    // Bounds check
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    int nidx = ny * width + nx;

                    // Skip if not foreground or already visited
                    if (g_fg_mask[nidx] == 0 || g_visited[nidx]) continue;

                    // Issue 2 fix: Check stack capacity with margin
                    if (sp + 2 > max_stack_entries - 8) {
                        if (!stack_overflow_warned) {
                            LOG_WARN("Flood fill stack near capacity (%d/%d); region may be incomplete",
                                     sp, max_stack_entries);
                            stack_overflow_warned = true;
                        }
                        // C7-MED-004: Flag component as truncated so we can discard it
                        component_truncated = true;
                        continue;  // Skip this neighbor rather than overflow
                    }

                    // Mark as visited BEFORE pushing to prevent duplicates
                    g_visited[nidx] = 1;
                    g_stack[sp++] = nx;
                    g_stack[sp++] = ny;
                }
            }

            // C7-MED-004: Discard components that were truncated by stack overflow.
            // Their area and bounds are unreliable since the flood fill was incomplete.
            if (component_truncated) {
                LOG_DEBUG("Discarding truncated component at (%d,%d) with partial area %d",
                          start_x, start_y, area);
                continue;
            }

            // Filter by area
            if (area < (int)g_config.min_area || area > (int)g_config.max_area) {
                continue;
            }

            // Calculate dimensions
            int w = max_x - min_x + 1;
            int h = max_y - min_y + 1;

            // Issue 4 fix: Prevent division by zero (h should never be 0, but be defensive)
            if (h == 0) h = 1;

            // Filter by aspect ratio
            float aspect = (float)w / (float)h;
            if (aspect < g_config.min_aspect_ratio || aspect > g_config.max_aspect_ratio) {
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

    return count;
}

int motion_detect(const uint8_t *frame_data, detection_result_t *result) {
    // Issue 9: Add error logging for each failure case
    if (!g_initialized) {
        LOG_WARN("motion_detect called before initialization");
        return -1;
    }

    if (frame_data == NULL) {
        LOG_WARN("motion_detect: frame_data is NULL");
        return -1;
    }

    if (result == NULL) {
        LOG_WARN("motion_detect: result is NULL");
        return -1;
    }

    // Initialize result
    // Issue 3: Only set count and has_motion. Caller sets frame_seq and timestamp_ms
    // (see header doc). Do not set frame_seq here as caller will overwrite it anyway.
    result->count = 0;
    result->has_motion = false;

    // Convert to grayscale
    bgr_to_gray(frame_data, g_gray);

    // Update background model
    update_background(g_gray);
    g_frame_count++;

    // Skip detection on first frame (no background comparison possible)
    if (g_frame_count <= 1) {
        return 0;
    }

    // Compute foreground mask
    compute_foreground_mask(g_gray);

    // Check if any motion at all (before morphological ops)
    int pixels = FRAME_WIDTH * FRAME_HEIGHT;
    int motion_pixels = 0;
    for (int i = 0; i < pixels; i++) {
        if (g_fg_mask[i]) motion_pixels++;
    }
    result->has_motion = (motion_pixels > 50);  // At least 50 pixels changed

    // Apply morphological opening (erode then dilate) to remove noise
    erode_3x3();
    dilate_3x3();

    // Apply closing (dilate then erode) to fill small holes
    dilate_3x3();
    erode_3x3();

    // Find connected components and extract detections
    // C7-LOW-001: Defensive check before uint8_t cast. find_connected_components()
    // currently only returns >= 0, but guard against future changes returning negative.
    int raw_count = find_connected_components(result->detections, MAX_DETECTIONS);
    result->count = (raw_count > 0) ? (uint8_t)raw_count : 0;

    return result->count;
}

void motion_reset_background(void) {
    g_bg_initialized = false;
    g_frame_count = 0;

    if (g_background_float) {
        memset(g_background_float, 0, FRAME_WIDTH * FRAME_HEIGHT * sizeof(float));
    }
    if (g_background) {
        memset(g_background, 0, FRAME_WIDTH * FRAME_HEIGHT);
    }

    LOG_INFO("Background model reset");
}

bool motion_is_initialized(void) {
    return g_initialized;
}

void motion_cleanup(void) {
    if (g_background_float) {
        free_buffer(g_background_float);
        g_background_float = NULL;
    }
    if (g_background) {
        free_buffer(g_background);
        g_background = NULL;
    }
    if (g_fg_mask) {
        free_buffer(g_fg_mask);
        g_fg_mask = NULL;
    }
    if (g_gray) {
        free_buffer(g_gray);
        g_gray = NULL;
    }
    if (g_visited) {
        free_buffer(g_visited);
        g_visited = NULL;
    }
    if (g_stack) {
        free_buffer(g_stack);
        g_stack = NULL;
    }

    g_initialized = false;
    g_bg_initialized = false;
    g_frame_count = 0;

    LOG_INFO("Motion detector cleanup complete");
}

const char *motion_status_str(motion_status_t status) {
    switch (status) {
        case MOTION_OK: return "OK";
        case MOTION_ERROR_NOT_INITIALIZED: return "Not initialized";
        case MOTION_ERROR_INVALID_PARAM: return "Invalid parameter";
        case MOTION_ERROR_NO_MEMORY: return "Memory allocation failed";
        default: return "Unknown error";
    }
}

#ifdef DEBUG_VISUALIZATION

void detection_draw_debug(uint8_t *frame, const detection_result_t *result) {
    if (frame == NULL || result == NULL) return;

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
