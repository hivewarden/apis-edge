package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// tenantIDPattern validates tenant IDs to prevent SQL injection.
// Only allows alphanumeric characters, hyphens, and underscores.
var tenantIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// TenantMiddleware creates middleware that sets up tenant context for each request.
// It must be applied AFTER AuthMiddleware since it requires JWT claims.
//
// The middleware operates differently based on AUTH_MODE:
//
// Local Mode (AUTH_MODE=local):
//   - Uses claims.TenantID from local JWT (default: 00000000-0000-0000-0000-000000000000)
//   - Looks up user by internal ID (claims.UserID = user.id)
//   - Does NOT auto-provision users (users must exist in DB)
//   - Skips tenant status check (default tenant is always active)
//
// SaaS Mode (AUTH_MODE=keycloak):
//   - Uses claims.TenantID (mirrored from Keycloak org_id)
//   - Looks up user by Keycloak ID (claims.UserID = keycloak_user_id)
//   - Auto-provisions tenant and user on first login
//   - Checks tenant status (403 if suspended/deleted)
//
// For each authenticated request:
// 1. Acquires a database connection from the pool
// 2. Sets app.tenant_id in the database session for RLS
// 3. Looks up or provisions the user based on auth mode
// 4. Stores the connection and user in context for handlers
// 5. Releases the connection after the request completes
func TenantMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get claims from auth middleware
			claims := GetClaims(r.Context())
			if claims == nil {
				// This should not happen if AuthMiddleware is applied first
				log.Error().Msg("TenantMiddleware called without auth claims")
				respondErrorJSON(w, "authentication required", http.StatusUnauthorized)
				return
			}

			// Acquire connection from pool
			conn, err := pool.Acquire(r.Context())
			if err != nil {
				log.Error().Err(err).Msg("Failed to acquire database connection")
				respondErrorJSON(w, "database unavailable", http.StatusServiceUnavailable)
				return
			}
			defer conn.Release()

			// Use TenantID which is set correctly by both local and SaaS auth middlewares
			tenantID := claims.TenantID

			// E15-C3: Fallback when Keycloak org_id claim is missing.
			// Uses a transaction with a scoped RLS bypass flag to look up
			// the user's stored tenant_id by their external OIDC user ID.
			// First-time users MUST have org_id — fallback only helps existing users.
			if tenantID == "" && !config.IsLocalAuth() {
				log.Warn().Str("user_id", claims.UserID).
					Msg("SaaS mode: org_id missing, attempting user-lookup fallback")

				var fallbackTenantID string
				tx, txErr := conn.Begin(r.Context())
				if txErr == nil {
					_, _ = tx.Exec(r.Context(), "SELECT set_config('app.org_fallback_mode', 'true', true)")
					txErr = tx.QueryRow(r.Context(),
						"SELECT tenant_id FROM users WHERE external_user_id = $1 LIMIT 1",
						claims.UserID,
					).Scan(&fallbackTenantID)
					tx.Rollback(r.Context()) // Always rollback — discards SET LOCAL
				}

				if txErr != nil || fallbackTenantID == "" {
					log.Error().Err(txErr).Str("user_id", claims.UserID).
						Msg("SaaS mode: org_id fallback failed — user has no stored tenant")
					respondErrorJSON(w, "organization identity required (org_id claim missing)", http.StatusForbidden)
					return
				}
				tenantID = fallbackTenantID
				claims.TenantID = tenantID
				claims.OrgID = tenantID
				log.Info().Str("user_id", claims.UserID).Str("tenant_id", tenantID).
					Msg("SaaS mode: org_id resolved via user-lookup fallback")
			}

			// Validate tenant ID format for defense in depth.
			// While we use parameterized queries, validation provides additional safety.
			if !tenantIDPattern.MatchString(tenantID) {
				log.Error().Str("tenant_id", tenantID).Msg("Invalid tenant ID format")
				respondErrorJSON(w, "invalid tenant id", http.StatusBadRequest)
				return
			}

			// Set tenant context in database session for RLS enforcement.
			// Using set_config with true for local scope (transaction-only).
			// This must happen BEFORE user lookup because RLS is enabled on users table.
			_, err = conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, true)", tenantID)
			if err != nil {
				log.Error().Err(err).Str("tenant_id", tenantID).Msg("Failed to set tenant context")
				respondErrorJSON(w, "failed to set tenant context", http.StatusInternalServerError)
				return
			}

			// Mode-aware user lookup and provisioning
			var user *storage.User

			if config.IsLocalAuth() {
				// LOCAL MODE: Look up user by internal ID, no auto-provisioning
				user, err = lookupLocalUser(r.Context(), conn, claims)
				if err != nil {
					if errors.Is(err, storage.ErrNotFound) {
						log.Warn().
							Str("user_id", claims.UserID).
							Str("tenant_id", tenantID).
							Msg("Local mode: user not found in database")
						respondErrorJSON(w, "user not found", http.StatusForbidden)
						return
					}
					log.Error().Err(err).Str("user_id", claims.UserID).Msg("Failed to lookup user")
					respondErrorJSON(w, "failed to lookup user", http.StatusInternalServerError)
					return
				}

				// SECURITY FIX (AUTH-002-F2): Defense-in-depth tenant verification
				// Verify the user's actual tenant_id in the database matches the JWT claim.
				// This provides an extra layer of protection beyond RLS in case of:
				// - Token theft with modified claims
				// - RLS policy misconfiguration
				// - Database migration issues
				if user.TenantID != tenantID {
					log.Error().
						Str("user_id", claims.UserID).
						Str("jwt_tenant_id", tenantID).
						Str("db_tenant_id", user.TenantID).
						Msg("SECURITY: Tenant mismatch between JWT and database record")
					respondErrorJSON(w, "access denied", http.StatusForbidden)
					return
				}
			} else {
				// SAAS MODE: Check tenant status, then provision user if needed
				if err := checkTenantStatus(r.Context(), conn, tenantID); err != nil {
					if errors.Is(err, errTenantNotActive) {
						log.Warn().
							Str("tenant_id", tenantID).
							Msg("SaaS mode: tenant not active")
						respondErrorJSON(w, "tenant access denied", http.StatusForbidden)
						return
					}
					// Tenant doesn't exist yet - will be created during provisioning
					if !errors.Is(err, storage.ErrNotFound) {
						log.Error().Err(err).Str("tenant_id", tenantID).Msg("Failed to check tenant status")
						respondErrorJSON(w, "failed to validate tenant", http.StatusInternalServerError)
						return
					}
				}

				// Auto-provision user (creates tenant/user on first login)
				user, err = provisionSaaSUser(r.Context(), conn, claims)
				if err != nil {
					log.Error().Err(err).Str("user_id", claims.UserID).Msg("Failed to provision user")
					respondErrorJSON(w, "failed to provision user", http.StatusInternalServerError)
					return
				}

				// SECURITY FIX (AUTH-002-F2): Defense-in-depth tenant verification for SaaS mode
				// Verify the provisioned user's tenant_id matches the JWT claim.
				// In SaaS mode, this catches edge cases where:
				// - A user was moved between orgs in the OIDC provider but has old token
				// - Token was somehow issued with wrong org_id claim
				if user.TenantID != tenantID {
					log.Error().
						Str("user_id", claims.UserID).
						Str("jwt_tenant_id", tenantID).
						Str("db_tenant_id", user.TenantID).
						Msg("SECURITY: Tenant mismatch between JWT and database record (SaaS)")
					respondErrorJSON(w, "access denied", http.StatusForbidden)
					return
				}
			}

			// Store connection and user in context for handlers
			ctx := storage.WithConn(r.Context(), conn)
			ctx = WithUser(ctx, user)

			log.Trace().
				Str("tenant_id", tenantID).
				Str("user_id", claims.UserID).
				Str("auth_mode", config.AuthMode()).
				Str("path", r.URL.Path).
				Msg("Tenant context set")

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// errTenantNotActive is returned when a tenant exists but is not in 'active' status.
var errTenantNotActive = errors.New("tenant not active")

