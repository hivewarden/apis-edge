/**
 * Clip Uploader implementation.
 *
 * Handles uploading detection clips to the server with:
 * - In-memory queue with disk persistence
 * - Multipart HTTP upload via POSIX sockets
 * - Exponential backoff on failure
 * - Rate limiting between uploads
 */

#include "clip_uploader.h"
#include "config_manager.h"
#include "log.h"
#include "platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <errno.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/stat.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#endif

#include "cJSON.h"

// ============================================================================
// Constants
// ============================================================================

#define HTTP_BUFFER_SIZE     8192
#define READ_CHUNK_SIZE      4096
#define BOUNDARY_STRING      "----APISUploadBoundary7MA4YWxkTrZu0gW"
#define QUEUE_FILE_PATH      "/data/apis/upload_queue.json"
#define QUEUE_FILE_VERSION   1

// ============================================================================
// Global State
// ============================================================================

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static clip_queue_entry_t g_queue[MAX_UPLOAD_QUEUE];
static uint32_t g_queue_count = 0;
static int64_t g_last_upload_time = 0;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_upload_thread;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
#define UPLOAD_LOCK()   pthread_mutex_lock(&g_mutex)
#define UPLOAD_UNLOCK() pthread_mutex_unlock(&g_mutex)
#else
static SemaphoreHandle_t g_upload_mutex = NULL;
static TaskHandle_t g_upload_task = NULL;
#define UPLOAD_LOCK()   do { if (g_upload_mutex) xSemaphoreTake(g_upload_mutex, portMAX_DELAY); } while(0)
#define UPLOAD_UNLOCK() do { if (g_upload_mutex) xSemaphoreGive(g_upload_mutex); } while(0)
#endif

// ============================================================================
// Utility Functions
// ============================================================================

const char *upload_status_name(upload_status_t status) {
    switch (status) {
        case UPLOAD_STATUS_SUCCESS:       return "SUCCESS";
        case UPLOAD_STATUS_NETWORK_ERROR: return "NETWORK_ERROR";
        case UPLOAD_STATUS_SERVER_ERROR:  return "SERVER_ERROR";
        case UPLOAD_STATUS_AUTH_ERROR:    return "AUTH_ERROR";
        case UPLOAD_STATUS_CLIENT_ERROR:  return "CLIENT_ERROR";
        case UPLOAD_STATUS_FILE_ERROR:    return "FILE_ERROR";
        case UPLOAD_STATUS_NO_CONFIG:     return "NO_CONFIG";
        default:                          return "UNKNOWN";
    }
}

uint32_t clip_uploader_retry_delay(uint32_t retry_count) {
    // Exponential backoff: 60 * 2^retry, capped at 3600 seconds
    uint32_t delay = INITIAL_RETRY_SEC;
    for (uint32_t i = 0; i < retry_count && delay < MAX_RETRY_SEC; i++) {
        delay *= 2;
    }
    if (delay > MAX_RETRY_SEC) {
        delay = MAX_RETRY_SEC;
    }
    return delay;
}

static int64_t get_current_time(void) {
    return (int64_t)time(NULL);
}

// ============================================================================
// Queue Persistence
// ============================================================================

#if defined(APIS_PLATFORM_PI)
static int save_queue_to_disk(void) {
    cJSON *root = cJSON_CreateObject();
    if (!root) return -1;

    cJSON_AddNumberToObject(root, "version", QUEUE_FILE_VERSION);

    cJSON *entries = cJSON_CreateArray();
    if (!entries) {
        cJSON_Delete(root);
        return -1;
    }

    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (g_queue[i].uploaded) continue;  // Don't persist uploaded entries

        cJSON *entry = cJSON_CreateObject();
        if (!entry) continue;

        cJSON_AddStringToObject(entry, "clip_path", g_queue[i].clip_path);
        cJSON_AddStringToObject(entry, "detection_id", g_queue[i].detection_id);
        cJSON_AddNumberToObject(entry, "retry_count", g_queue[i].retry_count);
        cJSON_AddNumberToObject(entry, "next_retry_time", (double)g_queue[i].next_retry_time);
        cJSON_AddNumberToObject(entry, "queued_time", (double)g_queue[i].queued_time);

        cJSON_AddItemToArray(entries, entry);
    }

    cJSON_AddItemToObject(root, "entries", entries);

    char *json_str = cJSON_Print(root);
    cJSON_Delete(root);

    if (!json_str) return -1;

    FILE *fp = fopen(QUEUE_FILE_PATH, "w");
    if (!fp) {
        LOG_WARN("Could not write queue file: %s", QUEUE_FILE_PATH);
        free(json_str);
        return -1;
    }

    fprintf(fp, "%s", json_str);
    fclose(fp);
    free(json_str);

    LOG_DEBUG("Queue persisted to disk (%u entries)", g_queue_count);
    return 0;
}

