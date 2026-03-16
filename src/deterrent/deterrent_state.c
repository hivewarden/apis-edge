#include "deterrent_state.h"

#include "log.h"
#include "platform_mutex.h"
#include "psram_alloc.h"

#include <ctype.h>
#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

typedef struct {
    bool initialized;
    char artifact_dir[DETERRENT_ARTIFACT_PATH_MAX];
    deterrent_snapshot_t snapshot;
} deterrent_context_t;

static deterrent_context_t g_ctx = {0};

APIS_MUTEX_DECLARE(deterrent);
#define DETERRENT_LOCK()   APIS_MUTEX_LOCK(deterrent)
#define DETERRENT_UNLOCK() APIS_MUTEX_UNLOCK(deterrent)

static const char *deterrent_confidence_name(confidence_level_t level) {
    switch (level) {
        case CONFIDENCE_LOW:
            return "LOW";
        case CONFIDENCE_MEDIUM:
            return "MEDIUM";
        case CONFIDENCE_HIGH:
            return "HIGH";
        default:
            return "NONE";
    }
}

static const char *deterrent_target_state_name(target_state_t state) {
    switch (state) {
        case TARGET_STATE_IDLE:
            return "IDLE";
        case TARGET_STATE_ACQUIRING:
            return "ACQUIRING";
        case TARGET_STATE_TRACKING:
            return "TRACKING";
        case TARGET_STATE_LOST:
            return "LOST";
        case TARGET_STATE_COOLDOWN:
            return "COOLDOWN";
        default:
            return "UNKNOWN";
    }
}

static void set_timestamp_now(char *buf, size_t size) {
    time_t now = time(NULL);
    struct tm tm_buf;
    struct tm *tm = gmtime_r(&now, &tm_buf);

    if (tm != NULL) {
        strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", tm);
    } else {
        snprintf(buf, size, "1970-01-01T00:00:00Z");
    }
}

static void set_snapshot_defaults_locked(void) {
    memset(&g_ctx.snapshot, 0, sizeof(g_ctx.snapshot));
    g_ctx.snapshot.mode = CONFIG_DETERRENT_MODE_SHADOW;
    g_ctx.snapshot.state = TARGET_STATE_IDLE;
    g_ctx.snapshot.target_center_x = -1;
    g_ctx.snapshot.target_center_y = -1;
    snprintf(g_ctx.snapshot.confidence, sizeof(g_ctx.snapshot.confidence), "NONE");
}

static int ensure_dir(const char *path) {
    if (path == NULL || path[0] == '\0') {
        return -1;
    }

    char tmp[DETERRENT_ARTIFACT_PATH_MAX];
    size_t len = strlen(path);

    if (len >= sizeof(tmp)) {
        return -1;
    }

    snprintf(tmp, sizeof(tmp), "%s", path);

    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, 0755) != 0 && errno != EEXIST) {
                return -1;
            }
            *p = '/';
        }
    }

    if (mkdir(tmp, 0755) != 0 && errno != EEXIST) {
        return -1;
    }

    return 0;
}

static void draw_rect(frame_t *frame, int x, int y, int w, int h,
                      uint8_t b, uint8_t g, uint8_t r) {
    if (frame == NULL || w <= 0 || h <= 0) {
        return;
    }

    int x0 = x < 0 ? 0 : x;
    int y0 = y < 0 ? 0 : y;
    int x1 = x + w - 1;
    int y1 = y + h - 1;

    if (x1 >= frame->width) x1 = frame->width - 1;
    if (y1 >= frame->height) y1 = frame->height - 1;

    for (int px = x0; px <= x1; px++) {
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y0, 0, b);
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y0, 1, g);
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y0, 2, r);
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y1, 0, b);
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y1, 1, g);
        frame_set_pixel(frame, (uint16_t)px, (uint16_t)y1, 2, r);
    }

    for (int py = y0; py <= y1; py++) {
        frame_set_pixel(frame, (uint16_t)x0, (uint16_t)py, 0, b);
        frame_set_pixel(frame, (uint16_t)x0, (uint16_t)py, 1, g);
        frame_set_pixel(frame, (uint16_t)x0, (uint16_t)py, 2, r);
        frame_set_pixel(frame, (uint16_t)x1, (uint16_t)py, 0, b);
        frame_set_pixel(frame, (uint16_t)x1, (uint16_t)py, 1, g);
        frame_set_pixel(frame, (uint16_t)x1, (uint16_t)py, 2, r);
    }
}