// lookupLocalUser retrieves a user by their internal ID for local auth mode.
// In local mode, claims.UserID contains the internal user ID from the users table.
// Returns storage.ErrNotFound if the user doesn't exist.
func lookupLocalUser(ctx context.Context, conn *pgxpool.Conn, claims *Claims) (*storage.User, error) {
	// In local mode, the JWT sub claim contains the internal user ID
	user, err := storage.GetUserByID(ctx, conn, claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("tenant: lookup local user: %w", err)
	}
	return user, nil
}

// provisionSaaSUser ensures a user exists for SaaS mode, creating them if needed.
// Uses the existing EnsureUserProvisioned service which handles tenant/user creation.
func provisionSaaSUser(ctx context.Context, conn *pgxpool.Conn, claims *Claims) (*storage.User, error) {
	provClaims := &services.ProvisioningClaims{
		UserID: claims.UserID,
		OrgID:  claims.TenantID,
		Email:  claims.Email,
		Name:   claims.Name,
	}
	user, err := services.EnsureUserProvisioned(ctx, conn, provClaims)
	if err != nil {
		return nil, fmt.Errorf("tenant: provision saas user: %w", err)
	}
	return user, nil
}

// checkTenantStatus verifies that a tenant exists and is active.
// Only called in SaaS mode where tenants can be suspended or deleted.
// Returns:
//   - nil if tenant is active
//   - errTenantNotActive if tenant exists but status is not 'active'
//   - storage.ErrNotFound if tenant doesn't exist (will be created during provisioning)
func checkTenantStatus(ctx context.Context, conn *pgxpool.Conn, tenantID string) error {
	status, err := storage.GetTenantStatus(ctx, conn, tenantID)
	if err != nil {
		return err
	}

	if status != "active" && status != "" {
		// Empty status means column doesn't exist (backward compatible) - treat as active
		return errTenantNotActive
	}

	return nil
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
// Works consistently in both local and SaaS modes by using TenantID field.
func GetTenantID(ctx context.Context) string {
	claims := GetClaims(ctx)
	if claims == nil {
		return ""
	}
	// Use TenantID which is populated by both local and SaaS auth middlewares
	return claims.TenantID
}

// WithTenantID returns a new context with the tenant ID attached.
// This is primarily used in tests to inject tenant context without full auth claims.
// For production code, use the TenantMiddleware which sets claims with TenantID.
func WithTenantID(ctx context.Context, tenantID string) context.Context {
	// Create minimal claims with the tenant ID for compatibility
	claims := &Claims{
		TenantID: tenantID,
	}
	return context.WithValue(ctx, ClaimsKey, claims)
}
