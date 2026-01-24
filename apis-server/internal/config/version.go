// Package config provides configuration and build information for the APIS server.
package config

// Version is the application version.
// Set at build time via ldflags:
//
//	go build -ldflags "-X github.com/jermoo/apis/apis-server/internal/config.Version=1.2.3" ./cmd/server
//
// Default value is used for local development.
var Version = "0.1.0"
