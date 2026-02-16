/**
 * Frame data structure for captured video frames.
 *
 * Memory layout: BGR interleaved (same as OpenCV default)
 * Total size at 640x480: 640 * 480 * 3 = 921,600 bytes (~900KB)
 */

#ifndef APIS_FRAME_H
#define APIS_FRAME_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#define FRAME_WIDTH  640
#define FRAME_HEIGHT 480
#define FRAME_CHANNELS 3  // BGR
#define FRAME_SIZE (FRAME_WIDTH * FRAME_HEIGHT * FRAME_CHANNELS)

/**
 * A captured video frame with metadata.
 *
 * NOTE: timestamp_ms is uint32_t which overflows after ~49.7 days of
 * continuous operation (2^32 ms = 49.7 days). For most APIS use cases,
 * devices are expected to reboot or restart within this period. If
 * longer continuous operation is required, consider using the sequence
 * number (which also overflows but at a much longer interval at typical
 * FPS) or comparing timestamps within a reasonable window.
 *
 * C7-LOW-007: ALL consumers of timestamp_ms MUST handle wraparound.
 * Use unsigned subtraction for duration: duration = (newer - older)
 * which works correctly across the wrap boundary for durations < ~24 days.
 * See classifier.c:147-154 for a correct wraparound handling example.
 * NEVER compare timestamps with > or < directly (e.g., "if (ts > deadline)")
 * as this fails at the wrap boundary.
 */
typedef struct {
    uint8_t data[FRAME_SIZE];   // BGR pixel data
    uint32_t timestamp_ms;       // Milliseconds since boot (overflows after ~49 days)
    uint32_t sequence;           // Frame number since start
    uint16_t width;
    uint16_t height;
    bool valid;                  // False if capture failed
} frame_t;

/**
 * Initialize a frame structure to default values.
 *
 * @param frame Pointer to frame to initialize
 */
static inline void frame_init(frame_t *frame) {
    if (frame == NULL) return;

    memset(frame->data, 0, FRAME_SIZE);
    frame->timestamp_ms = 0;
    frame->sequence = 0;
    frame->width = FRAME_WIDTH;
    frame->height = FRAME_HEIGHT;
    frame->valid = false;
}

/**
 * Copy frame data from source to destination.
 *
 * @param dst Destination frame
 * @param src Source frame
 */
static inline void frame_copy(frame_t *dst, const frame_t *src) {
    if (dst == NULL || src == NULL) return;

    memcpy(dst->data, src->data, FRAME_SIZE);
    dst->timestamp_ms = src->timestamp_ms;
    dst->sequence = src->sequence;
    dst->width = src->width;
    dst->height = src->height;
    dst->valid = src->valid;
}

/**
 * Get pixel value at (x, y) for given channel.
 *
 * @param frame Frame to read from
 * @param x X coordinate (0 to width-1)
 * @param y Y coordinate (0 to height-1)
 * @param channel Channel (0=B, 1=G, 2=R)
 * @return Pixel value (0-255) or 0 if out of bounds
 */
static inline uint8_t frame_get_pixel(const frame_t *frame, uint16_t x, uint16_t y, uint8_t channel) {
    if (frame == NULL || x >= frame->width || y >= frame->height || channel >= FRAME_CHANNELS) {
        return 0;
    }

    size_t offset = (y * frame->width + x) * FRAME_CHANNELS + channel;
    return frame->data[offset];
}

/**
 * Set pixel value at (x, y) for given channel.
 *
 * @param frame Frame to write to
 * @param x X coordinate (0 to width-1)
 * @param y Y coordinate (0 to height-1)
 * @param channel Channel (0=B, 1=G, 2=R)
 * @param value Pixel value (0-255)
 */
static inline void frame_set_pixel(frame_t *frame, uint16_t x, uint16_t y, uint8_t channel, uint8_t value) {
    if (frame == NULL || x >= frame->width || y >= frame->height || channel >= FRAME_CHANNELS) {
        return;
    }

    size_t offset = (y * frame->width + x) * FRAME_CHANNELS + channel;
    frame->data[offset] = value;
}

/**
 * Convert frame to grayscale (in-place, uses B channel for result).
 *
 * @param frame Frame to convert
 */
static inline void frame_to_grayscale(frame_t *frame) {
    if (frame == NULL || !frame->valid) return;

    for (size_t i = 0; i < FRAME_SIZE; i += FRAME_CHANNELS) {
        // Standard luminance conversion: 0.299*R + 0.587*G + 0.114*B
        uint8_t gray = (uint8_t)(
            (frame->data[i + 2] * 77 +   // R * 0.299 * 256
             frame->data[i + 1] * 150 +  // G * 0.587 * 256
             frame->data[i + 0] * 29     // B * 0.114 * 256
            ) >> 8
        );
        frame->data[i] = gray;
        frame->data[i + 1] = gray;
        frame->data[i + 2] = gray;
    }
}

#endif // APIS_FRAME_H
