/**
 * Server Communication implementation.
 *
 * Handles heartbeat communication with the APIS server.
 * Uses POSIX sockets for HTTP POST requests.
 */

// Enable strptime and timegm on POSIX systems
// Note: _GNU_SOURCE enables timegm; _XOPEN_SOURCE enables strptime
// _DARWIN_C_SOURCE enables timegm on macOS
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#ifndef _XOPEN_SOURCE
#define _XOPEN_SOURCE 700
#endif
#ifndef _DEFAULT_SOURCE
#define _DEFAULT_SOURCE
#endif
#ifdef __APPLE__
#ifndef _DARWIN_C_SOURCE
#define _DARWIN_C_SOURCE
#endif
#endif

#include "server_comm.h"
#include "config_manager.h"
#include "led_controller.h"
#include "clip_uploader.h"
#include "storage_manager.h"
#include "http_utils.h"
#include "tls_client.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <errno.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

#include "cJSON.h"

// ESP32 lwIP may not provide gai_strerror; provide a fallback
#ifdef APIS_PLATFORM_ESP32
#ifndef gai_strerror
static inline const char *apis_gai_strerror(int errcode) {
    (void)errcode;
    return "DNS resolution failed";
}
#define gai_strerror apis_gai_strerror
#endif
#endif

// ESP32 newlib doesn't provide timegm; implement a portable version
#ifdef APIS_PLATFORM_ESP32
static time_t apis_timegm(struct tm *tm) {
    // Set TZ to UTC, call mktime, restore TZ
    // This is the standard portable timegm implementation
    time_t ret;
    char *tz = getenv("TZ");
    setenv("TZ", "UTC0", 1);
    tzset();
    ret = mktime(tm);
    if (tz) {
        setenv("TZ", tz, 1);
    } else {
        unsetenv("TZ");
    }
    tzset();
    return ret;
}
#define timegm apis_timegm
#endif

// ============================================================================
// Constants
// ============================================================================

#define HTTP_BUFFER_SIZE    4096
#define FIRMWARE_VERSION    "1.0.0"
#define DEFAULT_SERVER_PORT 443

// Security Helpers (COMM-001-4 fix)
#include "secure_util.h"

// ============================================================================
// COMM-001-6: Auth Failure Constants
// ============================================================================

#define MAX_AUTH_FAILURES 3  // Require re-provisioning after this many auth failures

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static volatile server_status_t g_status = SERVER_STATUS_UNKNOWN;
static volatile int64_t g_last_success_time = 0;  // Unix timestamp of last success
static time_t g_start_time = 0;
static volatile int g_auth_fail_count = 0;  // COMM-001-6: Track consecutive auth failures

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_heartbeat_thread;
#else
static TaskHandle_t g_heartbeat_task = NULL;
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(comm);
#define COMM_LOCK()   APIS_MUTEX_LOCK(comm)
#define COMM_UNLOCK() APIS_MUTEX_UNLOCK(comm)

// ============================================================================
// Utility Functions
// ============================================================================

const char *server_status_name(server_status_t status) {
    switch (status) {
        case SERVER_STATUS_UNKNOWN:     return "UNKNOWN";
        case SERVER_STATUS_ONLINE:      return "ONLINE";
        case SERVER_STATUS_OFFLINE:     return "OFFLINE";
        case SERVER_STATUS_AUTH_FAILED: return "AUTH_FAILED";
        default:                        return "UNKNOWN";
    }
}

static uint32_t get_uptime_seconds(void) {
    if (g_start_time == 0) return 0;
    return (uint32_t)(time(NULL) - g_start_time);
}

// Heartbeat always uses /api/units/heartbeat endpoint
#define HEARTBEAT_PATH "/api/units/heartbeat"

// ============================================================================
// HTTP Client
// ============================================================================

