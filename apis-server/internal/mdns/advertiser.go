// Package mdns provides mDNS service advertisement for the Hive Warden server.
//
// In standalone mode, the server advertises itself as a _hivewarden._tcp
// service on the local network. ESP32 edge devices discover this service
// after connecting to WiFi, eliminating the need for manual server URL entry.
//
// Only runs in standalone (local auth) mode. SaaS mode uses DNS, not mDNS.
package mdns

import (
	"fmt"
	"os"
	"sync"

	"github.com/grandcat/zeroconf"
	"github.com/rs/zerolog/log"
)

const (
	// ServiceType is the DNS-SD service type for Hive Warden servers.
	// Edge devices query for this service type to auto-discover the server.
	// Follows RFC 6763 naming: underscore prefix, max 15 chars, ._tcp suffix.
	ServiceType = "_hivewarden._tcp."

	// serviceTypeShort is the service type without the trailing dot,
	// as required by the zeroconf library.
	serviceTypeShort = "_hivewarden"

	// domain is the mDNS domain (always "local" for link-local).
	domain = "local."
)

// Advertiser manages mDNS service advertisement for the Hive Warden server.
type Advertiser struct {
	server *zeroconf.Server
	mu     sync.Mutex
}

// Start begins advertising the Hive Warden server on the local network.
//
// The server is registered with TXT records that edge devices use to
// configure their connection:
//   - version: API version for compatibility checking
//   - mode: deployment mode (standalone or saas)
//   - path: API base path (/api)
//   - auth: authentication mode (local or keycloak)
//
// This is non-fatal — if mDNS fails to start, the server continues
// normally and devices fall back to manual URL configuration.
func (a *Advertiser) Start(port int, authMode string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.server != nil {
		return fmt.Errorf("mdns: already advertising")
	}

	hostname, err := os.Hostname()
	if err != nil {
		hostname = "hivewarden"
	}

	// TXT records provide metadata to discovering edge devices
	txt := []string{
		"version=1",
		"mode=standalone",
		"path=/api",
		fmt.Sprintf("auth=%s", authMode),
	}

	// Register the service. The instance name is the hostname,
	// making it unique on the network even with multiple servers.
	a.server, err = zeroconf.Register(
		hostname,         // Instance name (unique per server)
		serviceTypeShort, // _hivewarden
		domain,           // local.
		port,             // Server port (e.g., 3000)
		txt,              // TXT records
		nil,              // All network interfaces
	)
	if err != nil {
		return fmt.Errorf("mdns: failed to register service: %w", err)
	}

	log.Info().
		Str("service", ServiceType).
		Int("port", port).
		Str("hostname", hostname).
		Strs("txt", txt).
		Msg("mDNS service advertised — edge devices can auto-discover this server")

	return nil
}

// Stop cleanly shuts down the mDNS advertisement.
func (a *Advertiser) Stop() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.server != nil {
		a.server.Shutdown()
		a.server = nil
		log.Info().Msg("mDNS service advertisement stopped")
	}
}
