/**
 * WiFi Provisioning for APIS Edge Device (ESP32).
 *
 * Manages WiFi connectivity:
 * - Checks NVS for saved WiFi credentials
 * - Connects as station (STA) if credentials exist
 * - Falls back to AP mode ("HiveWarden-XXXX") for initial setup
 *
 * AP mode creates a WPA2 hotspot. Users connect via phone and
 * the captive portal setup page appears automatically.
 */

#ifdef APIS_PLATFORM_ESP32

#include "wifi_provision.h"
#include "config_manager.h"
#include "log.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_mac.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "nvs_flash.h"
#include "nvs.h"

#include <string.h>
#include <stdio.h>

// ============================================================================
// Constants
// ============================================================================

#define WIFI_NVS_NAMESPACE  "apis_wifi"
#define WIFI_NVS_KEY_SSID   "ssid"
#define WIFI_NVS_KEY_PASS   "password"

#define WIFI_STA_MAX_RETRY          5
#define WIFI_STA_CONNECT_TIMEOUT_MS 10000

#define WIFI_AP_CHANNEL         1
#define WIFI_AP_MAX_CONNECTIONS  4
#define WIFI_AP_SSID_PREFIX     "HiveWarden-"
#define WIFI_AP_PASS_PREFIX     "HW-"  // WPA2 password = "HW-" + full MAC hex

// Event group bits
#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

// ============================================================================
// State
// ============================================================================

static wifi_prov_mode_t g_mode = WIFI_PROV_MODE_NONE;
static EventGroupHandle_t s_wifi_event_group = NULL;
static int s_retry_count = 0;
static bool g_initialized = false;
static char g_ap_ssid[32] = {0};
static char g_ap_password[32] = {0};  // WPA2 password for AP mode

// ============================================================================
// Forward Declarations
// ============================================================================

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data);
static int start_sta_mode(const char *ssid, const char *password);
static int start_ap_mode(void);
static bool load_wifi_credentials(char *ssid, size_t ssid_len,
                                  char *password, size_t pass_len);
static void build_ap_ssid(void);
static void build_ap_password(void);

// ============================================================================
// Event Handler
// ============================================================================

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data) {
    (void)arg;

    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_STA_START:
                LOG_INFO("WiFi STA started, connecting...");
                esp_wifi_connect();
                break;

            case WIFI_EVENT_STA_DISCONNECTED: {
                wifi_event_sta_disconnected_t *event =
                    (wifi_event_sta_disconnected_t *)event_data;
                if (s_retry_count < WIFI_STA_MAX_RETRY) {
                    s_retry_count++;
                    LOG_WARN("WiFi disconnected (reason=%d), retry %d/%d",
                             event->reason, s_retry_count, WIFI_STA_MAX_RETRY);
                    esp_wifi_connect();
                } else {
                    LOG_ERROR("WiFi connection failed after %d retries", WIFI_STA_MAX_RETRY);
                    xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
                }
                break;
            }

            case WIFI_EVENT_AP_START:
                LOG_INFO("WiFi AP started — beacon broadcasting");
                break;

            case WIFI_EVENT_AP_STOP:
                LOG_WARN("WiFi AP stopped");
                break;

            case WIFI_EVENT_AP_STACONNECTED: {
                wifi_event_ap_staconnected_t *event =
                    (wifi_event_ap_staconnected_t *)event_data;
                LOG_INFO("Client connected to AP (MAC: " MACSTR ")", MAC2STR(event->mac));
                break;
            }

            case WIFI_EVENT_AP_STADISCONNECTED: {
                wifi_event_ap_stadisconnected_t *event =
                    (wifi_event_ap_stadisconnected_t *)event_data;
                LOG_INFO("Client disconnected from AP (MAC: " MACSTR ")", MAC2STR(event->mac));
                break;
            }

            default:
                break;
        }
    } else if (event_base == IP_EVENT) {
        if (event_id == IP_EVENT_STA_GOT_IP) {
            ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
            LOG_INFO("WiFi connected! IP: " IPSTR, IP2STR(&event->ip_info.ip));
            s_retry_count = 0;
            xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        }
    }
}

// ============================================================================
// Public API
// ============================================================================