static int http_post(const char *host, uint16_t port, const char *path,
                     const char *api_key, const char *body,
                     bool use_tls,
                     char *response, size_t response_size, int *http_status) {
    *http_status = 0;

    // TLS path: use tls_client wrapper for encrypted connection
    if (use_tls) {
        tls_context_t *tls_ctx = tls_connect(host, port);
        if (!tls_ctx) {
            LOG_ERROR("TLS connection to %s:%d failed", host, port);
            return -1;
        }

        // Build request
        char request[HTTP_BUFFER_SIZE];
        size_t body_len = body ? strlen(body) : 0;
        int req_len = snprintf(request, sizeof(request),
            "POST %s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "X-API-Key: %s\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n"
            "\r\n"
            "%s",
            path, host, api_key ? api_key : "", body_len, body ? body : "");

        // Send request over TLS
        int write_result = tls_write(tls_ctx, request, req_len);
        // COMM-001-4 fix: Clear API key from request buffer after sending
        secure_clear(request, sizeof(request));

        if (write_result < 0) {
            LOG_ERROR("Failed to send request over TLS");
            tls_close(tls_ctx);
            return -1;
        }

        // Receive response over TLS
        int received = tls_read(tls_ctx, response, response_size - 1);
        tls_close(tls_ctx);

        if (received <= 0) {
            if (received < 0) {
                LOG_ERROR("Failed to receive TLS response");
            }
            return -1;
        }

        response[received] = '\0';

        // Parse HTTP status
        if (sscanf(response, "HTTP/1.1 %d", http_status) != 1 &&
            sscanf(response, "HTTP/1.0 %d", http_status) != 1) {
            LOG_ERROR("Failed to parse HTTP status");
            return -1;
        }

        return 0;
    }

    // Plain HTTP path: use POSIX sockets directly

    // Resolve hostname using thread-safe getaddrinfo (supports IPv4 and IPv6)
    struct addrinfo hints = {0};
    struct addrinfo *result = NULL;
    hints.ai_family = AF_INET;      // IPv4
    hints.ai_socktype = SOCK_STREAM;

    char port_str[8];
    snprintf(port_str, sizeof(port_str), "%u", port);

    int gai_err = getaddrinfo(host, port_str, &hints, &result);
    if (gai_err != 0) {
        LOG_ERROR("Failed to resolve host: %s (%s)", host, gai_strerror(gai_err));
        return -1;
    }

    // Create socket
    int sock = socket(result->ai_family, result->ai_socktype, result->ai_protocol);
    if (sock < 0) {
        LOG_ERROR("Failed to create socket: %s", strerror(errno));
        freeaddrinfo(result);
        return -1;
    }

    // Set timeouts
    struct timeval timeout = {
        .tv_sec = HEARTBEAT_TIMEOUT_SEC,
        .tv_usec = 0
    };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));

    // Connect using resolved address
    if (connect(sock, result->ai_addr, result->ai_addrlen) < 0) {
        LOG_ERROR("Failed to connect to %s:%d: %s", host, port, strerror(errno));
        close(sock);
        freeaddrinfo(result);
        return -1;
    }

    freeaddrinfo(result);

    // Build request
    char request[HTTP_BUFFER_SIZE];
    size_t body_len = body ? strlen(body) : 0;
    int req_len = snprintf(request, sizeof(request),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "X-API-Key: %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s",
        path, host, api_key ? api_key : "", body_len, body ? body : "");

    // Send request
    if (send(sock, request, req_len, 0) < 0) {
        LOG_ERROR("Failed to send request: %s", strerror(errno));
        // COMM-001-4 fix: Clear API key from request buffer before returning
        secure_clear(request, sizeof(request));
        close(sock);
        return -1;
    }

    // COMM-001-4 fix: Clear API key from request buffer after sending
    // This prevents the API key from remaining in memory
    secure_clear(request, sizeof(request));

    // S8-H4 fix: Loop on recv() to handle partial HTTP responses.
    // A single recv() may not return the complete response, especially
    // on slow networks or when the response is larger than one TCP segment.
    size_t total_received = 0;
    while (total_received < response_size - 1) {
        ssize_t chunk = recv(sock, response + total_received,
                             response_size - 1 - total_received, 0);
        if (chunk < 0) {
            if (errno == EINTR) continue;  // Interrupted, retry
            if (total_received > 0) break;  // Got some data, use it
            LOG_ERROR("Failed to receive response: %s", strerror(errno));
            close(sock);
            return -1;
        }
        if (chunk == 0) break;  // Connection closed by server
        total_received += (size_t)chunk;

        // Check if we have a complete HTTP response (headers + body based on Connection: close)
        // For "Connection: close" responses, the server closes the connection when done,
        // so recv() returning 0 is the signal. We keep looping until that happens.
    }
    close(sock);

    if (total_received == 0) {
        LOG_ERROR("Empty response from server");
        return -1;
    }

    response[total_received] = '\0';

    // Parse HTTP status
    if (sscanf(response, "HTTP/1.1 %d", http_status) != 1 &&
        sscanf(response, "HTTP/1.0 %d", http_status) != 1) {
        LOG_ERROR("Failed to parse HTTP status");
        return -1;
    }

    return 0;
}

