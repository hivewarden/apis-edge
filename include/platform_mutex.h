/**
 * Platform-abstracted mutex macros for APIS Edge Device.
 *
 * Provides APIS_MUTEX_DECLARE, APIS_MUTEX_INIT, APIS_MUTEX_LOCK, APIS_MUTEX_UNLOCK
 * macros that adapt to the target platform:
 *   - ESP32: FreeRTOS SemaphoreHandle_t
 *   - Pi / Test: pthread_mutex_t
 */

#ifndef APIS_PLATFORM_MUTEX_H
#define APIS_PLATFORM_MUTEX_H

#if defined(APIS_PLATFORM_ESP32)

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#define APIS_MUTEX_DECLARE(name)  static SemaphoreHandle_t apis_mutex_##name = NULL

#define APIS_MUTEX_INIT(name)     do { \
        if (apis_mutex_##name == NULL) { \
            apis_mutex_##name = xSemaphoreCreateMutex(); \
        } \
    } while (0)

#define APIS_MUTEX_LOCK(name)     do { \
        if (apis_mutex_##name) xSemaphoreTake(apis_mutex_##name, portMAX_DELAY); \
    } while (0)

#define APIS_MUTEX_UNLOCK(name)   do { \
        if (apis_mutex_##name) xSemaphoreGive(apis_mutex_##name); \
    } while (0)

#elif defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

#include <pthread.h>

#define APIS_MUTEX_DECLARE(name)  static pthread_mutex_t apis_mutex_##name = PTHREAD_MUTEX_INITIALIZER

#define APIS_MUTEX_INIT(name)     ((void)0)  /* statically initialized */

#define APIS_MUTEX_LOCK(name)     pthread_mutex_lock(&apis_mutex_##name)

#define APIS_MUTEX_UNLOCK(name)   pthread_mutex_unlock(&apis_mutex_##name)

#else

#warning "Unknown platform for platform_mutex.h - mutex operations are no-ops"

#define APIS_MUTEX_DECLARE(name)  /* no-op */
#define APIS_MUTEX_INIT(name)     ((void)0)
#define APIS_MUTEX_LOCK(name)     ((void)0)
#define APIS_MUTEX_UNLOCK(name)   ((void)0)

#endif

#endif /* APIS_PLATFORM_MUTEX_H */
