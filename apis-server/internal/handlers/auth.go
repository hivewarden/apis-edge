// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/rs/zerolog/log"
)

// AuthConfig contains the OIDC configuration for clients.
type AuthConfig struct {
	// Issuer is the Zitadel instance URL (authority)
	Issuer string `json:"issuer"`
	// ClientID is the application's client ID in Zitadel
	ClientID string `json:"client_id"`
}

// GetAuthConfig returns the OIDC configuration for frontend clients.
// This endpoint is public (no authentication required) so the frontend
// can fetch configuration before attempting login.
//
// Response:
//
//	{
//	  "issuer": "http://localhost:8080",
//	  "client_id": "123456789@apis"
//	}
func GetAuthConfig(w http.ResponseWriter, r *http.Request) {
	config := AuthConfig{
		Issuer:   os.Getenv("ZITADEL_ISSUER"),
		ClientID: os.Getenv("ZITADEL_CLIENT_ID"),
	}

	// Log the config request (helpful for debugging)
	log.Debug().
		Str("issuer", config.Issuer).
		Bool("client_id_set", config.ClientID != "").
		Msg("Auth config requested")

	// Warn if configuration is missing
	if config.Issuer == "" {
		log.Warn().Msg("ZITADEL_ISSUER environment variable not set")
	}
	if config.ClientID == "" {
		log.Warn().Msg("ZITADEL_CLIENT_ID environment variable not set")
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(config); err != nil {
		log.Error().Err(err).Msg("Failed to encode auth config response")
		respondError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// respondError sends a JSON error response matching CLAUDE.md API format.
func respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{"error": msg, "code": code})
}

// respondJSON sends a JSON response with the given status code.
func respondJSON(w http.ResponseWriter, data any, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Error().Err(err).Msg("handler: failed to encode response")
	}
}
