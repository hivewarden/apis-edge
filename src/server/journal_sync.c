#include "journal_sync.h"

#include "config_manager.h"
#include "http_utils.h"
#include "log.h"
#include "platform.h"
#include "secure_util.h"
#include "telemetry_journal.h"
#include "tls_client.h"

#include "cJSON.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
#include <pthread.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netdb.h>
#else
#include "esp_http_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

#define JOURNAL_SYNC_PATH "/api/units/journal/sync"
#define JOURNAL_SYNC_INTERVAL_MS 10000
#define JOURNAL_SYNC_HTTP_BUFFER 8192
#define JOURNAL_SYNC_TASK_STACK 12288
#define JOURNAL_SYNC_TASK_PRIORITY 4

static volatile bool g_initialized = false;
static volatile bool g_running = false;
static volatile journal_sync_status_t g_last_status = JOURNAL_SYNC_STATUS_NO_PENDING;

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static pthread_t g_thread;
#else
static TaskHandle_t g_task = NULL;
#endif

const char *journal_sync_status_name(journal_sync_status_t status) {
    switch (status) {
        case JOURNAL_SYNC_STATUS_SUCCESS: return "SUCCESS";
        case JOURNAL_SYNC_STATUS_NO_PENDING: return "NO_PENDING";
        case JOURNAL_SYNC_STATUS_NO_CONFIG: return "NO_CONFIG";
        case JOURNAL_SYNC_STATUS_NETWORK_ERROR: return "NETWORK_ERROR";
        case JOURNAL_SYNC_STATUS_AUTH_ERROR: return "AUTH_ERROR";
        case JOURNAL_SYNC_STATUS_SERVER_ERROR: return "SERVER_ERROR";
        case JOURNAL_SYNC_STATUS_CLIENT_ERROR: return "CLIENT_ERROR";
        default: return "UNKNOWN";
    }
}

