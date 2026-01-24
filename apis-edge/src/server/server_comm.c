/**
 * Server Communication implementation.
 *
 * Handles heartbeat communication with the APIS server.
 * Uses POSIX sockets for HTTP POST requests.
 */

#include "server_comm.h"
#include "config_manager.h"
#include "led_controller.h"
#include "clip_uploader.h"
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
#include <pthread.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#endif

#include "cJSON.h"

// ============================================================================
// Constants
// ============================================================================

#define HTTP_BUFFER_SIZE    4096
#define FIRMWARE_VERSION    "1.0.0"
#define DEFAULT_SERVER_PORT 443

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static volatile server_status_t g_status = SERVER_STATUS_UNKNOWN;
static volatile int64_t g_last_success_time = 0;  // Unix timestamp of last success
static time_t g_start_time = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_heartbeat_thread;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define COMM_LOCK()   pthread_mutex_lock(&g_mutex)
#define COMM_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_comm_mutex = NULL;
static TaskHandle_t g_heartbeat_task = NULL;
#define COMM_LOCK()   do { if (g_comm_mutex) xSemaphoreTake(g_comm_mutex, portMAX_DELAY); } while(0)
#define COMM_UNLOCK() do { if (g_comm_mutex) xSemaphoreGive(g_comm_mutex); } while(0)
#endif

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

// Parse URL into host, port, path
static int parse_url(const char *url, char *host, size_t host_len,
                     uint16_t *port, char *path, size_t path_len) {
    // Default values
    *port = 80;
    strncpy(path, "/api/units/heartbeat", path_len - 1);
    path[path_len - 1] = '\0';

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
        host_part_len = host_len - 1;
    }
    memcpy(host, start, host_part_len);
    host[host_part_len] = '\0';

    // Check for port
    if (*host_end == ':') {
        *port = (uint16_t)atoi(host_end + 1);
        // Skip to path
        while (*host_end && *host_end != '/') {
            host_end++;
        }
    }

    // Check for path
    if (*host_end == '/') {
        strncpy(path, host_end, path_len - 1);
        path[path_len - 1] = '\0';
    }

    return 0;
}

// ============================================================================
// HTTP Client
// ============================================================================

static int http_post(const char *host, uint16_t port, const char *path,
                     const char *api_key, const char *body,
                     char *response, size_t response_size, int *http_status) {
    *http_status = 0;

    // Resolve hostname
    struct hostent *he = gethostbyname(host);
    if (!he) {
        LOG_ERROR("Failed to resolve host: %s", host);
        return -1;
    }

    // Create socket
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        LOG_ERROR("Failed to create socket: %s", strerror(errno));
        return -1;
    }

    // Set timeouts
    struct timeval timeout = {
        .tv_sec = HEARTBEAT_TIMEOUT_SEC,
        .tv_usec = 0
    };
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));

    // Connect
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
    };
    memcpy(&addr.sin_addr, he->h_addr, he->h_length);

    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        LOG_ERROR("Failed to connect to %s:%d: %s", host, port, strerror(errno));
        close(sock);
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

    // Send request
    if (send(sock, request, req_len, 0) < 0) {
        LOG_ERROR("Failed to send request: %s", strerror(errno));
        close(sock);
        return -1;
    }

    // Receive response
    ssize_t received = recv(sock, response, response_size - 1, 0);
    close(sock);

    if (received <= 0) {
        if (received < 0) {
            LOG_ERROR("Failed to receive response: %s", strerror(errno));
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

// ============================================================================
// Heartbeat Logic
// ============================================================================

static int do_heartbeat(heartbeat_response_t *resp) {
    const runtime_config_t *config = config_manager_get();
    if (!config) {
        LOG_ERROR("No configuration available");
        return -1;
    }

    // Check if server is configured
    if (strlen(config->server.url) == 0) {
        LOG_DEBUG("No server URL configured, skipping heartbeat");
        return -1;
    }

    // Parse server URL
    char host[256];
    uint16_t port;
    char path[256];
    if (parse_url(config->server.url, host, sizeof(host), &port, path, sizeof(path)) < 0) {
        LOG_ERROR("Invalid server URL: %s", config->server.url);
        return -1;
    }

    // Build request body
    cJSON *req_json = cJSON_CreateObject();
    cJSON_AddBoolToObject(req_json, "armed", config->armed);
    cJSON_AddStringToObject(req_json, "firmware_version", FIRMWARE_VERSION);
    cJSON_AddNumberToObject(req_json, "uptime_seconds", get_uptime_seconds());
    cJSON_AddNumberToObject(req_json, "free_storage_mb", 1024);  // TODO: Get from storage_manager
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
    int result = http_post(host, port, path, config->server.api_key,
                           body, response, sizeof(response), &http_status);
    free(body);

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
        COMM_UNLOCK();

        LOG_ERROR("Heartbeat failed: authentication error (HTTP %d)", http_status);
        return -1;
    }

    if (http_status != 200) {
        COMM_LOCK();
        g_status = SERVER_STATUS_OFFLINE;
        COMM_UNLOCK();

        LOG_WARN("Heartbeat failed: HTTP %d", http_status);
        return -1;
    }

    // Parse response
    const char *body_start = strstr(response, "\r\n\r\n");
    if (!body_start) {
        LOG_ERROR("Malformed HTTP response");
        return -1;
    }
    body_start += 4;

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

        // TODO: Parse server time and calculate drift
        // For now, just log it
        LOG_DEBUG("Server time: %s", local_resp.server_time);
    }

    // Check for config updates
    cJSON *cfg = cJSON_GetObjectItem(resp_json, "config");
    if (cfg && cJSON_IsObject(cfg)) {
        local_resp.has_config = true;

        cJSON *armed = cJSON_GetObjectItem(cfg, "armed");
        if (armed && cJSON_IsBool(armed)) {
            local_resp.armed = cJSON_IsTrue(armed);

            // Update local armed state if changed
            if (local_resp.armed != config->armed) {
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
        }
    }

    cJSON_Delete(resp_json);

    // Success!
    COMM_LOCK();
    g_status = SERVER_STATUS_ONLINE;
    g_last_success_time = time(NULL);
    COMM_UNLOCK();

    // Clear offline LED state
    if (led_controller_is_initialized()) {
        led_controller_clear_state(LED_STATE_OFFLINE);
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

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Create mutex
    if (g_comm_mutex == NULL) {
        g_comm_mutex = xSemaphoreCreateMutex();
        if (g_comm_mutex == NULL) {
            LOG_ERROR("Failed to create server comm mutex");
            return -1;
        }
    }
#endif

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

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_comm_mutex != NULL) {
        vSemaphoreDelete(g_comm_mutex);
        g_comm_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("Server comm cleanup complete");
}

bool server_comm_is_initialized(void) {
    return g_initialized;
}

bool server_comm_is_running(void) {
    return g_running;
}
