/**
 * Hive Warden — Default Onboarding Configuration
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  SELF-HOSTERS: Edit this file before building the firmware!   │
 * └────────────────────────────────────────────────────────────────┘
 *
 * When a device connects to WiFi for the first time, it needs to know
 * where the Hive Warden server is. This file controls the default
 * server URL that the device uses.
 *
 * HOW SERVER DISCOVERY WORKS (in order):
 *
 *   1. User-configured URL  — If someone entered a server URL during
 *      setup (via the captive portal), that URL is used. Always wins.
 *
 *   2. mDNS auto-discovery  — The device searches the local network
 *      for a Hive Warden server. Works automatically for standalone
 *      installs on the same LAN. No config needed.
 *
 *   3. Default URL (below)  — If nothing else found, the device uses
 *      the URL defined here. By default this points to the official
 *      Hive Warden cloud at hivewarden.eu.
 *
 * FOR SELF-HOSTERS:
 *   Change ONBOARDING_DEFAULT_URL to your own server address.
 *   Example: "https://bees.myclub.be"
 *
 *   If you also want a fallback (e.g., the official cloud as backup),
 *   set ONBOARDING_FALLBACK_URL. Leave it empty ("") to disable.
 */

#ifndef APIS_ONBOARDING_DEFAULTS_H
#define APIS_ONBOARDING_DEFAULTS_H

/**
 * Primary server URL.
 *
 * The device connects here after WiFi setup if no server was found
 * via mDNS and no URL was manually configured.
 *
 * Default: Official Hive Warden cloud (free tier available)
 * Self-host: Change to your server's public URL
 */
#define ONBOARDING_DEFAULT_URL   "https://hivewarden.eu"

/**
 * Fallback server URL (optional).
 *
 * If the primary URL is unreachable, the device tries this one.
 * Set to "" (empty string) to disable fallback.
 *
 * Examples:
 *   ""                              — No fallback (default)
 *   "https://hivewarden.eu"         — Fall back to official cloud
 *   "http://192.168.1.100:3000"     — Fall back to a local server
 */
#define ONBOARDING_FALLBACK_URL  ""

#endif // APIS_ONBOARDING_DEFAULTS_H
