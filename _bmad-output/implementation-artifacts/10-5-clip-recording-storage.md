# Story 10.5: Clip Recording & Storage

Status: done

## Story

As an **APIS unit**,
I want to record short video clips of detections,
So that beekeepers can review what was detected.

## Acceptance Criteria

### AC1: Detection-Triggered Recording
**Given** a detection event occurs
**When** recording is triggered
**Then** a 5-second clip is saved (2s before, 3s after detection)
**And** the clip is encoded as H.264 MP4
**And** resolution matches camera (640x480)

### AC2: Clip File Management
**Given** a clip is recorded
**When** it's saved to storage
**Then** filename format is: `det_YYYYMMDD_HHMMSS.mp4`
**And** file size is typically 500KB-2MB
**And** clip is linked to the detection event record

### AC3: Overlapping Detection Handling
**Given** multiple detections happen rapidly
**When** clips would overlap
**Then** they're merged into a single longer clip
**And** all detection events reference the same clip file

### AC4: Storage Rotation
**Given** storage reaches threshold (1GB used)
**When** new clips are recorded
**Then** oldest clips are deleted (FIFO)
**And** detection records retain metadata but mark clip as "pruned"

## Tasks / Subtasks

- [x] **Task 1: Rolling Frame Buffer** (AC: 1)
  - [x] 1.1: Implement circular buffer for last 2 seconds of frames
  - [x] 1.2: Store frames with timestamps
  - [x] 1.3: Efficient memory management (pre-allocated buffers)

- [x] **Task 2: Clip Recording** (AC: 1, 2)
  - [x] 2.1: Trigger recording on detection event
  - [x] 2.2: Capture buffer (pre-roll) + continue for 3 seconds
  - [x] 2.3: Encode to H.264 MP4
  - [x] 2.4: Generate filename with timestamp

- [x] **Task 3: Clip Merging** (AC: 3)
  - [x] 3.1: Detect overlapping recording windows
  - [x] 3.2: Extend clip instead of creating new one
  - [x] 3.3: Link multiple events to single clip file

- [x] **Task 4: Storage Management** (AC: 4)
  - [x] 4.1: Monitor clip storage directory size
  - [x] 4.2: Implement FIFO deletion when threshold exceeded
  - [x] 4.3: Update event records when clips are pruned

## Technical Notes

### Project Structure

```
apis-edge/
├── include/
│   ├── rolling_buffer.h     # Frame buffer interface
│   ├── clip_recorder.h      # Clip recording interface
│   └── storage_manager.h    # Storage rotation interface
├── src/
│   └── storage/
│       ├── rolling_buffer.c # Frame buffer implementation
│       ├── clip_recorder.c  # Recording state machine
│       └── storage_manager.c # FIFO cleanup
├── hal/
│   └── video/
│       ├── encoder.h        # Video encoder interface
│       ├── pi/
│       │   └── encoder_pi.c # FFmpeg-based encoder for Pi
│       └── esp32/
│           └── encoder_esp32.c # JPEG sequence for ESP32
└── tests/
    ├── test_clip_recorder.c
    └── test_storage_manager.c
```

### Recording State Machine

```
                      ┌─────────────┐
                      │    IDLE     │
                      └──────┬──────┘
                             │ detection triggered
                             ▼
                      ┌─────────────┐
      ┌───────────────│  RECORDING  │───────────────┐
      │               └──────┬──────┘               │
      │ new detection        │ 3s elapsed           │ error
      │ (extend)             ▼                      ▼
      │               ┌─────────────┐        ┌─────────────┐
      └───────────────│  EXTENDING  │        │   ERROR     │
                      └──────┬──────┘        └──────┬──────┘
                             │ extended time elapsed│
                             ▼                      │
                      ┌─────────────┐               │
                      │ FINALIZING  │───────────────┘
                      └──────┬──────┘
                             │ file written
                             ▼
                      ┌─────────────┐
                      │    IDLE     │
                      └─────────────┘
```

### Rolling Buffer Interface

