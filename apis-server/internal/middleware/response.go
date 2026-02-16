// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"encoding/json"
	"net/http"
)

// respondErrorJSON sends a JSON error response with the given message and status code.
// This is the standard error response helper for all middleware functions.
// It produces the standard API error format: {"error": "...", "code": N}
func respondErrorJSON(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{"error": message, "code": code})
}