static int load_queue_from_disk(void) {
    FILE *fp = fopen(QUEUE_FILE_PATH, "r");
    if (!fp) {
        LOG_DEBUG("No existing queue file found");
        return 0;  // Not an error
    }

    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    if (size <= 0 || size > 1024 * 1024) {  // Max 1MB
        fclose(fp);
        return -1;
    }

    char *json_str = malloc(size + 1);
    if (!json_str) {
        fclose(fp);
        return -1;
    }

    size_t read = fread(json_str, 1, size, fp);
    fclose(fp);
    json_str[read] = '\0';

    cJSON *root = cJSON_Parse(json_str);
    free(json_str);

    if (!root) {
        LOG_WARN("Failed to parse queue file");
        return -1;
    }

    cJSON *entries = cJSON_GetObjectItem(root, "entries");
    if (!entries || !cJSON_IsArray(entries)) {
        cJSON_Delete(root);
        return -1;
    }

    g_queue_count = 0;
    cJSON *entry;
    cJSON_ArrayForEach(entry, entries) {
        if (g_queue_count >= MAX_UPLOAD_QUEUE) break;

        cJSON *path = cJSON_GetObjectItem(entry, "clip_path");
        cJSON *det_id = cJSON_GetObjectItem(entry, "detection_id");
        cJSON *retry = cJSON_GetObjectItem(entry, "retry_count");
        cJSON *next_time = cJSON_GetObjectItem(entry, "next_retry_time");
        cJSON *queued = cJSON_GetObjectItem(entry, "queued_time");

        if (!path || !cJSON_IsString(path)) continue;

        clip_queue_entry_t *e = &g_queue[g_queue_count];
        memset(e, 0, sizeof(*e));

        strncpy(e->clip_path, path->valuestring, CLIP_PATH_MAX - 1);

        if (det_id && cJSON_IsString(det_id)) {
            strncpy(e->detection_id, det_id->valuestring, DETECTION_ID_MAX - 1);
        }

        if (retry && cJSON_IsNumber(retry)) {
            e->retry_count = (uint32_t)retry->valueint;
        }

        if (next_time && cJSON_IsNumber(next_time)) {
            e->next_retry_time = (int64_t)next_time->valuedouble;
        }

        if (queued && cJSON_IsNumber(queued)) {
            e->queued_time = (int64_t)queued->valuedouble;
        }

        e->uploaded = false;
        g_queue_count++;
    }

    cJSON_Delete(root);

    LOG_INFO("Loaded %u clips from queue file", g_queue_count);
    return 0;
}
#else
// Test/ESP32: No disk persistence
static int save_queue_to_disk(void) { return 0; }
static int load_queue_from_disk(void) { return 0; }
#endif

// ============================================================================
// Queue Management
// ============================================================================

static void compact_queue(void) {
    // Remove uploaded entries and compact
    uint32_t write_idx = 0;
    for (uint32_t read_idx = 0; read_idx < g_queue_count; read_idx++) {
        if (!g_queue[read_idx].uploaded) {
            if (write_idx != read_idx) {
                g_queue[write_idx] = g_queue[read_idx];
            }
            write_idx++;
        }
    }
    g_queue_count = write_idx;
}

