/**
 * HTTP Server implementation for APIS Edge Device.
 *
 * Lightweight HTTP/1.1 server using POSIX sockets.
 * Supports GET and POST methods with JSON responses.
 * Includes MJPEG streaming endpoint.
 *
 * S8-I-02: No CSRF protection is implemented on state-changing POST endpoints
 * (arm/disarm, config update). For an embedded device on a local network,
 * CSRF tokens are unusual. The CORS origin allowlist (if properly configured)
 * mitigates browser-based cross-origin attacks. If the device is ever exposed
 * to the internet, CSRF protection should be added.
 */

#include "http_server.h"
#include "config_manager.h"
#include "event_logger.h"
#include "storage_manager.h"
#include "led_controller.h"
#include "safety_layer.h"
#include "button_handler.h"
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
#include <sys/stat.h>  // COMM-001-7: For stat() to check directory existence
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#else
#include "freertos/FreeRTOS.h"
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

// COMM-001-7: Local authentication token length
#define LOCAL_AUTH_TOKEN_LEN 32
#define LOCAL_AUTH_TOKEN_FILE "/data/apis/local_auth_token"
#define LOCAL_AUTH_TOKEN_FILE_DEV "./data/apis/local_auth_token"

// ============================================================================
// Global State
// ============================================================================

static int g_server_fd = -1;
static http_config_t g_config;
static volatile bool g_running = false;
static volatile bool g_initialized = false;
static volatile bool g_background_mode = false;  // Track if started in background mode
static time_t g_start_time = 0;

// COMM-001-7: Local authentication token
static char g_local_auth_token[LOCAL_AUTH_TOKEN_LEN + 1] = {0};

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_server_thread;
#else
/* ESP32 task handle would go here */
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(http);
#define HTTP_LOCK()   APIS_MUTEX_LOCK(http)
#define HTTP_UNLOCK() APIS_MUTEX_UNLOCK(http)

// ============================================================================
// Forward Declarations
// ============================================================================

static void *server_thread_func(void *arg);
static void handle_client(int client_fd, const char *client_ip);
static int parse_request(const char *buffer, size_t len, http_request_t *req);
static void route_request(int client_fd, const http_request_t *req);
static int init_local_auth_token(void);  // COMM-001-7: Forward declare

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

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(http);

    // COMM-001-7: Initialize local authentication token
    init_local_auth_token();

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
    g_background_mode = background;  // Track mode for safe thread join

    if (background) {
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
        if (pthread_create(&g_server_thread, NULL, server_thread_func, NULL) != 0) {
            LOG_ERROR("Failed to create server thread: %s", strerror(errno));
            g_running = false;
            g_background_mode = false;
            return -1;
        }
        LOG_INFO("HTTP server started in background on port %d", g_config.port);
#else
        LOG_ERROR("Background mode not supported on this platform");
        g_running = false;
        g_background_mode = false;
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
    // Only join thread if we started in background mode (thread was created)
    if (g_background_mode) {
        pthread_join(g_server_thread, NULL);
        g_background_mode = false;
    }
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

    /* Mutex cleanup handled by platform_mutex lifecycle */

    g_initialized = false;
    LOG_INFO("HTTP server cleanup complete");
}

uint16_t http_server_get_port(void) {
    return g_config.port;
}

// ============================================================================
// COMM-001-7: Local Authentication
// ============================================================================

/**
 * Generate a random hexadecimal token using cryptographically secure randomness.
 */
