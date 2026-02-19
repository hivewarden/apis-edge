/**
 * PSRAM allocation overrides for quirc on ESP32.
 *
 * quirc uses malloc/calloc/free internally for large image buffers (~300KB+).
 * On ESP32, internal SRAM is limited (~300KB total), so these must go to PSRAM.
 *
 * This header is force-included via -include in the ESP32 CMakeLists.txt,
 * overriding stdlib allocators for quirc source files only.
 */

#ifndef QUIRC_ALLOC_H
#define QUIRC_ALLOC_H

#ifdef APIS_PLATFORM_ESP32

#include <esp_heap_caps.h>
#include <stddef.h>

static inline void *quirc_psram_malloc(size_t size) {
    return heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
}

static inline void *quirc_psram_calloc(size_t nmemb, size_t size) {
    return heap_caps_calloc(nmemb, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
}

static inline void quirc_psram_free(void *ptr) {
    heap_caps_free(ptr);
}

#define malloc  quirc_psram_malloc
#define calloc  quirc_psram_calloc
#define free    quirc_psram_free

#endif /* APIS_PLATFORM_ESP32 */
#endif /* QUIRC_ALLOC_H */