```c
// include/rolling_buffer.h
#ifndef APIS_ROLLING_BUFFER_H
#define APIS_ROLLING_BUFFER_H

#include "frame.h"
#include <stdint.h>
#include <stdbool.h>

#define BUFFER_DURATION_SECONDS 2
#define BUFFER_FPS 10
#define MAX_BUFFER_FRAMES (BUFFER_DURATION_SECONDS * BUFFER_FPS)

/**
 * A frame stored in the rolling buffer.
 */
typedef struct {
    uint8_t *data;           // BGR pixel data (allocated separately)
    uint32_t timestamp_ms;
    uint32_t sequence;
    bool valid;
} buffered_frame_t;

/**
 * Rolling buffer configuration.
 */
typedef struct {
    float duration_seconds;  // Buffer duration (2.0 default)
    uint8_t fps;             // Expected FPS (10 default)
} rolling_buffer_config_t;

/**
 * Initialize the rolling buffer.
 *
 * @param config Configuration (NULL for defaults)
 * @return 0 on success, -1 on failure
 */
int rolling_buffer_init(const rolling_buffer_config_t *config);

/**
 * Add a frame to the rolling buffer.
 * Oldest frames are automatically discarded.
 *
 * @param frame Frame to add (data is copied)
 * @return 0 on success
 */
int rolling_buffer_add(const frame_t *frame);

/**
 * Get all frames currently in the buffer.
 *
 * @param frames Output array (must hold MAX_BUFFER_FRAMES entries)
 * @return Number of valid frames
 */
int rolling_buffer_get_all(buffered_frame_t *frames);

/**
 * Get frame count in buffer.
 */
int rolling_buffer_count(void);

/**
 * Clear all frames from buffer.
 */
void rolling_buffer_clear(void);

/**
 * Get default configuration.
 */
rolling_buffer_config_t rolling_buffer_config_defaults(void);

/**
 * Cleanup and free buffer resources.
 */
void rolling_buffer_cleanup(void);

#endif // APIS_ROLLING_BUFFER_H
```

### Clip Recorder Interface

```c
// include/clip_recorder.h
#ifndef APIS_CLIP_RECORDER_H
#define APIS_CLIP_RECORDER_H

#include "frame.h"
#include <stdint.h>
#include <stdbool.h>

#define MAX_LINKED_EVENTS 10
#define POST_ROLL_SECONDS 3

/**
 * Recording state.
 */
typedef enum {
    RECORD_STATE_IDLE = 0,
    RECORD_STATE_RECORDING,
    RECORD_STATE_EXTENDING,
    RECORD_STATE_FINALIZING,
    RECORD_STATE_ERROR,
} record_state_t;

/**
 * Clip recorder configuration.
 */
typedef struct {
    char output_dir[128];     // Clip storage directory
    uint8_t fps;              // Recording FPS (10 default)
    uint8_t post_roll_seconds; // Seconds after detection (3 default)
} clip_recorder_config_t;

/**
 * Clip recording result.
 */
typedef struct {
    char filepath[128];       // Full path to recorded clip
    uint32_t duration_ms;     // Clip duration
    uint32_t file_size;       // File size in bytes
    int64_t linked_events[MAX_LINKED_EVENTS]; // Event IDs linked to this clip
    int linked_count;         // Number of linked events
} clip_result_t;

/**
 * Initialize the clip recorder.
 *
 * @param config Configuration (NULL for defaults)
 * @return 0 on success
 */
int clip_recorder_init(const clip_recorder_config_t *config);

/**
 * Start recording a new clip.
 * Pre-roll frames are taken from the rolling buffer.
 *
 * @param event_id Event ID to link to this clip
 * @return Path to clip file (recording in progress)
 */
const char *clip_recorder_start(int64_t event_id);

/**
 * Add a frame to the current clip.
 * Call this from the main capture loop.
 *
 * @param frame Frame to add
 * @return true if clip was finalized
 */
bool clip_recorder_add_frame(const frame_t *frame);

/**
 * Extend the current clip (for overlapping detections).
 *
 * @param event_id Additional event ID to link
 */
void clip_recorder_extend(int64_t event_id);

/**
 * Check if recording is active.
 */
bool clip_recorder_is_recording(void);

/**
 * Get current recording state.
 */
record_state_t clip_recorder_get_state(void);

/**
 * Force stop recording (e.g., on shutdown).
 *
 * @param result Output clip result (can be NULL)
 * @return 0 if clip was finalized, -1 if no clip was recording
 */
int clip_recorder_stop(clip_result_t *result);

/**
 * Get linked event IDs for current clip.
 *
 * @param event_ids Output array
 * @param max_count Maximum events to return
 * @return Number of linked events
 */
int clip_recorder_get_linked_events(int64_t *event_ids, int max_count);

/**
 * Get default configuration.
 */
clip_recorder_config_t clip_recorder_config_defaults(void);

/**
 * Cleanup clip recorder resources.
 */
void clip_recorder_cleanup(void);

#endif // APIS_CLIP_RECORDER_H
```

### Storage Manager Interface

