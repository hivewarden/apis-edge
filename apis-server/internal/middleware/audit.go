package middleware

import (
	"net/http"

	"github.com/jermoo/apis/apis-server/internal/services"
)

// AuditContextMiddleware adds audit context to requests.
// This middleware should be applied AFTER AuthMiddleware.
// It extracts tenant_id, user_id, and IP address and stores them
// in the context for use by audit logging.
func AuditContextMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Get claims from auth middleware
			claims := GetClaims(ctx)
			if claims != nil {
				// Extract IP address from RemoteAddr.
				// RealIP middleware normalizes this from trusted proxy headers.
				ipAddress := services.ExtractIPAddress(r.RemoteAddr)

				// Add audit context
				ctx = services.WithAuditContext(ctx, claims.TenantID, claims.UserID, ipAddress)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