// ============================================================================
// Heartbeat Logic
// ============================================================================

static int do_heartbeat(heartbeat_response_t *resp) {
    // S8-C3 fix: Use thread-safe snapshot instead of raw pointer
    runtime_config_t config_local;
    config_manager_get_snapshot(&config_local);

    // Copy the api_key to a local buffer and then mask it in the snapshot
    char api_key_copy[CFG_MAX_API_KEY_LEN];
    strncpy(api_key_copy, config_local.server.api_key, sizeof(api_key_copy) - 1);
    api_key_copy[sizeof(api_key_copy) - 1] = '\0';

    // Clear sensitive data from the snapshot for safety
    memset(config_local.server.api_key, 0, sizeof(config_local.server.api_key));
    // From here on, use config_local and api_key_copy only

    // Check if server is configured
    if (strlen(config_local.server.url) == 0) {
        LOG_DEBUG("No server URL configured, skipping heartbeat");
        secure_clear(api_key_copy, sizeof(api_key_copy));
        return -1;
    }

    // Parse server URL (I8 fix: uses shared http_parse_url)
    char host[256];
    uint16_t port;
    char path[256];
    if (http_parse_url(config_local.server.url, host, sizeof(host), &port, path, sizeof(path),
                       HEARTBEAT_PATH) < 0) {
        LOG_ERROR("Invalid server URL: %s", config_local.server.url);
        secure_clear(api_key_copy, sizeof(api_key_copy));
        return -1;
    }

    // Determine if HTTPS should be used based on URL scheme
    bool use_tls = false;
    if (strncmp(config_local.server.url, "https://", 8) == 0) {
        if (tls_available()) {
            use_tls = true;
            LOG_DEBUG("Using TLS for heartbeat to %s:%u", host, port);
        } else {
            // S8-H1 fix: Refuse to silently downgrade from HTTPS to plain HTTP.
            // Sending API keys over unencrypted connections exposes credentials.
            LOG_ERROR("Server URL requires HTTPS but TLS is not available on this platform. "
                      "Refusing to send credentials over plain HTTP. "
                      "Either use an HTTP URL or enable TLS support.");
            secure_clear(api_key_copy, sizeof(api_key_copy));
            return -1;
        }
    }

    // Build request body
    cJSON *req_json = cJSON_CreateObject();
    cJSON_AddStringToObject(req_json, "unit_id", config_local.device.id);
    cJSON_AddBoolToObject(req_json, "armed", config_local.armed);
    cJSON_AddStringToObject(req_json, "firmware_version", FIRMWARE_VERSION);
    cJSON_AddNumberToObject(req_json, "uptime_seconds", get_uptime_seconds());
    // Get actual free storage from storage_manager
    uint32_t free_storage_mb = 0;
    if (storage_manager_is_initialized()) {
        storage_stats_t stats;
        if (storage_manager_get_stats(&stats) == STORAGE_MANAGER_OK) {
            // Calculate free storage: max_size - used_size
            // Use DEFAULT_MAX_STORAGE_MB from storage_manager.h
            free_storage_mb = (stats.total_size_mb < DEFAULT_MAX_STORAGE_MB)
                ? (DEFAULT_MAX_STORAGE_MB - stats.total_size_mb) : 0;
        }
    }
    cJSON_AddNumberToObject(req_json, "free_storage_mb", free_storage_mb);
    cJSON_AddNumberToObject(req_json, "pending_clips",
        clip_uploader_is_initialized() ? clip_uploader_pending_count() : 0);

    char *body = cJSON_PrintUnformatted(req_json);
    cJSON_Delete(req_json);

    if (!body) {
        LOG_ERROR("Failed to serialize heartbeat request");
        return -1;
    }

    // Send request
    char response[HTTP_BUFFER_SIZE];
    int http_status;
    int result = http_post(host, port, path, api_key_copy,
                           body, use_tls,
                           response, sizeof(response), &http_status);
    free(body);

    // Clear sensitive api_key copy from stack
    secure_clear(api_key_copy, sizeof(api_key_copy));

    if (result < 0) {
        // Network error
        COMM_LOCK();
        g_status = SERVER_STATUS_OFFLINE;
        COMM_UNLOCK();

        if (led_controller_is_initialized()) {
            led_controller_set_state(LED_STATE_OFFLINE);
        }

        LOG_WARN("Heartbeat failed: network error");
        return -1;
    }

    // Check HTTP status
    if (http_status == 401 || http_status == 403) {
        COMM_LOCK();
        g_status = SERVER_STATUS_AUTH_FAILED;
        g_auth_fail_count++;  // COMM-001-6: Track auth failures
        int fail_count = g_auth_fail_count;
        COMM_UNLOCK();

        LOG_ERROR("Heartbeat failed: authentication error (HTTP %d, attempt %d/%d)",
                  http_status, fail_count, MAX_AUTH_FAILURES);

        // COMM-001-6: Visual alert to user via LED
        if (led_controller_is_initialized()) {
            led_controller_set_state(LED_STATE_AUTH_FAILED);
        }

        // COMM-001-6: After repeated failures, require re-provisioning
        if (fail_count >= MAX_AUTH_FAILURES) {
            LOG_ERROR("Multiple auth failures - requiring re-provisioning");

            // Disable sensitive operations - disarm the device
            config_manager_set_armed(false);

            // Update LED to show disarmed state
            if (led_controller_is_initialized()) {
                led_controller_clear_state(LED_STATE_ARMED);
                led_controller_set_state(LED_STATE_DISARMED);
            }

            // Clear potentially compromised key
            config_manager_clear_api_key();

            // Mark device as needing setup
            config_manager_set_needs_setup(true);
        }

        return -1;
    }

    if (http_status != 200) {
        COMM_LOCK();
        g_status = SERVER_STATUS_OFFLINE;
        COMM_UNLOCK();

        LOG_WARN("Heartbeat failed: HTTP %d", http_status);
        return -1;
    }

    // Parse response with Content-Length validation
    const char *body_start = strstr(response, "\r\n\r\n");
    if (!body_start) {
        LOG_ERROR("Malformed HTTP response");
        return -1;
    }

    // Parse Content-Length header for body size validation
    // Uses strtol() instead of atoi() to detect overflow and negative values
    const char *cl_header = strstr(response, "Content-Length:");
    if (!cl_header) {
        cl_header = strstr(response, "content-length:");
    }
    size_t content_length = 0;
    if (cl_header && cl_header < body_start) {
        const char *cl_value = cl_header + 15;  // Skip "Content-Length:"
        // Skip leading whitespace
        while (*cl_value == ' ' || *cl_value == '\t') cl_value++;
        errno = 0;
        char *endptr = NULL;
        long cl_parsed = strtol(cl_value, &endptr, 10);
        if (errno == ERANGE || cl_parsed < 0 || endptr == cl_value) {
            LOG_WARN("Invalid Content-Length header value, ignoring");
            cl_parsed = 0;
        }
        content_length = (size_t)cl_parsed;
    }

    body_start += 4;  // Skip "\r\n\r\n"

    // Validate body doesn't exceed Content-Length (if provided) or response buffer
    size_t body_len = strlen(body_start);
    if (content_length > 0 && body_len > content_length) {
        // Truncate body to Content-Length for safety
        body_len = content_length;
    }

    // Validate body is reasonable size before parsing
    if (body_len == 0) {
        LOG_ERROR("Empty response body");
        return -1;
    }
    if (body_len > HTTP_BUFFER_SIZE - 512) {  // Leave room for headers
        LOG_ERROR("Response body too large: %zu bytes", body_len);
        return -1;
    }

    cJSON *resp_json = cJSON_Parse(body_start);
    if (!resp_json) {
        LOG_ERROR("Failed to parse heartbeat response");
        return -1;
    }

    // Extract response data
    heartbeat_response_t local_resp = {0};

    cJSON *server_time = cJSON_GetObjectItem(resp_json, "server_time");
    if (server_time && cJSON_IsString(server_time)) {
        strncpy(local_resp.server_time, server_time->valuestring,
                sizeof(local_resp.server_time) - 1);
        local_resp.server_time[sizeof(local_resp.server_time) - 1] = '\0';

        // Parse ISO 8601 server time and calculate drift
        // Format: "2026-01-26T14:30:00Z" or with timezone offset
        struct tm server_tm = {0};
        char *parse_result = strptime(local_resp.server_time, "%Y-%m-%dT%H:%M:%S", &server_tm);
        if (parse_result != NULL) {
            // Convert server time to Unix timestamp (assuming UTC)
            time_t server_epoch = timegm(&server_tm);
            time_t local_epoch = time(NULL);
            int64_t drift_seconds = (int64_t)(local_epoch - server_epoch);

            // Store drift in milliseconds
            local_resp.time_drift_ms = drift_seconds * 1000;

            // Log warning if drift exceeds 5 seconds
            if (drift_seconds > 5 || drift_seconds < -5) {
                LOG_WARN("Clock drift detected: %lld seconds (local %s server)",
                         (long long)drift_seconds,
                         drift_seconds > 0 ? "ahead of" : "behind");
            } else {
                LOG_DEBUG("Server time: %s, drift: %lld seconds",
                          local_resp.server_time, (long long)drift_seconds);
            }
        } else {
            LOG_DEBUG("Could not parse server time: %s", local_resp.server_time);
        }
    }

    // Check for config updates
    cJSON *cfg = cJSON_GetObjectItem(resp_json, "config");
    if (cfg && cJSON_IsObject(cfg)) {
        local_resp.has_config = true;

        cJSON *armed = cJSON_GetObjectItem(cfg, "armed");
        if (armed && cJSON_IsBool(armed)) {
            local_resp.armed = cJSON_IsTrue(armed);

            // Update local armed state if changed
            if (local_resp.armed != config_local.armed) {
                LOG_INFO("Server updated armed state to: %s",
                         local_resp.armed ? "true" : "false");
                config_manager_set_armed(local_resp.armed);

                // Update LED
                if (led_controller_is_initialized()) {
                    if (local_resp.armed) {
                        led_controller_clear_state(LED_STATE_DISARMED);
                        led_controller_set_state(LED_STATE_ARMED);
                    } else {
                        led_controller_clear_state(LED_STATE_ARMED);
                        led_controller_set_state(LED_STATE_DISARMED);
                    }
                }
            }
        }

        cJSON *detection = cJSON_GetObjectItem(cfg, "detection_enabled");
        if (detection && cJSON_IsBool(detection)) {
            local_resp.detection_enabled = cJSON_IsTrue(detection);

            // Update local detection enabled state if changed
            if (local_resp.detection_enabled != config_local.detection.enabled) {
                LOG_INFO("Server updated detection_enabled to: %s",
                         local_resp.detection_enabled ? "true" : "false");
                // Use config_manager_update with JSON to apply change
                char update_json[64];
                snprintf(update_json, sizeof(update_json),
                         "{\"detection\":{\"enabled\":%s}}",
                         local_resp.detection_enabled ? "true" : "false");
                config_manager_update(update_json, NULL);
            }
        }
    }

    cJSON_Delete(resp_json);

    // Success!
    COMM_LOCK();
    g_status = SERVER_STATUS_ONLINE;
    g_last_success_time = time(NULL);
    g_auth_fail_count = 0;  // COMM-001-6: Reset auth failure counter on success
    COMM_UNLOCK();

    // Clear offline and auth failed LED states
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_OFFLINE);
        led_controller_clear_state(LED_STATE_AUTH_FAILED);  // COMM-001-6: Clear auth failed indicator
    }

    LOG_DEBUG("Heartbeat successful");

    if (resp) {
        *resp = local_resp;
    }

    return 0;
}

