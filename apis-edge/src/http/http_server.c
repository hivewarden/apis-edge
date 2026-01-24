/**
 * HTTP Server implementation for APIS Edge Device.
 *
 * Lightweight HTTP/1.1 server using POSIX sockets.
 * Supports GET and POST methods with JSON responses.
 * Includes MJPEG streaming endpoint.
 */

#include "http_server.h"
#include "config_manager.h"
#include "led_controller.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#endif

// MSG_NOSIGNAL is Linux-only; on macOS/BSD use SO_NOSIGPIPE socket option
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

#include "cJSON.h"

// ============================================================================
// Constants
// ============================================================================

#define HTTP_RECV_BUFFER_SIZE 8192
#define HTTP_SEND_BUFFER_SIZE 4096
#define FIRMWARE_VERSION "1.0.0"

// ============================================================================
// Global State
// ============================================================================

static int g_server_fd = -1;
static http_config_t g_config;
static volatile bool g_running = false;
static volatile bool g_initialized = false;
static time_t g_start_time = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_server_thread;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define HTTP_LOCK()   pthread_mutex_lock(&g_mutex)
#define HTTP_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
// ESP32: Use FreeRTOS semaphore for thread safety
static SemaphoreHandle_t g_http_mutex = NULL;
#define HTTP_LOCK()   do { if (g_http_mutex) xSemaphoreTake(g_http_mutex, portMAX_DELAY); } while(0)
#define HTTP_UNLOCK() do { if (g_http_mutex) xSemaphoreGive(g_http_mutex); } while(0)
#endif

// ============================================================================
// Forward Declarations
// ============================================================================

static void *server_thread_func(void *arg);
static void handle_client(int client_fd);
static int parse_request(const char *buffer, size_t len, http_request_t *req);
static void route_request(int client_fd, const http_request_t *req);

// Endpoint handlers
static void handle_status(int client_fd, const http_request_t *req);
static void handle_arm(int client_fd, const http_request_t *req);
static void handle_disarm(int client_fd, const http_request_t *req);
static void handle_config_get(int client_fd, const http_request_t *req);
static void handle_config_post(int client_fd, const http_request_t *req);
static void handle_stream(int client_fd, const http_request_t *req);
static void handle_not_found(int client_fd, const http_request_t *req);

// ============================================================================
// Public API
// ============================================================================

http_config_t http_server_default_config(void) {
    http_config_t config = {
        .port = 8080,
        .max_connections = 4,
        .timeout_ms = 5000,
    };
    return config;
}