```c
// include/storage_manager.h
#ifndef APIS_STORAGE_MANAGER_H
#define APIS_STORAGE_MANAGER_H

#include <stdint.h>
#include <stdbool.h>

#define DEFAULT_MAX_STORAGE_MB 1000

/**
 * Storage manager configuration.
 */
typedef struct {
    char clips_dir[128];      // Clip storage directory
    uint32_t max_size_mb;     // Maximum storage usage (1000 MB default)
    uint32_t target_free_mb;  // Target free space after cleanup (100 MB)
} storage_manager_config_t;

/**
 * Storage statistics.
 */
typedef struct {
    uint32_t total_size_mb;   // Total clip storage used
    uint32_t clip_count;      // Number of clip files
    bool needs_cleanup;       // True if over threshold
} storage_stats_t;

/**
 * Initialize the storage manager.
 *
 * @param config Configuration (NULL for defaults)
 * @return 0 on success
 */
int storage_manager_init(const storage_manager_config_t *config);

/**
 * Get current storage statistics.
 *
 * @param stats Output statistics
 * @return 0 on success
 */
int storage_manager_get_stats(storage_stats_t *stats);

/**
 * Check if cleanup is needed.
 */
bool storage_manager_needs_cleanup(void);

/**
 * Perform FIFO cleanup of oldest clips.
 *
 * @param deleted_paths Output array of deleted paths (can be NULL)
 * @param max_paths Maximum paths to return
 * @return Number of clips deleted
 */
int storage_manager_cleanup(char **deleted_paths, int max_paths);

/**
 * Delete a specific clip file.
 *
 * @param filepath Path to clip to delete
 * @return 0 on success
 */
int storage_manager_delete_clip(const char *filepath);

/**
 * Get default configuration.
 */
storage_manager_config_t storage_manager_config_defaults(void);

/**
 * Cleanup storage manager resources.
 */
void storage_manager_cleanup_resources(void);

#endif // APIS_STORAGE_MANAGER_H
```

### Rolling Buffer Implementation

```c
// src/storage/rolling_buffer.c
/**
 * Thread-safe rolling frame buffer for clip pre-roll.
 */

#include "rolling_buffer.h"
#include "log.h"
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

static rolling_buffer_config_t g_config;
static buffered_frame_t g_buffer[MAX_BUFFER_FRAMES];
static int g_head = 0;
static int g_count = 0;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool g_initialized = false;

rolling_buffer_config_t rolling_buffer_config_defaults(void) {
    return (rolling_buffer_config_t){
        .duration_seconds = BUFFER_DURATION_SECONDS,
        .fps = BUFFER_FPS,
    };
}

int rolling_buffer_init(const rolling_buffer_config_t *config) {
    pthread_mutex_lock(&g_mutex);

    if (config == NULL) {
        g_config = rolling_buffer_config_defaults();
    } else {
        g_config = *config;
    }

    // Pre-allocate frame data buffers
    for (int i = 0; i < MAX_BUFFER_FRAMES; i++) {
        g_buffer[i].data = malloc(FRAME_SIZE);
        if (!g_buffer[i].data) {
            // Cleanup on failure
            for (int j = 0; j < i; j++) {
                free(g_buffer[j].data);
            }
            pthread_mutex_unlock(&g_mutex);
            LOG_ERROR("Failed to allocate buffer frames");
            return -1;
        }
        g_buffer[i].valid = false;
    }

    g_head = 0;
    g_count = 0;
    g_initialized = true;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Rolling buffer initialized (%.1f seconds, %d FPS)",
             g_config.duration_seconds, g_config.fps);

    return 0;
}

int rolling_buffer_add(const frame_t *frame) {
    if (!g_initialized || !frame) {
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    // Copy frame data to next slot
    buffered_frame_t *slot = &g_buffer[g_head];

    memcpy(slot->data, frame->data, FRAME_SIZE);
    slot->timestamp_ms = frame->timestamp_ms;
    slot->sequence = frame->sequence;
    slot->valid = true;

    // Advance head (circular)
    g_head = (g_head + 1) % MAX_BUFFER_FRAMES;

    if (g_count < MAX_BUFFER_FRAMES) {
        g_count++;
    }

    pthread_mutex_unlock(&g_mutex);

    return 0;
}

int rolling_buffer_get_all(buffered_frame_t *frames) {
    if (!g_initialized || !frames) {
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    int count = g_count;

    // Copy frames in chronological order (oldest first)
    int start = (g_head - g_count + MAX_BUFFER_FRAMES) % MAX_BUFFER_FRAMES;

    for (int i = 0; i < count; i++) {
        int idx = (start + i) % MAX_BUFFER_FRAMES;
        frames[i] = g_buffer[idx];
        // Note: frames[i].data points to buffer memory, caller must not free
    }

    pthread_mutex_unlock(&g_mutex);

    return count;
}

int rolling_buffer_count(void) {
    pthread_mutex_lock(&g_mutex);
    int count = g_count;
    pthread_mutex_unlock(&g_mutex);
    return count;
}

void rolling_buffer_clear(void) {
    pthread_mutex_lock(&g_mutex);

    for (int i = 0; i < MAX_BUFFER_FRAMES; i++) {
        g_buffer[i].valid = false;
    }
    g_head = 0;
    g_count = 0;

    pthread_mutex_unlock(&g_mutex);
}

void rolling_buffer_cleanup(void) {
    pthread_mutex_lock(&g_mutex);

    for (int i = 0; i < MAX_BUFFER_FRAMES; i++) {
        if (g_buffer[i].data) {
            free(g_buffer[i].data);
            g_buffer[i].data = NULL;
        }
    }

    g_initialized = false;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Rolling buffer cleanup complete");
}
```

