/**
 * Platform-abstracted monotonic time utility for APIS Edge Device.
 *
 * Provides get_time_ms() that returns monotonic milliseconds since boot.
 * Adapts to ESP32 (esp_timer), Pi (clock_gettime), and Test (clock_gettime).
 */

#ifndef APIS_TIME_UTIL_H
#define APIS_TIME_UTIL_H

#include <stdint.h>

#if defined(APIS_PLATFORM_ESP32)

#include "esp_timer.h"

static inline uint32_t get_time_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

#elif defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

/* _DARWIN_C_SOURCE needed for macOS compatibility with clock_gettime */
#define _DARWIN_C_SOURCE
#include <time.h>

static inline uint32_t get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)((uint64_t)ts.tv_sec * 1000 + (uint64_t)ts.tv_nsec / 1000000);
}

#else

#warning "Unknown platform for time_util.h - get_time_ms returns 0"

static inline uint32_t get_time_ms(void) {
    return 0;
}

#endif

#endif /* APIS_TIME_UTIL_H */
