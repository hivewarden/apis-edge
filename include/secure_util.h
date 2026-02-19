/**
 * Secure utility functions for APIS Edge Device.
 *
 * Provides secure_clear() to zero sensitive data from memory.
 * Uses volatile pointer to prevent compiler optimization from removing the clear.
 */

#ifndef APIS_SECURE_UTIL_H
#define APIS_SECURE_UTIL_H

#include <stddef.h>

/**
 * Securely clear sensitive data from memory.
 * Uses volatile pointer to prevent compiler optimization from removing the clear.
 * This prevents API keys and other secrets from remaining in memory after use.
 */
static inline void secure_clear(void *ptr, size_t size) {
    volatile unsigned char *p = (volatile unsigned char *)ptr;
    while (size--) {
        *p++ = 0;
    }
}

#endif /* APIS_SECURE_UTIL_H */
