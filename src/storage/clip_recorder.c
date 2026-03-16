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
#include <errno.h>
#include <sys/stat.h>
#include <unistd.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "img_converters.h"
#endif

#ifdef APIS_PLATFORM_PI
#include <sys/stat.h>
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
static clip_recorder_owner_t g_owner = CLIP_RECORDER_OWNER_NONE;
static uint16_t g_record_width = FRAME_WIDTH;
static uint16_t g_record_height = FRAME_HEIGHT;
static int64_t g_linked_events[MAX_LINKED_EVENTS];
static int g_linked_count = 0;
static char g_recorded_at[CLIP_RECORDED_AT_MAX];
static clip_result_t g_last_result;
static bool g_last_result_available = false;
static bool g_initialized = false;

#ifdef APIS_PLATFORM_PI
// FFmpeg encoder context
static AVFormatContext *g_format_ctx = NULL;
static AVCodecContext *g_codec_ctx = NULL;
static AVStream *g_stream = NULL;
static struct SwsContext *g_sws_ctx = NULL;
static AVFrame *g_frame = NULL;
static int g_frame_count = 0;
#elif defined(APIS_PLATFORM_ESP32)
#define AVI_MAX_FRAMES 96
#define AVI_MJPEG_QUALITY 80

static FILE *g_avi_fp = NULL;
static uint32_t g_avi_frame_offsets[AVI_MAX_FRAMES];
static uint32_t g_avi_frame_sizes[AVI_MAX_FRAMES];
static uint32_t g_avi_frame_count = 0;
static uint32_t g_last_written_frame_ts_ms = 0;
static long g_avi_riff_size_offset = 0;
static long g_avi_total_frames_offset = 0;
static long g_avi_stream_length_offset = 0;
static long g_avi_movi_size_offset = 0;
static long g_avi_movi_fourcc_offset = 0;
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
    if (event_id <= 0) {
        return false;
    }

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
#ifdef APIS_PLATFORM_ESP32
    snprintf(config.output_dir, sizeof(config.output_dir), "/data/clips");
#else
    snprintf(config.output_dir, sizeof(config.output_dir), "./data/clips");
#endif
#ifdef APIS_PLATFORM_ESP32
    config.fps = 5;
#else
    config.fps = 10;
#endif
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
#ifdef APIS_PLATFORM_ESP32
    const char *extension = "avi";
#else
    const char *extension = "mp4";
#endif
    if (tm) {
        snprintf(buf, size, "%s/det_%04d%02d%02d_%02d%02d%02d.%s",
                 g_config.output_dir,
                 tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
                 tm->tm_hour, tm->tm_min, tm->tm_sec,
                 extension);
    } else {
        snprintf(buf, size, "%s/det_unknown.%s", g_config.output_dir, extension);
    }
}