int wifi_provision_init(void) {
    if (g_initialized) {
        LOG_WARN("WiFi provisioning already initialized");
        return 0;
    }

    // Build AP SSID and WPA2 password from MAC address
    build_ap_ssid();
    build_ap_password();

    // Initialize TCP/IP stack
    esp_err_t ret = esp_netif_init();
    if (ret != ESP_OK) {
        LOG_ERROR("esp_netif_init failed: %s", esp_err_to_name(ret));
        return -1;
    }

    // Create default event loop
    ret = esp_event_loop_create_default();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        LOG_ERROR("esp_event_loop_create_default failed: %s", esp_err_to_name(ret));
        return -1;
    }

    // Create event group for connection status
    s_wifi_event_group = xEventGroupCreate();
    if (!s_wifi_event_group) {
        LOG_ERROR("Failed to create WiFi event group");
        return -1;
    }

    // Initialize WiFi with default config
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ret = esp_wifi_init(&cfg);
    if (ret != ESP_OK) {
        LOG_ERROR("esp_wifi_init failed: %s", esp_err_to_name(ret));
        return -1;
    }

    // Register event handlers
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                               &wifi_event_handler, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                               &wifi_event_handler, NULL);

    g_initialized = true;

    // Check for saved WiFi credentials
    char ssid[33] = {0};
    char password[65] = {0};

    if (load_wifi_credentials(ssid, sizeof(ssid), password, sizeof(password))) {
        LOG_INFO("Found saved WiFi credentials (SSID: %s)", ssid);

        if (start_sta_mode(ssid, password) == 0) {
            // Wait for connection or failure
            EventBits_t bits = xEventGroupWaitBits(
                s_wifi_event_group,
                WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                pdFALSE, pdFALSE,
                pdMS_TO_TICKS(WIFI_STA_CONNECT_TIMEOUT_MS));

            if (bits & WIFI_CONNECTED_BIT) {
                g_mode = WIFI_PROV_MODE_STA;
                LOG_INFO("WiFi connected in STA mode");
                return 0;
            }

            LOG_WARN("STA connection failed/timed out, falling back to AP mode");
            esp_wifi_stop();
        }
    } else {
        LOG_INFO("No saved WiFi credentials found");
    }

    // Start AP mode for provisioning
    if (start_ap_mode() == 0) {
        g_mode = WIFI_PROV_MODE_AP;
        LOG_INFO("WiFi started in AP mode: %s", g_ap_ssid);
        LOG_INFO("AP Password: %s", g_ap_password);
        LOG_INFO("Connect to this network — setup page will appear automatically");
        return 0;
    }

    LOG_ERROR("Failed to start WiFi in any mode");
    return -1;
}

wifi_prov_mode_t wifi_provision_get_mode(void) {
    return g_mode;
}

int wifi_provision_save_credentials(const char *ssid, const char *password) {
    if (!ssid || strlen(ssid) == 0) {
        LOG_ERROR("SSID is required");
        return -1;
    }

    nvs_handle_t nvs;
    esp_err_t ret = nvs_open(WIFI_NVS_NAMESPACE, NVS_READWRITE, &nvs);
    if (ret != ESP_OK) {
        LOG_ERROR("Failed to open NVS: %s", esp_err_to_name(ret));
        return -1;
    }

    ret = nvs_set_str(nvs, WIFI_NVS_KEY_SSID, ssid);
    if (ret != ESP_OK) {
        LOG_ERROR("Failed to save SSID: %s", esp_err_to_name(ret));
        nvs_close(nvs);
        return -1;
    }

    ret = nvs_set_str(nvs, WIFI_NVS_KEY_PASS, password ? password : "");
    if (ret != ESP_OK) {
        LOG_ERROR("Failed to save password: %s", esp_err_to_name(ret));
        nvs_close(nvs);
        return -1;
    }

    ret = nvs_commit(nvs);
    nvs_close(nvs);

    if (ret != ESP_OK) {
        LOG_ERROR("Failed to commit NVS: %s", esp_err_to_name(ret));
        return -1;
    }

    LOG_INFO("WiFi credentials saved (SSID: %s)", ssid);
    return 0;
}

bool wifi_provision_has_credentials(void) {
    char ssid[33];
    char password[65];
    return load_wifi_credentials(ssid, sizeof(ssid), password, sizeof(password));
}

void wifi_provision_get_ap_ssid(char *buf, size_t buf_size) {
    if (g_ap_ssid[0] == '\0') {
        build_ap_ssid();
    }
    snprintf(buf, buf_size, "%s", g_ap_ssid);
}

void wifi_provision_get_ap_password(char *buf, size_t buf_size) {
    if (g_ap_password[0] == '\0') {
        build_ap_password();
    }
    snprintf(buf, buf_size, "%s", g_ap_password);
}

// ============================================================================
// Internal Functions
// ============================================================================

static void build_ap_ssid(void) {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
    snprintf(g_ap_ssid, sizeof(g_ap_ssid), "%s%02X%02X",
             WIFI_AP_SSID_PREFIX, mac[4], mac[5]);
}

