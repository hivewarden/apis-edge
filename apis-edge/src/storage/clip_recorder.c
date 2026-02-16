/**
 * Detection-triggered clip recording with pre-roll support.
 *
 * Records video clips to H.264 MP4 files (on Pi) or JPEG sequences (on ESP32).
 * Handles overlapping detections by extending clips and linking multiple events.
 */

#include "clip_recorder.h"
#include "rolling_buffer.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#endif

#ifdef APIS_PLATFORM_PI
#include <sys/stat.h>
#include <errno.h>
// FFmpeg headers for H.264 encoding
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/opt.h>
#include <libswscale/swscale.h>
#endif

#ifdef APIS_PLATFORM_ESP32
#include "esp_timer.h"
#endif

// S8-H2 fix: HAL-style mutex wrappers instead of direct pthread usage
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define CLIP_LOCK()   pthread_mutex_lock(&g_mutex)
#define CLIP_UNLOCK() pthread_mutex_unlock(&g_mutex)
#elif defined(APIS_PLATFORM_ESP32)
static SemaphoreHandle_t g_clip_sem = NULL;
#define CLIP_LOCK()   do { if (g_clip_sem) xSemaphoreTake(g_clip_sem, portMAX_DELAY); } while(0)
#define CLIP_UNLOCK() do { if (g_clip_sem) xSemaphoreGive(g_clip_sem); } while(0)
#else
#define CLIP_LOCK()   ((void)0)
#define CLIP_UNLOCK() ((void)0)
#endif

// Module state - protected by mutex for thread safety
static clip_recorder_config_t g_config;
static record_state_t g_state = RECORD_STATE_IDLE;
static char g_current_clip[CLIP_PATH_MAX];
static uint32_t g_record_start_ms = 0;
static uint32_t g_extend_until_ms = 0;
static int64_t g_linked_events[MAX_LINKED_EVENTS];
static int g_linked_count = 0;
static bool g_initialized = false;

#ifdef APIS_PLATFORM_PI
// FFmpeg encoder context
static AVFormatContext *g_format_ctx = NULL;
static AVCodecContext *g_codec_ctx = NULL;
static AVStream *g_stream = NULL;
static struct SwsContext *g_sws_ctx = NULL;
static AVFrame *g_frame = NULL;
static int g_frame_count = 0;
#endif

/**
 * Check if an event ID is already linked to the current clip.
 * Must be called while holding g_mutex.
 *
 * @param event_id Event ID to check
 * @return true if already linked
 */
static bool is_event_linked(int64_t event_id) {
    for (int i = 0; i < g_linked_count; i++) {
        if (g_linked_events[i] == event_id) {
            return true;
        }
    }
    return false;
}

/**
 * Add an event ID to the linked events list if not already present.
 * Must be called while holding g_mutex.
 *
 * @param event_id Event ID to link
 * @return true if event was added, false if already linked or list full
 */
static bool link_event_if_new(int64_t event_id) {
    if (g_linked_count >= MAX_LINKED_EVENTS) {
        LOG_WARN("Cannot link event %lld: max linked events reached (%d)",
                 (long long)event_id, MAX_LINKED_EVENTS);
        return false;
    }
    if (is_event_linked(event_id)) {
        return false;
    }
    g_linked_events[g_linked_count++] = event_id;
    LOG_DEBUG("Linked event %lld to clip (total: %d)",
              (long long)event_id, g_linked_count);
    return true;
}

clip_recorder_config_t clip_recorder_config_defaults(void) {
    clip_recorder_config_t config;
    memset(&config, 0, sizeof(config));
    snprintf(config.output_dir, sizeof(config.output_dir), "./data/clips");
    config.fps = 10;
    config.pre_roll_seconds = PRE_ROLL_SECONDS;
    config.post_roll_seconds = POST_ROLL_SECONDS;
    return config;
}

/**
 * Generate timestamp-based filename.
 * Uses localtime_r() for thread safety (localtime() uses a shared static buffer).
 */
static void generate_filename(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm tm_buf;
    struct tm *tm = localtime_r(&now, &tm_buf);
    if (tm) {
        snprintf(buf, size, "%s/det_%04d%02d%02d_%02d%02d%02d.mp4",
                 g_config.output_dir,
                 tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
                 tm->tm_hour, tm->tm_min, tm->tm_sec);
    } else {
        snprintf(buf, size, "%s/det_unknown.mp4", g_config.output_dir);
    }
}