static int find_next_uploadable(void) {
    int64_t now = get_current_time();
    int oldest_idx = -1;
    int64_t oldest_time = 0;

    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (g_queue[i].uploaded) continue;
        if (g_queue[i].next_retry_time > now) continue;  // Not ready for retry

        // Find oldest (FIFO)
        if (oldest_idx < 0 || g_queue[i].queued_time < oldest_time) {
            oldest_idx = (int)i;
            oldest_time = g_queue[i].queued_time;
        }
    }

    return oldest_idx;
}

// ============================================================================
// URL Parsing (shared with server_comm)
// ============================================================================

static int parse_url(const char *url, char *host, size_t host_len,
                     uint16_t *port, char *path, size_t path_len) {
    *port = 80;
    strncpy(path, "/api/units/clips", path_len - 1);
    path[path_len - 1] = '\0';

    if (!url || strlen(url) == 0) {
        return -1;
    }

    const char *start = url;

    if (strncmp(url, "https://", 8) == 0) {
        start = url + 8;
        *port = 443;
    } else if (strncmp(url, "http://", 7) == 0) {
        start = url + 7;
        *port = 80;
    }

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

    if (*host_end == ':') {
        *port = (uint16_t)atoi(host_end + 1);
        while (*host_end && *host_end != '/') {
            host_end++;
        }
    }

    // For clip uploads, always use /api/units/clips regardless of URL path

    return 0;
}

// ============================================================================
// HTTP Multipart Upload
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static long get_file_size(const char *filepath) {
    struct stat st;
    if (stat(filepath, &st) != 0) {
        return -1;
    }
    return st.st_size;
}