### Clip Recorder Implementation

```c
// src/storage/clip_recorder.c
/**
 * Detection-triggered clip recording with pre-roll support.
 */

#include "clip_recorder.h"
#include "rolling_buffer.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <pthread.h>

// For Pi: Use FFmpeg for H.264 encoding
// For ESP32: Use JPEG sequence (no H.264 hardware encoder)
#ifdef APIS_PLATFORM_PI
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/opt.h>
#include <libswscale/swscale.h>
#endif

static clip_recorder_config_t g_config;
static record_state_t g_state = RECORD_STATE_IDLE;
static char g_current_clip[128];
static uint32_t g_extend_until_ms = 0;
static int64_t g_linked_events[MAX_LINKED_EVENTS];
static int g_linked_count = 0;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool g_initialized = false;

// FFmpeg context (Pi only)
#ifdef APIS_PLATFORM_PI
static AVFormatContext *g_format_ctx = NULL;
static AVCodecContext *g_codec_ctx = NULL;
static AVStream *g_stream = NULL;
static struct SwsContext *g_sws_ctx = NULL;
static AVFrame *g_frame = NULL;
static int g_frame_count = 0;
#endif

clip_recorder_config_t clip_recorder_config_defaults(void) {
    return (clip_recorder_config_t){
        .output_dir = "./data/clips",
        .fps = 10,
        .post_roll_seconds = POST_ROLL_SECONDS,
    };
}

/**
 * Generate timestamp-based filename.
 */
static void generate_filename(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm *tm = localtime(&now);
    snprintf(buf, size, "%s/det_%04d%02d%02d_%02d%02d%02d.mp4",
             g_config.output_dir,
             tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
             tm->tm_hour, tm->tm_min, tm->tm_sec);
}

/**
 * Get current time in milliseconds.
 */
static uint32_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

#ifdef APIS_PLATFORM_PI
/**
 * Initialize FFmpeg encoder for H.264.
 */
static int init_encoder(const char *filepath) {
    int ret;

    // Allocate format context
    avformat_alloc_output_context2(&g_format_ctx, NULL, NULL, filepath);
    if (!g_format_ctx) {
        LOG_ERROR("Could not create output context");
        return -1;
    }

    // Find H.264 encoder
    const AVCodec *codec = avcodec_find_encoder(AV_CODEC_ID_H264);
    if (!codec) {
        LOG_ERROR("H.264 codec not found");
        return -1;
    }

    // Create stream
    g_stream = avformat_new_stream(g_format_ctx, NULL);
    if (!g_stream) {
        LOG_ERROR("Failed to create stream");
        return -1;
    }

    // Allocate codec context
    g_codec_ctx = avcodec_alloc_context3(codec);
    g_codec_ctx->codec_id = AV_CODEC_ID_H264;
    g_codec_ctx->codec_type = AVMEDIA_TYPE_VIDEO;
    g_codec_ctx->width = FRAME_WIDTH;
    g_codec_ctx->height = FRAME_HEIGHT;
    g_codec_ctx->time_base = (AVRational){1, g_config.fps};
    g_codec_ctx->framerate = (AVRational){g_config.fps, 1};
    g_codec_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
    g_codec_ctx->gop_size = 10;
    g_codec_ctx->max_b_frames = 0;

    // Set preset for speed
    av_opt_set(g_codec_ctx->priv_data, "preset", "ultrafast", 0);
    av_opt_set(g_codec_ctx->priv_data, "tune", "zerolatency", 0);

    // Open codec
    ret = avcodec_open2(g_codec_ctx, codec, NULL);
    if (ret < 0) {
        LOG_ERROR("Could not open codec");
        return -1;
    }

    // Copy codec parameters to stream
    avcodec_parameters_from_context(g_stream->codecpar, g_codec_ctx);
    g_stream->time_base = g_codec_ctx->time_base;

    // Open output file
    ret = avio_open(&g_format_ctx->pb, filepath, AVIO_FLAG_WRITE);
    if (ret < 0) {
        LOG_ERROR("Could not open output file");
        return -1;
    }

    // Write header
    ret = avformat_write_header(g_format_ctx, NULL);
    if (ret < 0) {
        LOG_ERROR("Error writing header");
        return -1;
    }

    // Allocate frame
    g_frame = av_frame_alloc();
    g_frame->format = g_codec_ctx->pix_fmt;
    g_frame->width = g_codec_ctx->width;
    g_frame->height = g_codec_ctx->height;
    av_frame_get_buffer(g_frame, 0);

    // Create scaler for BGR to YUV conversion
    g_sws_ctx = sws_getContext(
        FRAME_WIDTH, FRAME_HEIGHT, AV_PIX_FMT_BGR24,
        FRAME_WIDTH, FRAME_HEIGHT, AV_PIX_FMT_YUV420P,
        SWS_BILINEAR, NULL, NULL, NULL
    );

    g_frame_count = 0;

    return 0;
}

/**
 * Encode and write a frame.
 */
static int encode_frame(const uint8_t *bgr_data) {
    int ret;

    // Convert BGR to YUV
    const uint8_t *src_slices[1] = {bgr_data};
    int src_strides[1] = {FRAME_WIDTH * 3};

    sws_scale(g_sws_ctx, src_slices, src_strides, 0, FRAME_HEIGHT,
              g_frame->data, g_frame->linesize);

    g_frame->pts = g_frame_count++;

    // Send frame to encoder
    ret = avcodec_send_frame(g_codec_ctx, g_frame);
    if (ret < 0) {
        return -1;
    }

    // Receive encoded packets
    AVPacket *pkt = av_packet_alloc();
    while (ret >= 0) {
        ret = avcodec_receive_packet(g_codec_ctx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
        }

        av_packet_rescale_ts(pkt, g_codec_ctx->time_base, g_stream->time_base);
        pkt->stream_index = g_stream->index;

        av_interleaved_write_frame(g_format_ctx, pkt);
        av_packet_unref(pkt);
    }
    av_packet_free(&pkt);

    return 0;
}

/**
 * Finalize and close encoder.
 */
static void close_encoder(void) {
    if (g_format_ctx) {
        // Flush encoder
        avcodec_send_frame(g_codec_ctx, NULL);

        AVPacket *pkt = av_packet_alloc();
        while (avcodec_receive_packet(g_codec_ctx, pkt) >= 0) {
            av_packet_rescale_ts(pkt, g_codec_ctx->time_base, g_stream->time_base);
            pkt->stream_index = g_stream->index;
            av_interleaved_write_frame(g_format_ctx, pkt);
            av_packet_unref(pkt);
        }
        av_packet_free(&pkt);

        // Write trailer
        av_write_trailer(g_format_ctx);

        // Cleanup
        if (g_sws_ctx) sws_freeContext(g_sws_ctx);
        if (g_frame) av_frame_free(&g_frame);
        if (g_codec_ctx) avcodec_free_context(&g_codec_ctx);
        avio_closep(&g_format_ctx->pb);
        avformat_free_context(g_format_ctx);

        g_format_ctx = NULL;
        g_sws_ctx = NULL;
        g_frame = NULL;
        g_codec_ctx = NULL;
    }
}
#endif // APIS_PLATFORM_PI

int clip_recorder_init(const clip_recorder_config_t *config) {
    pthread_mutex_lock(&g_mutex);

    if (config == NULL) {
        g_config = clip_recorder_config_defaults();
    } else {
        g_config = *config;
    }

    // Ensure output directory exists
    mkdir(g_config.output_dir, 0755);

    g_state = RECORD_STATE_IDLE;
    g_linked_count = 0;
    g_initialized = true;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Clip recorder initialized (output: %s)", g_config.output_dir);

    return 0;
}

const char *clip_recorder_start(int64_t event_id) {
    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        pthread_mutex_unlock(&g_mutex);
        return NULL;
    }

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
        // Already recording - extend instead
        clip_recorder_extend(event_id);
        pthread_mutex_unlock(&g_mutex);
        return g_current_clip;
    }

    // Generate filename
    generate_filename(g_current_clip, sizeof(g_current_clip));

    // Link event
    g_linked_events[0] = event_id;
    g_linked_count = 1;

#ifdef APIS_PLATFORM_PI
    // Initialize encoder
    if (init_encoder(g_current_clip) < 0) {
        g_state = RECORD_STATE_ERROR;
        pthread_mutex_unlock(&g_mutex);
        return NULL;
    }

    // Write pre-roll frames from rolling buffer
    buffered_frame_t pre_roll[MAX_BUFFER_FRAMES];
    int pre_roll_count = rolling_buffer_get_all(pre_roll);

    for (int i = 0; i < pre_roll_count; i++) {
        if (pre_roll[i].valid) {
            encode_frame(pre_roll[i].data);
        }
    }

    LOG_INFO("Started clip: %s with %d pre-roll frames", g_current_clip, pre_roll_count);
#else
    // ESP32: Would use JPEG sequence instead
    LOG_INFO("Started clip (ESP32 mode): %s", g_current_clip);
#endif

    g_state = RECORD_STATE_RECORDING;
    g_extend_until_ms = get_time_ms() + (g_config.post_roll_seconds * 1000);

    pthread_mutex_unlock(&g_mutex);

    return g_current_clip;
}

bool clip_recorder_add_frame(const frame_t *frame) {
    pthread_mutex_lock(&g_mutex);

    if (!g_initialized || g_state == RECORD_STATE_IDLE) {
        pthread_mutex_unlock(&g_mutex);
        return false;
    }

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
#ifdef APIS_PLATFORM_PI
        encode_frame(frame->data);
#endif

        // Check if recording should end
        if (get_time_ms() >= g_extend_until_ms) {
            g_state = RECORD_STATE_FINALIZING;

#ifdef APIS_PLATFORM_PI
            close_encoder();
#endif

            LOG_INFO("Finalized clip: %s (linked to %d events)",
                     g_current_clip, g_linked_count);

            g_state = RECORD_STATE_IDLE;
            pthread_mutex_unlock(&g_mutex);
            return true;
        }
    }

    pthread_mutex_unlock(&g_mutex);
    return false;
}

void clip_recorder_extend(int64_t event_id) {
    pthread_mutex_lock(&g_mutex);

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
        uint32_t new_end = get_time_ms() + (g_config.post_roll_seconds * 1000);
        if (new_end > g_extend_until_ms) {
            g_extend_until_ms = new_end;
            g_state = RECORD_STATE_EXTENDING;
            LOG_DEBUG("Extended clip until %u ms", g_extend_until_ms);
        }

        if (g_linked_count < MAX_LINKED_EVENTS) {
            // Check if event already linked
            bool found = false;
            for (int i = 0; i < g_linked_count; i++) {
                if (g_linked_events[i] == event_id) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                g_linked_events[g_linked_count++] = event_id;
            }
        }
    }

    pthread_mutex_unlock(&g_mutex);
}

bool clip_recorder_is_recording(void) {
    pthread_mutex_lock(&g_mutex);
    bool recording = (g_state == RECORD_STATE_RECORDING ||
                      g_state == RECORD_STATE_EXTENDING);
    pthread_mutex_unlock(&g_mutex);
    return recording;
}

record_state_t clip_recorder_get_state(void) {
    pthread_mutex_lock(&g_mutex);
    record_state_t state = g_state;
    pthread_mutex_unlock(&g_mutex);
    return state;
}

int clip_recorder_stop(clip_result_t *result) {
    pthread_mutex_lock(&g_mutex);

    if (g_state == RECORD_STATE_IDLE) {
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

#ifdef APIS_PLATFORM_PI
    close_encoder();
#endif

    if (result) {
        strncpy(result->filepath, g_current_clip, sizeof(result->filepath) - 1);
        result->linked_count = g_linked_count;
        memcpy(result->linked_events, g_linked_events,
               g_linked_count * sizeof(int64_t));

        // Get file size
        struct stat st;
        if (stat(g_current_clip, &st) == 0) {
            result->file_size = (uint32_t)st.st_size;
        }
    }

    g_state = RECORD_STATE_IDLE;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Clip stopped: %s", g_current_clip);

    return 0;
}

int clip_recorder_get_linked_events(int64_t *event_ids, int max_count) {
    pthread_mutex_lock(&g_mutex);

    int count = (g_linked_count < max_count) ? g_linked_count : max_count;
    memcpy(event_ids, g_linked_events, count * sizeof(int64_t));

    pthread_mutex_unlock(&g_mutex);

    return count;
}

void clip_recorder_cleanup(void) {
    pthread_mutex_lock(&g_mutex);

#ifdef APIS_PLATFORM_PI
    if (g_state != RECORD_STATE_IDLE) {
        close_encoder();
    }
#endif

    g_initialized = false;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Clip recorder cleanup complete");
}
```