/**
 * Get current time in milliseconds (monotonic).
 *
 * On Pi: Uses CLOCK_MONOTONIC for reliable timing.
 * On ESP32: Uses esp_timer_get_time() which provides microsecond resolution.
 *
 * NOTE: This is a uint32_t which overflows after ~49.7 days. For post-roll
 * timing purposes, this is acceptable as we only compare relative durations.
 */
static uint32_t get_time_ms(void) {
#ifdef APIS_PLATFORM_PI
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
#elif defined(APIS_PLATFORM_ESP32)
    // esp_timer_get_time() returns microseconds since boot
    return (uint32_t)(esp_timer_get_time() / 1000);
#else
    // Fallback for testing/other platforms - use clock() if available
    #include <time.h>
    return (uint32_t)((clock() * 1000) / CLOCKS_PER_SEC);
#endif
}

#ifdef APIS_PLATFORM_PI
/**
 * Create output directory if it doesn't exist.
 */
static int ensure_output_dir(void) {
    if (mkdir(g_config.output_dir, 0755) < 0 && errno != EEXIST) {
        LOG_ERROR("Could not create clip directory: %s", g_config.output_dir);
        return -1;
    }
    return 0;
}

/**
 * Initialize FFmpeg encoder for H.264.
 */
static int init_encoder(const char *filepath) {
    int ret;

    // Allocate format context
    ret = avformat_alloc_output_context2(&g_format_ctx, NULL, NULL, filepath);
    if (ret < 0 || !g_format_ctx) {
        LOG_ERROR("Could not create output context");
        return -1;
    }

    // Find H.264 encoder
    const AVCodec *codec = avcodec_find_encoder(AV_CODEC_ID_H264);
    if (!codec) {
        LOG_ERROR("H.264 codec not found");
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        return -1;
    }

    // Create stream
    g_stream = avformat_new_stream(g_format_ctx, NULL);
    if (!g_stream) {
        LOG_ERROR("Failed to create stream");
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        return -1;
    }

    // Allocate codec context
    g_codec_ctx = avcodec_alloc_context3(codec);
    if (!g_codec_ctx) {
        LOG_ERROR("Failed to allocate codec context");
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        return -1;
    }

    g_codec_ctx->codec_id = AV_CODEC_ID_H264;
    g_codec_ctx->codec_type = AVMEDIA_TYPE_VIDEO;
    g_codec_ctx->width = FRAME_WIDTH;
    g_codec_ctx->height = FRAME_HEIGHT;
    g_codec_ctx->time_base = (AVRational){1, g_config.fps};
    g_codec_ctx->framerate = (AVRational){g_config.fps, 1};
    g_codec_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
    g_codec_ctx->gop_size = 10;
    g_codec_ctx->max_b_frames = 0;

    // Set preset for speed on Pi
    av_opt_set(g_codec_ctx->priv_data, "preset", "ultrafast", 0);
    av_opt_set(g_codec_ctx->priv_data, "tune", "zerolatency", 0);

    // Open codec
    ret = avcodec_open2(g_codec_ctx, codec, NULL);
    if (ret < 0) {
        LOG_ERROR("Could not open H.264 codec");
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        return -1;
    }

    // Copy codec parameters to stream
    avcodec_parameters_from_context(g_stream->codecpar, g_codec_ctx);
    g_stream->time_base = g_codec_ctx->time_base;

    // Open output file
    ret = avio_open(&g_format_ctx->pb, filepath, AVIO_FLAG_WRITE);
    if (ret < 0) {
        LOG_ERROR("Could not open output file: %s", filepath);
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        return -1;
    }

    // Write header
    ret = avformat_write_header(g_format_ctx, NULL);
    if (ret < 0) {
        LOG_ERROR("Error writing file header");
        avio_closep(&g_format_ctx->pb);
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        return -1;
    }

    // Allocate frame
    g_frame = av_frame_alloc();
    if (!g_frame) {
        LOG_ERROR("Could not allocate frame");
        avio_closep(&g_format_ctx->pb);
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        return -1;
    }

    g_frame->format = g_codec_ctx->pix_fmt;
    g_frame->width = g_codec_ctx->width;
    g_frame->height = g_codec_ctx->height;
    ret = av_frame_get_buffer(g_frame, 0);
    if (ret < 0) {
        LOG_ERROR("Could not allocate frame buffer");
        av_frame_free(&g_frame);
        avio_closep(&g_format_ctx->pb);
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        g_frame = NULL;
        return -1;
    }

    // Create scaler for BGR to YUV conversion
    g_sws_ctx = sws_getContext(
        FRAME_WIDTH, FRAME_HEIGHT, AV_PIX_FMT_BGR24,
        FRAME_WIDTH, FRAME_HEIGHT, AV_PIX_FMT_YUV420P,
        SWS_BILINEAR, NULL, NULL, NULL
    );

    if (!g_sws_ctx) {
        LOG_ERROR("Could not create color converter");
        av_frame_free(&g_frame);
        avio_closep(&g_format_ctx->pb);
        avcodec_free_context(&g_codec_ctx);
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
        g_codec_ctx = NULL;
        g_frame = NULL;
        return -1;
    }

    g_frame_count = 0;

    return 0;
}

