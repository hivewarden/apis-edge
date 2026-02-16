// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
)

// CSRF configuration constants
const (
	// CSRFCookieName is the name of the CSRF token cookie.
	// This cookie is readable by JavaScript (HttpOnly=false) so the frontend
	// can include the token in request headers.
	CSRFCookieName = "apis_csrf_token"

	// CSRFHeaderName is the HTTP header that must contain the CSRF token.
	// The frontend reads the token from the cookie and includes it in this header.
	CSRFHeaderName = "X-CSRF-Token"

	// CSRFTokenLength is the length of the CSRF token in bytes (32 bytes = 64 hex chars).
	// 256 bits of entropy provides strong protection against brute force attacks.
	CSRFTokenLength = 32
)

// generateCSRFToken creates a cryptographically secure random token.
func generateCSRFToken() (string, error) {
	bytes := make([]byte, CSRFTokenLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// isSecureCookie determines whether cookies should have the Secure flag set.
// It checks TLS status, proxy headers, and the SECURE_COOKIES env var override.
func isSecureCookie(r *http.Request) bool {
	secure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	if os.Getenv("SECURE_COOKIES") == "true" {
		secure = true
	} else if os.Getenv("SECURE_COOKIES") == "false" {
		secure = false
	}
	return secure
}

// SetCSRFCookie generates and sets a CSRF token cookie on the response.
// This should be called after successful login to provide the frontend
// with a token to include in subsequent state-changing requests.
//
// SECURITY FIX (CSRF-001-1, CSRF-001-3): Added CSRF token generation with proper cookie attributes.
//
// Cookie attributes:
// - HttpOnly: false (JavaScript must be able to read the token)
// - Secure: true in production (HTTPS only)
// - SameSite: Strict (prevents cross-origin requests from sending the cookie)
// - Path: / (available to all API endpoints)
func SetCSRFCookie(w http.ResponseWriter, r *http.Request) error {
	token, err := generateCSRFToken()
	if err != nil {
		log.Error().Err(err).Msg("middleware: failed to generate CSRF token")
		return err
	}

	cookie := &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: false, // Must be readable by JavaScript
		Secure:   isSecureCookie(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   86400 * 7, // 7 days - matches remember-me session cookie duration.
		// NOTE (S1-L4): For default 24h sessions, this cookie outlives the session.
		// This is benign since a new login generates a new CSRF cookie.
		// Aligning with the actual JWT expiry would be more precise but adds complexity.
	}

	http.SetCookie(w, cookie)
	return nil
}

// ClearCSRFCookie removes the CSRF token cookie (e.g., on logout).
func ClearCSRFCookie(w http.ResponseWriter, r *http.Request) {
	cookie := &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: false,
		Secure:   isSecureCookie(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1, // Delete cookie
	}

	http.SetCookie(w, cookie)
}

// CSRFProtection is middleware that validates CSRF tokens on state-changing requests.
// It implements the Double-Submit Cookie pattern:
// 1. Server sets a random token in a cookie (readable by JS, not HttpOnly)
// 2. Client includes the token in X-CSRF-Token header on each request
// 3. Server validates that the header value matches the cookie value
//
// Protected methods: POST, PUT, PATCH, DELETE
// Unprotected methods: GET, HEAD, OPTIONS (safe methods per HTTP spec)
//
// SECURITY FIX (CSRF-001-1): Added CSRF token validation for state-changing requests.
func CSRFProtection(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip CSRF check for safe methods (read-only operations)
		method := strings.ToUpper(r.Method)
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// Get token from cookie
		cookie, err := r.Cookie(CSRFCookieName)
		if err != nil || cookie.Value == "" {
			log.Warn().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Str("remote_addr", r.RemoteAddr).
				Msg("CSRF validation failed: missing cookie")
			respondErrorJSON(w, "CSRF token missing", http.StatusForbidden)
			return
		}

		// Get token from header
		headerToken := r.Header.Get(CSRFHeaderName)
		if headerToken == "" {
			log.Warn().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Str("remote_addr", r.RemoteAddr).
				Msg("CSRF validation failed: missing header")
			respondErrorJSON(w, "CSRF token missing from header", http.StatusForbidden)
			return
		}

		// Constant-time comparison to prevent timing attacks
		// Both tokens are hex strings, so we can compare directly
		if !secureCompare(cookie.Value, headerToken) {
			log.Warn().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Str("remote_addr", r.RemoteAddr).
				Msg("CSRF validation failed: token mismatch")
			respondErrorJSON(w, "CSRF token invalid", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// secureCompare performs a constant-time string comparison.
// Uses crypto/subtle.ConstantTimeCompare for guaranteed constant-time behavior.
func secureCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