static void draw_crosshair(frame_t *frame, int cx, int cy,
                           uint8_t b, uint8_t g, uint8_t r) {
    if (frame == NULL) {
        return;
    }

    for (int dx = -4; dx <= 4; dx++) {
        int px = cx + dx;
        if (px >= 0 && px < frame->width && cy >= 0 && cy < frame->height) {
            frame_set_pixel(frame, (uint16_t)px, (uint16_t)cy, 0, b);
            frame_set_pixel(frame, (uint16_t)px, (uint16_t)cy, 1, g);
            frame_set_pixel(frame, (uint16_t)px, (uint16_t)cy, 2, r);
        }
    }

    for (int dy = -4; dy <= 4; dy++) {
        int py = cy + dy;
        if (cx >= 0 && cx < frame->width && py >= 0 && py < frame->height) {
            frame_set_pixel(frame, (uint16_t)cx, (uint16_t)py, 0, b);
            frame_set_pixel(frame, (uint16_t)cx, (uint16_t)py, 1, g);
            frame_set_pixel(frame, (uint16_t)cx, (uint16_t)py, 2, r);
        }
    }
}

static void glyph_for_char(char c, uint8_t glyph[5]) {
    static const uint8_t blank[5] = {0, 0, 0, 0, 0};

    memcpy(glyph, blank, 5);

    switch (toupper((unsigned char)c)) {
        case 'A': { uint8_t g[5] = {0x1E, 0x05, 0x05, 0x1E, 0x00}; memcpy(glyph, g, 5); break; }
        case 'B': { uint8_t g[5] = {0x1F, 0x15, 0x15, 0x0A, 0x00}; memcpy(glyph, g, 5); break; }
        case 'C': { uint8_t g[5] = {0x0E, 0x11, 0x11, 0x11, 0x00}; memcpy(glyph, g, 5); break; }
        case 'D': { uint8_t g[5] = {0x1F, 0x11, 0x11, 0x0E, 0x00}; memcpy(glyph, g, 5); break; }
        case 'E': { uint8_t g[5] = {0x1F, 0x15, 0x15, 0x11, 0x00}; memcpy(glyph, g, 5); break; }
        case 'G': { uint8_t g[5] = {0x0E, 0x11, 0x15, 0x1D, 0x00}; memcpy(glyph, g, 5); break; }
        case 'H': { uint8_t g[5] = {0x1F, 0x04, 0x04, 0x1F, 0x00}; memcpy(glyph, g, 5); break; }
        case 'I': { uint8_t g[5] = {0x11, 0x1F, 0x11, 0x00, 0x00}; memcpy(glyph, g, 5); break; }
        case 'K': { uint8_t g[5] = {0x1F, 0x04, 0x0A, 0x11, 0x00}; memcpy(glyph, g, 5); break; }
        case 'L': { uint8_t g[5] = {0x1F, 0x10, 0x10, 0x10, 0x00}; memcpy(glyph, g, 5); break; }
        case 'N': { uint8_t g[5] = {0x1F, 0x02, 0x04, 0x1F, 0x00}; memcpy(glyph, g, 5); break; }
        case 'O': { uint8_t g[5] = {0x0E, 0x11, 0x11, 0x0E, 0x00}; memcpy(glyph, g, 5); break; }
        case 'Q': { uint8_t g[5] = {0x0E, 0x11, 0x19, 0x1E, 0x00}; memcpy(glyph, g, 5); break; }
        case 'R': { uint8_t g[5] = {0x1F, 0x05, 0x0D, 0x12, 0x00}; memcpy(glyph, g, 5); break; }
        case 'S': { uint8_t g[5] = {0x12, 0x15, 0x15, 0x09, 0x00}; memcpy(glyph, g, 5); break; }
        case 'T': { uint8_t g[5] = {0x01, 0x1F, 0x01, 0x00, 0x00}; memcpy(glyph, g, 5); break; }
        case 'U': { uint8_t g[5] = {0x0F, 0x10, 0x10, 0x0F, 0x00}; memcpy(glyph, g, 5); break; }
        case 'V': { uint8_t g[5] = {0x07, 0x08, 0x10, 0x08, 0x07}; memcpy(glyph, g, 5); break; }
        case 'W': { uint8_t g[5] = {0x1F, 0x08, 0x04, 0x08, 0x1F}; memcpy(glyph, g, 5); break; }
        case '-': { uint8_t g[5] = {0x04, 0x04, 0x04, 0x04, 0x00}; memcpy(glyph, g, 5); break; }
        default: break;
    }
}