### Storage Manager Implementation

```c
// src/storage/storage_manager.c
/**
 * FIFO clip storage management.
 */

#include "storage_manager.h"
#include "log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

static storage_manager_config_t g_config;
static bool g_initialized = false;

storage_manager_config_t storage_manager_config_defaults(void) {
    return (storage_manager_config_t){
        .clips_dir = "./data/clips",
        .max_size_mb = DEFAULT_MAX_STORAGE_MB,
        .target_free_mb = 100,
    };
}

int storage_manager_init(const storage_manager_config_t *config) {
    if (config == NULL) {
        g_config = storage_manager_config_defaults();
    } else {
        g_config = *config;
    }

    // Ensure directory exists
    mkdir(g_config.clips_dir, 0755);

    g_initialized = true;

    LOG_INFO("Storage manager initialized (max: %d MB)", g_config.max_size_mb);

    return 0;
}

int storage_manager_get_stats(storage_stats_t *stats) {
    if (!g_initialized || !stats) {
        return -1;
    }

    stats->total_size_mb = 0;
    stats->clip_count = 0;

    DIR *dir = opendir(g_config.clips_dir);
    if (!dir) {
        return -1;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_type == DT_REG) {
            // Check if it's an MP4 file
            size_t len = strlen(entry->d_name);
            if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
                char filepath[256];
                snprintf(filepath, sizeof(filepath), "%s/%s",
                         g_config.clips_dir, entry->d_name);

                struct stat st;
                if (stat(filepath, &st) == 0) {
                    stats->total_size_mb += st.st_size / (1024 * 1024);
                    stats->clip_count++;
                }
            }
        }
    }

    closedir(dir);

    stats->needs_cleanup = stats->total_size_mb > g_config.max_size_mb;

    return 0;
}

bool storage_manager_needs_cleanup(void) {
    storage_stats_t stats;
    if (storage_manager_get_stats(&stats) < 0) {
        return false;
    }
    return stats.needs_cleanup;
}

/**
 * Comparison function for sorting files by modification time.
 */
typedef struct {
    char path[256];
    time_t mtime;
    size_t size;
} clip_file_t;

static int compare_mtime(const void *a, const void *b) {
    return ((clip_file_t *)a)->mtime - ((clip_file_t *)b)->mtime;
}

int storage_manager_cleanup(char **deleted_paths, int max_paths) {
    if (!g_initialized) {
        return -1;
    }

    // Get list of all clips sorted by modification time
    clip_file_t *clips = malloc(1000 * sizeof(clip_file_t));
    if (!clips) return -1;

    int clip_count = 0;

    DIR *dir = opendir(g_config.clips_dir);
    if (!dir) {
        free(clips);
        return -1;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL && clip_count < 1000) {
        if (entry->d_type == DT_REG) {
            size_t len = strlen(entry->d_name);
            if (len > 4 && strcmp(entry->d_name + len - 4, ".mp4") == 0) {
                snprintf(clips[clip_count].path, sizeof(clips[clip_count].path),
                         "%s/%s", g_config.clips_dir, entry->d_name);

                struct stat st;
                if (stat(clips[clip_count].path, &st) == 0) {
                    clips[clip_count].mtime = st.st_mtime;
                    clips[clip_count].size = st.st_size;
                    clip_count++;
                }
            }
        }
    }
    closedir(dir);

    // Sort by modification time (oldest first)
    qsort(clips, clip_count, sizeof(clip_file_t), compare_mtime);

    // Calculate how much to delete
    size_t total_size = 0;
    for (int i = 0; i < clip_count; i++) {
        total_size += clips[i].size;
    }

    size_t target_size = (g_config.max_size_mb - g_config.target_free_mb) * 1024 * 1024;
    size_t to_free = (total_size > target_size) ? (total_size - target_size) : 0;

    // Delete oldest clips
    int deleted = 0;
    size_t freed = 0;

    for (int i = 0; i < clip_count && freed < to_free; i++) {
        if (unlink(clips[i].path) == 0) {
            LOG_INFO("Deleted clip: %s (%.1f MB)",
                     clips[i].path, (float)clips[i].size / (1024 * 1024));

            if (deleted_paths && deleted < max_paths) {
                deleted_paths[deleted] = strdup(clips[i].path);
            }

            freed += clips[i].size;
            deleted++;
        }
    }

    free(clips);

    if (deleted > 0) {
        LOG_INFO("Storage cleanup: deleted %d clips, freed %.1f MB",
                 deleted, (float)freed / (1024 * 1024));
    }

    return deleted;
}

int storage_manager_delete_clip(const char *filepath) {
    if (!g_initialized || !filepath) {
        return -1;
    }

    if (unlink(filepath) == 0) {
        LOG_DEBUG("Deleted clip: %s", filepath);
        return 0;
    }

    return -1;
}

void storage_manager_cleanup_resources(void) {
    g_initialized = false;
    LOG_INFO("Storage manager cleanup complete");
}
```