int http_server_init(const http_config_t *config) {
    if (g_initialized) {
        LOG_WARN("HTTP server already initialized");
        return 0;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Create mutex if not already created
    if (g_http_mutex == NULL) {
        g_http_mutex = xSemaphoreCreateMutex();
        if (g_http_mutex == NULL) {
            LOG_ERROR("Failed to create HTTP mutex");
            return -1;
        }
    }
#endif

    // Use provided config or defaults
    if (config) {
        g_config = *config;
    } else {
        g_config = http_server_default_config();
    }

    // Create socket
    g_server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (g_server_fd < 0) {
        LOG_ERROR("Failed to create socket: %s", strerror(errno));
        return -1;
    }

    // Allow address reuse
    int opt = 1;
    if (setsockopt(g_server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        LOG_WARN("Failed to set SO_REUSEADDR: %s", strerror(errno));
    }

#ifdef SO_NOSIGPIPE
    // macOS/BSD: Disable SIGPIPE at socket level (since MSG_NOSIGNAL isn't available)
    if (setsockopt(g_server_fd, SOL_SOCKET, SO_NOSIGPIPE, &opt, sizeof(opt)) < 0) {
        LOG_WARN("Failed to set SO_NOSIGPIPE: %s", strerror(errno));
    }
#endif

    // Bind to port
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(g_config.port),
    };

    if (bind(g_server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        LOG_ERROR("Failed to bind to port %d: %s", g_config.port, strerror(errno));
        close(g_server_fd);
        g_server_fd = -1;
        return -1;
    }

    // Get actual port if ephemeral (port 0)
    if (g_config.port == 0) {
        socklen_t addr_len = sizeof(addr);
        if (getsockname(g_server_fd, (struct sockaddr *)&addr, &addr_len) == 0) {
            g_config.port = ntohs(addr.sin_port);
        }
    }

    // Start listening
    if (listen(g_server_fd, g_config.max_connections) < 0) {
        LOG_ERROR("Failed to listen: %s", strerror(errno));
        close(g_server_fd);
        g_server_fd = -1;
        return -1;
    }

    g_start_time = time(NULL);
    g_initialized = true;

    LOG_INFO("HTTP server initialized on port %d", g_config.port);
    return 0;
}

int http_server_start(bool background) {
    if (!g_initialized) {
        LOG_ERROR("HTTP server not initialized");
        return -1;
    }

    if (g_running) {
        LOG_WARN("HTTP server already running");
        return 0;
    }

    g_running = true;

    if (background) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
        if (pthread_create(&g_server_thread, NULL, server_thread_func, NULL) != 0) {
            LOG_ERROR("Failed to create server thread: %s", strerror(errno));
            g_running = false;
            return -1;
        }
        LOG_INFO("HTTP server started in background on port %d", g_config.port);
#else
        LOG_ERROR("Background mode not supported on this platform");
        g_running = false;
        return -1;
#endif
    } else {
        LOG_INFO("HTTP server starting on port %d (blocking)", g_config.port);
        server_thread_func(NULL);
    }

    return 0;
}

void http_server_stop(void) {
    if (!g_running) {
        return;
    }

    g_running = false;

    // Close server socket to interrupt accept()
    if (g_server_fd >= 0) {
        shutdown(g_server_fd, SHUT_RDWR);
    }

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    // Wait for server thread to exit
    pthread_join(g_server_thread, NULL);
#endif

    LOG_INFO("HTTP server stopped");
}

bool http_server_is_running(void) {
    return g_running;
}

void http_server_cleanup(void) {
    http_server_stop();

    if (g_server_fd >= 0) {
        close(g_server_fd);
        g_server_fd = -1;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Delete mutex
    if (g_http_mutex != NULL) {
        vSemaphoreDelete(g_http_mutex);
        g_http_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("HTTP server cleanup complete");
}

uint16_t http_server_get_port(void) {
    return g_config.port;
}

// ============================================================================
// Response Helpers
// ============================================================================

const char *http_status_text(http_status_t status) {
    switch (status) {
        case HTTP_OK: return "OK";
        case HTTP_BAD_REQUEST: return "Bad Request";
        case HTTP_NOT_FOUND: return "Not Found";
        case HTTP_METHOD_NOT_ALLOWED: return "Method Not Allowed";
        case HTTP_INTERNAL_ERROR: return "Internal Server Error";
        default: return "Unknown";
    }
}

int http_send_json(int client_fd, http_status_t status, const char *json_body) {
    char header[512];
    size_t body_len = json_body ? strlen(json_body) : 0;

    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n",
        status, http_status_text(status), body_len);

    // Send header
    if (send(client_fd, header, header_len, 0) < 0) {
        LOG_ERROR("Failed to send response header: %s", strerror(errno));
        return -1;
    }

    // Send body
    if (body_len > 0) {
        if (send(client_fd, json_body, body_len, 0) < 0) {
            LOG_ERROR("Failed to send response body: %s", strerror(errno));
            return -1;
        }
    }

    return 0;
}

int http_send_error(int client_fd, http_status_t status, const char *message) {
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "error", message);
    cJSON_AddNumberToObject(response, "code", status);

    char *json = cJSON_PrintUnformatted(response);
    int result = http_send_json(client_fd, status, json);

    free(json);
    cJSON_Delete(response);
    return result;
}

// ============================================================================
// Server Thread
// ============================================================================

static void *server_thread_func(void *arg) {
    (void)arg;

    LOG_INFO("HTTP server thread started");

    while (g_running) {
        // Use select with timeout to allow clean shutdown
        fd_set read_fds;
        FD_ZERO(&read_fds);
        FD_SET(g_server_fd, &read_fds);

        struct timeval timeout = {
            .tv_sec = 1,
            .tv_usec = 0,
        };

        int ready = select(g_server_fd + 1, &read_fds, NULL, NULL, &timeout);
        if (ready < 0) {
            if (errno == EINTR) continue;
            if (!g_running) break;
            LOG_ERROR("select error: %s", strerror(errno));
            break;
        }

        if (ready == 0) {
            // Timeout - check if we should continue
            continue;
        }

        // Accept new connection
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(g_server_fd, (struct sockaddr *)&client_addr, &client_len);

        if (client_fd < 0) {
            if (!g_running) break;
            LOG_ERROR("accept error: %s", strerror(errno));
            continue;
        }

        // Set receive timeout
        struct timeval recv_timeout = {
            .tv_sec = g_config.timeout_ms / 1000,
            .tv_usec = (g_config.timeout_ms % 1000) * 1000,
        };
        setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &recv_timeout, sizeof(recv_timeout));

        LOG_DEBUG("Connection from %s:%d",
                  inet_ntoa(client_addr.sin_addr),
                  ntohs(client_addr.sin_port));

        // Handle request (single-threaded for simplicity)
        handle_client(client_fd);

        close(client_fd);
    }

    LOG_INFO("HTTP server thread exiting");
    return NULL;
}