static void draw_text(frame_t *frame, int x, int y, const char *text,
                      uint8_t b, uint8_t g, uint8_t r) {
    if (frame == NULL || text == NULL) {
        return;
    }

    int cursor_x = x;
    for (const char *p = text; *p != '\0'; p++) {
        uint8_t glyph[5];
        glyph_for_char(*p, glyph);

        for (int col = 0; col < 5; col++) {
            for (int row = 0; row < 7; row++) {
                if ((glyph[col] >> row) & 0x01U) {
                    int px = cursor_x + col;
                    int py = y + row;
                    if (px >= 0 && px < frame->width &&
                        py >= 0 && py < frame->height) {
                        frame_set_pixel(frame, (uint16_t)px, (uint16_t)py, 0, b);
                        frame_set_pixel(frame, (uint16_t)px, (uint16_t)py, 1, g);
                        frame_set_pixel(frame, (uint16_t)px, (uint16_t)py, 2, r);
                    }
                }
            }
        }

        cursor_x += 6;
    }
}

static int save_ppm(const frame_t *frame, const char *path) {
    FILE *fp;

    if (frame == NULL || path == NULL) {
        return -1;
    }

    fp = fopen(path, "wb");
    if (fp == NULL) {
        return -1;
    }

    fprintf(fp, "P6\n%u %u\n255\n", frame->width, frame->height);
    for (uint32_t y = 0; y < frame->height; y++) {
        for (uint32_t x = 0; x < frame->width; x++) {
            size_t offset = (y * frame->width + x) * FRAME_CHANNELS;
            uint8_t rgb[3] = {
                frame->data[offset + 2],
                frame->data[offset + 1],
                frame->data[offset + 0],
            };
            if (fwrite(rgb, 1, sizeof(rgb), fp) != sizeof(rgb)) {
                fclose(fp);
                unlink(path);
                return -1;
            }
        }
    }

    fclose(fp);
    return 0;
}

static int export_annotated_frame_locked(const frame_t *frame,
                                         const targeting_snapshot_t *targeting,
                                         const classified_detection_t *classification,
                                         char *out_path,
                                         size_t out_path_size) {
    frame_t *annotated = NULL;
    char filename[DETERRENT_ARTIFACT_PATH_MAX];

    if (frame == NULL || targeting == NULL || classification == NULL ||
        g_ctx.artifact_dir[0] == '\0') {
        return -1;
    }

    annotated = psram_malloc(sizeof(*annotated));
    if (annotated == NULL) {
        return -1;
    }

    frame_copy(annotated, frame);
    draw_rect(annotated,
              classification->detection.x,
              classification->detection.y,
              classification->detection.w,
              classification->detection.h,
              0, 220, 255);
    draw_crosshair(annotated,
                   targeting->target.centroid.x,
                   targeting->target.centroid.y,
                   80, 255, 80);
    draw_text(annotated, 10, 10,
              config_deterrent_mode_name(g_ctx.snapshot.mode),
              255, 255, 255);
    draw_text(annotated, 10, 22,
              deterrent_target_state_name(targeting->state),
              255, 210, 90);

    snprintf(filename, sizeof(filename), "%s/shadow_%" PRIu32 "_%" PRIu32 ".ppm",
             g_ctx.artifact_dir,
             frame->sequence,
             frame->timestamp_ms);

    if (save_ppm(annotated, filename) != 0) {
        psram_free(annotated);
        return -1;
    }

    psram_free(annotated);
    snprintf(out_path, out_path_size, "%s", filename);
    return 0;
}

int deterrent_state_init(const char *artifact_dir) {
    APIS_MUTEX_INIT(deterrent);

    DETERRENT_LOCK();
    memset(&g_ctx, 0, sizeof(g_ctx));
    set_snapshot_defaults_locked();
    if (artifact_dir != NULL) {
        snprintf(g_ctx.artifact_dir, sizeof(g_ctx.artifact_dir), "%s", artifact_dir);
    }
    g_ctx.initialized = true;
    DETERRENT_UNLOCK();

    if (g_ctx.artifact_dir[0] != '\0' && ensure_dir(g_ctx.artifact_dir) != 0) {
        LOG_WARN("Failed to create deterrent artifact directory: %s", g_ctx.artifact_dir);
    }

    return 0;
}

void deterrent_state_cleanup(void) {
    DETERRENT_LOCK();
    set_snapshot_defaults_locked();
    g_ctx.artifact_dir[0] = '\0';
    g_ctx.initialized = false;
    DETERRENT_UNLOCK();
}

void deterrent_state_set_mode(config_deterrent_mode_t mode) {
    DETERRENT_LOCK();
    if (g_ctx.initialized) {
        g_ctx.snapshot.mode = mode;
    }
    DETERRENT_UNLOCK();
}

