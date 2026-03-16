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
#include "deterrent_state.h"
#include "event_logger.h"
#include "storage_manager.h"
#include "led_controller.h"
#include "safety_layer.h"
#include "button_handler.h"
#include "qr_scanner.h"
#include "manual_capture.h"
#include "sync_pipeline.h"
#include "vision_runtime.h"
#include "camera.h"
#include "server_comm.h"
#include "secure_util.h"
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

#ifdef APIS_PLATFORM_ESP32
#include "wifi_provision.h"
#include "esp_system.h"  // for esp_restart()
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
#elif defined(APIS_PLATFORM_ESP32)
#include "freertos/task.h"
static TaskHandle_t g_server_task = NULL;
#define HTTP_SERVER_TASK_STACK_SIZE 16384
#define HTTP_SERVER_TASK_PRIORITY   5
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
static void handle_setup_get(int client_fd, const http_request_t *req);
static void handle_setup_post(int client_fd, const http_request_t *req);
static void handle_claim_get(int client_fd, const http_request_t *req);
static void handle_claim_post(int client_fd, const http_request_t *req);
static void handle_arm(int client_fd, const http_request_t *req);
static void handle_disarm(int client_fd, const http_request_t *req);
static void handle_capture(int client_fd, const http_request_t *req);
static void handle_config_get(int client_fd, const http_request_t *req);
static void handle_config_post(int client_fd, const http_request_t *req);
static void handle_stream(int client_fd, const http_request_t *req);
static void handle_qr_preview(int client_fd, const http_request_t *req);
static void handle_not_found(int client_fd, const http_request_t *req);
static int http_send_redirect(int client_fd, const char *location);
static int url_decode(const char *src, char *dst, size_t dst_size);
static bool form_get_param(const char *body, const char *key,
                           char *value, size_t value_size);

static const char *deterrent_target_state_name(target_state_t state) {
    switch (state) {
        case TARGET_STATE_IDLE:
            return "IDLE";
        case TARGET_STATE_ACQUIRING:
            return "ACQUIRING";
        case TARGET_STATE_TRACKING:
            return "TRACKING";
        case TARGET_STATE_LOST:
            return "LOST";
        case TARGET_STATE_COOLDOWN:
            return "COOLDOWN";
        default:
            return "UNKNOWN";
    }
}

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
#elif defined(APIS_PLATFORM_ESP32)
        BaseType_t ret = xTaskCreate(
            (TaskFunction_t)server_thread_func,
            "http_server",
            HTTP_SERVER_TASK_STACK_SIZE,
            NULL,
            HTTP_SERVER_TASK_PRIORITY,
            &g_server_task);
        if (ret != pdPASS) {
            LOG_ERROR("Failed to create HTTP server task");
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

    LOG_DEBUG("Local auth token generated (%zu bytes)", strlen(g_local_auth_token));
    LOG_INFO("Local auth token written to %s", token_path);

    return 0;
}

/**
 * Verify local authentication from request.
 * Expects "Authorization: Bearer <token>" header.
 */