static void generate_random_token(char *buf, size_t len) {
    static const char hex_chars[] = "0123456789abcdef";
    unsigned char random_bytes[64]; // Enough for up to 128 hex chars
    size_t bytes_needed = (len + 1) / 2; // Each byte gives 2 hex chars
    if (bytes_needed > sizeof(random_bytes)) {
        bytes_needed = sizeof(random_bytes);
    }

#if defined(APIS_PLATFORM_ESP32)
    // ESP32: Use hardware RNG via esp_fill_random
    esp_fill_random(random_bytes, bytes_needed);
#elif defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    // Pi/Test: Read from /dev/urandom for cryptographic randomness
    int urandom_fd = open("/dev/urandom", O_RDONLY);
    if (urandom_fd >= 0) {
        ssize_t rd = read(urandom_fd, random_bytes, bytes_needed);
        close(urandom_fd);
        if (rd < (ssize_t)bytes_needed) {
            // S8-H5 fix: Fail rather than falling back to predictable rand()
            // A short read from /dev/urandom should never happen on Linux/macOS,
            // but if it does, the token would be partially predictable.
            LOG_ERROR("Short read from /dev/urandom (%zd/%zu bytes) - cannot generate secure token",
                      rd, bytes_needed);
            memset(buf, 0, len + 1);
            return;
        }
    } else {
        // S8-H5 fix: Fail rather than falling back to predictable rand()
        // An auth token generated from rand() would be trivially guessable.
        LOG_ERROR("Could not open /dev/urandom - cannot generate secure auth token");
        memset(buf, 0, len + 1);
        return;
    }
#else
    // S8-H5 fix: Unknown platform - fail rather than use predictable rand()
    LOG_ERROR("No cryptographic RNG available on this platform - cannot generate secure token");
    memset(buf, 0, len + 1);
    return;
#endif

    // Convert random bytes to hex string
    for (size_t i = 0; i < len; i++) {
        unsigned char byte = random_bytes[i / 2];
        if (i % 2 == 0) {
            buf[i] = hex_chars[(byte >> 4) & 0x0F];
        } else {
            buf[i] = hex_chars[byte & 0x0F];
        }
    }
    buf[len] = '\0';
}

/**
 * Load or generate local authentication token.
 * Token is persisted to survive reboots.
 */
