/**
 * PSRAM-aware allocation helpers.
 *
 * On ESP32, large allocations (>10KB) are routed to PSRAM via
 * heap_caps_malloc(MALLOC_CAP_SPIRAM) to avoid exhausting the ~300KB
 * internal SRAM. On other platforms, falls back to standard malloc.
 *
 * Use psram_malloc/psram_free for any allocation that may exceed 10KB
 * (frame buffers, image buffers, rolling buffer slots, etc.).
 */

#ifndef PSRAM_ALLOC_H
#define PSRAM_ALLOC_H

#include <stdlib.h>
#include "platform.h"

#ifdef APIS_PLATFORM_ESP32
#include "esp_heap_caps.h"

#define PSRAM_ALLOC_THRESHOLD 10240  /* 10KB */

static inline void *psram_malloc(size_t size) {
    if (size > PSRAM_ALLOC_THRESHOLD) {
        void *p = heap_caps_malloc(size, MALLOC_CAP_SPIRAM);
        if (p) return p;
        /* Fallback to any available memory */
    }
    return malloc(size);
}

static inline void *psram_calloc(size_t count, size_t size) {
    size_t total = count * size;
    if (total > PSRAM_ALLOC_THRESHOLD) {
        void *p = heap_caps_calloc(count, size, MALLOC_CAP_SPIRAM);
        if (p) return p;
    }
    return calloc(count, size);
}

static inline void psram_free(void *p) {
    free(p);  /* heap_caps_malloc memory is freed with regular free on ESP32 */
}

#else
/* Non-ESP32: regular malloc */
static inline void *psram_malloc(size_t size) { return malloc(size); }
static inline void *psram_calloc(size_t count, size_t size) { return calloc(count, size); }
static inline void psram_free(void *p) { free(p); }
#endif

#endif /* PSRAM_ALLOC_H */