/**
 * Encode and write a frame.
 */
static int encode_frame(const uint8_t *bgr_data) {
    if (!g_format_ctx || !g_codec_ctx || !g_frame || !g_sws_ctx) {
        return -1;
    }

    int ret;

    // Make frame writable
    ret = av_frame_make_writable(g_frame);
    if (ret < 0) {
        return -1;
    }

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
    if (!pkt) {
        return -1;
    }

    while (ret >= 0) {
        ret = avcodec_receive_packet(g_codec_ctx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
        }
        if (ret < 0) {
            av_packet_free(&pkt);
            return -1;
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
        if (pkt) {
            while (avcodec_receive_packet(g_codec_ctx, pkt) >= 0) {
                av_packet_rescale_ts(pkt, g_codec_ctx->time_base, g_stream->time_base);
                pkt->stream_index = g_stream->index;
                av_interleaved_write_frame(g_format_ctx, pkt);
                av_packet_unref(pkt);
            }
            av_packet_free(&pkt);
        }

        // Write trailer
        av_write_trailer(g_format_ctx);

        // Cleanup
        if (g_sws_ctx) {
            sws_freeContext(g_sws_ctx);
            g_sws_ctx = NULL;
        }
        if (g_frame) {
            av_frame_free(&g_frame);
            g_frame = NULL;
        }
        if (g_codec_ctx) {
            avcodec_free_context(&g_codec_ctx);
            g_codec_ctx = NULL;
        }
        if (g_format_ctx->pb) {
            avio_closep(&g_format_ctx->pb);
        }
        avformat_free_context(g_format_ctx);
        g_format_ctx = NULL;
    }
    g_stream = NULL;
}
#endif // APIS_PLATFORM_PI

clip_recorder_status_t clip_recorder_init(const clip_recorder_config_t *config) {
    CLIP_LOCK();

    if (g_initialized) {
        LOG_WARN("Clip recorder already initialized");
        CLIP_UNLOCK();
        return CLIP_RECORDER_OK;
    }

    if (config == NULL) {
        g_config = clip_recorder_config_defaults();
    } else {
        g_config = *config;
    }

#ifdef APIS_PLATFORM_PI
    // Ensure output directory exists
    if (ensure_output_dir() < 0) {
        CLIP_UNLOCK();
        return CLIP_RECORDER_ERROR_FILE_WRITE;
    }
#endif

    g_state = RECORD_STATE_IDLE;
    g_linked_count = 0;
    g_current_clip[0] = '\0';
    g_initialized = true;

    CLIP_UNLOCK();

    LOG_INFO("Clip recorder initialized (output: %s, pre: %ds, post: %ds)",
             g_config.output_dir, g_config.pre_roll_seconds, g_config.post_roll_seconds);

    return CLIP_RECORDER_OK;
}

bool clip_recorder_is_initialized(void) {
    CLIP_LOCK();
    bool init = g_initialized;
    CLIP_UNLOCK();
    return init;
}

/**
 * Start recording a new clip, or extend the current one.
 *
 * IMPORTANT - CALLER BUFFER SAFETY: The returned pointer references the
 * internal static buffer g_current_clip. The caller MUST copy the returned
 * path to their own buffer immediately before the next call to
 * clip_recorder_start() (when IDLE), as a new clip start will overwrite
 * the buffer. See clip_recorder.h POINTER LIFETIME documentation.
 *
 * S8-M3 TOCTOU NOTE: The static buffer g_current_clip is protected by
 * CLIP_LOCK() during writes. The returned pointer is safe to dereference
 * only while the caller holds no expectation of exclusivity - i.e., they
 * must copy the string immediately. The mutex ensures the buffer is not
 * written concurrently during the function call itself.
 */
const char *clip_recorder_start(int64_t event_id) {
    CLIP_LOCK();

    if (!g_initialized) {
        LOG_WARN("clip_recorder_start called before initialization");
        CLIP_UNLOCK();
        return NULL;
    }

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
        // Already recording - extend instead (inline to keep mutex held)
        uint32_t new_end = get_time_ms() + (g_config.post_roll_seconds * 1000);
        if (new_end > g_extend_until_ms) {
            g_extend_until_ms = new_end;
            g_state = RECORD_STATE_EXTENDING;
            LOG_DEBUG("Extended clip until %u ms", g_extend_until_ms);
        }

        // Add event ID if not already linked (uses helper to avoid code duplication)
        link_event_if_new(event_id);

        CLIP_UNLOCK();
        // Return path to static buffer - see clip_recorder.h POINTER LIFETIME notes.
        // Callers must copy the path if they need it to survive across clip boundaries.
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
        CLIP_UNLOCK();
        return NULL;
    }

    // Write pre-roll frames from rolling buffer
    // Allocate frame array with data buffers for thread-safe copy
    buffered_frame_t *pre_roll = rolling_buffer_alloc_frames(MAX_BUFFER_FRAMES);
    int pre_roll_count = 0;

    if (pre_roll != NULL) {
        pre_roll_count = rolling_buffer_get_all(pre_roll);

        for (int i = 0; i < pre_roll_count; i++) {
            if (pre_roll[i].valid && pre_roll[i].data) {
                encode_frame(pre_roll[i].data);
            }
        }

        rolling_buffer_free_frames(pre_roll, MAX_BUFFER_FRAMES);
    } else {
        LOG_WARN("Could not allocate pre-roll buffer, starting clip without pre-roll");
    }

    LOG_INFO("Started clip: %s with %d pre-roll frames", g_current_clip, pre_roll_count);
#else
    // ESP32: MVP uses JPEG sequence approach (frames saved individually)
    // TODO(ESP32): Implement encoder_esp32.c with hardware JPEG encoding
    // when porting to production ESP32 firmware. For now, log only - frames
    // are still tracked in rolling buffer but not persisted to flash.
    LOG_INFO("Started clip (ESP32 mode): %s (stub - frames not persisted)", g_current_clip);
#endif

    g_state = RECORD_STATE_RECORDING;
    g_record_start_ms = get_time_ms();
    g_extend_until_ms = g_record_start_ms + (g_config.post_roll_seconds * 1000);

    CLIP_UNLOCK();

    return g_current_clip;
}

