// Package middleware provides HTTP middleware for the APIS server.
package middleware

import (
	"net/http"

	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/config"
)

// SuperAdminOnly is middleware that restricts access to super-admin users only.
// It requires:
// 1. SaaS mode (AUTH_MODE=keycloak) - returns 404 in local mode
// 2. User's email must be in SUPER_ADMIN_EMAILS env var - returns 403 if not
//
// SECURITY: All authorization failures return a generic "Access denied" message
// to prevent role enumeration attacks. The specific reason for denial is only
// logged server-side for debugging.
//
// This middleware should be applied after the authentication middleware so that
// claims are available in the request context.
//
// Usage:
//
//	r.Route("/api/admin", func(r chi.Router) {
//	    r.Use(authMiddleware)
//	    r.Use(middleware.SuperAdminOnly)
//	    // ... admin routes
//	})
func SuperAdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Super-admin features are only available in SaaS mode
		if !config.IsSaaSMode() {
			log.Debug().
				Str("path", r.URL.Path).
				Str("auth_mode", config.AuthMode()).
				Msg("Super-admin endpoint accessed in non-SaaS mode")
			respondErrorJSON(w, "Not found", http.StatusNotFound)
			return
		}

		// Get authenticated user claims
		claims := GetClaims(r.Context())
		if claims == nil {
			log.Warn().
				Str("path", r.URL.Path).
				Msg("Super-admin endpoint accessed without authentication")
			// SECURITY FIX (AUTH-002-F5): Return generic "Access denied" instead of
			// "Authentication required" to prevent distinguishing between
			// unauthenticated and unauthorized states (role enumeration prevention)
			respondErrorJSON(w, "Access denied", http.StatusForbidden)
			return
		}

		// Check if user is a super-admin
		if !config.IsSuperAdmin(claims.Email) {
			log.Info().
				Str("user_id", claims.UserID).
				Str("email", claims.Email).
				Str("path", r.URL.Path).
				Msg("Non-super-admin attempted to access admin endpoint")
			// SECURITY FIX (AUTH-002-F5): Use same generic message for all auth failures
			respondErrorJSON(w, "Access denied", http.StatusForbidden)
			return
		}

		log.Debug().
			Str("user_id", claims.UserID).
			Str("email", claims.Email).
			Str("path", r.URL.Path).
			Msg("Super-admin access granted")

		next.ServeHTTP(w, r)
	})
}