static int init_local_auth_token(void) {
    // Try to load existing token
    const char *token_path = LOCAL_AUTH_TOKEN_FILE;
    // Use dev path if running in dev mode (check if ./data exists)
    struct stat st;
    if (stat("./data", &st) == 0 && S_ISDIR(st.st_mode)) {
        token_path = LOCAL_AUTH_TOKEN_FILE_DEV;
    }

    FILE *fp = fopen(token_path, "r");
    if (fp) {
        size_t read = fread(g_local_auth_token, 1, LOCAL_AUTH_TOKEN_LEN, fp);
        fclose(fp);

        if (read == LOCAL_AUTH_TOKEN_LEN) {
            g_local_auth_token[LOCAL_AUTH_TOKEN_LEN] = '\0';
            LOG_INFO("Local auth token loaded from file");
            return 0;
        }
    }

    // Generate new token
    generate_random_token(g_local_auth_token, LOCAL_AUTH_TOKEN_LEN);

    // Save token with restricted permissions (0600)
    int fd = open(token_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (fd >= 0) {
        fp = fdopen(fd, "w");
        if (fp) {
            fwrite(g_local_auth_token, 1, LOCAL_AUTH_TOKEN_LEN, fp);
            fclose(fp);
        } else {
            close(fd);
        }
    }

    LOG_INFO("New local auth token generated (display on device for initial setup)");
    LOG_INFO("New local auth token generated (length: %d)", LOCAL_AUTH_TOKEN_LEN);

    return 0;
}

/**
 * Verify local authentication from request.
 * Expects "Authorization: Bearer <token>" header.
 */
static bool verify_local_auth(const http_request_t *req) {
    if (strlen(g_local_auth_token) == 0) {
        // No token configured - auth disabled (shouldn't happen)
        return true;
    }

    if (strlen(req->authorization) == 0) {
        return false;
    }

    // Expect: "Bearer <token>"
    if (strncmp(req->authorization, "Bearer ", 7) != 0) {
        return false;
    }

    // Constant-time comparison to prevent timing attacks
    // Always compare the full minimum length regardless of length mismatch
    const char *provided = req->authorization + 7;
    size_t token_len = strlen(g_local_auth_token);
    size_t provided_len = strlen(provided);

    // S8-L-07: Always iterate over the stored token length to avoid
    // leaking length information via timing. For indices beyond the
    // provided string length, XOR with 0 (which still marks mismatch
    // via the initial length-difference check above).
    volatile unsigned char result = (token_len != provided_len) ? 1 : 0;
    for (size_t i = 0; i < token_len; i++) {
        unsigned char provided_byte = (i < provided_len) ? (unsigned char)provided[i] : 0;
        result |= (unsigned char)(g_local_auth_token[i] ^ provided_byte);
    }

    return result == 0;
}

// Rate limiting (extracted to http_rate_limit.c)
#include "http_rate_limit.h"

// ============================================================================
// Response Helpers
// ============================================================================

const char *http_status_text(http_status_t status) {
    switch (status) {
        case HTTP_OK: return "OK";
        case HTTP_UNAUTHORIZED: return "Unauthorized";  // COMM-001-7
        case HTTP_BAD_REQUEST: return "Bad Request";
        case HTTP_NOT_FOUND: return "Not Found";
        case HTTP_TOO_MANY_REQUESTS: return "Too Many Requests";
        case HTTP_METHOD_NOT_ALLOWED: return "Method Not Allowed";
        case HTTP_INTERNAL_ERROR: return "Internal Server Error";
        default: return "Unknown";
    }
}

// Thread-local origin for CORS response (set before calling http_send_json)
// S8-M2 fix: _Thread_local is not supported on ESP32 (FreeRTOS).
// Use __thread on Pi/Test (GCC extension, widely supported) and fall back
// to a plain static on ESP32 (single HTTP server task, so safe).
#if defined(APIS_PLATFORM_ESP32)
static const char *tl_request_origin = NULL;  // Single task, no TLS needed
#else
static _Thread_local const char *tl_request_origin = NULL;
#endif

/**
 * S8-C2 fix: Validate Origin header against an allowlist.
 * Returns the origin string if it matches, or NULL if not allowed.
 *
 * Default allowed origins: localhost dev servers.
 * If config has a dashboard_url (via server.url), that origin is also allowed.
 */
static const char *validate_cors_origin(const char *origin) {
    if (!origin || origin[0] == '\0') {
        return NULL;
    }

    // Default development origins always allowed
    if (strcmp(origin, "http://localhost:5173") == 0 ||
        strcmp(origin, "http://localhost:3000") == 0) {
        return origin;
    }

    // Check if origin matches the configured server URL (dashboard origin).
    // The server URL in config is the APIS server URL; the dashboard typically
    // runs on the same origin, so we derive an origin from it.
    runtime_config_t config_snapshot;
    config_manager_get_public(&config_snapshot);
    if (strlen(config_snapshot.server.url) > 0) {
        // Extract origin from server URL (scheme + host + optional port)
        // e.g. "https://apis.honeybeegood.be/api" -> "https://apis.honeybeegood.be"
        const char *url = config_snapshot.server.url;
        const char *scheme_end = strstr(url, "://");
        if (scheme_end) {
            const char *host_start = scheme_end + 3;
            const char *path_start = strchr(host_start, '/');
            size_t origin_len;
            if (path_start) {
                origin_len = (size_t)(path_start - url);
            } else {
                origin_len = strlen(url);
            }
            // Compare with provided origin
            if (strlen(origin) == origin_len &&
                strncmp(origin, url, origin_len) == 0) {
                return origin;
            }
        }
    }

    LOG_DEBUG("CORS origin rejected: %s", origin);
    return NULL;
}

void http_set_request_origin(const char *origin) {
    // S8-C2 fix: Only set the origin if it passes validation
    tl_request_origin = validate_cors_origin(origin);
}

int http_send_json(int client_fd, http_status_t status, const char *json_body) {
    char header[512];
    size_t body_len = json_body ? strlen(json_body) : 0;

    // Use request Origin header if available, otherwise no CORS header
    const char *cors_origin = (tl_request_origin && tl_request_origin[0]) ? tl_request_origin : NULL;

    int header_len;
    if (cors_origin) {
        header_len = snprintf(header, sizeof(header),
            "HTTP/1.1 %d %s\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n"
            "Access-Control-Allow-Origin: %s\r\n"
            "Vary: Origin\r\n"
            "\r\n",
            status, http_status_text(status), body_len, cors_origin);
    } else {
        header_len = snprintf(header, sizeof(header),
            "HTTP/1.1 %d %s\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n"
            "\r\n",
            status, http_status_text(status), body_len);
    }

    // MEMORY-001-8 fix: Check for snprintf truncation
    if (header_len < 0 || (size_t)header_len >= sizeof(header)) {
        LOG_ERROR("HTTP response header truncated or error");
        return -1;
    }

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

        // Set receive and send timeouts
        struct timeval recv_timeout = {
            .tv_sec = g_config.timeout_ms / 1000,
            .tv_usec = (g_config.timeout_ms % 1000) * 1000,
        };
        setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &recv_timeout, sizeof(recv_timeout));
        setsockopt(client_fd, SOL_SOCKET, SO_SNDTIMEO, &recv_timeout, sizeof(recv_timeout));

        char client_ip[64];
        strncpy(client_ip, inet_ntoa(client_addr.sin_addr), sizeof(client_ip) - 1);
        client_ip[sizeof(client_ip) - 1] = '\0';

        LOG_DEBUG("Connection from %s:%d",
                  client_ip,
                  ntohs(client_addr.sin_port));

        // Handle request (single-threaded for simplicity)
        handle_client(client_fd, client_ip);

        close(client_fd);
    }

    LOG_INFO("HTTP server thread exiting");
    return NULL;
}

