/**
 * HTTP Rate Limiter for APIS Edge Device.
 *
 * Tracks per-IP auth failure counts and blocks IPs that exceed
 * the failure threshold within a sliding time window.
 *
 * Extracted from http_server.c to reduce file size.
 * Not thread-safe on its own -- callers must hold HTTP_LOCK().
 */

#ifndef APIS_HTTP_RATE_LIMIT_H
#define APIS_HTTP_RATE_LIMIT_H

#include <stdbool.h>

/**
 * Check if an IP is currently rate-limited.
 * @return true if the IP is blocked, false otherwise.
 */
bool rate_limit_is_blocked(const char *ip);

/**
 * Record an auth failure for an IP.
 * Blocks the IP if the failure threshold is exceeded within the window.
 */
void rate_limit_record_failure(const char *ip);

/**
 * Clear rate limit state for an IP (e.g., on successful auth).
 */
void rate_limit_clear(const char *ip);

#endif /* APIS_HTTP_RATE_LIMIT_H */