// ============================================================================
// Heartbeat Thread
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static void *heartbeat_thread_func(void *arg) {
    (void)arg;

    LOG_INFO("Heartbeat thread started");

    // Initial heartbeat with retries
    for (int i = 0; i < BOOT_RETRY_COUNT && g_running; i++) {
        if (do_heartbeat(NULL) == 0) {
            break;
        }
        if (i < BOOT_RETRY_COUNT - 1) {
            LOG_INFO("Boot heartbeat retry %d/%d in %ds",
                     i + 1, BOOT_RETRY_COUNT, BOOT_RETRY_DELAY_SEC);
            for (int j = 0; j < BOOT_RETRY_DELAY_SEC && g_running; j++) {
                apis_sleep_ms(1000);
            }
        }
    }

    // Regular heartbeat loop
    uint32_t seconds_waited = 0;
    while (g_running) {
        apis_sleep_ms(1000);
        seconds_waited++;

        if (seconds_waited >= HEARTBEAT_INTERVAL_SEC) {
            do_heartbeat(NULL);
            seconds_waited = 0;
        }
    }

    LOG_INFO("Heartbeat thread exiting");
    return NULL;
}

#else // ESP32

static void heartbeat_task_func(void *arg) {
    (void)arg;

    LOG_INFO("Heartbeat task started");

    // Initial heartbeat with retries
    for (int i = 0; i < BOOT_RETRY_COUNT && g_running; i++) {
        if (do_heartbeat(NULL) == 0) {
            break;
        }
        if (i < BOOT_RETRY_COUNT - 1) {
            LOG_INFO("Boot heartbeat retry %d/%d", i + 1, BOOT_RETRY_COUNT);
            vTaskDelay(pdMS_TO_TICKS(BOOT_RETRY_DELAY_SEC * 1000));
        }
    }

    // Regular heartbeat loop
    TickType_t last_wake = xTaskGetTickCount();
    while (g_running) {
        vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(HEARTBEAT_INTERVAL_SEC * 1000));
        do_heartbeat(NULL);
    }

    LOG_INFO("Heartbeat task exiting");
    g_heartbeat_task = NULL;
    vTaskDelete(NULL);
}

