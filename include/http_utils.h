/**
 * HTTP Utilities - Shared HTTP helper functions.
 *
 * Common utilities for HTTP operations used by server_comm and clip_uploader.
 */

#ifndef APIS_HTTP_UTILS_H
#define APIS_HTTP_UTILS_H

#include <stdint.h>
#include <stddef.h>

/**
 * Parse a URL into its components.
 *
 * Extracts host, port, and path from a URL string.
 * Supports http:// and https:// protocols.
 *
 * @param url The URL to parse (e.g., "https://api.example.com:8080/path")
 * @param host Output buffer for hostname
 * @param host_len Size of host buffer
 * @param port Output pointer for port number (default: 80 for http, 443 for https)
 * @param path Output buffer for path (default path if none specified in URL)
 * @param path_len Size of path buffer
 * @param default_path Default path to use if URL has no path component
 * @return 0 on success, -1 on error
 */
int http_parse_url(const char *url, char *host, size_t host_len,
                   uint16_t *port, char *path, size_t path_len,
                   const char *default_path);

#endif // APIS_HTTP_UTILS_H
