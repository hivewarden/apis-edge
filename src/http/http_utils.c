/**
 * HTTP Utilities implementation.
 *
 * Common HTTP helper functions shared across modules.
 */

#include "http_utils.h"
#include "log.h"

#include <string.h>
#include <stdlib.h>

int http_parse_url(const char *url, char *host, size_t host_len,
                   uint16_t *port, char *path, size_t path_len,
                   const char *default_path) {
    // Default values
    *port = 80;
    if (default_path && path && path_len > 0) {
        strncpy(path, default_path, path_len - 1);
        path[path_len - 1] = '\0';
    }

    if (!url || strlen(url) == 0) {
        return -1;
    }

    const char *start = url;

    // Skip protocol
    if (strncmp(url, "https://", 8) == 0) {
        start = url + 8;
        *port = 443;
    } else if (strncmp(url, "http://", 7) == 0) {
        start = url + 7;
        *port = 80;
    }

    // Find end of host (port or path)
    const char *host_end = start;
    while (*host_end && *host_end != ':' && *host_end != '/') {
        host_end++;
    }

    size_t host_part_len = host_end - start;
    if (host_part_len >= host_len) {
        // Host too long for buffer - return error instead of silently truncating
        LOG_ERROR("Hostname too long (%zu bytes, max %zu)", host_part_len, host_len - 1);
        return -1;
    }
    memcpy(host, start, host_part_len);
    host[host_part_len] = '\0';

    // S8-L-01: Use strtol() instead of atoi() to avoid undefined behavior
    // on overflow and to distinguish "0" from non-numeric input.
    if (*host_end == ':') {
        char *endptr = NULL;
        long parsed_port = strtol(host_end + 1, &endptr, 10);
        if (endptr == host_end + 1 || parsed_port <= 0 || parsed_port > 65535) {
            LOG_ERROR("Invalid port number in URL");
            return -1;
        }
        *port = (uint16_t)parsed_port;
        // Skip to path
        while (*host_end && *host_end != '/') {
            host_end++;
        }
    }

    // Check for path (only use if caller wants to override default)
    if (*host_end == '/' && path && path_len > 0) {
        // For some endpoints, we want to keep the default path regardless
        // This function allows the caller to decide by passing NULL for default_path
        if (!default_path) {
            strncpy(path, host_end, path_len - 1);
            path[path_len - 1] = '\0';
        }
    }

    return 0;
}
