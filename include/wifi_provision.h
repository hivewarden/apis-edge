/**
 * WiFi Provisioning for APIS Edge Device.
 *
 * Handles WiFi connection management:
 * - STA mode: Connect to saved WiFi network
 * - AP mode: Create "HiveWarden-XXXX" hotspot for initial setup
 *
 * On first boot (no saved credentials), starts AP mode so the user
 * can connect via phone. A captive portal automatically pops up the
 * setup page — no manual URL entry needed.
 *
 * ESP32-only module. Guarded by APIS_PLATFORM_ESP32.
 */

#ifndef APIS_WIFI_PROVISION_H
#define APIS_WIFI_PROVISION_H

#include <stdbool.h>
#include <stddef.h>

/**
 * WiFi provisioning mode.
 */
typedef enum {
    WIFI_PROV_MODE_NONE = 0,  // Not initialized
    WIFI_PROV_MODE_AP,        // Access point (needs setup)
    WIFI_PROV_MODE_STA,       // Station (connected to WiFi)
} wifi_prov_mode_t;

/**
 * Initialize WiFi provisioning.
 *
 * Checks NVS for saved WiFi credentials:
 * - If credentials exist: connects as WiFi station (STA mode)
 * - If no credentials: starts AP mode ("HiveWarden-XXXX" hotspot)
 * - If STA connection fails after timeout: falls back to AP mode
 *
 * Must be called after NVS and SPIFFS are initialized, but before
 * the main application loop.
 *
 * @return 0 on success (WiFi started in some mode), -1 on error
 */
int wifi_provision_init(void);

/**
 * Get current WiFi provisioning mode.
 *
 * @return Current mode (AP, STA, or NONE)
 */
wifi_prov_mode_t wifi_provision_get_mode(void);

/**
 * Save WiFi credentials to NVS.
 *
 * @param ssid WiFi network name
 * @param password WiFi password (can be empty for open networks)
 * @return 0 on success, -1 on error
 */
int wifi_provision_save_credentials(const char *ssid, const char *password);

/**
 * Check if WiFi credentials are saved in NVS.
 *
 * @return true if credentials exist
 */
bool wifi_provision_has_credentials(void);

/**
 * Get the AP mode SSID (e.g., "HiveWarden-A1B2").
 *
 * @param buf Output buffer
 * @param buf_size Buffer size (recommend >= 32)
 */
void wifi_provision_get_ap_ssid(char *buf, size_t buf_size);

/**
 * Get the AP mode WPA2 password (e.g., "HW-B8F862F9D38C").
 *
 * Password is derived from the device MAC address.
 * Printed on serial at boot; in production, printed on device label.
 *
 * @param buf Output buffer
 * @param buf_size Buffer size (recommend >= 32)
 */
void wifi_provision_get_ap_password(char *buf, size_t buf_size);

#endif // APIS_WIFI_PROVISION_H
