package middleware

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TenantMiddleware creates middleware that sets up tenant context for each request.
// It must be applied AFTER AuthMiddleware since it requires JWT claims.
//
// For each authenticated request:
// 1. Acquires a database connection from the pool
// 2. Sets app.tenant_id in the database session for RLS
// 3. Stores the connection in context for handlers
// 4. Releases the connection after the request completes
func TenantMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get claims from auth middleware
			claims := GetClaims(r.Context())
			if claims == nil {
				// This should not happen if AuthMiddleware is applied first
				log.Error().Msg("TenantMiddleware called without auth claims")
				respondTenantError(w, "authentication required", http.StatusUnauthorized)
				return
			}

			// Acquire connection from pool
			conn, err := pool.Acquire(r.Context())
			if err != nil {
				log.Error().Err(err).Msg("Failed to acquire database connection")
				respondTenantError(w, "database unavailable", http.StatusServiceUnavailable)
				return
			}
			defer conn.Release()

			// Set tenant context in database session FIRST
			// This must happen BEFORE provisioning because RLS is enabled on users table.
			// Using SET LOCAL so it only applies to this connection's session.
			// The org_id comes from the validated JWT, so it's trusted.
			_, err = conn.Exec(r.Context(), "SET LOCAL app.tenant_id = $1", claims.OrgID)
			if err != nil {
				log.Error().Err(err).Str("org_id", claims.OrgID).Msg("Failed to set tenant context")
				respondTenantError(w, "failed to set tenant context", http.StatusInternalServerError)
				return
			}

			// Ensure user is provisioned (creates tenant/user on first login)
			// Now that tenant context is set, RLS will allow operations on this tenant's data.
			// Note: Tenants table has no RLS, so GetOrCreateTenant works regardless.
			provClaims := &services.ProvisioningClaims{
				UserID: claims.UserID,
				OrgID:  claims.OrgID,
				Email:  claims.Email,
				Name:   claims.Name,
			}
			user, err := services.EnsureUserProvisioned(r.Context(), conn, provClaims)
			if err != nil {
				log.Error().Err(err).Str("user_id", claims.UserID).Msg("Failed to provision user")
				respondTenantError(w, "failed to provision user", http.StatusInternalServerError)
				return
			}

			// Store connection and user in context for handlers
			ctx := storage.WithConn(r.Context(), conn)
			ctx = WithUser(ctx, user)

			log.Debug().
				Str("tenant_id", claims.OrgID).
				Str("user_id", claims.UserID).
				Str("path", r.URL.Path).
				Msg("Tenant context set")

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// respondTenantError sends a JSON error response for tenant middleware errors.
func respondTenantError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{
		"error": message,
		"code":  code,
	})
}

// userCtxKey is the context key for storing the provisioned user.
type userCtxKey struct{}

// UserKey is the context key for storing the database user.
var UserKey = userCtxKey{}

// GetUser retrieves the provisioned user from the request context.
// Returns nil if no user is set (e.g., before provisioning).
func GetUser(ctx context.Context) *storage.User {
	user, _ := ctx.Value(UserKey).(*storage.User)
	return user
}

// WithUser returns a new context with the user attached.
func WithUser(ctx context.Context, user *storage.User) context.Context {
	return context.WithValue(ctx, UserKey, user)
}

// GetTenantID retrieves the tenant ID from the request context.
// Returns empty string if no claims are set.
func GetTenantID(ctx context.Context) string {
	claims := GetClaims(ctx)
	if claims == nil {
		return ""
	}
	return claims.OrgID
}