static void set_recorded_at_now(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm tm_buf;
    struct tm *tm = gmtime_r(&now, &tm_buf);

    if (tm != NULL) {
        strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        snprintf(buf, size, "1970-01-01T00:00:00Z");
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
    g_codec_ctx->width = g_record_width;
    g_codec_ctx->height = g_record_height;
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
        g_record_width, g_record_height, AV_PIX_FMT_BGR24,
        g_record_width, g_record_height, AV_PIX_FMT_YUV420P,
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
    int src_strides[1] = {g_record_width * 3};

    sws_scale(g_sws_ctx, src_slices, src_strides, 0, g_record_height,
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

#ifdef APIS_PLATFORM_ESP32
static bool write_u16_le(FILE *fp, uint16_t value) {
    uint8_t bytes[2] = {
        (uint8_t)(value & 0xFF),
        (uint8_t)((value >> 8) & 0xFF),
    };
    return fwrite(bytes, 1, sizeof(bytes), fp) == sizeof(bytes);
}

static bool write_u32_le(FILE *fp, uint32_t value) {
    uint8_t bytes[4] = {
        (uint8_t)(value & 0xFF),
        (uint8_t)((value >> 8) & 0xFF),
        (uint8_t)((value >> 16) & 0xFF),
        (uint8_t)((value >> 24) & 0xFF),
    };
    return fwrite(bytes, 1, sizeof(bytes), fp) == sizeof(bytes);
}

static bool write_fourcc(FILE *fp, const char *fourcc) {
    return fwrite(fourcc, 1, 4, fp) == 4;
}

static bool patch_u32_le(FILE *fp, long offset, uint32_t value) {
    long current = ftell(fp);
    if (current < 0) {
        return false;
    }

    if (fseek(fp, offset, SEEK_SET) != 0) {
        return false;
    }

    bool ok = write_u32_le(fp, value);
    if (fseek(fp, current, SEEK_SET) != 0) {
        return false;
    }
    return ok;
}

static uint32_t frame_interval_ms(void) {
    return (g_config.fps > 0) ? (1000U / g_config.fps) : 200U;
}

static bool should_write_frame(uint32_t timestamp_ms) {
    if (g_avi_frame_count == 0 || g_last_written_frame_ts_ms == 0) {
        g_last_written_frame_ts_ms = timestamp_ms;
        return true;
    }

    if ((timestamp_ms - g_last_written_frame_ts_ms) >= frame_interval_ms()) {
        g_last_written_frame_ts_ms = timestamp_ms;
        return true;
    }

    return false;
}

static int init_avi_writer(const char *filepath, uint16_t width, uint16_t height) {
    long strl_size_offset;
    long hdrl_end;

    g_avi_fp = fopen(filepath, "wb");
    if (g_avi_fp == NULL) {
        LOG_ERROR("Could not open AVI output file: %s", filepath);
        return -1;
    }

    memset(g_avi_frame_offsets, 0, sizeof(g_avi_frame_offsets));
    memset(g_avi_frame_sizes, 0, sizeof(g_avi_frame_sizes));
    g_avi_frame_count = 0;
    g_last_written_frame_ts_ms = 0;

    if (!write_fourcc(g_avi_fp, "RIFF")) {
        return -1;
    }
    g_avi_riff_size_offset = ftell(g_avi_fp);
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_fourcc(g_avi_fp, "AVI ")) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "LIST")) {
        return -1;
    }
    long hdrl_size_offset = ftell(g_avi_fp);
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_fourcc(g_avi_fp, "hdrl")) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "avih") ||
        !write_u32_le(g_avi_fp, 56) ||
        !write_u32_le(g_avi_fp, 1000000U / (g_config.fps > 0 ? g_config.fps : 1)) ||
        !write_u32_le(g_avi_fp, (uint32_t)width * height * g_config.fps) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0x10)) {
        return -1;
    }
    g_avi_total_frames_offset = ftell(g_avi_fp);
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 1) ||
        !write_u32_le(g_avi_fp, (uint32_t)width * height * FRAME_CHANNELS) ||
        !write_u32_le(g_avi_fp, width) ||
        !write_u32_le(g_avi_fp, height) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0)) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "LIST")) {
        return -1;
    }
    strl_size_offset = ftell(g_avi_fp);
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_fourcc(g_avi_fp, "strl")) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "strh") ||
        !write_u32_le(g_avi_fp, 56) ||
        !write_fourcc(g_avi_fp, "vids") ||
        !write_fourcc(g_avi_fp, "MJPG") ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u16_le(g_avi_fp, 0) ||
        !write_u16_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 1) ||
        !write_u32_le(g_avi_fp, g_config.fps) ||
        !write_u32_le(g_avi_fp, 0)) {
        return -1;
    }
    g_avi_stream_length_offset = ftell(g_avi_fp);
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, (uint32_t)width * height * FRAME_CHANNELS) ||
        !write_u32_le(g_avi_fp, 0xFFFFFFFFU) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u16_le(g_avi_fp, 0) ||
        !write_u16_le(g_avi_fp, 0) ||
        !write_u16_le(g_avi_fp, width) ||
        !write_u16_le(g_avi_fp, height)) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "strf") ||
        !write_u32_le(g_avi_fp, 40) ||
        !write_u32_le(g_avi_fp, 40) ||
        !write_u32_le(g_avi_fp, width) ||
        !write_u32_le(g_avi_fp, height) ||
        !write_u16_le(g_avi_fp, 1) ||
        !write_u16_le(g_avi_fp, 24) ||
        !write_fourcc(g_avi_fp, "MJPG") ||
        !write_u32_le(g_avi_fp, (uint32_t)width * height * FRAME_CHANNELS) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0) ||
        !write_u32_le(g_avi_fp, 0)) {
        return -1;
    }

    hdrl_end = ftell(g_avi_fp);
    if (!patch_u32_le(g_avi_fp, strl_size_offset,
                      (uint32_t)(hdrl_end - (strl_size_offset + 4))) ||
        !patch_u32_le(g_avi_fp, hdrl_size_offset,
                      (uint32_t)(hdrl_end - (hdrl_size_offset + 4)))) {
        return -1;
    }

    if (!write_fourcc(g_avi_fp, "LIST")) {
        return -1;
    }
    g_avi_movi_size_offset = ftell(g_avi_fp);
    g_avi_movi_fourcc_offset = g_avi_movi_size_offset + 4;
    if (!write_u32_le(g_avi_fp, 0) ||
        !write_fourcc(g_avi_fp, "movi")) {
        return -1;
    }

    return 0;
}

