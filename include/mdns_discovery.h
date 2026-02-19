/**
 * mDNS Service Discovery for APIS Edge Device.
 *
 * After connecting to WiFi (STA mode), uses mDNS/DNS-SD to:
 * 1. Advertise this edge device on the local network
 * 2. Discover the Hive Warden server automatically
 *
 * This eliminates the need for users to manually enter the server URL
 * during setup. The server advertises "_hivewarden._tcp" and the device
 * queries for it after connecting to WiFi.
 *
 * Discovery sequence (matches CLAUDE.md boot sequence):
 * 1. Check saved config → use if exists
 * 2. Try mDNS: query for _hivewarden._tcp → THIS MODULE
 * 3. Try default: apis.honeybeegood.be
 * 4. No server → operate standalone
 *
 * ESP32-only module. Requires espressif/mdns component.
 */

#ifndef APIS_MDNS_DISCOVERY_H
#define APIS_MDNS_DISCOVERY_H

#include <stdint.h>
#include <stddef.h>

/**
 * Result of an mDNS server discovery query.
 */
typedef struct {
    char host[64];       // Server IP address (e.g., "192.168.1.100")
    uint16_t port;       // Server port (e.g., 3000)
    char api_path[32];   // API base path (e.g., "/api")
    char auth_mode[16];  // Auth mode from TXT record (e.g., "local")
} mdns_server_result_t;

/**
 * Initialize mDNS for the edge device.
 *
 * Sets the device hostname (e.g., "hivewarden-A1B2.local") and
 * advertises it as a _hivewarden._tcp service so the dashboard
 * and server can discover edge devices on the network.
 *
 * @param device_id  Short device identifier (e.g., "A1B2")
 * @param http_port  Port the device HTTP server listens on
 * @return 0 on success, -1 on error
 */
int mdns_discovery_init(const char *device_id, uint16_t http_port);

/**
 * Discover a Hive Warden server on the local network.
 *
 * Sends a PTR query for _hivewarden._tcp services. If a server is
 * found, populates the result struct with its address and metadata.
 *
 * @param result  Output: discovered server info
 * @return 0 if server found, -1 if no server discovered
 */
int mdns_discovery_find_server(mdns_server_result_t *result);

/**
 * Clean up mDNS resources.
 */
void mdns_discovery_cleanup(void);

#endif // APIS_MDNS_DISCOVERY_H