### Clip Specifications

| Property | Value | Notes |
|----------|-------|-------|
| Format | H.264 MP4 (avc1) | Falls back to MJPEG on ESP32 |
| Resolution | 640x480 | Matches camera |
| Frame rate | 10 FPS | Matches capture |
| Duration | 5 seconds typical | 2s pre-roll + 3s post |
| File size | 500KB - 2MB | Depends on motion |
| Storage path | `./data/clips/` | Configured via config.yaml |
| Max storage | 1GB default | ~50 clips retained |

### File Naming

Format: `det_YYYYMMDD_HHMMSS.mp4`

Example: `det_20260122_143052.mp4`

### Build Configuration

Add to `CMakeLists.txt`:

```cmake
# FFmpeg for video encoding (Pi only)
if(APIS_PLATFORM STREQUAL "pi")
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(FFMPEG REQUIRED libavcodec libavformat libavutil libswscale)

    target_link_libraries(apis-edge ${FFMPEG_LIBRARIES})
    target_include_directories(apis-edge PRIVATE ${FFMPEG_INCLUDE_DIRS})
endif()

# Clip recording module
set(CLIP_SOURCES
    src/storage/rolling_buffer.c
    src/storage/clip_recorder.c
    src/storage/storage_manager.c
)

target_sources(apis-edge PRIVATE ${CLIP_SOURCES})
target_link_libraries(apis-edge pthread)
```