static int write_avi_frame(const uint8_t *jpeg_data, size_t jpeg_size) {
    if (g_avi_fp == NULL || jpeg_data == NULL || jpeg_size == 0) {
        return -1;
    }

    if (g_avi_frame_count >= AVI_MAX_FRAMES) {
        LOG_WARN("AVI frame limit reached (%u frames)", AVI_MAX_FRAMES);
        return -1;
    }

    long chunk_offset = ftell(g_avi_fp);
    if (chunk_offset < 0) {
        return -1;
    }

    g_avi_frame_offsets[g_avi_frame_count] =
        (uint32_t)(chunk_offset - g_avi_movi_fourcc_offset);
    g_avi_frame_sizes[g_avi_frame_count] = (uint32_t)jpeg_size;

    if (!write_fourcc(g_avi_fp, "00dc") ||
        !write_u32_le(g_avi_fp, (uint32_t)jpeg_size) ||
        fwrite(jpeg_data, 1, jpeg_size, g_avi_fp) != jpeg_size) {
        return -1;
    }

    if ((jpeg_size & 1U) != 0U) {
        fputc(0, g_avi_fp);
    }

    g_avi_frame_count++;
    return 0;
}

static int encode_frame_esp32(const uint8_t *bgr_data, uint16_t width,
                              uint16_t height, uint32_t timestamp_ms) {
    uint8_t *jpeg_data = NULL;
    size_t jpeg_size = 0;
    int result = -1;

    if (!should_write_frame(timestamp_ms)) {
        return 0;
    }

    if (!fmt2jpg((uint8_t *)bgr_data,
                 (size_t)width * height * FRAME_CHANNELS,
                 width,
                 height,
                 PIXFORMAT_RGB888,
                 AVI_MJPEG_QUALITY,
                 &jpeg_data,
                 &jpeg_size)) {
        LOG_WARN("ESP32 JPEG conversion failed");
        return -1;
    }

    result = write_avi_frame(jpeg_data, jpeg_size);
    free(jpeg_data);
    return result;
}

static int write_capture_frame_esp32(const uint8_t *bgr_data,
                                     uint16_t width,
                                     uint16_t height,
                                     uint32_t timestamp_ms,
                                     const uint8_t *jpeg_data,
                                     size_t jpeg_size,
                                     uint16_t jpeg_width,
                                     uint16_t jpeg_height) {
    if (bgr_data == NULL) {
        return -1;
    }

    if (jpeg_data != NULL && jpeg_size > 0 &&
        jpeg_width == g_record_width &&
        jpeg_height == g_record_height) {
        if (!should_write_frame(timestamp_ms)) {
            return 0;
        }
        return write_avi_frame(jpeg_data, jpeg_size);
    }

    return encode_frame_esp32(bgr_data, width, height, timestamp_ms);
}