static bool verify_local_auth(const http_request_t *req) {
    if (g_local_auth_token[0] == '\0') {
        // No token available — token generation failed. Deny all requests
        // to prevent auth bypass when RNG or HAL fails.
        LOG_WARN("Auth denied: no local auth token available (generation failed?)");
        return false;
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

static bool claim_flow_active(void) {
    runtime_config_t config_snapshot;
    config_manager_get_snapshot(&config_snapshot);
    return !config_snapshot.needs_setup &&
           strlen(config_snapshot.server.api_key) == 0 &&
           qr_scanner_is_initialized();
}

static bool request_param_from_json_or_form(const http_request_t *req, const char *key,
                                            char *value, size_t value_size) {
    if (!req || !key || !value || value_size == 0 || req->body_len == 0) {
        if (value && value_size > 0) {
            value[0] = '\0';
        }
        return false;
    }

    value[0] = '\0';

    if (strstr(req->content_type, "application/json") != NULL) {
        cJSON *body = cJSON_Parse(req->body);
        if (body) {
            cJSON *item = cJSON_GetObjectItem(body, key);
            if (item && cJSON_IsString(item) && item->valuestring) {
                strncpy(value, item->valuestring, value_size - 1);
                value[value_size - 1] = '\0';
                cJSON_Delete(body);
                return true;
            }
            cJSON_Delete(body);
        }
    }

    return form_get_param(req->body, key, value, value_size);
}

static bool get_effective_claim_server_url(char *out, size_t out_size) {
    runtime_config_t config_snapshot;
    config_manager_get_effective_snapshot(&config_snapshot);
    if (strlen(config_snapshot.server.url) == 0) {
        if (out && out_size > 0) {
            out[0] = '\0';
        }
        return false;
    }

    snprintf(out, out_size, "%s", config_snapshot.server.url);
    return true;
}

static bool get_claim_server_url_hint(char *out, size_t out_size) {
    if (config_manager_get_pending_claim_server_url(out, out_size) == 0 &&
        strlen(out) > 0) {
        return true;
    }

    return get_effective_claim_server_url(out, out_size);
}

static bool validate_claim_server_url_input(const char *url) {
    if (!url) {
        return false;
    }
    if (strlen(url) == 0 || strlen(url) >= CFG_MAX_URL_LEN) {
        return false;
    }

    return strncmp(url, "http://", 7) == 0 || strncmp(url, "https://", 8) == 0;
}

static int persist_claim_from_token(const char *server_url, const char *claim_token,
                                    char *error_message, size_t error_message_size) {
    char api_key[CFG_MAX_API_KEY_LEN] = {0};
    int rc = -1;

    if (!server_url || !claim_token || strlen(server_url) == 0 || strlen(claim_token) == 0) {
        if (error_message && error_message_size > 0) {
            snprintf(error_message, error_message_size,
                     "Server URL and claim token are required");
        }
        return -1;
    }

    if (!config_manager_begin_claim_exchange()) {
        if (error_message && error_message_size > 0) {
            snprintf(error_message, error_message_size,
                     "Another claim attempt is already in progress. Wait a moment and retry.");
        }
        return -1;
    }

    if (server_comm_exchange_claim_token(server_url, claim_token,
                                         api_key, sizeof(api_key)) != 0) {
        if (error_message && error_message_size > 0) {
            snprintf(error_message, error_message_size,
                     "Claim token exchange failed. Check the token, server URL, or server reachability.");
        }
        secure_clear(api_key, sizeof(api_key));
        config_manager_end_claim_exchange();
        return -1;
    }

    rc = config_manager_finalize_claim(server_url, api_key);
    config_manager_end_claim_exchange();
    secure_clear(api_key, sizeof(api_key));
    if (rc != 0) {
        if (error_message && error_message_size > 0) {
            snprintf(error_message, error_message_size,
                     "Claim succeeded but device persistence failed");
        }
        return -1;
    }

    if (error_message && error_message_size > 0) {
        error_message[0] = '\0';
    }
    return 0;
}

// Rate limiting (extracted to http_rate_limit.c)
#include "http_rate_limit.h"

// ============================================================================
// Response Helpers
// ============================================================================

const char *http_status_text(http_status_t status) {
    switch (status) {
        case HTTP_OK: return "OK";
        case HTTP_ACCEPTED: return "Accepted";
        case HTTP_UNAUTHORIZED: return "Unauthorized";  // COMM-001-7
        case HTTP_BAD_REQUEST: return "Bad Request";
        case HTTP_NOT_FOUND: return "Not Found";
        case HTTP_CONFLICT: return "Conflict";
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
    LOG_INFO("HTTP client connected from %s", client_ip);

    // Heap-allocate large buffers to avoid stack overflow on ESP32
    // (recv buffer 8KB + http_request_t ~5KB would exceed FreeRTOS task stack)
    char *buffer = (char *)malloc(HTTP_RECV_BUFFER_SIZE);
    http_request_t *req_ptr = (http_request_t *)calloc(1, sizeof(http_request_t));
    if (!buffer || !req_ptr) {
        LOG_ERROR("Failed to allocate HTTP buffers");
        free(buffer);
        free(req_ptr);
        return;
    }

    // Read headers first (initial recv)
    ssize_t received = recv(client_fd, buffer, HTTP_RECV_BUFFER_SIZE - 1, 0);

    if (received <= 0) {
        if (received < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            LOG_ERROR("recv error: %s", strerror(errno));
        }
        free(buffer);
        free(req_ptr);
        return;
    }

    buffer[received] = '\0';

    // Parse request (headers + any initial body data)
    // Use heap-allocated req_ptr (not stack) to avoid stack overflow on ESP32
    http_request_t *req = req_ptr;
    if (parse_request(buffer, received, req) < 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "Malformed request");
        free(buffer);
        free(req_ptr);
        return;
    }

    // Done with recv buffer
    free(buffer);
    buffer = NULL;

    // Store client IP for rate limiting
    strncpy(req->client_ip, client_ip, sizeof(req->client_ip) - 1);
    req->client_ip[sizeof(req->client_ip) - 1] = '\0';

    // Change 11: Loop recv to read remaining body if Content-Length > body received so far
    if (req->content_length > 0 && req->body_len < req->content_length) {
        size_t total_body_read = req->body_len;
        while (total_body_read < req->content_length &&
               total_body_read < sizeof(req->body) - 1) {
            size_t to_read = req->content_length - total_body_read;
            if (to_read > sizeof(req->body) - 1 - total_body_read) {
                to_read = sizeof(req->body) - 1 - total_body_read;
            }
            ssize_t chunk = recv(client_fd, req->body + total_body_read, to_read, 0);
            if (chunk <= 0) {
                if (chunk < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                    LOG_WARN("Timeout reading request body");
                }
                break;
            }
            total_body_read += (size_t)chunk;
        }
        req->body[total_body_read] = '\0';
        req->body_len = total_body_read;
    }

    // Set CORS origin for response helpers
    http_set_request_origin(req->origin);

    LOG_INFO("Request: %s %s from %s", req->method, req->path, client_ip);

    // Route to handler
    route_request(client_fd, req);

    // Clear thread-local origin
    http_set_request_origin(NULL);

    free(req_ptr);
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

    // QR preview endpoint - public during onboarding/debug so the operator can
    // confirm the board is pointed correctly before claim succeeds.
    if (strcmp(req->path, "/qr-preview.bmp") == 0) {
        if (strcmp(req->method, "GET") == 0) {
            handle_qr_preview(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET for /qr-preview.bmp");
        }
        return;
    }

    if (strcmp(req->path, "/claim") == 0) {
        if (!claim_flow_active()) {
            http_send_error(client_fd, HTTP_CONFLICT,
                            "Claim page is only available while the device is waiting to be claimed.");
            return;
        }

        if (strcmp(req->method, "GET") == 0) {
            handle_claim_get(client_fd, req);
        } else if (strcmp(req->method, "POST") == 0) {
            handle_claim_post(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET or POST for /claim");
        }
        return;
    }

    // Setup endpoint - accessible without auth ONLY when device needs setup
    // (AP mode / first boot). Once configured, requires auth like everything else.
    if (strcmp(req->path, "/setup") == 0) {
        if (config_manager_needs_setup()) {
            // No auth required during initial setup
            if (strcmp(req->method, "GET") == 0) {
                handle_setup_get(client_fd, req);
            } else if (strcmp(req->method, "POST") == 0) {
                handle_setup_post(client_fd, req);
            } else {
                http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use GET or POST for /setup");
            }
            return;
        }
        // If setup is complete, fall through to auth check below
    }

    if (claim_flow_active() &&
        (strcmp(req->path, "/") == 0 || strcmp(req->path, "/index.html") == 0)) {
        http_send_redirect(client_fd, "/claim");
        return;
    }

    // Captive portal mode: during setup, redirect ALL unknown paths to /setup.
    // This must come BEFORE auth check — captive portal probes don't send tokens.
    if (config_manager_needs_setup()) {
        http_send_redirect(client_fd, "/setup");
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

    if (strcmp(req->path, "/capture") == 0) {
        if (strcmp(req->method, "POST") == 0) {
            handle_capture(client_fd, req);
        } else {
            http_send_error(client_fd, HTTP_METHOD_NOT_ALLOWED, "Use POST for /capture");
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
    manual_capture_snapshot_t capture_snapshot;
    deterrent_snapshot_t deterrent_snapshot;
    vision_snapshot_t vision_snapshot;

    // Get armed state from config manager - use public snapshot to avoid
    // holding a pointer to shared state
    runtime_config_t config_snapshot;
    config_manager_get_public(&config_snapshot);
    bool armed = config_snapshot.armed;
    bool detection_enabled = config_snapshot.detection.enabled;
    runtime_config_t effective_snapshot;
    config_manager_get_effective_snapshot(&effective_snapshot);

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
    cJSON_AddStringToObject(response, "home_source",
        config_home_source_name(config_manager_get_effective_server_source()));
    cJSON_AddStringToObject(response, "resolved_server_url",
        effective_snapshot.server.url);
    cJSON_AddStringToObject(response, "install_profile",
        install_profile_name(config_snapshot.install_profile));

    bool qr_scanning = qr_scanner_is_initialized() &&
        strlen(config_snapshot.server.api_key) == 0;
    cJSON_AddBoolToObject(response, "qr_scanning", qr_scanning);

    qr_scanner_diagnostics_t qr_diag = {0};
    qr_scanner_get_diagnostics(&qr_diag);
    cJSON *qr = cJSON_CreateObject();
    cJSON_AddBoolToObject(qr, "active", qr_scanning);
    cJSON_AddNumberToObject(qr, "frame_width", qr_diag.width);
    cJSON_AddNumberToObject(qr, "frame_height", qr_diag.height);
    cJSON_AddNumberToObject(qr, "last_code_count", qr_diag.last_code_count);
    cJSON_AddStringToObject(qr, "last_decode_error", qr_diag.last_decode_error);
    cJSON_AddStringToObject(qr, "last_decode_pass", qr_diag.last_decode_pass);
    cJSON_AddStringToObject(qr, "operator_hint", qr_diag.operator_hint);
    cJSON_AddStringToObject(qr, "profile",
                            camera_qr_profile_name(camera_get_qr_profile()));
    cJSON_AddNumberToObject(qr, "frames_processed", (double)qr_diag.frames_processed);
    cJSON_AddNumberToObject(qr, "frames_with_candidates", (double)qr_diag.frames_with_candidates);
    cJSON_AddNumberToObject(qr, "frames_with_payload", (double)qr_diag.frames_with_payload);
    cJSON_AddItemToObject(response, "qr", qr);

    cJSON *claim = cJSON_CreateObject();
    cJSON_AddBoolToObject(claim, "available", claim_flow_active());
    cJSON_AddBoolToObject(claim, "pending_token",
                          config_manager_has_pending_claim_token());
    {
        char claim_server_url[CFG_MAX_URL_LEN] = {0};
        if (get_claim_server_url_hint(claim_server_url, sizeof(claim_server_url))) {
            cJSON_AddStringToObject(claim, "server_url", claim_server_url);
        } else {
            cJSON_AddStringToObject(claim, "server_url", "");
        }
    }
    cJSON_AddStringToObject(claim, "path", "/claim");
    cJSON_AddItemToObject(response, "claim", claim);

    manual_capture_get_snapshot(&capture_snapshot);
    cJSON *manual_capture = cJSON_CreateObject();
    cJSON_AddStringToObject(manual_capture, "request_id", capture_snapshot.request_id);
    cJSON_AddStringToObject(manual_capture, "state",
                            manual_capture_state_name(capture_snapshot.state));
    cJSON_AddStringToObject(manual_capture, "recorded_at", capture_snapshot.recorded_at);
    cJSON_AddStringToObject(manual_capture, "upload_state",
                            manual_capture_upload_state_name(capture_snapshot.upload_state));
    cJSON_AddStringToObject(manual_capture, "last_clip_path",
                            capture_snapshot.last_clip_path);
    cJSON_AddStringToObject(manual_capture, "last_error",
                            capture_snapshot.last_error);
    cJSON_AddItemToObject(response, "manual_capture", manual_capture);

    deterrent_state_get_snapshot(&deterrent_snapshot);
    cJSON *deterrent = cJSON_CreateObject();
    cJSON_AddStringToObject(deterrent, "mode",
                            config_deterrent_mode_name(deterrent_snapshot.mode));
    cJSON_AddStringToObject(deterrent, "state",
                            deterrent_target_state_name(deterrent_snapshot.state));
    cJSON_AddBoolToObject(deterrent, "target_acquired",
                          deterrent_snapshot.target_acquired);
    cJSON_AddNumberToObject(deterrent, "target_center_x",
                            deterrent_snapshot.target_center_x);
    cJSON_AddNumberToObject(deterrent, "target_center_y",
                            deterrent_snapshot.target_center_y);
    cJSON_AddNumberToObject(deterrent, "target_area",
                            deterrent_snapshot.target_area);
    cJSON_AddNumberToObject(deterrent, "hover_duration_ms",
                            deterrent_snapshot.hover_duration_ms);
    cJSON_AddStringToObject(deterrent, "confidence",
                            deterrent_snapshot.confidence);
    cJSON_AddBoolToObject(deterrent, "would_move",
                          deterrent_snapshot.would_move);
    cJSON_AddBoolToObject(deterrent, "would_fire",
                          deterrent_snapshot.would_fire);
    cJSON_AddStringToObject(deterrent, "last_decision_at",
                            deterrent_snapshot.last_decision_at);
    cJSON_AddStringToObject(deterrent, "last_clip_path",
                            deterrent_snapshot.last_clip_path);
    cJSON_AddStringToObject(deterrent, "last_annotated_frame_path",
                            deterrent_snapshot.last_annotated_frame_path);
    cJSON_AddStringToObject(deterrent, "last_error",
                            deterrent_snapshot.last_error);
    cJSON_AddItemToObject(response, "deterrent", deterrent);

    vision_runtime_get_snapshot(&vision_snapshot);
    cJSON *vision = cJSON_CreateObject();
    cJSON_AddStringToObject(vision, "install_profile",
                            install_profile_name(vision_snapshot.install_profile));
    cJSON_AddStringToObject(vision, "watch_mode_state",
                            vision_watch_mode_state_name(vision_snapshot.watch_mode_state));
    cJSON_AddStringToObject(vision, "sensor_mode", vision_snapshot.sensor_mode);
    cJSON_AddStringToObject(vision, "sensor_resolution", vision_snapshot.sensor_resolution);
    cJSON_AddStringToObject(vision, "analysis_resolution", vision_snapshot.analysis_resolution);
    cJSON_AddNumberToObject(vision, "camera_fps", vision_snapshot.camera_fps);
    cJSON_AddNumberToObject(vision, "analysis_fps", vision_snapshot.analysis_fps);
    cJSON_AddNumberToObject(vision, "frames_dropped", vision_snapshot.frames_dropped);
    cJSON_AddNumberToObject(vision, "active_lane", vision_snapshot.active_lane);
    cJSON *lanes = cJSON_CreateArray();
    for (int lane = 0; lane < 3; lane++) {
        cJSON *lane_json = cJSON_CreateObject();
        cJSON_AddBoolToObject(lane_json, "active", vision_snapshot.lanes[lane].active);
        cJSON_AddBoolToObject(lane_json, "cooling", vision_snapshot.lanes[lane].cooling);
        cJSON_AddNumberToObject(lane_json, "track_id", vision_snapshot.lanes[lane].track_id);
        cJSON_AddNumberToObject(lane_json, "target_center_x",
                                vision_snapshot.lanes[lane].target_center_x);
        cJSON_AddNumberToObject(lane_json, "target_center_y",
                                vision_snapshot.lanes[lane].target_center_y);
        cJSON_AddNumberToObject(lane_json, "target_area",
                                vision_snapshot.lanes[lane].target_area);
        cJSON_AddNumberToObject(lane_json, "hover_duration_ms",
                                vision_snapshot.lanes[lane].hover_duration_ms);
        cJSON_AddNumberToObject(lane_json, "score",
                                vision_snapshot.lanes[lane].score);
        cJSON_AddStringToObject(lane_json, "confidence",
                                vision_snapshot.lanes[lane].confidence);
        cJSON_AddItemToArray(lanes, lane_json);
    }
    cJSON_AddItemToObject(vision, "lanes", lanes);
    cJSON_AddStringToObject(vision, "last_error", vision_snapshot.last_error);
    cJSON_AddItemToObject(response, "vision", vision);

    {
        sync_pipeline_snapshot_t sync_snapshot;
        sync_pipeline_get_snapshot(&sync_snapshot);
        cJSON *business_sync = cJSON_CreateObject();
        cJSON_AddBoolToObject(business_sync, "initialized", sync_snapshot.initialized);
        cJSON_AddBoolToObject(business_sync, "uploader_running", sync_snapshot.uploader_running);
        cJSON_AddNumberToObject(business_sync, "pending_clips", sync_snapshot.pending_clips);
        cJSON_AddNumberToObject(business_sync, "pending_entries",
                                sync_snapshot.journal.pending_entries);
        cJSON_AddNumberToObject(business_sync, "pending_activation_events",
                                sync_snapshot.journal.pending_activation_events);
        cJSON_AddNumberToObject(business_sync, "pending_encounters",
                                sync_snapshot.journal.pending_encounters);
        cJSON_AddBoolToObject(business_sync, "journal_sync_initialized",
                              sync_snapshot.journal_sync.initialized);
        cJSON_AddBoolToObject(business_sync, "journal_sync_running",
                              sync_snapshot.journal_sync.running);
        cJSON_AddStringToObject(business_sync, "last_journal_sync_status",
                                journal_sync_status_name(sync_snapshot.journal_sync.last_status));

        cJSON *active_encounter = cJSON_CreateObject();
        cJSON_AddBoolToObject(active_encounter, "active", sync_snapshot.active_encounter.active);
        cJSON_AddStringToObject(active_encounter, "encounter_id",
                                sync_snapshot.active_encounter.encounter_id);
        cJSON_AddNumberToObject(active_encounter, "lane",
                                sync_snapshot.active_encounter.lane);
        cJSON_AddNumberToObject(active_encounter, "detection_count",
                                sync_snapshot.active_encounter.detection_count);
        cJSON_AddNumberToObject(active_encounter, "activation_count",
                                sync_snapshot.active_encounter.activation_count);
        cJSON_AddStringToObject(active_encounter, "pending_clip_id",
                                sync_snapshot.active_encounter.pending_clip_id);
        cJSON_AddStringToObject(active_encounter, "first_seen_at",
                                sync_snapshot.active_encounter.first_seen_at);
        cJSON_AddStringToObject(active_encounter, "last_seen_at",
                                sync_snapshot.active_encounter.last_seen_at);
        cJSON_AddItemToObject(business_sync, "active_encounter", active_encounter);
        cJSON_AddItemToObject(response, "business_sync", business_sync);
    }

    // LED status: current display state + all active states
    if (led_controller_is_initialized()) {
        cJSON *led = cJSON_CreateObject();
        cJSON_AddStringToObject(led, "current", led_state_name(led_controller_get_state()));
        char led_summary[256];
        led_controller_active_summary(led_summary, sizeof(led_summary));
        cJSON_AddStringToObject(led, "active", led_summary);
        cJSON_AddItemToObject(response, "led", led);
    }

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

static void handle_capture(int client_fd, const http_request_t *req) {
    uint8_t duration_seconds = 3;
    bool upload = true;
    manual_capture_snapshot_t snapshot;

    if (req->body_len > 0) {
        cJSON *body = cJSON_Parse(req->body);
        if (body == NULL) {
            http_send_error(client_fd, HTTP_BAD_REQUEST, "Invalid JSON body");
            return;
        }

        cJSON *duration = cJSON_GetObjectItem(body, "duration_seconds");
        if (duration != NULL) {
            if (!cJSON_IsNumber(duration)) {
                cJSON_Delete(body);
                http_send_error(client_fd, HTTP_BAD_REQUEST,
                                "'duration_seconds' must be a number");
                return;
            }
            duration_seconds = (uint8_t)duration->valueint;
        }

        cJSON *upload_item = cJSON_GetObjectItem(body, "upload");
        if (upload_item != NULL) {
            if (!cJSON_IsBool(upload_item)) {
                cJSON_Delete(body);
                http_send_error(client_fd, HTTP_BAD_REQUEST,
                                "'upload' must be true or false");
                return;
            }
            upload = cJSON_IsTrue(upload_item);
        }

        cJSON_Delete(body);
    }

    if (manual_capture_request(duration_seconds, upload, &snapshot) != 0) {
        http_send_error(client_fd, HTTP_CONFLICT, "Manual capture already in progress");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "request_id", snapshot.request_id);
    cJSON_AddStringToObject(response, "state",
                            manual_capture_state_name(snapshot.state));

    char *json = cJSON_PrintUnformatted(response);
    http_send_json(client_fd, HTTP_ACCEPTED, json);

    free(json);
    cJSON_Delete(response);

    LOG_INFO("Manual capture requested: id=%s duration=%us upload=%s",
             snapshot.request_id,
             snapshot.duration_seconds,
             snapshot.upload_requested ? "true" : "false");
}

static void handle_config_get(int client_fd, const http_request_t *req) {
    (void)req;

    runtime_config_t public_config;
    config_manager_get_public(&public_config);

    char json_buf[4096];
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

static void handle_qr_preview(int client_fd, const http_request_t *req) {
    const char *validated_origin = validate_cors_origin(req->origin);
    uint16_t width = 0;
    uint16_t height = 0;
    size_t gray_size = camera_copy_last_qr_frame(NULL, 0, &width, &height);
    if (gray_size == 0 || width == 0 || height == 0) {
        http_send_error(client_fd, HTTP_NOT_FOUND,
                        "QR preview not available yet. Wait for a frame and retry.");
        return;
    }

    uint8_t *gray = (uint8_t *)malloc(gray_size);
    if (!gray) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to allocate QR preview buffer");
        return;
    }

    if (camera_copy_last_qr_frame(gray, gray_size, &width, &height) != gray_size) {
        free(gray);
        http_send_error(client_fd, HTTP_CONFLICT, "QR preview changed while reading. Retry.");
        return;
    }

    const uint32_t row_stride = ((uint32_t)width + 3U) & ~3U;
    const uint32_t pixel_bytes = row_stride * (uint32_t)height;
    const uint32_t bmp_size = 14U + 40U + (256U * 4U) + pixel_bytes;
    char header[512];
    int header_len;

    if (validated_origin) {
        header_len = snprintf(header, sizeof(header),
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: image/bmp\r\n"
            "Content-Length: %lu\r\n"
            "Cache-Control: no-cache, no-store, must-revalidate\r\n"
            "Pragma: no-cache\r\n"
            "Connection: close\r\n"
            "Access-Control-Allow-Origin: %s\r\n"
            "Vary: Origin\r\n"
            "\r\n",
            (unsigned long)bmp_size, validated_origin);
    } else {
        header_len = snprintf(header, sizeof(header),
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: image/bmp\r\n"
            "Content-Length: %lu\r\n"
            "Cache-Control: no-cache, no-store, must-revalidate\r\n"
            "Pragma: no-cache\r\n"
            "Connection: close\r\n"
            "\r\n",
            (unsigned long)bmp_size);
    }

    if (header_len < 0 || (size_t)header_len >= sizeof(header) ||
        send(client_fd, header, (size_t)header_len, MSG_NOSIGNAL) <= 0) {
        free(gray);
        return;
    }

    const uint32_t pixel_data_offset = 14U + 40U + (256U * 4U);
    uint8_t file_header[14] = {
        'B', 'M',
        (uint8_t)(bmp_size & 0xFF),
        (uint8_t)((bmp_size >> 8) & 0xFF),
        (uint8_t)((bmp_size >> 16) & 0xFF),
        (uint8_t)((bmp_size >> 24) & 0xFF),
        0, 0, 0, 0,
        (uint8_t)(pixel_data_offset & 0xFF),
        (uint8_t)((pixel_data_offset >> 8) & 0xFF),
        (uint8_t)((pixel_data_offset >> 16) & 0xFF),
        (uint8_t)((pixel_data_offset >> 24) & 0xFF),
    };
    uint8_t info_header[40] = {0};
    info_header[0] = 40;
    info_header[4] = (uint8_t)(width & 0xFF);
    info_header[5] = (uint8_t)((width >> 8) & 0xFF);
    info_header[8] = (uint8_t)(height & 0xFF);
    info_header[9] = (uint8_t)((height >> 8) & 0xFF);
    info_header[12] = 1;   // planes
    info_header[14] = 8;   // 8-bit indexed
    info_header[20] = (uint8_t)(pixel_bytes & 0xFF);
    info_header[21] = (uint8_t)((pixel_bytes >> 8) & 0xFF);
    info_header[22] = (uint8_t)((pixel_bytes >> 16) & 0xFF);
    info_header[23] = (uint8_t)((pixel_bytes >> 24) & 0xFF);
    info_header[32] = 0;
    info_header[33] = 1;   // 256 colors in palette

    if (send(client_fd, file_header, sizeof(file_header), MSG_NOSIGNAL) <= 0 ||
        send(client_fd, info_header, sizeof(info_header), MSG_NOSIGNAL) <= 0) {
        free(gray);
        return;
    }

    uint8_t palette[256 * 4];
    for (int i = 0; i < 256; i++) {
        palette[i * 4 + 0] = (uint8_t)i;
        palette[i * 4 + 1] = (uint8_t)i;
        palette[i * 4 + 2] = (uint8_t)i;
        palette[i * 4 + 3] = 0;
    }
    if (send(client_fd, palette, sizeof(palette), MSG_NOSIGNAL) <= 0) {
        free(gray);
        return;
    }

    static const uint8_t zero_pad[3] = {0, 0, 0};
    const uint32_t padding = row_stride - (uint32_t)width;
    for (int row = (int)height - 1; row >= 0; row--) {
        const uint8_t *row_ptr = gray + ((size_t)row * (size_t)width);
        if (send(client_fd, row_ptr, width, MSG_NOSIGNAL) <= 0) {
            free(gray);
            return;
        }
        if (padding > 0 &&
            send(client_fd, zero_pad, padding, MSG_NOSIGNAL) <= 0) {
            free(gray);
            return;
        }
    }

    LOG_INFO("Served QR preview frame (%ux%u BMP)", width, height);
    free(gray);
}

// ============================================================================
// Setup Page (WiFi Provisioning)
// ============================================================================

// Embedded HTML for the setup page
static const char SETUP_PAGE_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>HiveWarden Setup</title>"
    "<style>"
    "body{font-family:-apple-system,sans-serif;max-width:420px;margin:24px auto;"
    "padding:0 16px;background:#0f0f23;color:#e0e0e0}"
    "h1{color:#f5a623;font-size:1.3em;text-align:center;margin-bottom:4px}"
    ".sub{text-align:center;font-size:.85em;color:#888;margin-bottom:20px}"
    "label{display:block;margin:14px 0 4px;font-size:.9em;color:#ccc}"
    "input{width:100%;padding:10px;border:1px solid #333;border-radius:6px;"
    "background:#1a1a3e;color:#fff;box-sizing:border-box;font-size:1em}"
    "input:focus{border-color:#f5a623;outline:none}"
    "button{width:100%;padding:13px;margin-top:22px;background:#f5a623;"
    "color:#0f0f23;border:none;border-radius:6px;font-size:1.05em;"
    "font-weight:bold;cursor:pointer}"
    "button:active{background:#d4891a}"
    ".hint{font-size:.78em;color:#666;margin-top:3px}"
    "hr{border:none;border-top:1px solid #222;margin:18px 0}"
    "#qr-wrap{display:none;text-align:center;margin:12px 0}"
    "#qr-video{width:100%;max-width:300px;height:200px;object-fit:cover;"
    "border-radius:6px;border:2px solid #f5a623;background:#000}"
    "#qr-scan{background:#2a2a5e;color:#f5a623;border:1px solid #f5a623;"
    "margin-top:0;font-weight:normal}"
    "#qr-cancel{background:#333;color:#ccc;margin-top:8px;font-size:.9em;"
    "display:none}"
    "#qr-status{font-size:.8em;color:#888;margin-top:6px}"
    ".qr-ok{color:#4CAF50!important}"
    "</style></head><body>"
    "<h1>HiveWarden Setup</h1>"
    "<p class=\"sub\">Connect your device to WiFi</p>"
    "<form method=\"POST\" action=\"/setup\">"
    "<label>WiFi Network (SSID)</label>"
    "<input name=\"ssid\" required placeholder=\"Your WiFi name\">"
    "<label>WiFi Password</label>"
    "<input name=\"password\" type=\"password\" placeholder=\"WiFi password\">"
    "<hr>"
    "<label>Claim Token (Recommended)</label>"
    "<input name=\"claim_token\" id=\"claim_token\" "
    "placeholder=\"One-time token from HiveWarden\">"
    "<p class=\"hint\">Use the short-lived claim token from the dashboard QR or claim sheet</p>"
    "<button type=\"button\" id=\"qr-scan\" onclick=\"startScan()\">"
    "&#128247; Scan claim QR with this browser</button>"
    "<div id=\"qr-wrap\">"
    "<video id=\"qr-video\" playsinline autoplay muted></video>"
    "<button type=\"button\" id=\"qr-cancel\" onclick=\"stopScan()\">"
    "Cancel</button>"
    "<p id=\"qr-status\"></p></div>"
    // Server URL: hidden field, only populated via QR code or advanced users.
    // By default the firmware uses ONBOARDING_DEFAULT_URL from onboarding_defaults.h
    "<input type=\"hidden\" name=\"server_url\" id=\"server_url\">"
    "<details style=\"margin-top:16px\">"
    "<summary style=\"color:#666;font-size:.8em;cursor:pointer\">"
    "Advanced: custom server URL</summary>"
    "<label style=\"margin-top:8px\">Server URL</label>"
    "<input id=\"server_url_visible\" "
    "placeholder=\"https://hivewarden.eu\" "
    "oninput=\"document.getElementById('server_url').value=this.value\">"
    "<p class=\"hint\">Only change if self-hosting Hive Warden or discovery will not find your server</p>"
    "<label style=\"margin-top:8px\">Advanced: raw API key</label>"
    "<input name=\"api_key\" id=\"api_key\" placeholder=\"Only for advanced/manual recovery\">"
    "<p class=\"hint\">Prefer the claim token above. Raw API keys are for advanced recovery only.</p>"
    "</details>"
    "<button type=\"submit\">Save &amp; Reboot</button>"
    "</form>"
    "<script>"
    "var stream=null,raf=null;"
    "function startScan(){"
    "if(!('BarcodeDetector' in window)){"
    "document.getElementById('qr-status').textContent="
    "'QR scanning not supported on this browser \\u2014 enter the key manually';"
    "document.getElementById('qr-wrap').style.display='block';return}"
    "var v=document.getElementById('qr-video');"
    "var w=document.getElementById('qr-wrap');"
    "var c=document.getElementById('qr-cancel');"
    "var s=document.getElementById('qr-status');"
    "w.style.display='block';c.style.display='block';"
    "s.textContent='Opening camera...';"
    "navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})"
    ".then(function(st){"
    "stream=st;v.srcObject=st;s.textContent='Point at QR code...';"
    "var bd=new BarcodeDetector({formats:['qr_code']});"
    "function detect(){"
    "bd.detect(v).then(function(codes){"
    "if(codes.length>0){try{"
    "var raw=(codes[0].rawValue||'').trim();"
    "if(raw[0]==='{'){"
    "var d=JSON.parse(raw);"
    "if(d.s){document.getElementById('server_url').value=d.s;"
    "document.getElementById('server_url_visible').value=d.s}"
    "if(d.t){document.getElementById('claim_token').value=d.t}"
    "else if(d.k){document.getElementById('api_key').value=d.k}"
    "}else{document.getElementById('claim_token').value=raw}"
    "s.textContent='\\u2705 QR scanned!';"
    "s.className='qr-ok';stopScan();return"
    "}catch(e){}}"
    "raf=requestAnimationFrame(detect)"
    "}).catch(function(){raf=requestAnimationFrame(detect)})"
    "}raf=requestAnimationFrame(detect)"
    "}).catch(function(e){"
    "s.textContent='Camera error: '+e.message;"
    "c.style.display='block'})}"
    "function stopScan(){"
    "if(raf){cancelAnimationFrame(raf);raf=null}"
    "if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}"
    "document.getElementById('qr-video').srcObject=null;"
    "document.getElementById('qr-cancel').style.display='none'}"
    "if(!('BarcodeDetector' in window)){"
    "document.getElementById('qr-scan').style.display='none'}"
    "</script>"
    "</body></html>";

// Success page shown after setup
static const char SETUP_SUCCESS_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>HiveWarden - Setup Complete</title>"
    "<style>"
    "body{font-family:-apple-system,sans-serif;max-width:420px;margin:40px auto;"
    "padding:0 16px;background:#0f0f23;color:#e0e0e0;text-align:center}"
    "h1{color:#4CAF50;font-size:1.3em}"
    "p{color:#aaa;line-height:1.5}"
    "</style></head><body>"
    "<h1>Setup Complete</h1>"
    "<p>Device is rebooting and will connect to your WiFi network.</p>"
    "<p>You can close this page.</p>"
    "</body></html>";

static const char CLAIM_PAGE_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>HiveWarden Claim</title>"
    "<style>"
    "body{font-family:-apple-system,sans-serif;max-width:460px;margin:24px auto;"
    "padding:0 16px;background:#0f0f23;color:#e0e0e0}"
    "h1{color:#f5a623;font-size:1.35em;text-align:center;margin-bottom:4px}"
    ".sub{text-align:center;font-size:.9em;color:#a9acb5;margin-bottom:18px;line-height:1.45}"
    "label{display:block;margin:14px 0 4px;font-size:.9em;color:#ccc}"
    "input{width:100%;padding:10px;border:1px solid #333;border-radius:6px;"
    "background:#1a1a3e;color:#fff;box-sizing:border-box;font-size:1em}"
    "input:focus{border-color:#f5a623;outline:none}"
    "button{width:100%;padding:13px;margin-top:18px;background:#f5a623;"
    "color:#0f0f23;border:none;border-radius:6px;font-size:1.05em;"
    "font-weight:bold;cursor:pointer}"
    ".hint{font-size:.78em;color:#8d92a0;margin-top:4px;line-height:1.45}"
    ".panel{margin-top:18px;padding:14px;border:1px solid #2b3051;"
    "border-radius:10px;background:#151a2f}"
    ".meta{font-size:.82em;color:#b8becc;line-height:1.5;margin-top:8px}"
    ".pill{display:inline-block;padding:2px 8px;border-radius:999px;"
    "background:#24304d;color:#f2f5ff;font-size:.76em;margin:0 6px 6px 0}"
    "#preview{width:100%;border-radius:8px;border:1px solid #3b4165;background:#05070d;"
    "display:block;min-height:180px;object-fit:contain}"
    "</style></head><body>"
    "<h1>Claim This Device</h1>"
    "<p class=\"sub\">If the camera does not finish scanning the QR, paste the same one-time claim token here. "
    "The token is short-lived and exchanged for the real device API key only once.</p>"
    "<form method=\"POST\" action=\"/claim\">"
    "<label>Claim Token</label>"
    "<input name=\"claim_token\" id=\"claim_token\" required "
    "placeholder=\"HWC... one-time token\">"
    "<p class=\"hint\">This is the same token shown under the QR code in HiveWarden.</p>"
    "<label>Server URL (optional)</label>"
    "<input name=\"server_url\" id=\"claim_server_url\" "
    "placeholder=\"Leave blank to use the discovered server\">"
    "<p class=\"hint\">Leave blank to use the locally discovered/default HiveWarden server. "
    "Fill this only if you are self-hosting or discovery picked the wrong server.</p>"
    "<button type=\"submit\">Claim &amp; Reboot</button>"
    "</form>"
    "<div class=\"panel\">"
    "<img id=\"preview\" alt=\"Live QR preview\" src=\"/qr-preview.bmp\">"
    "<div class=\"meta\" id=\"claim_meta\">Loading camera feedback...</div>"
    "</div>"
    "<script>"
    "var preview=document.getElementById('preview');"
    "var meta=document.getElementById('claim_meta');"
    "var serverInput=document.getElementById('claim_server_url');"
    "function refresh(){"
    "fetch('/status').then(function(r){return r.json()}).then(function(data){"
    "var qr=data.qr||{};var claim=data.claim||{};"
    "if(!serverInput.value&&claim.server_url){serverInput.value=claim.server_url}"
    "meta.innerHTML='"
    "<span class=\"pill\">QR '+(qr.active?'active':'inactive')+'</span>' + "
    "'<span class=\"pill\">'+(qr.profile||'profile unknown')+'</span>' + "
    "'<span class=\"pill\">candidates '+(qr.frames_with_candidates||0)+'</span>' + "
    "'<span class=\"pill\">payloads '+(qr.frames_with_payload||0)+'</span><br>' + "
    "'Hint: '+(qr.operator_hint||'Keep the QR centered and steady.') + '<br>' + "
    "'Resolved server: ' + (claim.server_url||data.resolved_server_url||'not available yet');"
    "}).catch(function(){meta.textContent='Status unavailable. Keep the token handy and retry in a moment.'});"
    "preview.src='/qr-preview.bmp?ts='+Date.now();"
    "}"
    "setInterval(refresh, 1200);refresh();"
    "</script>"
    "</body></html>";

static const char CLAIM_SUCCESS_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>HiveWarden - Claim Complete</title>"
    "<style>"
    "body{font-family:-apple-system,sans-serif;max-width:420px;margin:40px auto;"
    "padding:0 16px;background:#0f0f23;color:#e0e0e0;text-align:center}"
    "h1{color:#4CAF50;font-size:1.3em}"
    "p{color:#aaa;line-height:1.5}"
    "</style></head><body>"
    "<h1>Claim Complete</h1>"
    "<p>The device has stored its server identity and is rebooting now.</p>"
    "<p>You can return to HiveWarden and wait for the unit to come online.</p>"
    "</body></html>";

/**
 * Send an HTML response.
 */
static int http_send_html(int client_fd, http_status_t status, const char *html) {
    char header[256];
    size_t body_len = html ? strlen(html) : 0;
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: text/html; charset=utf-8\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n",
        status, http_status_text(status), body_len);

    if (header_len < 0 || (size_t)header_len >= sizeof(header)) return -1;
    if (send(client_fd, header, header_len, 0) < 0) return -1;
    if (body_len > 0 && send(client_fd, html, body_len, 0) < 0) return -1;
    return 0;
}

static void http_send_onboarding_page(int client_fd, http_status_t status,
                                      const char *title, const char *message) {
    char html[2048];
    snprintf(html, sizeof(html),
             "<!DOCTYPE html><html><head>"
             "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
             "<title>%s</title>"
             "<style>"
             "body{font-family:-apple-system,sans-serif;max-width:420px;margin:40px auto;"
             "padding:0 16px;background:#0f0f23;color:#e0e0e0;text-align:center}"
             "h1{color:#f5a623;font-size:1.3em}"
             "p{color:#aaa;line-height:1.5}"
             "a{color:#f5a623}"
             "</style></head><body>"
             "<h1>%s</h1>"
             "<p>%s</p>"
             "<p><a href=\"/claim\">Back to claim page</a></p>"
             "</body></html>",
             title, title, message);
    http_send_html(client_fd, status, html);
}

/**
 * URL-decode a string in-place.
 * Handles %XX hex encoding and '+' as space.
 */
static int url_decode(const char *src, char *dst, size_t dst_size) {
    size_t j = 0;
    for (size_t i = 0; src[i] && j < dst_size - 1; i++) {
        if (src[i] == '%' && src[i + 1] && src[i + 2]) {
            char hex[3] = {src[i + 1], src[i + 2], 0};
            char *end;
            long val = strtol(hex, &end, 16);
            if (end == hex + 2 && val >= 0 && val <= 255) {
                dst[j++] = (char)val;
                i += 2;  // skip the two hex chars (loop increments i too)
                continue;
            }
        }
        if (src[i] == '+') {
            dst[j++] = ' ';
            continue;
        }
        dst[j++] = src[i];
    }
    dst[j] = '\0';
    return (int)j;
}

/**
 * Extract a parameter from URL-encoded form body.
 * Returns true if found, value is URL-decoded.
 */
static bool form_get_param(const char *body, const char *key,
                           char *value, size_t value_size) {
    size_t key_len = strlen(key);
    const char *p = body;

    while (*p) {
        // Check if this position matches "key="
        if (strncmp(p, key, key_len) == 0 && p[key_len] == '=') {
            const char *val_start = p + key_len + 1;
            const char *val_end = strchr(val_start, '&');
            if (!val_end) val_end = val_start + strlen(val_start);

            size_t encoded_len = (size_t)(val_end - val_start);
            char encoded[512];
            if (encoded_len >= sizeof(encoded)) encoded_len = sizeof(encoded) - 1;
            memcpy(encoded, val_start, encoded_len);
            encoded[encoded_len] = '\0';

            url_decode(encoded, value, value_size);
            return true;
        }

        // Skip to next parameter
        const char *next = strchr(p, '&');
        if (!next) break;
        p = next + 1;
    }

    value[0] = '\0';
    return false;
}

static void handle_setup_get(int client_fd, const http_request_t *req) {
    (void)req;
    http_send_html(client_fd, HTTP_OK, SETUP_PAGE_HTML);
    LOG_INFO("Served setup page");
}

static void handle_setup_post(int client_fd, const http_request_t *req) {
    if (req->body_len == 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "Form data required");
        return;
    }

    // Parse form parameters
    char ssid[64] = {0};
    char password[128] = {0};
    char server_url[256] = {0};
    char claim_token[64] = {0};
    char api_key[64] = {0};

    if (!form_get_param(req->body, "ssid", ssid, sizeof(ssid)) || strlen(ssid) == 0) {
        http_send_error(client_fd, HTTP_BAD_REQUEST, "WiFi SSID is required");
        return;
    }

    form_get_param(req->body, "password", password, sizeof(password));
    form_get_param(req->body, "server_url", server_url, sizeof(server_url));
    form_get_param(req->body, "claim_token", claim_token, sizeof(claim_token));
    form_get_param(req->body, "api_key", api_key, sizeof(api_key));

    LOG_INFO("Setup: SSID=%s, server=%s, pending_claim=%s", ssid,
             strlen(server_url) > 0 ? server_url : "(auto-discover)",
             strlen(claim_token) > 0 ? "yes" : "no");

    // Save WiFi credentials
#ifdef APIS_PLATFORM_ESP32
    if (wifi_provision_save_credentials(ssid, password) != 0) {
        http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to save WiFi credentials");
        return;
    }
#endif

    if (strlen(api_key) > 0) {
        if (strlen(server_url) > 0) {
            if (config_manager_set_server(server_url, api_key) != 0) {
                http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to save server settings");
                return;
            }
        } else if (config_manager_set_api_key(api_key) != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to save API key");
            return;
        }
        if (config_manager_clear_pending_claim_token() != 0 ||
            config_manager_clear_pending_claim_server_url() != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR,
                            "Failed to clear pending claim state");
            return;
        }
    } else if (strlen(claim_token) > 0) {
        if (config_manager_set_pending_claim_token(claim_token) != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR,
                            "Failed to store claim token");
            return;
        }
        if (config_manager_set_pending_claim_server_url(server_url) != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR,
                            "Failed to store claim server selection");
            return;
        }
    } else {
        if (strlen(server_url) > 0 &&
            config_manager_set_server(server_url, NULL) != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR, "Failed to save server settings");
            return;
        }
        if (config_manager_clear_pending_claim_token() != 0 ||
            config_manager_clear_pending_claim_server_url() != 0) {
            http_send_error(client_fd, HTTP_INTERNAL_ERROR,
                            "Failed to clear pending claim state");
            return;
        }
    }

    // Mark setup as complete
    config_manager_complete_setup();

    // Send success page before rebooting
    http_send_html(client_fd, HTTP_OK, SETUP_SUCCESS_HTML);
    LOG_INFO("Setup complete - rebooting...");

    // Give the response time to be sent, then reboot
#ifdef APIS_PLATFORM_ESP32
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
#else
    // On Pi/test, just log (no reboot)
    LOG_INFO("Setup complete (reboot skipped on non-ESP32 platform)");
#endif
}

static void handle_claim_get(int client_fd, const http_request_t *req) {
    (void)req;
    http_send_html(client_fd, HTTP_OK, CLAIM_PAGE_HTML);
    LOG_INFO("Served claim page");
}

static void handle_claim_post(int client_fd, const http_request_t *req) {
    char claim_token[64] = {0};
    char server_url[CFG_MAX_URL_LEN] = {0};
    char error_message[256] = {0};

    if (req->body_len == 0) {
        http_send_onboarding_page(client_fd, HTTP_BAD_REQUEST,
                                  "Claim Failed",
                                  "Enter the one-time claim token and try again.");
        return;
    }

    if (!request_param_from_json_or_form(req, "claim_token",
                                         claim_token, sizeof(claim_token)) ||
        strlen(claim_token) == 0) {
        http_send_onboarding_page(client_fd, HTTP_BAD_REQUEST,
                                  "Claim Failed",
                                  "A one-time claim token is required.");
        return;
    }

    request_param_from_json_or_form(req, "server_url", server_url, sizeof(server_url));
    if (strlen(server_url) > 0) {
        if (!validate_claim_server_url_input(server_url)) {
            http_send_onboarding_page(client_fd, HTTP_BAD_REQUEST,
                                      "Claim Failed",
                                      "The provided server URL is invalid.");
            return;
        }
    } else if (!get_claim_server_url_hint(server_url, sizeof(server_url))) {
        http_send_onboarding_page(client_fd, HTTP_BAD_REQUEST,
                                  "Claim Failed",
                                  "No claim server is available yet. Enter a server URL or wait for discovery.");
        return;
    }

    if (persist_claim_from_token(server_url, claim_token,
                                 error_message, sizeof(error_message)) != 0) {
        http_send_onboarding_page(client_fd, HTTP_BAD_REQUEST,
                                  "Claim Failed", error_message);
        return;
    }

    http_send_html(client_fd, HTTP_OK, CLAIM_SUCCESS_HTML);
    LOG_INFO("Device claimed via local claim page against %s", server_url);

#ifdef APIS_PLATFORM_ESP32
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
#endif
}

/**
 * Send an HTTP 302 redirect response.
 */
static int http_send_redirect(int client_fd, const char *location) {
    // iOS requires a non-empty body to detect captive portal redirects
    const char *body = "Redirecting to setup page...";
    char header[512];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 302 Found\r\n"
        "Location: %s\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n",
        location, strlen(body));

    if (header_len < 0 || (size_t)header_len >= sizeof(header)) return -1;
    if (send(client_fd, header, header_len, MSG_NOSIGNAL) < 0) return -1;
    if (send(client_fd, body, strlen(body), MSG_NOSIGNAL) < 0) return -1;
    return 0;
}

static void handle_not_found(int client_fd, const http_request_t *req) {
    // Captive portal mode: during setup, redirect ALL unknown paths to /setup.
    // This is what makes the captive portal popup work — when a phone probes
    // captive.apple.com/hotspot-detect.html or connectivitycheck.gstatic.com,
    // the DNS server resolves it to us, and we redirect to the setup page.
    if (config_manager_needs_setup()) {
        http_send_redirect(client_fd, "/setup");
        return;
    }

    if (claim_flow_active()) {
        http_send_redirect(client_fd, "/claim");
        return;
    }

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