// ============================================================================
// Request Handling
// ============================================================================

static void handle_client(int client_fd) {
    char buffer[HTTP_RECV_BUFFER_SIZE];
    ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

    if (received <= 0) {
        if (received < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            LOG_ERROR("recv error: %s", strerror(errno));
        }
        return;
    }

    buffer[received] = '\0';

    // Parse request
    http_request_t req = {0};
    if (parse_request(buffer, received, &req) < 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "Malformed request");
        return;
    }

    LOG_DEBUG("Request: %s %s", req.method, req.path);

    // Route to handler
    route_request(client_fd, &req);
}

static int parse_request(const char *buffer, size_t len, http_request_t *req) {
    // Parse request line: METHOD PATH HTTP/1.1
    const char *line_end = strstr(buffer, "\r\n");
    if (!line_end) {
        return -1;
    }

    // Extract method
    const char *space1 = strchr(buffer, ' ');
    if (!space1 || space1 > line_end) {
        return -1;
    }

    size_t method_len = space1 - buffer;
    if (method_len >= sizeof(req->method)) {
        return -1;
    }
    memcpy(req->method, buffer, method_len);
    req->method[method_len] = '\0';

    // Extract path
    const char *path_start = space1 + 1;
    const char *space2 = strchr(path_start, ' ');
    if (!space2 || space2 > line_end) {
        return -1;
    }

    size_t path_len = space2 - path_start;
    if (path_len >= sizeof(req->path)) {
        path_len = sizeof(req->path) - 1;
    }
    memcpy(req->path, path_start, path_len);
    req->path[path_len] = '\0';

    // Parse headers
    const char *header_start = line_end + 2;
    while (header_start < buffer + len) {
        const char *header_end = strstr(header_start, "\r\n");
        if (!header_end) break;

        // Empty line marks end of headers
        if (header_end == header_start) {
            // Body starts after \r\n
            const char *body_start = header_end + 2;
            size_t body_available = len - (body_start - buffer);

            if (body_available > 0 && req->content_length > 0) {
                size_t to_copy = body_available;
                if (to_copy > sizeof(req->body) - 1) {
                    to_copy = sizeof(req->body) - 1;
                }
                if (to_copy > req->content_length) {
                    to_copy = req->content_length;
                }
                memcpy(req->body, body_start, to_copy);
                req->body[to_copy] = '\0';
                req->body_len = to_copy;
            }
            break;
        }

        // Parse Content-Type
        if (strncasecmp(header_start, "Content-Type:", 13) == 0) {
            const char *value = header_start + 13;
            while (*value == ' ') value++;
            size_t value_len = header_end - value;
            if (value_len >= sizeof(req->content_type)) {
                value_len = sizeof(req->content_type) - 1;
            }
            memcpy(req->content_type, value, value_len);
            req->content_type[value_len] = '\0';
        }

        // Parse Content-Length
        if (strncasecmp(header_start, "Content-Length:", 15) == 0) {
            const char *value = header_start + 15;
            while (*value == ' ') value++;
            req->content_length = strtoul(value, NULL, 10);
        }

        header_start = header_end + 2;
    }

    return 0;
}

