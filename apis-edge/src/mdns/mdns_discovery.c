/**
 * mDNS Service Discovery for APIS Edge Device (ESP32).
 *
 * Uses the ESP-IDF mDNS component to:
 * - Set a unique hostname (hivewarden-XXXX.local)
 * - Advertise this device as a _hivewarden._tcp service (type=edge)
 * - Query the local network for a Hive Warden server (_hivewarden._tcp, type=server)
 *
 * The Go server advertises itself with TXT records:
 *   version=1, mode=standalone, path=/api, auth=local
 *
 * This device advertises with TXT records:
 *   version=1, type=edge, id=<device_id>
 */

#ifdef APIS_PLATFORM_ESP32

#include "mdns_discovery.h"
#include "log.h"
#include "mdns.h"

#include <string.h>
#include <stdio.h>

// ============================================================================
// Constants
// ============================================================================

#define HIVEWARDEN_SERVICE_TYPE  "_hivewarden"
#define HIVEWARDEN_PROTO         "_tcp"
#define MDNS_QUERY_TIMEOUT_MS    5000
#define MDNS_MAX_RESULTS         4
#define MDNS_RETRY_COUNT         3
#define MDNS_RETRY_DELAY_MS      2000

// ============================================================================
// State
// ============================================================================

static bool g_mdns_initialized = false;

// ============================================================================
// Public API
// ============================================================================

int mdns_discovery_init(const char *device_id, uint16_t http_port) {
    if (g_mdns_initialized) {
        LOG_WARN("mDNS already initialized");
        return 0;
    }

    // Initialize the mDNS subsystem
    esp_err_t err = mdns_init();
    if (err != ESP_OK) {
        LOG_ERROR("mDNS init failed: %s", esp_err_to_name(err));
        return -1;
    }

    // Set hostname: "hivewarden-A1B2" → hivewarden-A1B2.local
    char hostname[32];
    snprintf(hostname, sizeof(hostname), "hivewarden-%.8s", device_id);

    err = mdns_hostname_set(hostname);
    if (err != ESP_OK) {
        LOG_ERROR("mDNS hostname_set failed: %s", esp_err_to_name(err));
        mdns_free();
        return -1;
    }

    // Set a human-readable instance name
    char instance[64];
    snprintf(instance, sizeof(instance), "Hive Warden Unit %s", device_id);
    mdns_instance_name_set(instance);

    // Advertise this device as a _hivewarden._tcp service
    // so the server/dashboard can discover edge devices
    mdns_txt_item_t txt[] = {
        { .key = "version", .value = "1" },
        { .key = "type",    .value = "edge" },
        { .key = "id",      .value = device_id },
    };
    err = mdns_service_add(instance, HIVEWARDEN_SERVICE_TYPE, HIVEWARDEN_PROTO,
                           http_port, txt, sizeof(txt) / sizeof(txt[0]));
    if (err != ESP_OK) {
        LOG_WARN("mDNS service_add failed: %s (continuing without advertisement)",
                 esp_err_to_name(err));
        // Non-fatal: outbound discovery can still work
    }

    g_mdns_initialized = true;
    LOG_INFO("mDNS initialized: %s.local, port %u", hostname, http_port);
    return 0;
}

int mdns_discovery_find_server(mdns_server_result_t *result) {
    if (!result) return -1;

    memset(result, 0, sizeof(*result));

    // Default API path
    strncpy(result->api_path, "/api", sizeof(result->api_path) - 1);

    LOG_INFO("Searching for Hive Warden server via mDNS...");

    // Retry a few times — the server may not have responded to the first
    // multicast query (network latency, packet loss on WiFi)
    for (int attempt = 0; attempt < MDNS_RETRY_COUNT; attempt++) {
        mdns_result_t *results = NULL;

        // PTR query: find all _hivewarden._tcp services
        esp_err_t err = mdns_query_ptr(HIVEWARDEN_SERVICE_TYPE,
                                        HIVEWARDEN_PROTO,
                                        MDNS_QUERY_TIMEOUT_MS,
                                        MDNS_MAX_RESULTS,
                                        &results);
        if (err != ESP_OK) {
            LOG_WARN("mDNS query attempt %d failed: %s",
                     attempt + 1, esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(MDNS_RETRY_DELAY_MS));
            continue;
        }

        if (!results) {
            LOG_INFO("mDNS attempt %d: no server found yet", attempt + 1);
            vTaskDelay(pdMS_TO_TICKS(MDNS_RETRY_DELAY_MS));
            continue;
        }

        // Walk the results looking for a server (not another edge device)
        mdns_result_t *r = results;
        bool found = false;

        while (r && !found) {
            // Check TXT records to distinguish server from edge devices
            bool is_server = false;
            for (size_t i = 0; i < r->txt_count; i++) {
                if (strcmp(r->txt[i].key, "type") == 0 &&
                    r->txt[i].value &&
                    strcmp(r->txt[i].value, "edge") == 0) {
                    // This is another edge device, skip it
                    is_server = false;
                    break;
                }
                // If no "type" key or type != "edge", assume it's a server
                // The Go server sets type implicitly through mode=standalone/saas
                if (strcmp(r->txt[i].key, "mode") == 0) {
                    is_server = true;
                }
            }

            // If no TXT records at all, also treat as server
            // (fallback for minimal server advertisement)
            if (r->txt_count == 0) {
                is_server = true;
            }

            if (!is_server) {
                r = r->next;
                continue;
            }

            // Extract IPv4 address
            mdns_ip_addr_t *addr = r->addr;
            while (addr) {
                if (addr->addr.type == ESP_IPADDR_TYPE_V4) {
                    snprintf(result->host, sizeof(result->host),
                             IPSTR, IP2STR(&addr->addr.u_addr.ip4));
                    found = true;
                    break;
                }
                addr = addr->next;
            }

            if (found) {
                result->port = r->port;

                // Extract TXT metadata
                for (size_t i = 0; i < r->txt_count; i++) {
                    if (strcmp(r->txt[i].key, "path") == 0 && r->txt[i].value) {
                        strncpy(result->api_path, r->txt[i].value,
                                sizeof(result->api_path) - 1);
                    }
                    if (strcmp(r->txt[i].key, "auth") == 0 && r->txt[i].value) {
                        strncpy(result->auth_mode, r->txt[i].value,
                                sizeof(result->auth_mode) - 1);
                    }
                }

                LOG_INFO("Discovered Hive Warden server: %s:%u (path=%s, instance=%s)",
                         result->host, result->port, result->api_path,
                         r->instance_name ? r->instance_name : "?");
            }

            r = r->next;
        }

        mdns_query_results_free(results);

        if (found) {
            return 0;
        }

        vTaskDelay(pdMS_TO_TICKS(MDNS_RETRY_DELAY_MS));
    }

    LOG_INFO("No Hive Warden server found via mDNS after %d attempts", MDNS_RETRY_COUNT);
    return -1;
}

void mdns_discovery_cleanup(void) {
    if (g_mdns_initialized) {
        mdns_free();
        g_mdns_initialized = false;
        LOG_INFO("mDNS cleanup complete");
    }
}

#endif // APIS_PLATFORM_ESP32