#endif

// ============================================================================
// Public API
// ============================================================================

int server_comm_init(void) {
    if (g_initialized) {
        LOG_WARN("Server comm already initialized");
        return 0;
    }

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(comm);

    g_status = SERVER_STATUS_UNKNOWN;
    g_last_success_time = 0;
    g_start_time = time(NULL);
    g_initialized = true;

    LOG_INFO("Server comm initialized");
    return 0;
}

int server_comm_start(void) {
    if (!g_initialized) {
        LOG_ERROR("Server comm not initialized");
        return -1;
    }

    if (g_running) {
        LOG_WARN("Heartbeat already running");
        return 0;
    }

    g_running = true;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    if (pthread_create(&g_heartbeat_thread, NULL, heartbeat_thread_func, NULL) != 0) {
        LOG_ERROR("Failed to create heartbeat thread");
        g_running = false;
        return -1;
    }
#else
    xTaskCreate(heartbeat_task_func, "heartbeat", 4096, NULL, 5, &g_heartbeat_task);
#endif

    LOG_INFO("Heartbeat thread started");
    return 0;
}

int server_comm_send_heartbeat(heartbeat_response_t *response) {
    if (!g_initialized) {
        return -1;
    }
    return do_heartbeat(response);
}

server_status_t server_comm_get_status(void) {
    server_status_t status;
    COMM_LOCK();
    status = g_status;
    COMM_UNLOCK();
    return status;
}

int64_t server_comm_seconds_since_heartbeat(void) {
    COMM_LOCK();
    int64_t last = g_last_success_time;
    COMM_UNLOCK();

    if (last == 0) {
        return -1;
    }
    return (int64_t)(time(NULL) - last);
}

void server_comm_stop(void) {
    if (!g_running) {
        return;
    }

    g_running = false;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_join(g_heartbeat_thread, NULL);
#else
    // Wait for task to finish
    for (int i = 0; i < 20 && g_heartbeat_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }
#endif

    LOG_INFO("Heartbeat stopped");
}

void server_comm_cleanup(void) {
    if (!g_initialized) {
        return;
    }

    server_comm_stop();

    /* Mutex cleanup handled by platform_mutex lifecycle */

    g_initialized = false;
    LOG_INFO("Server comm cleanup complete");
}

bool server_comm_is_initialized(void) {
    return g_initialized;
}

bool server_comm_is_running(void) {
    return g_running;
}