void deterrent_state_update_tracking(const targeting_snapshot_t *targeting,
                                     const classified_detection_t *classification) {
    DETERRENT_LOCK();

    if (!g_ctx.initialized) {
        DETERRENT_UNLOCK();
        return;
    }

    if (targeting == NULL) {
        g_ctx.snapshot.state = TARGET_STATE_IDLE;
        g_ctx.snapshot.target_acquired = false;
        g_ctx.snapshot.target_center_x = -1;
        g_ctx.snapshot.target_center_y = -1;
        g_ctx.snapshot.target_area = 0;
        g_ctx.snapshot.hover_duration_ms = 0;
        snprintf(g_ctx.snapshot.confidence, sizeof(g_ctx.snapshot.confidence), "NONE");
        g_ctx.snapshot.would_move = false;
        g_ctx.snapshot.would_fire = false;
        DETERRENT_UNLOCK();
        return;
    }

    g_ctx.snapshot.state = targeting->state;
    g_ctx.snapshot.target_acquired = targeting->target_active;
    g_ctx.snapshot.would_move = targeting->would_move;
    g_ctx.snapshot.would_fire = targeting->would_fire;

    if (targeting->target_active) {
        g_ctx.snapshot.target_center_x = targeting->target.centroid.x;
        g_ctx.snapshot.target_center_y = targeting->target.centroid.y;
        g_ctx.snapshot.target_area = targeting->target.area;
        g_ctx.snapshot.hover_duration_ms =
            classification != NULL ? classification->hover_duration_ms : 0;
        snprintf(g_ctx.snapshot.confidence, sizeof(g_ctx.snapshot.confidence),
                 "%s",
                 classification != NULL
                     ? deterrent_confidence_name(classification->confidence)
                     : "NONE");
        set_timestamp_now(g_ctx.snapshot.last_decision_at,
                          sizeof(g_ctx.snapshot.last_decision_at));
    } else {
        g_ctx.snapshot.target_center_x = -1;
        g_ctx.snapshot.target_center_y = -1;
        g_ctx.snapshot.target_area = 0;
        g_ctx.snapshot.hover_duration_ms = 0;
        snprintf(g_ctx.snapshot.confidence, sizeof(g_ctx.snapshot.confidence), "NONE");
    }

    DETERRENT_UNLOCK();
}

void deterrent_state_record_shadow_event(const frame_t *frame,
                                         const targeting_snapshot_t *targeting,
                                         const classified_detection_t *classification,
                                         const char *clip_path,
                                         bool export_annotated_frame) {
    char annotated_path[DETERRENT_ARTIFACT_PATH_MAX] = {0};

    DETERRENT_LOCK();

    if (!g_ctx.initialized) {
        DETERRENT_UNLOCK();
        return;
    }

    if (clip_path != NULL) {
        snprintf(g_ctx.snapshot.last_clip_path, sizeof(g_ctx.snapshot.last_clip_path),
                 "%s", clip_path);
    }

    set_timestamp_now(g_ctx.snapshot.last_decision_at,
                      sizeof(g_ctx.snapshot.last_decision_at));
    g_ctx.snapshot.last_error[0] = '\0';

    if (export_annotated_frame) {
        if (export_annotated_frame_locked(frame, targeting, classification,
                                          annotated_path, sizeof(annotated_path)) == 0) {
            snprintf(g_ctx.snapshot.last_annotated_frame_path,
                     sizeof(g_ctx.snapshot.last_annotated_frame_path),
                     "%s", annotated_path);
        } else {
            snprintf(g_ctx.snapshot.last_error, sizeof(g_ctx.snapshot.last_error),
                     "Failed to save annotated frame");
        }
    }

    DETERRENT_UNLOCK();
}

void deterrent_state_mark_clip_path(const char *clip_path) {
    if (clip_path == NULL) {
        return;
    }

    DETERRENT_LOCK();
    if (g_ctx.initialized) {
        snprintf(g_ctx.snapshot.last_clip_path, sizeof(g_ctx.snapshot.last_clip_path),
                 "%s", clip_path);
    }
    DETERRENT_UNLOCK();
}

void deterrent_state_mark_error(const char *message) {
    DETERRENT_LOCK();
    if (g_ctx.initialized) {
        snprintf(g_ctx.snapshot.last_error, sizeof(g_ctx.snapshot.last_error),
                 "%s", message != NULL ? message : "unknown");
    }
    DETERRENT_UNLOCK();
}

void deterrent_state_get_snapshot(deterrent_snapshot_t *out) {
    if (out == NULL) {
        return;
    }

    DETERRENT_LOCK();
    *out = g_ctx.snapshot;
    DETERRENT_UNLOCK();
}
