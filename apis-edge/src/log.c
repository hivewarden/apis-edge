/**
 * Logging implementation.
 *
 * Supports both text and JSON output formats.
 * Thread-safe using mutex on Pi platform.
 */

#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#include <sys/time.h>
static pthread_mutex_t g_log_mutex = PTHREAD_MUTEX_INITIALIZER;
#endif

#ifdef APIS_PLATFORM_ESP32
#include "esp_log.h"
static const char *TAG = "APIS";
#endif

// Global state
static FILE *g_log_file = NULL;
static log_level_t g_log_level = LOG_LEVEL_INFO;
static bool g_json_format = false;
static bool g_initialized = false;

// Level strings
static const char *LEVEL_NAMES[] = {"DEBUG", "INFO", "WARN", "ERROR"};
static const char *LEVEL_COLORS[] = {"\033[36m", "\033[32m", "\033[33m", "\033[31m"};
static const char *COLOR_RESET = "\033[0m";

/**
 * Get current timestamp string.
 */
static void get_timestamp(char *buf, size_t len) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    struct timeval tv;
    gettimeofday(&tv, NULL);
    struct tm *tm = localtime(&tv.tv_sec);

    snprintf(buf, len, "%04d-%02d-%02dT%02d:%02d:%02d.%03d",
             tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
             tm->tm_hour, tm->tm_min, tm->tm_sec,
             (int)(tv.tv_usec / 1000));
#else
    // ESP32: use tick count
    snprintf(buf, len, "%lu", (unsigned long)(esp_timer_get_time() / 1000));
#endif
}

/**
 * Extract filename from path.
 */
static const char *basename_from_path(const char *path) {
    const char *last_slash = strrchr(path, '/');
    return last_slash ? last_slash + 1 : path;
}

/**
 * Escape special characters for JSON string output.
 *
 * Escapes: backslash, double-quote, newline, carriage return, tab,
 * and control characters (as \uXXXX).
 *
 * @param src Source string to escape
 * @param dst Destination buffer (must be at least 2x src length + 1)
 * @param dst_size Size of destination buffer
 */
static void json_escape(const char *src, char *dst, size_t dst_size) {
    if (src == NULL || dst == NULL || dst_size == 0) {
        if (dst && dst_size > 0) dst[0] = '\0';
        return;
    }

    size_t j = 0;
    for (size_t i = 0; src[i] != '\0' && j < dst_size - 1; i++) {
        unsigned char c = (unsigned char)src[i];

        // Check if we have room for escape sequence (worst case: 6 chars for \uXXXX)
        if (j >= dst_size - 6) break;

        switch (c) {
            case '\\':
                dst[j++] = '\\';
                dst[j++] = '\\';
                break;
            case '"':
                dst[j++] = '\\';
                dst[j++] = '"';
                break;
            case '\n':
                dst[j++] = '\\';
                dst[j++] = 'n';
                break;
            case '\r':
                dst[j++] = '\\';
                dst[j++] = 'r';
                break;
            case '\t':
                dst[j++] = '\\';
                dst[j++] = 't';
                break;
            case '\b':
                dst[j++] = '\\';
                dst[j++] = 'b';
                break;
            case '\f':
                dst[j++] = '\\';
                dst[j++] = 'f';
                break;
            default:
                if (c < 32) {
                    // Control character: escape as \u00XX
                    j += snprintf(dst + j, dst_size - j, "\\u%04x", c);
                } else {
                    dst[j++] = c;
                }
                break;
        }
    }
    dst[j] = '\0';
}

void log_init(const char *file_path, log_level_t level, bool json_format) {
    g_log_level = level;
    g_json_format = json_format;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_mutex_lock(&g_log_mutex);

    // Close existing file if any
    if (g_log_file != NULL && g_log_file != stdout) {
        fclose(g_log_file);
        g_log_file = NULL;
    }

    // Open new log file
    if (file_path != NULL && strlen(file_path) > 0) {
        g_log_file = fopen(file_path, "a");
        if (g_log_file == NULL) {
            fprintf(stderr, "Warning: Could not open log file: %s\n", file_path);
            g_log_file = stdout;
        }
    } else {
        g_log_file = stdout;
    }

    pthread_mutex_unlock(&g_log_mutex);
#endif

    g_initialized = true;
}