// ============================================================================
// Request Handling
// ============================================================================

static void handle_client(int client_fd, const char *client_ip) {
    char buffer[HTTP_RECV_BUFFER_SIZE];

    // Read headers first (initial recv)
    ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1, 0);

    if (received <= 0) {
        if (received < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            LOG_ERROR("recv error: %s", strerror(errno));
        }
        return;
    }

    buffer[received] = '\0';

    // Parse request (headers + any initial body data)
    http_request_t req = {0};
    if (parse_request(buffer, received, &req) < 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "Malformed request");
        return;
    }

    // Store client IP for rate limiting
    strncpy(req.client_ip, client_ip, sizeof(req.client_ip) - 1);
    req.client_ip[sizeof(req.client_ip) - 1] = '\0';

    // Change 11: Loop recv to read remaining body if Content-Length > body received so far
    if (req.content_length > 0 && req.body_len < req.content_length) {
        size_t remaining = req.content_length - req.body_len;
        if (remaining > sizeof(req.body) - 1 - req.body_len) {
            remaining = sizeof(req.body) - 1 - req.body_len;
        }
        size_t total_body_read = req.body_len;
        while (total_body_read < req.content_length &&
               total_body_read < sizeof(req.body) - 1) {
            size_t to_read = req.content_length - total_body_read;
            if (to_read > sizeof(req.body) - 1 - total_body_read) {
                to_read = sizeof(req.body) - 1 - total_body_read;
            }
            ssize_t chunk = recv(client_fd, req.body + total_body_read, to_read, 0);
            if (chunk <= 0) {
                if (chunk < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                    // Timeout waiting for body data
                    LOG_WARN("Timeout reading request body");
                }
                break;
            }
            total_body_read += (size_t)chunk;
        }
        req.body[total_body_read] = '\0';
        req.body_len = total_body_read;
    }

    // Set CORS origin for response helpers
    http_set_request_origin(req.origin);

    LOG_DEBUG("Request: %s %s", req.method, req.path);

    // Route to handler
    route_request(client_fd, &req);

    // Clear thread-local origin
    http_set_request_origin(NULL);
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
        // MEMORY-001-1 fix: Reject truncated paths instead of silently truncating
        LOG_WARN("Request path too long (%zu bytes, max %zu)", path_len, sizeof(req->path) - 1);
        return -1;
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
            // MEMORY-001-2 fix: Validate strtoul result for overflow
            errno = 0;
            char *endptr = NULL;
            unsigned long parsed_length = strtoul(value, &endptr, 10);
            if (errno == ERANGE || parsed_length > SIZE_MAX) {
                LOG_WARN("Content-Length overflow detected");
                return -1;
            }
            if (endptr == value) {
                // No digits parsed - invalid Content-Length header
                LOG_WARN("Invalid Content-Length value");
                return -1;
            }
            req->content_length = (size_t)parsed_length;
            // Cap Content-Length to body buffer size for security
            if (req->content_length > sizeof(req->body) - 1) {
                req->content_length = sizeof(req->body) - 1;
            }
        }

        // Parse Origin header (for CORS validation)
        if (strncasecmp(header_start, "Origin:", 7) == 0) {
            const char *value = header_start + 7;
            while (*value == ' ') value++;
            size_t value_len = header_end - value;
            if (value_len >= sizeof(req->origin)) {
                value_len = sizeof(req->origin) - 1;
            }
            memcpy(req->origin, value, value_len);
            req->origin[value_len] = '\0';
        }

        // COMM-001-7: Parse Authorization header
        if (strncasecmp(header_start, "Authorization:", 14) == 0) {
            const char *value = header_start + 14;
            while (*value == ' ') value++;
            size_t value_len = header_end - value;
            if (value_len >= sizeof(req->authorization)) {
                value_len = sizeof(req->authorization) - 1;
            }
            memcpy(req->authorization, value, value_len);
            req->authorization[value_len] = '\0';
        }

        header_start = header_end + 2;
    }

    return 0;
}