bool clip_recorder_feed_frame(const frame_t *frame) {
    if (frame == NULL) {
        return false;
    }

    CLIP_LOCK();

    if (!g_initialized || g_state == RECORD_STATE_IDLE) {
        CLIP_UNLOCK();
        return false;
    }

    bool finalized = false;

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
#ifdef APIS_PLATFORM_PI
        encode_frame(frame->data);
#endif

        // Check if recording should end
        // S8-L-03: The uint32_t timer wraps after ~49.7 days. Use unsigned
        // subtraction to handle wraparound correctly: (now - start) >= duration
        // works even across the wrap boundary for durations < ~24 days.
        uint32_t now = get_time_ms();
        if ((now - g_record_start_ms) >= (g_extend_until_ms - g_record_start_ms)) {
            g_state = RECORD_STATE_FINALIZING;

#ifdef APIS_PLATFORM_PI
            close_encoder();
#endif

            uint32_t duration_ms = now - g_record_start_ms;
            LOG_INFO("Finalized clip: %s (duration: %u ms, linked to %d events)",
                     g_current_clip, duration_ms, g_linked_count);

            g_state = RECORD_STATE_IDLE;
            finalized = true;
        }
    }

    CLIP_UNLOCK();
    return finalized;
}

void clip_recorder_extend(int64_t event_id) {
    CLIP_LOCK();

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
        uint32_t new_end = get_time_ms() + (g_config.post_roll_seconds * 1000);
        if (new_end > g_extend_until_ms) {
            g_extend_until_ms = new_end;
            g_state = RECORD_STATE_EXTENDING;
            LOG_DEBUG("Extended clip until %u ms", g_extend_until_ms);
        }

        // Add event ID if not already linked (uses helper to avoid code duplication)
        link_event_if_new(event_id);
    }

    CLIP_UNLOCK();
}