static int build_payload(char **payload_out, char ids[][EDGE_SYNC_ID_MAX], int *id_count_out) {
    telemetry_journal_entry_t entries[TELEMETRY_JOURNAL_BATCH_MAX];
    cJSON *root = NULL;
    cJSON *items = NULL;
    int entry_count;

    if (payload_out == NULL || id_count_out == NULL) {
        return -1;
    }

    *payload_out = NULL;
    *id_count_out = 0;

    entry_count = telemetry_journal_get_pending(entries, TELEMETRY_JOURNAL_BATCH_MAX);
    if (entry_count < 0) {
        return -1;
    }
    if (entry_count == 0) {
        return 0;
    }

    root = cJSON_CreateObject();
    items = cJSON_CreateArray();
    if (root == NULL || items == NULL) {
        cJSON_Delete(root);
        return -1;
    }

    cJSON_AddStringToObject(root, "schema_version", EDGE_SYNC_SCHEMA_VERSION);

    for (int i = 0; i < entry_count; i++) {
        cJSON *item = cJSON_CreateObject();
        if (item == NULL) {
            continue;
        }

        snprintf(ids[i], EDGE_SYNC_ID_MAX, "%s", entries[i].id);
        cJSON_AddStringToObject(item, "entry_id", entries[i].id);
        cJSON_AddStringToObject(item, "entry_type", edge_sync_entry_type_name(entries[i].type));
        cJSON_AddStringToObject(item, "created_at", entries[i].created_at);
        cJSON_AddNumberToObject(item, "sequence", (double)entries[i].sequence);

        if (entries[i].type == EDGE_SYNC_ENTRY_LASER_ACTIVATION) {
            cJSON_AddStringToObject(item, "encounter_id", entries[i].payload.activation.encounter_id);
            cJSON_AddStringToObject(item, "clip_id", entries[i].payload.activation.clip_id);
            cJSON_AddStringToObject(item, "occurred_at", entries[i].payload.activation.occurred_at);
            cJSON_AddNumberToObject(item, "duration_ms", entries[i].payload.activation.duration_ms);
            cJSON_AddBoolToObject(item, "safety_timeout", entries[i].payload.activation.safety_timeout);
        } else {
            cJSON_AddStringToObject(item, "clip_id", entries[i].payload.encounter.clip_id);
            cJSON_AddStringToObject(item, "first_seen_at", entries[i].payload.encounter.first_seen_at);
            cJSON_AddStringToObject(item, "last_seen_at", entries[i].payload.encounter.last_seen_at);
            cJSON_AddNumberToObject(item, "duration_ms", entries[i].payload.encounter.duration_ms);
            cJSON_AddNumberToObject(item, "detection_count", entries[i].payload.encounter.detection_count);
            cJSON_AddNumberToObject(item, "high_confidence_count", entries[i].payload.encounter.high_confidence_count);
            cJSON_AddNumberToObject(item, "activation_count", entries[i].payload.encounter.activation_count);
            cJSON_AddNumberToObject(item, "max_hover_duration_ms", entries[i].payload.encounter.max_hover_duration_ms);
            cJSON_AddNumberToObject(item, "max_area", entries[i].payload.encounter.max_area);
            cJSON_AddNumberToObject(item, "lane", entries[i].payload.encounter.lane);
            cJSON_AddStringToObject(item, "max_confidence", entries[i].payload.encounter.max_confidence);
        }

        cJSON_AddItemToArray(items, item);
    }

    cJSON_AddItemToObject(root, "entries", items);
    *payload_out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    *id_count_out = entry_count;
    return (*payload_out != NULL) ? entry_count : -1;
}

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static journal_sync_status_t post_json(const char *server_url,
                                       const char *api_key,
                                       const char *body) {
    char host[256];
    uint16_t port;
    char path[256];
    struct addrinfo hints = {0};
    struct addrinfo *result = NULL;
    int sock = -1;
    bool use_tls = false;
    int http_status = 0;
    char response[JOURNAL_SYNC_HTTP_BUFFER];
    size_t body_len;
    char *request = NULL;
    size_t request_capacity;
    int request_len;
    journal_sync_status_t status = JOURNAL_SYNC_STATUS_NETWORK_ERROR;

    if (http_parse_url(server_url, host, sizeof(host), &port, path, sizeof(path),
                       JOURNAL_SYNC_PATH) < 0) {
        return JOURNAL_SYNC_STATUS_NO_CONFIG;
    }

    use_tls = strncmp(server_url, "https://", 8) == 0;
    body_len = strlen(body);
    request_capacity = strlen(host) + strlen(path) + strlen(api_key) + body_len + 512;
    request = malloc(request_capacity);
    if (request == NULL) {
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }

    request_len = snprintf(request, request_capacity,
                           "POST %s HTTP/1.1\r\n"
                           "Host: %s\r\n"
                           "X-API-Key: %s\r\n"
                           "Content-Type: application/json\r\n"
                           "Content-Length: %zu\r\n"
                           "Connection: close\r\n"
                           "\r\n"
                           "%s",
                           path, host, api_key, body_len, body);
    if (request_len <= 0 || (size_t)request_len >= request_capacity) {
        free(request);
        return JOURNAL_SYNC_STATUS_CLIENT_ERROR;
    }

    if (use_tls) {
        tls_context_t *tls = tls_connect(host, port);
        if (tls == NULL) {
            free(request);
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        if (tls_write(tls, request, request_len) < 0) {
            tls_close(tls);
            free(request);
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        int received = tls_read(tls, response, sizeof(response) - 1);
        tls_close(tls);
        free(request);
        if (received <= 0) {
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        response[received] = '\0';
    } else {
        char port_str[16];
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;
        snprintf(port_str, sizeof(port_str), "%u", port);
        if (getaddrinfo(host, port_str, &hints, &result) != 0) {
            free(request);
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        sock = socket(result->ai_family, result->ai_socktype, result->ai_protocol);
        if (sock < 0 || connect(sock, result->ai_addr, result->ai_addrlen) < 0) {
            if (result != NULL) {
                freeaddrinfo(result);
            }
            if (sock >= 0) {
                close(sock);
            }
            free(request);
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        freeaddrinfo(result);
        result = NULL;
        if (send(sock, request, request_len, 0) < 0) {
            close(sock);
            free(request);
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        int received = recv(sock, response, sizeof(response) - 1, 0);
        close(sock);
        free(request);
        if (received <= 0) {
            return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
        }
        response[received] = '\0';
    }

    if (sscanf(response, "HTTP/1.1 %d", &http_status) != 1 &&
        sscanf(response, "HTTP/1.0 %d", &http_status) != 1) {
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }

    if (http_status == 200 || http_status == 201) {
        status = JOURNAL_SYNC_STATUS_SUCCESS;
    } else if (http_status == 401 || http_status == 403) {
        status = JOURNAL_SYNC_STATUS_AUTH_ERROR;
    } else if (http_status >= 500) {
        status = JOURNAL_SYNC_STATUS_SERVER_ERROR;
    } else {
        status = JOURNAL_SYNC_STATUS_CLIENT_ERROR;
    }

    return status;
}
#else
static journal_sync_status_t post_json(const char *server_url,
                                       const char *api_key,
                                       const char *body) {
    char host[256];
    uint16_t port;
    char path[256];
    char full_url[512];
    int body_len = (int)strlen(body);
    esp_http_client_config_t config;
    esp_http_client_handle_t client;
    int http_status;

    if (http_parse_url(server_url, host, sizeof(host), &port, path, sizeof(path),
                       JOURNAL_SYNC_PATH) < 0) {
        return JOURNAL_SYNC_STATUS_NO_CONFIG;
    }

    snprintf(full_url, sizeof(full_url), "%s://%s:%u%s",
             strncmp(server_url, "https://", 8) == 0 ? "https" : "http",
             host, port, path);

    memset(&config, 0, sizeof(config));
    config.url = full_url;
    config.method = HTTP_METHOD_POST;
    config.timeout_ms = 10000;
    config.buffer_size = JOURNAL_SYNC_HTTP_BUFFER;
    client = esp_http_client_init(&config);
    if (client == NULL) {
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key", api_key);

    if (esp_http_client_open(client, body_len) != ESP_OK) {
        esp_http_client_cleanup(client);
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }
    if (esp_http_client_write(client, body, body_len) < 0) {
        esp_http_client_cleanup(client);
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }
    if (esp_http_client_fetch_headers(client) < 0) {
        esp_http_client_cleanup(client);
        return JOURNAL_SYNC_STATUS_NETWORK_ERROR;
    }

    http_status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (http_status == 200 || http_status == 201) {
        return JOURNAL_SYNC_STATUS_SUCCESS;
    }
    if (http_status == 401 || http_status == 403) {
        return JOURNAL_SYNC_STATUS_AUTH_ERROR;
    }
    if (http_status >= 500) {
        return JOURNAL_SYNC_STATUS_SERVER_ERROR;
    }
    return JOURNAL_SYNC_STATUS_CLIENT_ERROR;
}
#endif

journal_sync_status_t journal_sync_send_pending(void) {
    runtime_config_t config;
    char *payload = NULL;
    char ids[TELEMETRY_JOURNAL_BATCH_MAX][EDGE_SYNC_ID_MAX];
    const char *id_ptrs[TELEMETRY_JOURNAL_BATCH_MAX];
    int id_count = 0;
    int payload_count;
    journal_sync_status_t status;

    if (!g_initialized) {
        g_last_status = JOURNAL_SYNC_STATUS_CLIENT_ERROR;
        return JOURNAL_SYNC_STATUS_CLIENT_ERROR;
    }

    payload_count = build_payload(&payload, ids, &id_count);
    if (payload_count < 0) {
        g_last_status = JOURNAL_SYNC_STATUS_CLIENT_ERROR;
        return JOURNAL_SYNC_STATUS_CLIENT_ERROR;
    }
    if (payload_count == 0) {
        g_last_status = JOURNAL_SYNC_STATUS_NO_PENDING;
        return JOURNAL_SYNC_STATUS_NO_PENDING;
    }

    config_manager_get_effective_snapshot(&config);
    if (config.server.url[0] == '\0' || config.server.api_key[0] == '\0') {
        free(payload);
        secure_clear(config.server.api_key, sizeof(config.server.api_key));
        g_last_status = JOURNAL_SYNC_STATUS_NO_CONFIG;
        return JOURNAL_SYNC_STATUS_NO_CONFIG;
    }

    for (int i = 0; i < id_count; i++) {
        id_ptrs[i] = ids[i];
    }

    status = post_json(config.server.url, config.server.api_key, payload);
    free(payload);
    secure_clear(config.server.api_key, sizeof(config.server.api_key));

    if (status == JOURNAL_SYNC_STATUS_SUCCESS) {
        (void)telemetry_journal_mark_synced_batch(id_ptrs, id_count);
    }

    g_last_status = status;
    return status;
}

#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
static void *journal_sync_thread(void *arg) {
    (void)arg;
    while (g_running) {
        journal_sync_status_t status = journal_sync_send_pending();
        if (status != JOURNAL_SYNC_STATUS_NO_PENDING &&
            status != JOURNAL_SYNC_STATUS_NO_CONFIG) {
            LOG_DEBUG("Journal sync cycle: %s", journal_sync_status_name(status));
        }
        for (int i = 0; i < JOURNAL_SYNC_INTERVAL_MS / 100 && g_running; i++) {
            apis_sleep_ms(100);
        }
    }
    return NULL;
}
#else
static void journal_sync_task(void *arg) {
    (void)arg;
    while (g_running) {
        journal_sync_status_t status = journal_sync_send_pending();
        if (status != JOURNAL_SYNC_STATUS_NO_PENDING &&
            status != JOURNAL_SYNC_STATUS_NO_CONFIG) {
            LOG_DEBUG("Journal sync cycle: %s", journal_sync_status_name(status));
        }
        vTaskDelay(pdMS_TO_TICKS(JOURNAL_SYNC_INTERVAL_MS));
    }
    g_task = NULL;
    vTaskDelete(NULL);
}
#endif

int journal_sync_init(void) {
    if (g_initialized) {
        return 0;
    }

    if (!telemetry_journal_is_initialized()) {
        return -1;
    }

    g_last_status = JOURNAL_SYNC_STATUS_NO_PENDING;
    g_initialized = true;
    return 0;
}

int journal_sync_start(void) {
    if (!g_initialized) {
        return -1;
    }
    if (g_running) {
        return 0;
    }

    g_running = true;
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    if (pthread_create(&g_thread, NULL, journal_sync_thread, NULL) != 0) {
        g_running = false;
        return -1;
    }
#else
    if (xTaskCreate(journal_sync_task,
                    "journal_sync",
                    JOURNAL_SYNC_TASK_STACK,
                    NULL,
                    JOURNAL_SYNC_TASK_PRIORITY,
                    &g_task) != pdPASS) {
        g_running = false;
        return -1;
    }
#endif
    return 0;
}

void journal_sync_stop(void) {
    if (!g_running) {
        return;
    }

    g_running = false;
#if defined(APIS_PLATFORM_PI) || defined(APIS_PLATFORM_TEST)
    pthread_join(g_thread, NULL);
#else
    for (int i = 0; i < 50 && g_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }
#endif
}

void journal_sync_cleanup(void) {
    if (!g_initialized) {
        return;
    }
    journal_sync_stop();
    g_initialized = false;
    g_last_status = JOURNAL_SYNC_STATUS_NO_PENDING;
}

bool journal_sync_is_initialized(void) {
    return g_initialized;
}

bool journal_sync_is_running(void) {
    return g_running;
}

void journal_sync_get_snapshot(journal_sync_snapshot_t *snapshot) {
    if (snapshot == NULL) {
        return;
    }

    snapshot->initialized = g_initialized;
    snapshot->running = g_running;
    snapshot->last_status = g_last_status;
}