static void handle_options_preflight(int client_fd, const http_request_t *req) {
    // S8-C2 fix: Validate Origin against allowlist before reflecting
    const char *validated_origin = validate_cors_origin(req->origin);

    char response[512];
    if (validated_origin) {
        snprintf(response, sizeof(response),
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: %s\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
            "Access-Control-Max-Age: 86400\r\n"
            "Vary: Origin\r\n"
            "Connection: close\r\n"
            "\r\n", validated_origin);
    } else {
        snprintf(response, sizeof(response),
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
            "Access-Control-Max-Age: 86400\r\n"
            "Connection: close\r\n"
            "\r\n");
    }
    send(client_fd, response, strlen(response), 0);
}

static void route_request(int client_fd, const http_request_t *req) {
    // Handle CORS preflight for all endpoints (no auth required)
    if (strcmp(req->method, "OPTIONS") == 0) {
        handle_options_preflight(client_fd, req);
        return;
    }

    // Status endpoint - safe to expose without auth (no sensitive data)
    if (strcmp(req->path, "/status") == 0) {
        if (strcmp(req->method, "GET") == 0) {
            handle_status(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET for /status");
        }
        return;
    }

    // Rate limiting: check if client IP is blocked due to repeated auth failures
    if (rate_limit_is_blocked(req->client_ip)) {
        LOG_WARN("Rate limited request from %s to %s", req->client_ip, req->path);
        http_send_error(client_fd, HTTP_TOO_MANY_REQUESTS,
            "Too many failed authentication attempts. Try again later.");
        return;
    }

    // COMM-001-7: All other endpoints require authentication
    if (!verify_local_auth(req)) {
        rate_limit_record_failure(req->client_ip);
        LOG_WARN("Unauthorized request to %s from unauthenticated client", req->path);
        http_send_error(client_fd, HTTP_UNAUTHORIZED, "Authentication required. Use 'Authorization: Bearer <token>' header.");
        return;
    }

    // Auth succeeded - clear rate limit state for this IP
    rate_limit_clear(req->client_ip);

    // Arm endpoint (auth required)
    if (strcmp(req->path, "/arm") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_arm(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use POST for /arm");
        }
        return;
    }

    // Disarm endpoint (auth required)
    if (strcmp(req->path, "/disarm") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_disarm(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use POST for /disarm");
        }
        return;
    }

    // Config endpoint (auth required)
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

    // Stream endpoint (auth required)
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

    // Get armed state from config manager - use public snapshot to avoid
    // holding a pointer to shared state
    runtime_config_t config_snapshot;
    config_manager_get_public(&config_snapshot);
    bool armed = config_snapshot.armed;
    bool detection_enabled = config_snapshot.detection.enabled;

    cJSON_AddBoolToObject(response, "armed", armed);
    cJSON_AddBoolToObject(response, "detection_enabled", detection_enabled);
    cJSON_AddNumberToObject(response, "uptime_seconds", get_uptime_seconds());

    // Get actual detection count from event_logger if initialized
    int detections_today = 0;
    if (event_logger_is_initialized()) {
        storage_status_t status;
        if (event_logger_get_status(&status) == 0) {
            // Use total_events as approximation; in production, could filter by today's date
            detections_today = (int)status.total_events;
        }
    }
    cJSON_AddNumberToObject(response, "detections_today", detections_today);

    // Get actual storage free from storage_manager if initialized
    uint32_t storage_free_mb = 1024; // Default fallback
    if (storage_manager_is_initialized()) {
        storage_stats_t stats;
        if (storage_manager_get_stats(&stats) == STORAGE_MANAGER_OK) {
            // storage_stats has total_size_mb used; we need config to compute free
            // For now, report a reasonable estimate based on default max (1000MB) minus used
            uint32_t max_storage = 1000; // DEFAULT_MAX_STORAGE_MB
            storage_free_mb = (stats.total_size_mb < max_storage) ?
                              (max_storage - stats.total_size_mb) : 0;
        }
    }
    cJSON_AddNumberToObject(response, "storage_free_mb", storage_free_mb);

    cJSON_AddStringToObject(response, "firmware_version", FIRMWARE_VERSION);

    char *json = cJSON_PrintUnformatted(response);
    http_send_json(client_fd, HTTP_OK, json);

    free(json);
    cJSON_Delete(response);

    LOG_DEBUG("Sent status response");
}

static void handle_arm(int client_fd, const http_request_t *req) {
    (void)req;

    // SAFETY-001-2 fix: Check safety layer state before allowing arm
    // This prevents arming when system is in safe mode or emergency stop
    if (safety_is_initialized() && safety_is_safe_mode()) {
        LOG_WARN("Arm request rejected: system is in safe mode - manual reset required");
        http_send_error(client_fd, HTTP_BAD_REQUEST,
            "Cannot arm: system is in safe mode. Manual reset required.");
        return;
    }

    // SAFETY-001-6 fix: Check emergency stop state before arming
    // Emergency stop takes precedence over HTTP commands
    if (button_handler_is_initialized() && button_handler_is_emergency_stop()) {
        LOG_WARN("Arm request rejected: emergency stop is engaged");
        http_send_error(client_fd, HTTP_BAD_REQUEST,
            "Cannot arm: emergency stop is engaged. Clear emergency stop first.");
        return;
    }

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
    // S8-C2 fix: Validate Origin against allowlist before reflecting
    const char *validated_origin = validate_cors_origin(req->origin);

    // Build MJPEG headers with proper CORS (use validated Origin if present)
    char header[512];
    if (validated_origin) {
        snprintf(header, sizeof(header),
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
            "Connection: close\r\n"
            "Cache-Control: no-cache, no-store, must-revalidate\r\n"
            "Pragma: no-cache\r\n"
            "Access-Control-Allow-Origin: %s\r\n"
            "Vary: Origin\r\n"
            "\r\n", validated_origin);
    } else {
        snprintf(header, sizeof(header),
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
            "Connection: close\r\n"
            "Cache-Control: no-cache, no-store, must-revalidate\r\n"
            "Pragma: no-cache\r\n"
            "\r\n");
    }

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
    // Maximum stream duration: 5 minutes (300 seconds) to prevent resource exhaustion
    #define MJPEG_MAX_DURATION_SEC 300
    time_t stream_start = time(NULL);

    while (g_running) { // Stream until client disconnects, server stops, or timeout
        // Check maximum stream duration
        if (time(NULL) - stream_start >= MJPEG_MAX_DURATION_SEC) {
            LOG_INFO("MJPEG stream timeout after %d seconds", MJPEG_MAX_DURATION_SEC);
            break;
        }

        char boundary[128];
        int boundary_len = snprintf(boundary, sizeof(boundary),
            "--frame\r\n"
            "Content-Type: image/jpeg\r\n"
            "Content-Length: %zu\r\n"
            "\r\n", sizeof(test_jpeg));

        // MEMORY-001-8 fix: Check for snprintf truncation
        if (boundary_len < 0 || (size_t)boundary_len >= sizeof(boundary)) {
            LOG_ERROR("MJPEG boundary header truncated");
            break;
        }

        if (send(client_fd, boundary, boundary_len, MSG_NOSIGNAL) <= 0) break;
        if (send(client_fd, test_jpeg, sizeof(test_jpeg), MSG_NOSIGNAL) <= 0) break;
        if (send(client_fd, "\r\n", 2, MSG_NOSIGNAL) <= 0) break;

        frame_count++;
        apis_sleep_ms(100); // 10 FPS
    }

    LOG_INFO("MJPEG stream ended after %d frames", frame_count);
}

static void handle_not_found(int client_fd, const http_request_t *req) {
    // MEMORY-001-3 fix: Sanitize path before including in error message
    // Replace non-printable characters to prevent JSON output corruption
    char safe_path[64];
    size_t i;
    for (i = 0; i < sizeof(safe_path) - 1 && req->path[i] != '\0'; i++) {
        char c = req->path[i];
        // Only allow printable ASCII (32-126)
        safe_path[i] = (c >= 32 && c < 127) ? c : '?';
    }
    safe_path[i] = '\0';

    char message[256];
    snprintf(message, sizeof(message), "Endpoint not found: %s", safe_path);
    http_send_error(client_fd, HTTP_NOT_FOUND, message);
}