static void build_ap_password(void) {
    // WPA2 password = "HW-" + full MAC in hex (e.g., "HW-B8F862F9D38C")
    // 15 chars total — meets WPA2 minimum of 8 chars
    // Unique per device, printed on serial at boot
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
    snprintf(g_ap_password, sizeof(g_ap_password),
             "%s%02X%02X%02X%02X%02X%02X",
             WIFI_AP_PASS_PREFIX,
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static bool load_wifi_credentials(char *ssid, size_t ssid_len,
                                  char *password, size_t pass_len) {
    nvs_handle_t nvs;
    esp_err_t ret = nvs_open(WIFI_NVS_NAMESPACE, NVS_READONLY, &nvs);
    if (ret != ESP_OK) {
        return false;
    }

    size_t required_size = ssid_len;
    ret = nvs_get_str(nvs, WIFI_NVS_KEY_SSID, ssid, &required_size);
    if (ret != ESP_OK || required_size == 0) {
        nvs_close(nvs);
        return false;
    }

    required_size = pass_len;
    ret = nvs_get_str(nvs, WIFI_NVS_KEY_PASS, password, &required_size);
    if (ret != ESP_OK) {
        // Password is optional (open network)
        password[0] = '\0';
    }

    nvs_close(nvs);
    return strlen(ssid) > 0;
}

static int start_sta_mode(const char *ssid, const char *password) {
    esp_netif_create_default_wifi_sta();

    esp_wifi_set_mode(WIFI_MODE_STA);

    wifi_config_t wifi_config = {0};
    // Use snprintf to avoid -Werror=stringop-truncation with strncpy
    snprintf((char *)wifi_config.sta.ssid, sizeof(wifi_config.sta.ssid), "%s", ssid);
    if (password && strlen(password) > 0) {
        snprintf((char *)wifi_config.sta.password,
                 sizeof(wifi_config.sta.password), "%s", password);
    }
    // Require WPA2 minimum if password is set
    wifi_config.sta.threshold.authmode =
        (password && strlen(password) > 0) ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    esp_err_t ret = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (ret != ESP_OK) {
        LOG_ERROR("esp_wifi_set_config STA failed: %s", esp_err_to_name(ret));
        return -1;
    }

    ret = esp_wifi_start();
    if (ret != ESP_OK) {
        LOG_ERROR("esp_wifi_start STA failed: %s", esp_err_to_name(ret));
        return -1;
    }

    s_retry_count = 0;
    return 0;
}

static int start_ap_mode(void) {
    esp_netif_t *ap_netif = esp_netif_create_default_wifi_ap();
    if (!ap_netif) {
        LOG_ERROR("Failed to create AP netif — DHCP will not work");
        return -1;
    }

    esp_wifi_set_mode(WIFI_MODE_AP);

    wifi_config_t wifi_config = {
        .ap = {
            .channel = WIFI_AP_CHANNEL,
            .max_connection = WIFI_AP_MAX_CONNECTIONS,
            .authmode = WIFI_AUTH_OPEN,       // Open AP for easy setup (no password needed)
            .beacon_interval = 100,           // 100 TU (~102ms, standard)
            .ssid_hidden = 0,                 // Explicitly broadcast SSID
            .pmf_cfg = {
                .required = false,  // Optional PMF for max client compatibility
            },
        },
    };
    snprintf((char *)wifi_config.ap.ssid, sizeof(wifi_config.ap.ssid), "%s", g_ap_ssid);
    wifi_config.ap.ssid_len = strlen(g_ap_ssid);

    esp_err_t ret = esp_wifi_set_config(WIFI_IF_AP, &wifi_config);
    if (ret != ESP_OK) {
        LOG_ERROR("esp_wifi_set_config AP failed: %s", esp_err_to_name(ret));
        return -1;
    }

    ret = esp_wifi_start();
    if (ret != ESP_OK) {
        LOG_ERROR("esp_wifi_start AP failed: %s", esp_err_to_name(ret));
        return -1;
    }

    // These MUST be called AFTER esp_wifi_start() per ESP-IDF docs
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);

    // Log the AP IP for confirmation
    esp_netif_ip_info_t ip_info;
    if (esp_netif_get_ip_info(ap_netif, &ip_info) == ESP_OK) {
        LOG_INFO("AP IP: " IPSTR ", GW: " IPSTR ", Mask: " IPSTR,
                 IP2STR(&ip_info.ip), IP2STR(&ip_info.gw), IP2STR(&ip_info.netmask));
    }

    return 0;
}

#endif // APIS_PLATFORM_ESP32
