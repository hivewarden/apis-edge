/**
 * HTTP Server for APIS Edge Device.
 *
 * Provides REST endpoints for device control and monitoring:
 * - GET /status - Device status and metrics
 * - POST /arm - Enable armed mode
 * - POST /disarm - Disable armed mode
 * - GET /config - Get current configuration
 * - POST /config - Update configuration
 * - GET /stream - MJPEG video stream
 *
 * Uses POSIX sockets for portability.
 * Thread-safe with background server thread option.
 */

#ifndef APIS_HTTP_SERVER_H
#define APIS_HTTP_SERVER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

/**
 * HTTP server configuration.
 */
typedef struct {
    uint16_t port;              // Default: 8080
    uint8_t max_connections;    // Default: 4
    uint32_t timeout_ms;        // Request timeout (default: 5000)
} http_config_t;

/**
 * HTTP request structure.
 */
typedef struct {
    char method[16];            // GET, POST, etc.
    char path[256];             // Request path
    char body[4096];            // Request body (for POST)
    size_t body_len;            // Actual body length
    char content_type[64];      // Content-Type header
    size_t content_length;      // Content-Length header value
} http_request_t;

/**
 * HTTP response codes.
 */
typedef enum {
    HTTP_OK = 200,
    HTTP_BAD_REQUEST = 400,
    HTTP_NOT_FOUND = 404,
    HTTP_METHOD_NOT_ALLOWED = 405,
    HTTP_INTERNAL_ERROR = 500,
} http_status_t;

/**
 * Get default configuration.
 * Port: 8080, max_connections: 4, timeout: 5000ms
 */
http_config_t http_server_default_config(void);

/**
 * Initialize HTTP server.
 * Creates socket and binds to port, but doesn't start accepting.
 *
 * @param config Server configuration (NULL for defaults)
 * @return 0 on success, -1 on error
 */
int http_server_init(const http_config_t *config);

/**
 * Start serving requests.
 *
 * @param background If true, runs in separate thread and returns immediately
 * @return 0 on success, -1 on error
 */
int http_server_start(bool background);

/**
 * Stop HTTP server.
 * Closes all connections and stops the server thread.
 */
void http_server_stop(void);

/**
 * Check if server is running.
 *
 * @return true if server is accepting connections
 */
bool http_server_is_running(void);

/**
 * Cleanup server resources.
 * Call after stop to free all resources.
 */
void http_server_cleanup(void);

/**
 * Get the port the server is listening on.
 * Useful when port 0 was specified to get an ephemeral port.
 *
 * @return Port number, or 0 if not initialized
 */
uint16_t http_server_get_port(void);

// ============================================================================
// Response Helper Functions (for use by handlers)
// ============================================================================

/**
 * Send a JSON response.
 *
 * @param client_fd Client socket file descriptor
 * @param status HTTP status code
 * @param json_body JSON string to send
 * @return 0 on success, -1 on error
 */
int http_send_json(int client_fd, http_status_t status, const char *json_body);

/**
 * Send an error response.
 *
 * @param client_fd Client socket file descriptor
 * @param status HTTP status code
 * @param message Error message
 * @return 0 on success, -1 on error
 */
int http_send_error(int client_fd, http_status_t status, const char *message);

/**
 * Get status text for HTTP status code.
 *
 * @param status HTTP status code
 * @return Static string like "OK", "Not Found", etc.
 */
const char *http_status_text(http_status_t status);

#endif // APIS_HTTP_SERVER_H