static void close_avi_writer(void) {
    long movi_end;
    long file_end;

    if (g_avi_fp == NULL) {
        return;
    }

    movi_end = ftell(g_avi_fp);

    if (write_fourcc(g_avi_fp, "idx1") &&
        write_u32_le(g_avi_fp, g_avi_frame_count * 16U)) {
        for (uint32_t i = 0; i < g_avi_frame_count; i++) {
            if (!write_fourcc(g_avi_fp, "00dc") ||
                !write_u32_le(g_avi_fp, 0x10) ||
                !write_u32_le(g_avi_fp, g_avi_frame_offsets[i]) ||
                !write_u32_le(g_avi_fp, g_avi_frame_sizes[i])) {
                break;
            }
        }
    }

    file_end = ftell(g_avi_fp);

    patch_u32_le(g_avi_fp, g_avi_riff_size_offset, (uint32_t)(file_end - 8));
    patch_u32_le(g_avi_fp, g_avi_total_frames_offset, g_avi_frame_count);
    patch_u32_le(g_avi_fp, g_avi_stream_length_offset, g_avi_frame_count);
    patch_u32_le(g_avi_fp, g_avi_movi_size_offset,
                 (uint32_t)(movi_end - (g_avi_movi_size_offset + 4)));

    fclose(g_avi_fp);
    g_avi_fp = NULL;
}
#endif

static uint32_t get_file_size_bytes(const char *filepath) {
    struct stat st;
    if (filepath == NULL) {
        return 0;
    }

    if (stat(filepath, &st) == 0) {
        return (uint32_t)st.st_size;
    }

    return 0;
}

static void populate_result_locked(clip_result_t *result, uint32_t end_ms) {
    if (result == NULL) {
        return;
    }

    memset(result, 0, sizeof(*result));
    snprintf(result->filepath, sizeof(result->filepath), "%s", g_current_clip);
    snprintf(result->recorded_at, sizeof(result->recorded_at), "%s", g_recorded_at);
    result->linked_count = g_linked_count;
    if (g_linked_count > 0) {
        memcpy(result->linked_events, g_linked_events,
               g_linked_count * sizeof(int64_t));
    }
    result->duration_ms = end_ms - g_record_start_ms;
    result->file_size = get_file_size_bytes(g_current_clip);
}

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
    g_owner = CLIP_RECORDER_OWNER_NONE;
    g_record_width = FRAME_WIDTH;
    g_record_height = FRAME_HEIGHT;
    g_linked_count = 0;
    g_current_clip[0] = '\0';
    g_recorded_at[0] = '\0';
    memset(&g_last_result, 0, sizeof(g_last_result));
    g_last_result_available = false;
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
    return clip_recorder_start_owned(event_id, 0, CLIP_RECORDER_OWNER_DETECTION);
}

const char *clip_recorder_start_with_duration(int64_t event_id, uint32_t duration_ms) {
    return clip_recorder_start_owned(event_id, duration_ms, CLIP_RECORDER_OWNER_DETECTION);
}