void log_shutdown(void) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_mutex_lock(&g_log_mutex);

    if (g_log_file != NULL && g_log_file != stdout) {
        fflush(g_log_file);
        fclose(g_log_file);
        g_log_file = NULL;
    }

    pthread_mutex_unlock(&g_log_mutex);
#endif

    g_initialized = false;
}

void log_write(log_level_t level, const char *file, int line, const char *fmt, ...) {
    if (level < g_log_level) {
        return;
    }

    // Initialize on first use if needed
    if (!g_initialized) {
        log_init(NULL, LOG_LEVEL_INFO, false);
    }

    char timestamp[32];
    get_timestamp(timestamp, sizeof(timestamp));

    const char *filename = basename_from_path(file);
    const char *level_name = LEVEL_NAMES[level];

    // Format the message
    char message[1024];
    va_list args;
    va_start(args, fmt);
    vsnprintf(message, sizeof(message), fmt, args);
    va_end(args);

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_mutex_lock(&g_log_mutex);

    FILE *out = g_log_file ? g_log_file : stdout;

    if (g_json_format) {
        // JSON format - escape message to handle special characters
        char escaped_message[2048];
        json_escape(message, escaped_message, sizeof(escaped_message));
        fprintf(out, "{\"timestamp\":\"%s\",\"level\":\"%s\",\"file\":\"%s\",\"line\":%d,\"message\":\"%s\"}\n",
                timestamp, level_name, filename, line, escaped_message);
    } else {
        // Human-readable format with colors for terminal
        if (out == stdout) {
            fprintf(out, "%s[%s]%s %s %s:%d - %s\n",
                    LEVEL_COLORS[level], level_name, COLOR_RESET,
                    timestamp, filename, line, message);
        } else {
            // No colors for file output
            fprintf(out, "[%s] %s %s:%d - %s\n",
                    level_name, timestamp, filename, line, message);
        }
    }

    fflush(out);

    pthread_mutex_unlock(&g_log_mutex);
#else
    // ESP32: use ESP-IDF logging
    switch (level) {
        case LOG_LEVEL_DEBUG:
            ESP_LOGD(TAG, "%s:%d - %s", filename, line, message);
            break;
        case LOG_LEVEL_INFO:
            ESP_LOGI(TAG, "%s:%d - %s", filename, line, message);
            break;
        case LOG_LEVEL_WARN:
            ESP_LOGW(TAG, "%s:%d - %s", filename, line, message);
            break;
        case LOG_LEVEL_ERROR:
            ESP_LOGE(TAG, "%s:%d - %s", filename, line, message);
            break;
    }
#endif
}

void log_set_level(log_level_t level) {
    g_log_level = level;
}

log_level_t log_get_level(void) {
    return g_log_level;
}

const char *log_level_str(log_level_t level) {
    if (level >= 0 && level <= LOG_LEVEL_ERROR) {
        return LEVEL_NAMES[level];
    }
    return "UNKNOWN";
}

log_level_t log_level_parse(const char *str) {
    if (str == NULL) {
        return LOG_LEVEL_INFO;
    }

    if (strcasecmp(str, "DEBUG") == 0) return LOG_LEVEL_DEBUG;
    if (strcasecmp(str, "INFO") == 0) return LOG_LEVEL_INFO;
    if (strcasecmp(str, "WARN") == 0 || strcasecmp(str, "WARNING") == 0) return LOG_LEVEL_WARN;
    if (strcasecmp(str, "ERROR") == 0) return LOG_LEVEL_ERROR;

    return LOG_LEVEL_INFO;
}