static upload_status_t do_upload(clip_queue_entry_t *entry) {
    const runtime_config_t *config = config_manager_get();
    if (!config) {
        return UPLOAD_STATUS_NO_CONFIG;
    }

    if (strlen(config->server.url) == 0) {
        LOG_DEBUG("No server URL configured, skipping upload");
        return UPLOAD_STATUS_NO_CONFIG;
    }

    // Check if file exists
    long file_size = get_file_size(entry->clip_path);
    if (file_size < 0) {
        LOG_ERROR("Clip file not found: %s", entry->clip_path);
        return UPLOAD_STATUS_FILE_ERROR;
    }

    // Parse server URL
    char host[256];
    uint16_t port;
    char path[256];
    if (parse_url(config->server.url, host, sizeof(host), &port, path, sizeof(path)) < 0) {
        LOG_ERROR("Invalid server URL: %s", config->server.url);
        return UPLOAD_STATUS_NO_CONFIG;
    }

    // Extract filename from path
    const char *filename = strrchr(entry->clip_path, '/');
    if (filename) {
        filename++;  // Skip '/'
    } else {
        filename = entry->clip_path;
    }

    // Build multipart body header
    char body_header[1024];
    int header_len = snprintf(body_header, sizeof(body_header),
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"detection_id\"\r\n"
        "\r\n"
        "%s\r\n"
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"clip\"; filename=\"%s\"\r\n"
        "Content-Type: video/mp4\r\n"
        "\r\n",
        BOUNDARY_STRING, entry->detection_id,
        BOUNDARY_STRING, filename);

    // Build multipart body footer
    char body_footer[64];
    int footer_len = snprintf(body_footer, sizeof(body_footer),
        "\r\n--%s--\r\n", BOUNDARY_STRING);

    // Calculate total content length
    size_t content_length = header_len + file_size + footer_len;

    // Resolve hostname
    struct hostent *he = gethostbyname(host);
    if (!he) {
        LOG_ERROR("Failed to resolve host: %s", host);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Create socket
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        LOG_ERROR("Failed to create socket: %s", strerror(errno));
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Set timeouts
    struct timeval timeout = {
        .tv_sec = UPLOAD_TIMEOUT_SEC,
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
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Build HTTP headers
    char http_header[1024];
    int hdr_len = snprintf(http_header, sizeof(http_header),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "X-API-Key: %s\r\n"
        "Content-Type: multipart/form-data; boundary=%s\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n",
        path, host, config->server.api_key, BOUNDARY_STRING, content_length);

    // Send HTTP headers
    if (send(sock, http_header, hdr_len, 0) < 0) {
        LOG_ERROR("Failed to send headers: %s", strerror(errno));
        close(sock);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Send multipart header
    if (send(sock, body_header, header_len, 0) < 0) {
        LOG_ERROR("Failed to send body header: %s", strerror(errno));
        close(sock);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Send file content
    FILE *fp = fopen(entry->clip_path, "rb");
    if (!fp) {
        LOG_ERROR("Failed to open clip file: %s", entry->clip_path);
        close(sock);
        return UPLOAD_STATUS_FILE_ERROR;
    }

    char chunk[READ_CHUNK_SIZE];
    size_t bytes_sent = 0;
    while (!feof(fp)) {
        size_t read = fread(chunk, 1, sizeof(chunk), fp);
        if (read > 0) {
            ssize_t sent = send(sock, chunk, read, 0);
            if (sent < 0) {
                LOG_ERROR("Failed to send file data: %s", strerror(errno));
                fclose(fp);
                close(sock);
                return UPLOAD_STATUS_NETWORK_ERROR;
            }
            bytes_sent += sent;
        }
    }
    fclose(fp);

    // Send multipart footer
    if (send(sock, body_footer, footer_len, 0) < 0) {
        LOG_ERROR("Failed to send body footer: %s", strerror(errno));
        close(sock);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    LOG_DEBUG("Sent %zu bytes for clip upload", bytes_sent);

    // Receive response
    char response[HTTP_BUFFER_SIZE];
    ssize_t received = recv(sock, response, sizeof(response) - 1, 0);
    close(sock);

    if (received <= 0) {
        LOG_ERROR("Failed to receive response: %s",
                  received < 0 ? strerror(errno) : "connection closed");
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    response[received] = '\0';

    // Parse HTTP status
    int http_status = 0;
    if (sscanf(response, "HTTP/1.1 %d", &http_status) != 1 &&
        sscanf(response, "HTTP/1.0 %d", &http_status) != 1) {
        LOG_ERROR("Failed to parse HTTP status");
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Check status
    if (http_status == 201) {
        LOG_INFO("Clip uploaded successfully: %s", entry->clip_path);
        return UPLOAD_STATUS_SUCCESS;
    }

    if (http_status == 401 || http_status == 403) {
        LOG_ERROR("Upload auth failed (HTTP %d)", http_status);
        return UPLOAD_STATUS_AUTH_ERROR;
    }

    if (http_status >= 500) {
        LOG_WARN("Server error (HTTP %d)", http_status);
        return UPLOAD_STATUS_SERVER_ERROR;
    }

    LOG_WARN("Client error (HTTP %d)", http_status);
    return UPLOAD_STATUS_CLIENT_ERROR;
}

#else  // ESP32

static upload_status_t do_upload(clip_queue_entry_t *entry) {
    // TODO: Implement ESP-IDF HTTP client upload
    (void)entry;
    return UPLOAD_STATUS_NO_CONFIG;
}

#endif

// ============================================================================
// Upload Thread
// ============================================================================

static void process_upload_queue(void) {
    UPLOAD_LOCK();
    int idx = find_next_uploadable();
    if (idx < 0) {
        UPLOAD_UNLOCK();
        return;
    }

    // Check rate limit
    int64_t now = get_current_time();
    if (g_last_upload_time > 0 && now - g_last_upload_time < MIN_UPLOAD_INTERVAL_SEC) {
        UPLOAD_UNLOCK();
        return;
    }

    // Copy entry for upload (so we can release lock)
    clip_queue_entry_t entry = g_queue[idx];
    UPLOAD_UNLOCK();

    // Perform upload (may take a while)
    upload_status_t status = do_upload(&entry);

    UPLOAD_LOCK();

    // Find entry again (may have moved)
    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (strcmp(g_queue[i].clip_path, entry.clip_path) == 0 &&
            strcmp(g_queue[i].detection_id, entry.detection_id) == 0) {

            if (status == UPLOAD_STATUS_SUCCESS) {
                g_queue[i].uploaded = true;
                g_last_upload_time = get_current_time();
                compact_queue();
                save_queue_to_disk();
            } else if (status == UPLOAD_STATUS_FILE_ERROR ||
                       status == UPLOAD_STATUS_CLIENT_ERROR) {
                // Permanent failure - remove from queue
                LOG_WARN("Clip upload failed permanently: %s", entry.clip_path);
                g_queue[i].uploaded = true;  // Mark for removal
                compact_queue();
                save_queue_to_disk();
            } else {
                // Retry with backoff
                g_queue[i].retry_count++;
                uint32_t delay = clip_uploader_retry_delay(g_queue[i].retry_count);
                g_queue[i].next_retry_time = get_current_time() + delay;
                LOG_INFO("Will retry upload in %u seconds (attempt %u)",
                         delay, g_queue[i].retry_count);
                save_queue_to_disk();
            }
            break;
        }
    }

    UPLOAD_UNLOCK();
}

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)

static void *upload_thread_func(void *arg) {
    (void)arg;

    LOG_INFO("Upload thread started");

    while (g_running) {
        process_upload_queue();

        // Sleep in small increments to allow quick shutdown
        for (int i = 0; i < QUEUE_CHECK_INTERVAL_MS / 100 && g_running; i++) {
            apis_sleep_ms(100);
        }
    }

    LOG_INFO("Upload thread exiting");
    return NULL;
}

#else  // ESP32

static void upload_task_func(void *arg) {
    (void)arg;

    LOG_INFO("Upload task started");

    while (g_running) {
        process_upload_queue();
        vTaskDelay(pdMS_TO_TICKS(QUEUE_CHECK_INTERVAL_MS));
    }

    LOG_INFO("Upload task exiting");
    g_upload_task = NULL;
    vTaskDelete(NULL);
}

#endif

// ============================================================================
// Public API
// ============================================================================

int clip_uploader_init(void) {
    if (g_initialized) {
        LOG_WARN("Clip uploader already initialized");
        return 0;
    }

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    // ESP32: Create mutex
    if (g_upload_mutex == NULL) {
        g_upload_mutex = xSemaphoreCreateMutex();
        if (g_upload_mutex == NULL) {
            LOG_ERROR("Failed to create upload mutex");
            return -1;
        }
    }
#endif

    // Initialize queue
    memset(g_queue, 0, sizeof(g_queue));
    g_queue_count = 0;
    g_last_upload_time = 0;

    // Load persistent queue
    load_queue_from_disk();

    g_initialized = true;
    LOG_INFO("Clip uploader initialized (%u clips in queue)", g_queue_count);

    return 0;
}

int clip_uploader_start(void) {
    if (!g_initialized) {
        LOG_ERROR("Clip uploader not initialized");
        return -1;
    }

    if (g_running) {
        LOG_WARN("Upload thread already running");
        return 0;
    }

    g_running = true;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    if (pthread_create(&g_upload_thread, NULL, upload_thread_func, NULL) != 0) {
        LOG_ERROR("Failed to create upload thread");
        g_running = false;
        return -1;
    }
#else
    xTaskCreate(upload_task_func, "clip_upload", 8192, NULL, 4, &g_upload_task);
#endif

    LOG_INFO("Upload thread started");
    return 0;
}

int clip_uploader_queue(const char *clip_path, const char *detection_id) {
    if (!g_initialized) {
        return -1;
    }

    if (!clip_path || strlen(clip_path) == 0) {
        return -1;
    }

    UPLOAD_LOCK();

    // Check if already in queue
    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (strcmp(g_queue[i].clip_path, clip_path) == 0) {
            LOG_DEBUG("Clip already in queue: %s", clip_path);
            UPLOAD_UNLOCK();
            return 0;
        }
    }

    // Check if queue is full
    if (g_queue_count >= MAX_UPLOAD_QUEUE) {
        // Drop oldest unuploaded clip
        int oldest_idx = -1;
        int64_t oldest_time = 0;

        for (uint32_t i = 0; i < g_queue_count; i++) {
            if (!g_queue[i].uploaded) {
                if (oldest_idx < 0 || g_queue[i].queued_time < oldest_time) {
                    oldest_idx = (int)i;
                    oldest_time = g_queue[i].queued_time;
                }
            }
        }

        if (oldest_idx >= 0) {
            LOG_WARN("Queue full, dropping oldest clip: %s",
                     g_queue[oldest_idx].clip_path);
            g_queue[oldest_idx].uploaded = true;  // Mark for removal
            compact_queue();
        }
    }

    // Add new entry
    if (g_queue_count < MAX_UPLOAD_QUEUE) {
        clip_queue_entry_t *entry = &g_queue[g_queue_count];
        memset(entry, 0, sizeof(*entry));

        strncpy(entry->clip_path, clip_path, CLIP_PATH_MAX - 1);
        if (detection_id) {
            strncpy(entry->detection_id, detection_id, DETECTION_ID_MAX - 1);
        }
        entry->queued_time = get_current_time();
        entry->next_retry_time = 0;  // Upload immediately
        entry->retry_count = 0;
        entry->uploaded = false;

        g_queue_count++;

        LOG_INFO("Clip queued for upload: %s", clip_path);
        save_queue_to_disk();
    }

    UPLOAD_UNLOCK();

    return 0;
}

uint32_t clip_uploader_pending_count(void) {
    if (!g_initialized) {
        return 0;
    }

    UPLOAD_LOCK();
    uint32_t count = 0;
    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (!g_queue[i].uploaded) {
            count++;
        }
    }
    UPLOAD_UNLOCK();

    return count;
}

int clip_uploader_get_stats(upload_stats_t *stats) {
    if (!stats) {
        return -1;
    }

    if (!g_initialized) {
        memset(stats, 0, sizeof(*stats));
        return 0;
    }

    UPLOAD_LOCK();

    int64_t now = get_current_time();

    memset(stats, 0, sizeof(*stats));
    stats->last_upload_time = g_last_upload_time;
    stats->oldest_pending_time = 0;

    for (uint32_t i = 0; i < g_queue_count; i++) {
        if (g_queue[i].uploaded) {
            stats->uploaded_count++;
        } else if (g_queue[i].next_retry_time > now) {
            stats->retry_count++;
            stats->pending_count++;
        } else {
            stats->pending_count++;
        }

        // Track oldest pending
        if (!g_queue[i].uploaded) {
            if (stats->oldest_pending_time == 0 ||
                g_queue[i].queued_time < stats->oldest_pending_time) {
                stats->oldest_pending_time = g_queue[i].queued_time;
            }
        }
    }

    UPLOAD_UNLOCK();

    return 0;
}

void clip_uploader_stop(void) {
    if (!g_running) {
        return;
    }

    g_running = false;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_join(g_upload_thread, NULL);
#else
    for (int i = 0; i < 50 && g_upload_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }
#endif

    LOG_INFO("Upload thread stopped");
}

void clip_uploader_cleanup(void) {
    if (!g_initialized) {
        return;
    }

    clip_uploader_stop();

    // Persist queue before cleanup
    UPLOAD_LOCK();
    save_queue_to_disk();
    UPLOAD_UNLOCK();

#if !defined(APIS_PLATFORM_PI) && !defined(APIS_PLATFORM_TEST)
    if (g_upload_mutex != NULL) {
        vSemaphoreDelete(g_upload_mutex);
        g_upload_mutex = NULL;
    }
#endif

    g_initialized = false;
    LOG_INFO("Clip uploader cleanup complete");
}

bool clip_uploader_is_initialized(void) {
    return g_initialized;
}

bool clip_uploader_is_running(void) {
    return g_running;
}

// ============================================================================
// Testing Support
// ============================================================================

void clip_uploader_clear_queue(void) {
    UPLOAD_LOCK();
    memset(g_queue, 0, sizeof(g_queue));
    g_queue_count = 0;
    UPLOAD_UNLOCK();
}

int clip_uploader_get_entry(uint32_t index, clip_queue_entry_t *entry) {
    if (!entry) {
        return -1;
    }

    UPLOAD_LOCK();

    if (index >= g_queue_count) {
        UPLOAD_UNLOCK();
        return -1;
    }

    *entry = g_queue[index];
    UPLOAD_UNLOCK();

    return 0;
}
