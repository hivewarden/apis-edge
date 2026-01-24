/**
 * Platform detection and configuration.
 *
 * Defines APIS_PLATFORM_PI or APIS_PLATFORM_ESP32 based on build target.
 * These are typically set by CMake, but this header provides fallbacks.
 */

#ifndef APIS_PLATFORM_H
#define APIS_PLATFORM_H

// Fallback detection if CMake didn't set platform
#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_ESP32) && !defined(APIS_PLATFORM_TEST)
    #ifdef ESP_PLATFORM
        #define APIS_PLATFORM_ESP32
    #else
        #define APIS_PLATFORM_PI
    #endif
#endif

// Platform-specific includes
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    #include <unistd.h>
    #include <sys/time.h>
    #include <pthread.h>
#endif

#ifdef APIS_PLATFORM_ESP32
    #include "freertos/FreeRTOS.h"
    #include "freertos/task.h"
    #include "esp_timer.h"
#endif

// Cross-platform sleep
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    #define apis_sleep_ms(ms) usleep((ms) * 1000)
#else
    #define apis_sleep_ms(ms) vTaskDelay(pdMS_TO_TICKS(ms))
#endif

#endif // APIS_PLATFORM_H