static void route_request(int client_fd, const http_request_t *req) {
    // Status endpoint
    if (strcmp(req->path, "/status") == 0) {
        if (strcmp(req->method, "GET") == 0) {
            handle_status(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET for /status");
        }
        return;
    }

    // Arm endpoint
    if (strcmp(req->path, "/arm") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_arm(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use POST for /arm");
        }
        return;
    }

    // Disarm endpoint
    if (strcmp(req->path, "/disarm") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_disarm(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use POST for /disarm");
        }
        return;
    }

    // Config endpoint
    if (strcmp(req->path, "/config") == 0) {
        if (strcmp(req->method, "GET") == 0) {
            handle_config_get(client_fd, req);
        } else if (strcmp(req->method, "POST") == 0) {
            handle_config_post(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET or POST for /config");
        }
        return;
    }

    // Stream endpoint
    if (strcmp(req->path, "/stream") == 0) {
        if (strcmp(req->method, "GET") == 0) {
            handle_stream(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET for /stream");
        }
        return;
    }

    // Not found
    handle_not_found(client_fd, req);
}

// ============================================================================
// Endpoint Handlers
// ============================================================================

static long get_uptime_seconds(void) {
    if (g_start_time == 0) return 0;
    return (long)(time(NULL) - g_start_time);
}

static void handle_status(int client_fd, const http_request_t *req) {
    (void)req;

    cJSON *response = cJSON_CreateObject();

    // Get armed state from config manager
    const runtime_config_t *config = config_manager_get();
    bool armed = config ? config->armed : false;
    bool detection_enabled = config ? config->detection.enabled : true;

    cJSON_AddBoolToObject(response, "armed", armed);
    cJSON_AddBoolToObject(response, "detection_enabled", detection_enabled);
    cJSON_AddNumberToObject(response, "uptime_seconds", get_uptime_seconds());

    // TODO: Get actual detection count from event_logger when available
    cJSON_AddNumberToObject(response, "detections_today", 0);

    // TODO: Get actual storage free from storage_manager when available
    cJSON_AddNumberToObject(response, "storage_free_mb", 1024);

    cJSON_AddStringToObject(response, "firmware_version", FIRMWARE_VERSION);

    char *json = cJSON_PrintUnformatted(response);
    http_send_json(client_fd, HTTP_OK, json);

    free(json);
    cJSON_Delete(response);

    LOG_DEBUG("Sent status response");
}

static void handle_arm(int client_fd, const http_request_t *req) {
    (void)req;

    if (config_manager_set_armed(true) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to arm device");
        return;
    }

    // Update LED state
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_DISARMED);
        led_controller_set_state(LED_STATE_ARMED);
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "armed", true);

    char *json = cJSON_PrintUnformatted(response);
    http_send_json(client_fd, HTTP_OK, json);

    free(json);
    cJSON_Delete(response);

    LOG_INFO("Device armed via HTTP API");
}

static void handle_disarm(int client_fd, const http_request_t *req) {
    (void)req;

    if (config_manager_set_armed(false) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to disarm device");
        return;
    }

    // Update LED state
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_ARMED);
        led_controller_set_state(LED_STATE_DISARMED);
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "armed", false);

    char *json = cJSON_PrintUnformatted(response);
    http_send_json(client_fd, HTTP_OK, json);

    free(json);
    cJSON_Delete(response);

    LOG_INFO("Device disarmed via HTTP API");
}

