/**
 * Logging macros and functions.
 *
 * Supports:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - File and line information
 * - JSON format for structured logging
 * - File output with rotation (future)
 */

#ifndef APIS_LOG_H
#define APIS_LOG_H

#include <stdio.h>
#include <stdbool.h>

/**
 * Log severity levels.
 */
typedef enum {
    LOG_LEVEL_DEBUG = 0,
    LOG_LEVEL_INFO  = 1,
    LOG_LEVEL_WARN  = 2,
    LOG_LEVEL_ERROR = 3,
} log_level_t;

/**
 * Initialize the logging subsystem.
 *
 * @param file_path Path to log file (NULL for stdout only)
 * @param level Minimum log level to output
 * @param json_format Use JSON format for log entries
 */
void log_init(const char *file_path, log_level_t level, bool json_format);

/**
 * Shutdown the logging subsystem.
 * Flushes and closes any open log file.
 */
void log_shutdown(void);

/**
 * Write a log entry.
 *
 * @param level Log severity level
 * @param file Source file name
 * @param line Source line number
 * @param fmt Printf-style format string
 * @param ... Format arguments
 */
void log_write(log_level_t level, const char *file, int line, const char *fmt, ...);

/**
 * Set the minimum log level at runtime.
 *
 * @param level New minimum level
 */
void log_set_level(log_level_t level);

/**
 * Get the current minimum log level.
 *
 * @return Current minimum level
 */
log_level_t log_get_level(void);

/**
 * Convert log level to string.
 *
 * @param level Log level
 * @return Static string representation
 */
const char *log_level_str(log_level_t level);

/**
 * Parse log level from string.
 *
 * @param str String like "DEBUG", "INFO", etc.
 * @return Log level (defaults to INFO if unknown)
 */
log_level_t log_level_parse(const char *str);

// Convenience macros with file/line information
#define LOG_DEBUG(fmt, ...) log_write(LOG_LEVEL_DEBUG, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_INFO(fmt, ...)  log_write(LOG_LEVEL_INFO, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_WARN(fmt, ...)  log_write(LOG_LEVEL_WARN, __FILE__, __LINE__, fmt, ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) log_write(LOG_LEVEL_ERROR, __FILE__, __LINE__, fmt, ##__VA_ARGS__)

#endif // APIS_LOG_H
