/**
 * HTTP Rate Limiter implementation.
 *
 * Per-IP auth failure tracking with sliding window and automatic blocking.
 * Extracted from http_server.c to reduce file size.
 */

#include "http_rate_limit.h"
#include "log.h"

#include <string.h>
#include <time.h>

// ============================================================================
// Constants
// ============================================================================

#define RATE_LIMIT_MAX_ENTRIES  16
#define RATE_LIMIT_MAX_FAILURES 5
#define RATE_LIMIT_WINDOW_SEC   60
#define RATE_LIMIT_BLOCK_SEC    60

// ============================================================================
// Internal State
// ============================================================================

typedef struct {
    char ip[64];
    int failure_count;
    time_t first_failure;
    time_t blocked_until;
} rate_limit_entry_t;

static rate_limit_entry_t g_rate_limits[RATE_LIMIT_MAX_ENTRIES];
static int g_rate_limit_count = 0;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * S8-M1 fix: Periodically clean up expired rate limit entries.
 * Removes entries whose window and block have both expired.
 * Called from rate_limit_find_or_create when table is full.
 */
static void rate_limit_cleanup_expired(void) {
    time_t now = time(NULL);
    int write_idx = 0;

    for (int read_idx = 0; read_idx < g_rate_limit_count; read_idx++) {
        rate_limit_entry_t *e = &g_rate_limits[read_idx];
        // Keep entry if block is still active OR window hasn't expired yet
        bool block_active = (e->blocked_until > now);
        bool window_active = (e->failure_count > 0 &&
                              (now - e->first_failure) <= RATE_LIMIT_WINDOW_SEC);
        if (block_active || window_active) {
            if (write_idx != read_idx) {
                g_rate_limits[write_idx] = g_rate_limits[read_idx];
            }
            write_idx++;
        }
    }

    if (write_idx < g_rate_limit_count) {
        LOG_DEBUG("Rate limit cleanup: removed %d expired entries",
                  g_rate_limit_count - write_idx);
    }
    g_rate_limit_count = write_idx;
}

/**
 * Find or create a rate limit entry for the given IP.
 * Returns the entry index, or -1 if table is full and no expired entries exist.
 */
static int rate_limit_find_or_create(const char *ip) {
    time_t now = time(NULL);
    int oldest_idx = -1;
    time_t oldest_time = 0;

    for (int i = 0; i < g_rate_limit_count; i++) {
        if (strcmp(g_rate_limits[i].ip, ip) == 0) {
            return i;
        }
        // Track oldest entry for eviction
        if (oldest_idx < 0 || g_rate_limits[i].first_failure < oldest_time) {
            oldest_idx = i;
            oldest_time = g_rate_limits[i].first_failure;
        }
    }

    // Create new entry
    if (g_rate_limit_count < RATE_LIMIT_MAX_ENTRIES) {
        int idx = g_rate_limit_count++;
        memset(&g_rate_limits[idx], 0, sizeof(rate_limit_entry_t));
        strncpy(g_rate_limits[idx].ip, ip, sizeof(g_rate_limits[idx].ip) - 1);
        return idx;
    }

    // S8-M1 fix: Table full - try cleaning up expired entries first
    rate_limit_cleanup_expired();

    // After cleanup, try creating a new entry
    if (g_rate_limit_count < RATE_LIMIT_MAX_ENTRIES) {
        int idx = g_rate_limit_count++;
        memset(&g_rate_limits[idx], 0, sizeof(rate_limit_entry_t));
        strncpy(g_rate_limits[idx].ip, ip, sizeof(g_rate_limits[idx].ip) - 1);
        return idx;
    }

    // Still full after cleanup: evict the oldest entry
    if (oldest_idx >= 0) {
        memset(&g_rate_limits[oldest_idx], 0, sizeof(rate_limit_entry_t));
        strncpy(g_rate_limits[oldest_idx].ip, ip, sizeof(g_rate_limits[oldest_idx].ip) - 1);
        return oldest_idx;
    }

    (void)now;
    return -1;
}

// ============================================================================
// Public API
// ============================================================================

bool rate_limit_is_blocked(const char *ip) {
    time_t now = time(NULL);
    for (int i = 0; i < g_rate_limit_count; i++) {
        if (strcmp(g_rate_limits[i].ip, ip) == 0) {
            if (g_rate_limits[i].blocked_until > now) {
                return true;
            }
            // Block expired, reset if window also expired
            if (now - g_rate_limits[i].first_failure > RATE_LIMIT_WINDOW_SEC) {
                g_rate_limits[i].failure_count = 0;
                g_rate_limits[i].blocked_until = 0;
            }
            return false;
        }
    }
    return false;
}

void rate_limit_record_failure(const char *ip) {
    time_t now = time(NULL);
    int idx = rate_limit_find_or_create(ip);
    if (idx < 0) return;

    rate_limit_entry_t *entry = &g_rate_limits[idx];

    // Reset window if expired
    if (entry->failure_count > 0 && now - entry->first_failure > RATE_LIMIT_WINDOW_SEC) {
        entry->failure_count = 0;
    }

    if (entry->failure_count == 0) {
        entry->first_failure = now;
    }

    entry->failure_count++;

    if (entry->failure_count >= RATE_LIMIT_MAX_FAILURES) {
        entry->blocked_until = now + RATE_LIMIT_BLOCK_SEC;
        LOG_WARN("Rate limit: IP %s blocked for %d seconds after %d auth failures",
                 ip, RATE_LIMIT_BLOCK_SEC, entry->failure_count);
    }
}

void rate_limit_clear(const char *ip) {
    for (int i = 0; i < g_rate_limit_count; i++) {
        if (strcmp(g_rate_limits[i].ip, ip) == 0) {
            g_rate_limits[i].failure_count = 0;
            g_rate_limits[i].blocked_until = 0;
            return;
        }
    }
}