const char *clip_recorder_start_owned(int64_t event_id,
                                      uint32_t duration_ms,
                                      clip_recorder_owner_t owner) {
    uint32_t target_duration_ms;
    buffered_frame_t *pre_roll = NULL;
    int pre_roll_count = 0;
    uint16_t inferred_width = FRAME_WIDTH;
    uint16_t inferred_height = FRAME_HEIGHT;

    CLIP_LOCK();

    if (!g_initialized) {
        LOG_WARN("clip_recorder_start called before initialization");
        CLIP_UNLOCK();
        return NULL;
    }

    target_duration_ms = duration_ms > 0
        ? duration_ms
        : (uint32_t)g_config.post_roll_seconds * 1000U;

    if (g_state == RECORD_STATE_RECORDING || g_state == RECORD_STATE_EXTENDING) {
        // Already recording - extend instead (inline to keep mutex held)
        uint32_t new_end = get_time_ms() + target_duration_ms;
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

    g_linked_count = 0;
    memset(g_linked_events, 0, sizeof(g_linked_events));
    link_event_if_new(event_id);
    set_recorded_at_now(g_recorded_at, sizeof(g_recorded_at));
    g_last_result_available = false;
    g_owner = owner;

    pre_roll = rolling_buffer_alloc_frames(MAX_BUFFER_FRAMES);
    if (pre_roll != NULL) {
        pre_roll_count = rolling_buffer_get_all(pre_roll);
        for (int i = 0; i < pre_roll_count; i++) {
            if (!pre_roll[i].valid) {
                continue;
            }
            if (pre_roll[i].jpeg_size > 0 && pre_roll[i].jpeg_width > 0 && pre_roll[i].jpeg_height > 0) {
                inferred_width = pre_roll[i].jpeg_width;
                inferred_height = pre_roll[i].jpeg_height;
                break;
            }
            if (pre_roll[i].width > 0 && pre_roll[i].height > 0) {
                inferred_width = pre_roll[i].width;
                inferred_height = pre_roll[i].height;
            }
        }
    }
    g_record_width = inferred_width;
    g_record_height = inferred_height;

#ifdef APIS_PLATFORM_PI
    // Initialize encoder
    if (init_encoder(g_current_clip) < 0) {
        g_state = RECORD_STATE_ERROR;
        rolling_buffer_free_frames(pre_roll, MAX_BUFFER_FRAMES);
        CLIP_UNLOCK();
        return NULL;
    }

    if (pre_roll != NULL) {
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
#elif defined(APIS_PLATFORM_ESP32)
    if (init_avi_writer(g_current_clip, g_record_width, g_record_height) < 0) {
        g_state = RECORD_STATE_ERROR;
        rolling_buffer_free_frames(pre_roll, MAX_BUFFER_FRAMES);
        CLIP_UNLOCK();
        return NULL;
    }

    if (pre_roll != NULL) {
        for (int i = 0; i < pre_roll_count; i++) {
            if (pre_roll[i].valid && pre_roll[i].data != NULL) {
                if (write_capture_frame_esp32(pre_roll[i].data,
                                              pre_roll[i].width,
                                              pre_roll[i].height,
                                              pre_roll[i].timestamp_ms,
                                              pre_roll[i].jpeg_data,
                                              pre_roll[i].jpeg_size,
                                              pre_roll[i].jpeg_width,
                                              pre_roll[i].jpeg_height) < 0) {
                    LOG_WARN("Failed to encode pre-roll frame %d", i);
                }
            }
        }

        rolling_buffer_free_frames(pre_roll, MAX_BUFFER_FRAMES);
    }

    LOG_INFO("Started clip: %s with %d pre-roll frames", g_current_clip, pre_roll_count);
#else
    LOG_INFO("Started clip: %s", g_current_clip);
#endif

    g_state = RECORD_STATE_RECORDING;
    g_record_start_ms = get_time_ms();
    g_extend_until_ms = g_record_start_ms + target_duration_ms;

    CLIP_UNLOCK();

    return g_current_clip;
}

bool clip_recorder_feed_frame(const frame_t *frame) {
    return clip_recorder_feed_capture(frame, NULL, 0, 0, 0);
}

bool clip_recorder_feed_capture(const frame_t *frame,
                                const uint8_t *jpeg_data,
                                size_t jpeg_size,
                                uint16_t jpeg_width,
                                uint16_t jpeg_height) {
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
#elif defined(APIS_PLATFORM_ESP32)
        if (write_capture_frame_esp32(frame->data,
                                      frame->width,
                                      frame->height,
                                      frame->timestamp_ms,
                                      jpeg_data, jpeg_size,
                                      jpeg_width, jpeg_height) < 0) {
            g_state = RECORD_STATE_ERROR;
            LOG_ERROR("Failed to encode ESP32 clip frame");
        }
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
#elif defined(APIS_PLATFORM_ESP32)
            close_avi_writer();
#endif

            populate_result_locked(&g_last_result, now);
            g_last_result_available = true;

            uint32_t duration_ms = now - g_record_start_ms;
            LOG_INFO("Finalized clip: %s (duration: %u ms, linked to %d events)",
                     g_current_clip, duration_ms, g_linked_count);

            g_state = RECORD_STATE_IDLE;
            g_owner = CLIP_RECORDER_OWNER_NONE;
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

clip_recorder_owner_t clip_recorder_get_owner(void) {
    CLIP_LOCK();
    clip_recorder_owner_t owner = g_owner;
    CLIP_UNLOCK();
    return owner;
}

const char *clip_recorder_get_current_path(void) {
    CLIP_LOCK();
    const char *path = (g_state != RECORD_STATE_IDLE) ? g_current_clip : NULL;
    CLIP_UNLOCK();
    return path;
}

int clip_recorder_stop(clip_result_t *result) {
    uint32_t now = 0;

    CLIP_LOCK();

    if (g_state == RECORD_STATE_IDLE) {
        CLIP_UNLOCK();
        return -1;
    }

    now = get_time_ms();

#ifdef APIS_PLATFORM_PI
    close_encoder();
#elif defined(APIS_PLATFORM_ESP32)
    close_avi_writer();
#endif

    populate_result_locked(&g_last_result, now);
    g_last_result_available = true;
    if (result) {
        *result = g_last_result;
    }

    g_state = RECORD_STATE_IDLE;
    g_owner = CLIP_RECORDER_OWNER_NONE;
    g_record_width = FRAME_WIDTH;
    g_record_height = FRAME_HEIGHT;

    CLIP_UNLOCK();

    LOG_INFO("Clip stopped: %s", g_current_clip);

    return 0;
}

int clip_recorder_abort(bool remove_partial_file) {
    char clip_path[CLIP_PATH_MAX] = {0};
    bool had_clip = false;

    CLIP_LOCK();

    if (g_state == RECORD_STATE_IDLE) {
        CLIP_UNLOCK();
        return -1;
    }

    if (g_current_clip[0] != '\0') {
        snprintf(clip_path, sizeof(clip_path), "%s", g_current_clip);
        had_clip = true;
    }

#ifdef APIS_PLATFORM_PI
    close_encoder();
#elif defined(APIS_PLATFORM_ESP32)
    close_avi_writer();
#endif

    g_state = RECORD_STATE_IDLE;
    g_owner = CLIP_RECORDER_OWNER_NONE;
    g_record_width = FRAME_WIDTH;
    g_record_height = FRAME_HEIGHT;
    g_record_start_ms = 0;
    g_extend_until_ms = 0;
    g_linked_count = 0;
    memset(g_linked_events, 0, sizeof(g_linked_events));
    g_current_clip[0] = '\0';
    g_recorded_at[0] = '\0';
    g_last_result_available = false;
    memset(&g_last_result, 0, sizeof(g_last_result));

    CLIP_UNLOCK();

    if (remove_partial_file && had_clip) {
        if (unlink(clip_path) == 0) {
            LOG_WARN("Removed partial clip after abort: %s", clip_path);
        } else if (errno != ENOENT) {
            LOG_WARN("Failed to remove partial clip %s: %s",
                     clip_path, strerror(errno));
        }
    }

    if (had_clip) {
        LOG_WARN("Aborted clip recording: %s", clip_path);
    } else {
        LOG_WARN("Aborted clip recording");
    }

    return 0;
}

int clip_recorder_consume_last_result(clip_result_t *result) {
    CLIP_LOCK();

    if (!g_last_result_available || result == NULL) {
        CLIP_UNLOCK();
        return -1;
    }

    *result = g_last_result;
    g_last_result_available = false;
    memset(&g_last_result, 0, sizeof(g_last_result));

    CLIP_UNLOCK();
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
#elif defined(APIS_PLATFORM_ESP32)
    if (g_state != RECORD_STATE_IDLE) {
        close_avi_writer();
    }
#endif

    g_state = RECORD_STATE_IDLE;
    g_owner = CLIP_RECORDER_OWNER_NONE;
    g_record_width = FRAME_WIDTH;
    g_record_height = FRAME_HEIGHT;
    g_initialized = false;
    g_last_result_available = false;

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
