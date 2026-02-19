/**
 * Thread-safe rolling frame buffer for clip pre-roll.
 *
 * Maintains a circular buffer of recent frames that can be
 * retrieved when a detection triggers clip recording.
 */

#include "rolling_buffer.h"
#include "log.h"

#include <stdlib.h>
#include <string.h>
#include <pthread.h>

// Module state - protected by g_mutex for thread safety
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static rolling_buffer_config_t g_config;
static buffered_frame_t *g_buffer = NULL;
static int g_head = 0;
static int g_count = 0;
static int g_max_frames = 0;
static bool g_initialized = false;

rolling_buffer_config_t rolling_buffer_config_defaults(void) {
    rolling_buffer_config_t config;
    config.duration_seconds = (float)BUFFER_DURATION_SECONDS;
    config.fps = BUFFER_FPS;
    return config;
}

rolling_buffer_status_t rolling_buffer_init(const rolling_buffer_config_t *config) {
    pthread_mutex_lock(&g_mutex);

    if (g_initialized) {
        LOG_WARN("Rolling buffer already initialized");
        pthread_mutex_unlock(&g_mutex);
        return ROLLING_BUFFER_OK;
    }

    if (config == NULL) {
        g_config = rolling_buffer_config_defaults();
    } else {
        g_config = *config;
    }

    // Calculate number of frames to buffer
    g_max_frames = (int)(g_config.duration_seconds * g_config.fps);
    if (g_max_frames < 1) {
        g_max_frames = 1;
    }
    if (g_max_frames > MAX_BUFFER_FRAMES) {
        g_max_frames = MAX_BUFFER_FRAMES;
    }

    // Allocate buffer array
    g_buffer = calloc(g_max_frames, sizeof(buffered_frame_t));
    if (!g_buffer) {
        LOG_ERROR("Failed to allocate buffer array");
        pthread_mutex_unlock(&g_mutex);
        return ROLLING_BUFFER_ERROR_NO_MEMORY;
    }

    // Pre-allocate frame data buffers
    for (int i = 0; i < g_max_frames; i++) {
        g_buffer[i].data = malloc(FRAME_SIZE);
        if (!g_buffer[i].data) {
            // Cleanup on failure
            for (int j = 0; j < i; j++) {
                free(g_buffer[j].data);
            }
            free(g_buffer);
            g_buffer = NULL;
            LOG_ERROR("Failed to allocate frame buffer %d", i);
            pthread_mutex_unlock(&g_mutex);
            return ROLLING_BUFFER_ERROR_NO_MEMORY;
        }
        g_buffer[i].valid = false;
        g_buffer[i].timestamp_ms = 0;
        g_buffer[i].sequence = 0;
    }

    g_head = 0;
    g_count = 0;
    g_initialized = true;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Rolling buffer initialized (%.1f seconds, %d FPS, %d frames max)",
             g_config.duration_seconds, g_config.fps, g_max_frames);

    return ROLLING_BUFFER_OK;
}

bool rolling_buffer_is_initialized(void) {
    pthread_mutex_lock(&g_mutex);
    bool init = g_initialized;
    pthread_mutex_unlock(&g_mutex);
    return init;
}