### Pi Build Dependencies

```bash
# Install on Raspberry Pi OS
sudo apt-get install -y \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev
```

### Test Program

```c
// tests/test_clip_recorder.c
/**
 * Test program for clip recording module.
 */

#include "rolling_buffer.h"
#include "clip_recorder.h"
#include "storage_manager.h"
#include "frame.h"
#include "log.h"

#include <stdio.h>
#include <string.h>
#include <unistd.h>

static void fill_test_frame(frame_t *frame, int pattern) {
    // Fill with test pattern
    for (int i = 0; i < FRAME_SIZE; i++) {
        frame->data[i] = (uint8_t)((i + pattern) % 256);
    }
    frame->valid = true;
}

static void test_rolling_buffer(void) {
    printf("Testing rolling buffer...\n");

    rolling_buffer_init(NULL);

    frame_t frame;
    memset(&frame, 0, sizeof(frame));

    // Add frames
    for (int i = 0; i < 30; i++) {
        fill_test_frame(&frame, i);
        frame.sequence = i;
        frame.timestamp_ms = i * 100;
        rolling_buffer_add(&frame);
    }

    printf("Buffer count: %d (expected %d)\n",
           rolling_buffer_count(), MAX_BUFFER_FRAMES);

    // Get all frames
    buffered_frame_t frames[MAX_BUFFER_FRAMES];
    int count = rolling_buffer_get_all(frames);
    printf("Retrieved %d frames\n", count);

    if (count > 0) {
        printf("First frame sequence: %d, Last: %d\n",
               frames[0].sequence, frames[count-1].sequence);
    }

    rolling_buffer_cleanup();
    printf("PASS: Rolling buffer test completed\n");
}

static void test_storage_manager(void) {
    printf("Testing storage manager...\n");

    storage_manager_config_t config = storage_manager_config_defaults();
    strcpy(config.clips_dir, "/tmp/test_clips");
    config.max_size_mb = 10;

    storage_manager_init(&config);

    storage_stats_t stats;
    storage_manager_get_stats(&stats);
    printf("Storage: %d MB used, %d clips, needs_cleanup=%d\n",
           stats.total_size_mb, stats.clip_count, stats.needs_cleanup);

    storage_manager_cleanup_resources();
    printf("PASS: Storage manager test completed\n");
}

int main(void) {
    log_init(NULL, LOG_LEVEL_INFO, false);

    test_rolling_buffer();
    test_storage_manager();

    return 0;
}
```

## Files to Create

```
apis-edge/
├── include/
│   ├── rolling_buffer.h     # Frame buffer interface
│   ├── clip_recorder.h      # Clip recording interface
│   └── storage_manager.h    # Storage rotation interface
├── src/
│   └── storage/
│       ├── rolling_buffer.c # Frame buffer implementation
│       ├── clip_recorder.c  # Recording state machine
│       └── storage_manager.c # FIFO cleanup
├── hal/
│   └── video/
│       ├── encoder.h        # Video encoder interface
│       ├── pi/
│       │   └── encoder_pi.c # FFmpeg-based encoder
│       └── esp32/
│           └── encoder_esp32.c # JPEG sequence
└── tests/
    ├── test_clip_recorder.c
    └── test_storage_manager.c
```

## Dependencies

- Story 10.1 (Camera Capture Module)
- Story 10.4 (Detection Event Logging) - to link clips to events

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-22 | Claude | Story created |
| 2026-01-22 | Claude | Rewritten from Python to C with HAL abstraction |
