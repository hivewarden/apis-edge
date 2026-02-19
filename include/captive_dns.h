/**
 * Captive Portal DNS Server for APIS Edge Device.
 *
 * When the device is in AP mode (setup), this lightweight DNS server
 * intercepts ALL DNS queries and responds with the device's own IP
 * (192.168.4.1). This makes phones/laptops automatically detect a
 * captive portal and pop open the setup page.
 *
 * How it works:
 * 1. Phone connects to "HiveWarden-XXXX" WiFi
 * 2. Phone tries to resolve captive.apple.com (or similar)
 * 3. This DNS server responds: "captive.apple.com = 192.168.4.1"
 * 4. Phone's HTTP probe hits our HTTP server instead of Apple's
 * 5. Our server redirects to /setup → captive portal popup appears
 *
 * ESP32-only module. Only runs during AP mode.
 */

#ifndef APIS_CAPTIVE_DNS_H
#define APIS_CAPTIVE_DNS_H

#include <stdint.h>

/**
 * Start the captive DNS server.
 *
 * Listens on UDP port 53 and responds to all A-record queries
 * with the given IP address (typically 192.168.4.1).
 *
 * Must be called AFTER WiFi AP mode is started (needs the network
 * interface to be up).
 *
 * @param redirect_ip IPv4 address to return for all queries (network byte order)
 * @return 0 on success, -1 on error
 */
int captive_dns_start(uint32_t redirect_ip);

/**
 * Stop the captive DNS server.
 *
 * Closes the UDP socket and stops the background task.
 * Safe to call even if not started.
 */
void captive_dns_stop(void);

#endif // APIS_CAPTIVE_DNS_H
