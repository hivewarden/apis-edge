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
#include <stdint.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/* pthread.h pulled in by platform_mutex.h */
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <limits.h>
#else
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
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

// Security Helpers (COMM-001-4 fix)
#include "secure_util.h"

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
#else
static TaskHandle_t g_upload_task = NULL;
#endif

#include "platform_mutex.h"
APIS_MUTEX_DECLARE(upload);
#define UPLOAD_LOCK()   APIS_MUTEX_LOCK(upload)
#define UPLOAD_UNLOCK() APIS_MUTEX_UNLOCK(upload)

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

    // Atomic write: write to temp file, then rename to final path.
    // This prevents queue file corruption if power is lost during write.
    static const char *queue_tmp_path = QUEUE_FILE_PATH ".tmp";

    int queue_fd = open(queue_tmp_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (queue_fd < 0) {
        LOG_WARN("Could not open temp queue file for writing: %s", queue_tmp_path);
        free(json_str);
        return -1;
    }
    FILE *fp = fdopen(queue_fd, "w");
    if (!fp) {
        LOG_WARN("Could not fdopen temp queue file: %s", queue_tmp_path);
        close(queue_fd);
        free(json_str);
        return -1;
    }

    fprintf(fp, "%s", json_str);
    fclose(fp);
    free(json_str);

    // Atomic rename: replaces the old queue file in one operation
    if (rename(queue_tmp_path, QUEUE_FILE_PATH) != 0) {
        LOG_WARN("Failed to rename temp queue file: %s", strerror(errno));
        unlink(queue_tmp_path);
        return -1;
    }

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
        e->clip_path[CLIP_PATH_MAX - 1] = '\0';  // I5 fix: Explicit null termination

        if (det_id && cJSON_IsString(det_id)) {
            strncpy(e->detection_id, det_id->valuestring, DETECTION_ID_MAX - 1);
            e->detection_id[DETECTION_ID_MAX - 1] = '\0';  // I5 fix: Explicit null termination
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
// S8-M6 TODO: On ESP32, implement queue persistence via NVS (Non-Volatile Storage)
// or SPIFFS to survive power cycles. Currently queued clips are lost on reboot.
// Suggested approach: Store serialized queue in NVS blob with versioned format.
static int save_queue_to_disk(void) { return 0; }
static int load_queue_from_disk(void) { return 0; }
#endif

// ============================================================================
// Path Traversal Protection
// ============================================================================

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
/**
 * Check if a path is safely contained within a base directory.
 * Uses realpath() to resolve symlinks and ".." components.
 * Returns true if safe, false if path escapes base_dir or cannot be resolved.
 *
 * NOTE: On ESP32, realpath() is not available. This function is only
 * compiled for Pi/Test platforms. ESP32 uses a simpler string check.
 */
static bool is_safe_path(const char *path, const char *base_dir) {
    if (!path || !base_dir) return false;

    char resolved_path[PATH_MAX];
    char resolved_base[PATH_MAX];

    // Resolve base dir (must exist)
    if (realpath(base_dir, resolved_base) == NULL) {
        // Fallback: string-based traversal check when dirs don't exist (e.g. tests)
        // Reject any path containing ".." components
        if (strstr(path, "..") != NULL) {
            LOG_WARN("Path traversal detected (string check): %s", path);
            return false;
        }
        // Check that path starts with base_dir prefix
        size_t base_len = strlen(base_dir);
        if (strncmp(path, base_dir, base_len) == 0 &&
            (path[base_len] == '/' || path[base_len] == '\0')) {
            return true;
        }
        LOG_WARN("Path %s not under expected base %s", path, base_dir);
        return false;
    }

    // Resolve the target path
    // If the file doesn't exist yet, resolve the parent directory
    if (realpath(path, resolved_path) == NULL) {
        // File might not exist yet; check parent directory
        char path_copy[PATH_MAX];
        strncpy(path_copy, path, sizeof(path_copy) - 1);
        path_copy[sizeof(path_copy) - 1] = '\0';

        char *last_slash = strrchr(path_copy, '/');
        if (last_slash) {
            *last_slash = '\0';
            if (realpath(path_copy, resolved_path) == NULL) {
                // Parent also doesn't exist; fall back to string check
                if (strstr(path, "..") != NULL) {
                    LOG_WARN("Path traversal detected (string check): %s", path);
                    return false;
                }
                size_t base_len = strlen(resolved_base);
                if (strncmp(path, base_dir, strlen(base_dir)) == 0) {
                    return true;
                }
                LOG_WARN("Cannot resolve parent directory of: %s", path);
                return false;
            }
        } else {
            // No directory component - relative to cwd
            if (realpath(".", resolved_path) == NULL) {
                return false;
            }
        }
    }

    // Check that resolved path starts with resolved base
    size_t base_len = strlen(resolved_base);
    if (strncmp(resolved_path, resolved_base, base_len) != 0) {
        LOG_WARN("Path traversal detected: %s escapes %s", path, base_dir);
        return false;
    }

    // Ensure the character after the base prefix is '/' or '\0'
    if (resolved_path[base_len] != '/' && resolved_path[base_len] != '\0') {
        LOG_WARN("Path traversal detected: %s escapes %s (partial match)", path, base_dir);
        return false;
    }

    return true;
}
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
// URL Parsing (I8 fix: uses shared http_utils)
// ============================================================================

// Clip uploads always use /api/units/clips endpoint
#define CLIP_UPLOAD_PATH "/api/units/clips"

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
    // Resources managed by goto cleanup
    upload_status_t status = UPLOAD_STATUS_NETWORK_ERROR;
    struct addrinfo *addrinfo_result = NULL;
    int sock = -1;
    FILE *fp = NULL;
    tls_context_t *tls_ctx = NULL;
    bool secrets_cleared = false;

    // S8-C3 fix: Use thread-safe snapshot instead of raw pointer
    runtime_config_t config_snap;
    config_manager_get_snapshot(&config_snap);

    // Snapshot the fields we need
    char server_url[CFG_MAX_URL_LEN];
    char api_key_copy[CFG_MAX_API_KEY_LEN];
    char http_header[1024];
    memset(http_header, 0, sizeof(http_header));

    strncpy(server_url, config_snap.server.url, sizeof(server_url) - 1);
    server_url[sizeof(server_url) - 1] = '\0';
    strncpy(api_key_copy, config_snap.server.api_key, sizeof(api_key_copy) - 1);
    api_key_copy[sizeof(api_key_copy) - 1] = '\0';

    // Clear sensitive data from stack snapshot
    memset(config_snap.server.api_key, 0, sizeof(config_snap.server.api_key));

    if (strlen(server_url) == 0) {
        LOG_DEBUG("No server URL configured, skipping upload");
        status = UPLOAD_STATUS_NO_CONFIG;
        goto cleanup;
    }

    // Check if file exists
    long file_size = get_file_size(entry->clip_path);
    if (file_size < 0) {
        LOG_ERROR("Clip file not found: %s", entry->clip_path);
        status = UPLOAD_STATUS_FILE_ERROR;
        goto cleanup;
    }

    // Parse server URL (I8 fix: uses shared http_parse_url)
    char host[256];
    uint16_t port;
    char path[256];
    if (http_parse_url(server_url, host, sizeof(host), &port, path, sizeof(path),
                       CLIP_UPLOAD_PATH) < 0) {
        LOG_ERROR("Invalid server URL: %s", server_url);
        status = UPLOAD_STATUS_NO_CONFIG;
        goto cleanup;
    }

    // Determine if HTTPS should be used based on URL scheme
    bool use_tls = false;
    if (strncmp(server_url, "https://", 8) == 0) {
        if (tls_available()) {
            use_tls = true;
            LOG_DEBUG("Using TLS for clip upload to %s:%u", host, port);
        } else {
            // S8-H1 fix: Refuse to silently downgrade from HTTPS to plain HTTP.
            LOG_ERROR("Server URL requires HTTPS but TLS is not available. "
                      "Refusing to send credentials over plain HTTP for clip upload.");
            status = UPLOAD_STATUS_NETWORK_ERROR;
            goto cleanup;
        }
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

    // Content-Length overflow check
    if (file_size > (long)(SIZE_MAX - (size_t)header_len - (size_t)footer_len)) {
        LOG_ERROR("Content-Length overflow: file_size=%ld, header=%d, footer=%d",
                  file_size, header_len, footer_len);
        status = UPLOAD_STATUS_FILE_ERROR;
        goto cleanup;
    }

    // Calculate total content length
    size_t content_length = (size_t)header_len + (size_t)file_size + (size_t)footer_len;

    // Build HTTP headers (used by both TLS and plain paths)
    int hdr_len = snprintf(http_header, sizeof(http_header),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "X-API-Key: %s\r\n"
        "Content-Type: multipart/form-data; boundary=%s\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n",
        path, host, api_key_copy, BOUNDARY_STRING, content_length);

    // ---- TLS upload path ----
    if (use_tls) {
        tls_ctx = tls_connect(host, port);
        if (!tls_ctx) {
            LOG_ERROR("TLS connection to %s:%d failed for clip upload", host, port);
            goto cleanup;
        }

        if (tls_write(tls_ctx, http_header, hdr_len) < 0) {
            LOG_ERROR("Failed to send headers over TLS");
            goto cleanup;
        }
        secure_clear(http_header, sizeof(http_header));
        secure_clear(api_key_copy, sizeof(api_key_copy));
        secrets_cleared = true;

        if (tls_write(tls_ctx, body_header, header_len) < 0) {
            LOG_ERROR("Failed to send body header over TLS");
            goto cleanup;
        }

        fp = fopen(entry->clip_path, "rb");
        if (!fp) {
            LOG_ERROR("Failed to open clip file: %s", entry->clip_path);
            status = UPLOAD_STATUS_FILE_ERROR;
            goto cleanup;
        }

        char chunk[READ_CHUNK_SIZE];
        size_t bytes_sent = 0;
        while (!feof(fp)) {
            size_t rd = fread(chunk, 1, sizeof(chunk), fp);
            if (rd > 0) {
                int sent = tls_write(tls_ctx, chunk, rd);
                if (sent < 0) {
                    LOG_ERROR("Failed to send file data over TLS");
                    goto cleanup;
                }
                bytes_sent += (size_t)sent;
            }
        }
        fclose(fp);
        fp = NULL;

        if (tls_write(tls_ctx, body_footer, footer_len) < 0) {
            LOG_ERROR("Failed to send body footer over TLS");
            goto cleanup;
        }

        LOG_DEBUG("Sent %zu bytes for clip upload (TLS)", bytes_sent);

        char response[HTTP_BUFFER_SIZE];
        int received = tls_read(tls_ctx, response, sizeof(response) - 1);
        tls_close(tls_ctx);
        tls_ctx = NULL;

        if (received <= 0) {
            LOG_ERROR("Failed to receive TLS response for clip upload");
            goto cleanup;
        }

        response[received] = '\0';

        int http_status = 0;
        if (sscanf(response, "HTTP/1.1 %d", &http_status) != 1 &&
            sscanf(response, "HTTP/1.0 %d", &http_status) != 1) {
            LOG_ERROR("Failed to parse HTTP status");
            goto cleanup;
        }

        if (http_status == 201) {
            LOG_INFO("Clip uploaded successfully (TLS): %s", entry->clip_path);
            status = UPLOAD_STATUS_SUCCESS;
            goto cleanup;
        }
        if (http_status == 401 || http_status == 403) {
            LOG_ERROR("Upload auth failed (HTTP %d)", http_status);
            status = UPLOAD_STATUS_AUTH_ERROR;
            goto cleanup;
        }
        if (http_status >= 500) {
            LOG_WARN("Server error (HTTP %d)", http_status);
            status = UPLOAD_STATUS_SERVER_ERROR;
            goto cleanup;
        }
        LOG_WARN("Client error (HTTP %d)", http_status);
        status = UPLOAD_STATUS_CLIENT_ERROR;
        goto cleanup;
    }

    // ---- Plain HTTP upload path (no TLS) ----

    // MEMORY-001-9 fix: Use getaddrinfo instead of gethostbyname (thread-safe)
    {
        struct addrinfo hints = {0};
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;

        char port_str[16];
        snprintf(port_str, sizeof(port_str), "%u", port);

        int gai_err = getaddrinfo(host, port_str, &hints, &addrinfo_result);
        if (gai_err != 0) {
            LOG_ERROR("Failed to resolve host %s: %s", host, gai_strerror(gai_err));
            goto cleanup;
        }
    }

    sock = socket(addrinfo_result->ai_family, addrinfo_result->ai_socktype,
                  addrinfo_result->ai_protocol);
    if (sock < 0) {
        LOG_ERROR("Failed to create socket: %s", strerror(errno));
        goto cleanup;
    }

    // Set timeouts
    {
        struct timeval timeout = {
            .tv_sec = UPLOAD_TIMEOUT_SEC,
            .tv_usec = 0
        };
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    }

    if (connect(sock, addrinfo_result->ai_addr, addrinfo_result->ai_addrlen) < 0) {
        LOG_ERROR("Failed to connect to %s:%d: %s", host, port, strerror(errno));
        goto cleanup;
    }

    freeaddrinfo(addrinfo_result);
    addrinfo_result = NULL;

    if (send(sock, http_header, hdr_len, 0) < 0) {
        LOG_ERROR("Failed to send headers: %s", strerror(errno));
        goto cleanup;
    }

    // COMM-001-4 fix: Clear API key from header buffer and local copy after sending
    secure_clear(http_header, sizeof(http_header));
    secure_clear(api_key_copy, sizeof(api_key_copy));
    secrets_cleared = true;

    if (send(sock, body_header, header_len, 0) < 0) {
        LOG_ERROR("Failed to send body header: %s", strerror(errno));
        goto cleanup;
    }

    fp = fopen(entry->clip_path, "rb");
    if (!fp) {
        LOG_ERROR("Failed to open clip file: %s", entry->clip_path);
        status = UPLOAD_STATUS_FILE_ERROR;
        goto cleanup;
    }

    {
        char chunk[READ_CHUNK_SIZE];
        size_t bytes_sent = 0;
        while (!feof(fp)) {
            size_t rd = fread(chunk, 1, sizeof(chunk), fp);
            if (rd > 0) {
                ssize_t sent = send(sock, chunk, rd, 0);
                if (sent < 0) {
                    LOG_ERROR("Failed to send file data: %s", strerror(errno));
                    goto cleanup;
                }
                bytes_sent += sent;
            }
        }
        fclose(fp);
        fp = NULL;

        if (send(sock, body_footer, footer_len, 0) < 0) {
            LOG_ERROR("Failed to send body footer: %s", strerror(errno));
            goto cleanup;
        }

        LOG_DEBUG("Sent %zu bytes for clip upload", bytes_sent);
    }

    // S8-H4 fix: Loop on recv() to handle partial HTTP responses.
    {
        char response[HTTP_BUFFER_SIZE];
        size_t total_received = 0;
        while (total_received < sizeof(response) - 1) {
            ssize_t chunk = recv(sock, response + total_received,
                                 sizeof(response) - 1 - total_received, 0);
            if (chunk < 0) {
                if (errno == EINTR) continue;
                if (total_received > 0) break;
                LOG_ERROR("Failed to receive response: %s", strerror(errno));
                goto cleanup;
            }
            if (chunk == 0) break;
            total_received += (size_t)chunk;
        }
        close(sock);
        sock = -1;

        if (total_received == 0) {
            LOG_ERROR("Empty response from server for clip upload");
            goto cleanup;
        }

        response[total_received] = '\0';

        int http_status = 0;
        if (sscanf(response, "HTTP/1.1 %d", &http_status) != 1 &&
            sscanf(response, "HTTP/1.0 %d", &http_status) != 1) {
            LOG_ERROR("Failed to parse HTTP status");
            goto cleanup;
        }

        if (http_status == 201) {
            LOG_INFO("Clip uploaded successfully: %s", entry->clip_path);
            status = UPLOAD_STATUS_SUCCESS;
            goto cleanup;
        }
        if (http_status == 401 || http_status == 403) {
            LOG_ERROR("Upload auth failed (HTTP %d)", http_status);
            status = UPLOAD_STATUS_AUTH_ERROR;
            goto cleanup;
        }
        if (http_status >= 500) {
            LOG_WARN("Server error (HTTP %d)", http_status);
            status = UPLOAD_STATUS_SERVER_ERROR;
            goto cleanup;
        }
        LOG_WARN("Client error (HTTP %d)", http_status);
        status = UPLOAD_STATUS_CLIENT_ERROR;
    }

cleanup:
    if (!secrets_cleared) {
        secure_clear(http_header, sizeof(http_header));
        secure_clear(api_key_copy, sizeof(api_key_copy));
    }
    if (fp) fclose(fp);
    if (tls_ctx) tls_close(tls_ctx);
    if (addrinfo_result) freeaddrinfo(addrinfo_result);
    if (sock >= 0) close(sock);
    return status;
}

#else  // ESP32

#include "esp_http_client.h"
#include "esp_system.h"

// ESP32-specific file size function
static long get_file_size_esp32(const char *filepath) {
    FILE *fp = fopen(filepath, "rb");
    if (!fp) return -1;
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fclose(fp);
    return size;
}

static upload_status_t do_upload(clip_queue_entry_t *entry) {
    // S8-C3 fix: Use thread-safe snapshot instead of raw pointer
    runtime_config_t config_snap;
    config_manager_get_snapshot(&config_snap);

    char server_url_esp[CFG_MAX_URL_LEN];
    char api_key_esp[CFG_MAX_API_KEY_LEN];
    strncpy(server_url_esp, config_snap.server.url, sizeof(server_url_esp) - 1);
    server_url_esp[sizeof(server_url_esp) - 1] = '\0';
    strncpy(api_key_esp, config_snap.server.api_key, sizeof(api_key_esp) - 1);
    api_key_esp[sizeof(api_key_esp) - 1] = '\0';

    // Clear sensitive data from stack snapshot
    memset(config_snap.server.api_key, 0, sizeof(config_snap.server.api_key));

    if (strlen(server_url_esp) == 0) {
        LOG_DEBUG("No server URL configured, skipping upload");
        secure_clear(api_key_esp, sizeof(api_key_esp));
        return UPLOAD_STATUS_NO_CONFIG;
    }

    // Check if file exists
    long file_size = get_file_size_esp32(entry->clip_path);
    if (file_size < 0) {
        LOG_ERROR("Clip file not found: %s", entry->clip_path);
        secure_clear(api_key_esp, sizeof(api_key_esp));
        return UPLOAD_STATUS_FILE_ERROR;
    }

    // Parse server URL (I8 fix: uses shared http_parse_url)
    char host[256];
    uint16_t port;
    char path[256];
    if (http_parse_url(server_url_esp, host, sizeof(host), &port, path, sizeof(path),
                       CLIP_UPLOAD_PATH) < 0) {
        LOG_ERROR("Invalid server URL: %s", server_url_esp);
        secure_clear(api_key_esp, sizeof(api_key_esp));
        return UPLOAD_STATUS_NO_CONFIG;
    }

    // Extract filename from path
    const char *filename = strrchr(entry->clip_path, '/');
    if (filename) {
        filename++;
    } else {
        filename = entry->clip_path;
    }

    // Build full URL for upload endpoint
    char full_url[512];
    snprintf(full_url, sizeof(full_url), "%s://%s:%u%s",
             port == 443 ? "https" : "http", host, port, path);

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

    // Content-Length overflow check: ensure the total size doesn't wrap around
    if (file_size > (long)(SIZE_MAX - (size_t)header_len - (size_t)footer_len)) {
        LOG_ERROR("Content-Length overflow: file_size=%ld, header=%d, footer=%d",
                  file_size, header_len, footer_len);
        secure_clear(api_key_esp, sizeof(api_key_esp));
        return UPLOAD_STATUS_FILE_ERROR;
    }

    // Calculate total content length
    size_t content_length = (size_t)header_len + (size_t)file_size + (size_t)footer_len;

    // Configure ESP HTTP client
    esp_http_client_config_t http_config = {
        .url = full_url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = UPLOAD_TIMEOUT_SEC * 1000,
        .buffer_size = HTTP_BUFFER_SIZE,
    };

    esp_http_client_handle_t client = esp_http_client_init(&http_config);
    if (!client) {
        LOG_ERROR("Failed to init HTTP client");
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Set headers
    char content_type[128];
    snprintf(content_type, sizeof(content_type),
             "multipart/form-data; boundary=%s", BOUNDARY_STRING);
    esp_http_client_set_header(client, "Content-Type", content_type);
    esp_http_client_set_header(client, "X-API-Key", api_key_esp);
    // Clear api key from local copy now that it's been passed to HTTP client
    secure_clear(api_key_esp, sizeof(api_key_esp));

    char content_len_str[32];
    snprintf(content_len_str, sizeof(content_len_str), "%zu", content_length);
    esp_http_client_set_header(client, "Content-Length", content_len_str);

    // Open connection
    esp_err_t err = esp_http_client_open(client, content_length);
    if (err != ESP_OK) {
        LOG_ERROR("HTTP connection failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Write multipart header
    int written = esp_http_client_write(client, body_header, header_len);
    if (written < 0) {
        LOG_ERROR("Failed to write body header");
        esp_http_client_cleanup(client);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    // Write file content
    FILE *fp = fopen(entry->clip_path, "rb");
    if (!fp) {
        LOG_ERROR("Failed to open clip file: %s", entry->clip_path);
        esp_http_client_cleanup(client);
        return UPLOAD_STATUS_FILE_ERROR;
    }

    char chunk[READ_CHUNK_SIZE];
    size_t bytes_sent = 0;
    while (!feof(fp)) {
        size_t read = fread(chunk, 1, sizeof(chunk), fp);
        if (read > 0) {
            written = esp_http_client_write(client, chunk, read);
            if (written < 0) {
                LOG_ERROR("Failed to send file data");
                fclose(fp);
                esp_http_client_cleanup(client);
                return UPLOAD_STATUS_NETWORK_ERROR;
            }
            bytes_sent += written;
        }
    }
    fclose(fp);

    // Write multipart footer
    written = esp_http_client_write(client, body_footer, footer_len);
    if (written < 0) {
        LOG_ERROR("Failed to write body footer");
        esp_http_client_cleanup(client);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    LOG_DEBUG("Sent %zu bytes for clip upload", bytes_sent);

    // Get response
    int content_len = esp_http_client_fetch_headers(client);
    if (content_len < 0) {
        LOG_ERROR("Failed to fetch response headers");
        esp_http_client_cleanup(client);
        return UPLOAD_STATUS_NETWORK_ERROR;
    }

    int http_status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

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
                // I1 fix: Notify storage_manager that clip was uploaded
                if (storage_manager_is_initialized()) {
                    storage_manager_mark_uploaded(entry.clip_path);
                }
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

                // S8-M5: Enforce maximum retry count to prevent infinite retries
                if (g_queue[i].retry_count >= MAX_UPLOAD_RETRIES) {
                    LOG_WARN("Clip upload exceeded max retries (%u): %s",
                             MAX_UPLOAD_RETRIES, entry.clip_path);
                    g_queue[i].uploaded = true;  // Mark for removal
                    compact_queue();
                    save_queue_to_disk();
                } else {
                    uint32_t delay = clip_uploader_retry_delay(g_queue[i].retry_count);
                    g_queue[i].next_retry_time = get_current_time() + delay;
                    LOG_INFO("Will retry upload in %u seconds (attempt %u/%u)",
                             delay, g_queue[i].retry_count, MAX_UPLOAD_RETRIES);
                    save_queue_to_disk();
                }
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

    // Initialize mutex (no-op on Pi/Test where statically initialized)
    APIS_MUTEX_INIT(upload);

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
    if (!clip_path || strlen(clip_path) == 0) {
        return -1;
    }

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    // Path traversal protection: ensure clip_path is within expected directory
    // Use ./data/clips as the expected base (matching storage_manager default)
    if (!is_safe_path(clip_path, "./data/clips") && !is_safe_path(clip_path, "/data/apis") && !is_safe_path(clip_path, "/data/clips")) {
        LOG_ERROR("Clip path rejected (path traversal): %s", clip_path);
        return -1;
    }
#endif

    UPLOAD_LOCK();

    // I4 fix: Check g_initialized inside lock to prevent TOCTOU race
    if (!g_initialized) {
        UPLOAD_UNLOCK();
        return -1;
    }

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
            // I3 fix: Persist queue immediately after dropping to prevent data loss
            save_queue_to_disk();
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

    /* Mutex cleanup handled by platform_mutex lifecycle */

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