static void handle_config_get(int client_fd, const http_request_t *req) {
    (void)req;

    runtime_config_t public_config;
    config_manager_get_public(&public_config);

    char json_buf[2048];
    if (config_manager_to_json(&public_config, json_buf, sizeof(json_buf), false) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to serialize configuration");
        return;
    }

    http_send_json(client_fd, HTTP_OK, json_buf);
    LOG_DEBUG("Sent config response");
}

static void handle_config_post(int client_fd, const http_request_t *req) {
    if (req->body_len == 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "Request body required");
        return;
    }

    cfg_validation_t validation = {0};
    if (config_manager_update(req->body, &validation) < 0) {
        // Build error response with validation details
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "error", validation.error_message);
        cJSON_AddStringToObject(response, "field", validation.error_field);
        cJSON_AddNumberToObject(response, "code", HTTP_BAD_REQUEST);

        char *json = cJSON_PrintUnformatted(response);
        http_send_json(client_fd, HTTP_BAD_REQUEST, json);

        free(json);
        cJSON_Delete(response);

        LOG_WARN("Config update rejected: %s (%s)", validation.error_message, validation.error_field);
        return;
    }

    // Success - return updated config
    runtime_config_t public_config;
    config_manager_get_public(&public_config);

    char json_buf[2048];
    if (config_manager_to_json(&public_config, json_buf, sizeof(json_buf), false) < 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Config updated but serialization failed");
        return;
    }

    http_send_json(client_fd, HTTP_OK, json_buf);
    LOG_INFO("Configuration updated via HTTP API");
}

static void handle_stream(int client_fd, const http_request_t *req) {
    (void)req;

    // Send MJPEG headers
    const char *header =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
        "Connection: close\r\n"
        "Cache-Control: no-cache, no-store, must-revalidate\r\n"
        "Pragma: no-cache\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n";

    if (send(client_fd, header, strlen(header), 0) < 0) {
        LOG_ERROR("Failed to send stream header: %s", strerror(errno));
        return;
    }

    LOG_INFO("MJPEG stream started");

    // For now, send a placeholder frame periodically
    // In production, this would get frames from the camera module
    // TODO: Hook into camera_get_latest_frame() when camera module is integrated

    // Simple test pattern: 8x8 gray JPEG (minimal valid JPEG)
    static const uint8_t test_jpeg[] = {
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x08,
        0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xC0, 0xC6, 0x77,
        0x1C, 0x8A, 0xFF, 0xD9
    };

    int frame_count = 0;
    while (g_running && frame_count < 100) { // Limit for testing
        char boundary[128];
        int boundary_len = snprintf(boundary, sizeof(boundary),
            "--frame\r\n"
            "Content-Type: image/jpeg\r\n"
            "Content-Length: %zu\r\n"
            "\r\n", sizeof(test_jpeg));

        if (send(client_fd, boundary, boundary_len, MSG_NOSIGNAL) <= 0) break;
        if (send(client_fd, test_jpeg, sizeof(test_jpeg), MSG_NOSIGNAL) <= 0) break;
        if (send(client_fd, "\r\n", 2, MSG_NOSIGNAL) <= 0) break;

        frame_count++;
        apis_sleep_ms(100); // 10 FPS
    }

    LOG_INFO("MJPEG stream ended after %d frames", frame_count);
}

static void handle_not_found(int client_fd, const http_request_t *req) {
    char message[256];
    snprintf(message, sizeof(message), "Endpoint not found: %s", req->path);
    http_send_error(client_fd, HTTP_NOT_FOUND, message);
}