rolling_buffer_status_t rolling_buffer_add(const frame_t *frame) {
    if (frame == NULL) {
        return ROLLING_BUFFER_ERROR_INVALID_PARAM;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("rolling_buffer_add called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return ROLLING_BUFFER_ERROR_NOT_INITIALIZED;
    }

    // Copy frame data to next slot
    buffered_frame_t *slot = &g_buffer[g_head];

    memcpy(slot->data, frame->data, FRAME_SIZE);
    slot->timestamp_ms = frame->timestamp_ms;
    slot->sequence = frame->sequence;
    slot->valid = true;

    // Advance head (circular)
    g_head = (g_head + 1) % g_max_frames;

    if (g_count < g_max_frames) {
        g_count++;
    }

    pthread_mutex_unlock(&g_mutex);

    return ROLLING_BUFFER_OK;
}

int rolling_buffer_get_all(buffered_frame_t *frames) {
    if (frames == NULL) {
        return -1;
    }

    pthread_mutex_lock(&g_mutex);

    if (!g_initialized) {
        LOG_WARN("rolling_buffer_get_all called before initialization");
        pthread_mutex_unlock(&g_mutex);
        return -1;
    }

    int count = g_count;

    // Copy frames in chronological order (oldest first)
    // The oldest frame is at (g_head - g_count) modulo g_max_frames
    int start = (g_head - g_count + g_max_frames) % g_max_frames;

    for (int i = 0; i < count; i++) {
        int idx = (start + i) % g_max_frames;
        // Copy metadata
        frames[i].timestamp_ms = g_buffer[idx].timestamp_ms;
        frames[i].sequence = g_buffer[idx].sequence;
        frames[i].valid = g_buffer[idx].valid;
        // Copy actual frame data if caller has allocated buffer
        // SAFETY: Caller MUST pre-allocate frames[i].data with FRAME_SIZE bytes
        // If frames[i].data is NULL, caller must handle this case
        if (frames[i].data != NULL && g_buffer[idx].data != NULL) {
            memcpy(frames[i].data, g_buffer[idx].data, FRAME_SIZE);
        }
    }

    pthread_mutex_unlock(&g_mutex);

    return count;
}

int rolling_buffer_count(void) {
    pthread_mutex_lock(&g_mutex);
    int count = g_initialized ? g_count : 0;
    pthread_mutex_unlock(&g_mutex);
    return count;
}

void rolling_buffer_clear(void) {
    pthread_mutex_lock(&g_mutex);

    if (g_initialized) {
        for (int i = 0; i < g_max_frames; i++) {
            g_buffer[i].valid = false;
        }
        g_head = 0;
        g_count = 0;
    }

    pthread_mutex_unlock(&g_mutex);
}

void rolling_buffer_cleanup(void) {
    pthread_mutex_lock(&g_mutex);

    if (g_buffer) {
        for (int i = 0; i < g_max_frames; i++) {
            if (g_buffer[i].data) {
                free(g_buffer[i].data);
                g_buffer[i].data = NULL;
            }
        }
        free(g_buffer);
        g_buffer = NULL;
    }

    g_head = 0;
    g_count = 0;
    g_max_frames = 0;
    g_initialized = false;

    pthread_mutex_unlock(&g_mutex);

    LOG_INFO("Rolling buffer cleanup complete");
}

buffered_frame_t *rolling_buffer_alloc_frames(int count) {
    if (count <= 0) {
        return NULL;
    }

    buffered_frame_t *frames = calloc(count, sizeof(buffered_frame_t));
    if (!frames) {
        LOG_ERROR("Failed to allocate frames array");
        return NULL;
    }

    for (int i = 0; i < count; i++) {
        frames[i].data = malloc(FRAME_SIZE);
        if (!frames[i].data) {
            // Cleanup on failure
            for (int j = 0; j < i; j++) {
                free(frames[j].data);
            }
            free(frames);
            LOG_ERROR("Failed to allocate frame data buffer %d", i);
            return NULL;
        }
        frames[i].valid = false;
    }

    return frames;
}

void rolling_buffer_free_frames(buffered_frame_t *frames, int count) {
    if (frames == NULL) {
        return;
    }

    for (int i = 0; i < count; i++) {
        if (frames[i].data) {
            free(frames[i].data);
            frames[i].data = NULL;
        }
    }
    free(frames);
}

const char *rolling_buffer_status_str(rolling_buffer_status_t status) {
    switch (status) {
        case ROLLING_BUFFER_OK:                    return "OK";
        case ROLLING_BUFFER_ERROR_NOT_INITIALIZED: return "Not initialized";
        case ROLLING_BUFFER_ERROR_INVALID_PARAM:   return "Invalid parameter";
        case ROLLING_BUFFER_ERROR_NO_MEMORY:       return "Out of memory";
        default:                                   return "Unknown error";
    }
}
