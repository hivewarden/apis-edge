// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
)

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