bool clip_recorder_is_recording(void) {
    CLIP_LOCK();
    bool recording = (g_state == RECORD_STATE_RECORDING ||
                      g_state == RECORD_STATE_EXTENDING);
    CLIP_UNLOCK();
    return recording;
}

record_state_t clip_recorder_get_state(void) {
    CLIP_LOCK();
    record_state_t state = g_state;
    CLIP_UNLOCK();
    return state;
}

const char *clip_recorder_get_current_path(void) {
    CLIP_LOCK();
    const char *path = (g_state != RECORD_STATE_IDLE) ? g_current_clip : NULL;
    CLIP_UNLOCK();
    return path;
}

int clip_recorder_stop(clip_result_t *result) {
    CLIP_LOCK();

    if (g_state == RECORD_STATE_IDLE) {
        CLIP_UNLOCK();
        return -1;
    }

#ifdef APIS_PLATFORM_PI
    close_encoder();
#endif

    if (result) {
        memset(result, 0, sizeof(*result));
        snprintf(result->filepath, sizeof(result->filepath), "%s", g_current_clip);
        result->linked_count = g_linked_count;
        if (g_linked_count > 0) {
            memcpy(result->linked_events, g_linked_events,
                   g_linked_count * sizeof(int64_t));
        }
        result->duration_ms = get_time_ms() - g_record_start_ms;

#ifdef APIS_PLATFORM_PI
        // Get file size
        struct stat st;
        if (stat(g_current_clip, &st) == 0) {
            result->file_size = (uint32_t)st.st_size;
        }
#endif
    }

    g_state = RECORD_STATE_IDLE;

    CLIP_UNLOCK();

    LOG_INFO("Clip stopped: %s", g_current_clip);

    return 0;
}

int clip_recorder_get_linked_events(int64_t *event_ids, int max_count) {
    if (event_ids == NULL || max_count <= 0) {
        return 0;
    }

    CLIP_LOCK();

    int count = (g_linked_count < max_count) ? g_linked_count : max_count;
    if (count > 0) {
        memcpy(event_ids, g_linked_events, count * sizeof(int64_t));
    }

    CLIP_UNLOCK();

    return count;
}

void clip_recorder_cleanup(void) {
    CLIP_LOCK();

#ifdef APIS_PLATFORM_PI
    if (g_state != RECORD_STATE_IDLE) {
        close_encoder();
    }
#endif

    g_state = RECORD_STATE_IDLE;
    g_initialized = false;

    CLIP_UNLOCK();

    LOG_INFO("Clip recorder cleanup complete");
}

const char *clip_recorder_status_str(clip_recorder_status_t status) {
    switch (status) {
        case CLIP_RECORDER_OK:                    return "OK";
        case CLIP_RECORDER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case CLIP_RECORDER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        case CLIP_RECORDER_ERROR_ENCODER_FAILED:  return "Encoder failed";
        case CLIP_RECORDER_ERROR_FILE_WRITE:      return "File write failed";
        case CLIP_RECORDER_ERROR_NO_MEMORY:       return "Out of memory";
        default:                                  return "Unknown error";
    }
}

const char *clip_recorder_state_str(record_state_t state) {
    switch (state) {
        case RECORD_STATE_IDLE:       return "IDLE";
        case RECORD_STATE_RECORDING:  return "RECORDING";
        case RECORD_STATE_EXTENDING:  return "EXTENDING";
        case RECORD_STATE_FINALIZING: return "FINALIZING";
        case RECORD_STATE_ERROR:      return "ERROR";
        default:                      return "UNKNOWN";
    }
}
