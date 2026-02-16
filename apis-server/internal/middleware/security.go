// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"encoding/json"
	"net/http"
)

// Default body size limits
const (
	// DefaultMaxBodySize is 1MB - used for most JSON API endpoints
	DefaultMaxBodySize = 1 * 1024 * 1024
	// LargeMaxBodySize is 16MB - used for file upload endpoints
	LargeMaxBodySize = 16 * 1024 * 1024
)

// BodySizeOverride describes a body-size limit override for a specific route.
// Method and Path must both match to apply. Path matching is exact.
type BodySizeOverride struct {
	Method   string
	Path     string
	MaxBytes int64
}

// SecurityHeaders is middleware that adds security-related HTTP headers to all responses.
// These headers protect against common web vulnerabilities and are recommended by OWASP.
//
// Headers added:
// - X-Content-Type-Options: nosniff - Prevents MIME-type sniffing
// - X-Frame-Options: DENY - Prevents clickjacking by disabling framing
// - X-XSS-Protection: 1; mode=block - Enables browser XSS filter
//
// Note: Content-Security-Policy and Strict-Transport-Security are not included here
// as they require application-specific configuration and are typically handled by
// a reverse proxy (e.g., BunkerWeb) in production deployments.
//
// Example usage:
//
//	r := chi.NewRouter()
//	r.Use(SecurityHeaders)
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent MIME-type sniffing
		// This stops browsers from trying to guess the content type,
		// which can lead to XSS attacks if a malicious file is served
		// with an incorrect content type.
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking
		// DENY means the page cannot be displayed in a frame, regardless of
		// the site attempting to do so. This prevents malicious sites from
		// embedding our UI in a transparent frame to trick users.
		w.Header().Set("X-Frame-Options", "DENY")

		// Enable browser XSS filter
		// mode=block instructs the browser to block the page entirely if
		// a XSS attack is detected, rather than trying to sanitize.
		// Note: This header is deprecated in modern browsers but still
		// provides protection for older browsers.
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Referrer-Policy: Only send origin in cross-origin requests
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions-Policy: Disable unnecessary browser features
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// HSTS: Enforce HTTPS when behind TLS terminator
		// Only set when request came via HTTPS to avoid breaking dev environments
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		next.ServeHTTP(w, r)
	})
}

// MaxBodySize is middleware that limits the size of incoming request bodies.
// This prevents denial-of-service attacks where clients send extremely large
// requests to exhaust server memory.
//
// The middleware wraps the request body with http.MaxBytesReader, which will
// return an error if the client attempts to send more than maxBytes.
//
// Parameters:
//   - maxBytes: Maximum allowed request body size in bytes
//
// Example usage:
//
//	r := chi.NewRouter()
//	r.Use(MaxBodySize(middleware.DefaultMaxBodySize))  // 1MB for JSON endpoints
//	r.Route("/upload", func(r chi.Router) {
//	    r.Use(MaxBodySize(middleware.LargeMaxBodySize))  // 16MB for uploads
//	    r.Post("/", uploadHandler)
//	})
func MaxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Wrap the body with MaxBytesReader
			// This will automatically return an error if the body exceeds maxBytes
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// MaxBodySizeWithOverrides applies a default body-size limit with optional
// exact route/method overrides for endpoints that legitimately handle larger payloads.
func MaxBodySizeWithOverrides(defaultMaxBytes int64, overrides []BodySizeOverride) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			maxBytes := defaultMaxBytes
			for _, override := range overrides {
				if override.Method == r.Method && override.Path == r.URL.Path {
					maxBytes = override.MaxBytes
					break
				}
			}

			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// respondBodyTooLarge sends a 413 Payload Too Large response.
// This is a helper function for handlers that catch MaxBytesError.
func respondBodyTooLarge(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusRequestEntityTooLarge)
	json.NewEncoder(w).Encode(map[string]any{
		"error": "Request body too large",
		"code":  http.StatusRequestEntityTooLarge,
	})
}

// IsMaxBytesError checks if an error is due to request body size exceeding the limit.
// This can be used by handlers to provide a specific error response.
func IsMaxBytesError(err error) bool {
	if err == nil {
		return false
	}
	// The error message from http.MaxBytesReader contains "http: request body too large"
	return err.Error() == "http: request body too large"
}
