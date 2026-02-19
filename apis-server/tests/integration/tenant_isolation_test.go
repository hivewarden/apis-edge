// Package integration contains integration tests for the APIS server.
package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// mockAuthMiddleware creates a middleware that injects claims into context.
// This simulates authenticated requests for testing.
func mockAuthMiddleware(claims *middleware.Claims) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// mockTenantMiddleware replaces TenantMiddleware for handler integration tests.
// It auto-provisions the user (like SaaS mode) and creates a per-request copy
// of claims with UserID set to the internal database user ID. This ensures
// handlers that use claims.UserID for FK references get a valid users.id value
// without mutating the shared claims object across requests.
func mockTenantMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	// Cache provisioned user IDs: "externalID:tenantID" -> *storage.User
	var cache sync.Map

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			originalClaims := middleware.GetClaims(r.Context())
			if originalClaims == nil {
				http.Error(w, "no claims", http.StatusUnauthorized)
				return
			}

			conn, err := pool.Acquire(r.Context())
			if err != nil {
				http.Error(w, "db unavailable", http.StatusServiceUnavailable)
				return
			}
			defer conn.Release()

			// Create per-request copy of claims (never mutate the shared original)
			reqClaims := *originalClaims

			tenantID := reqClaims.TenantID
			if tenantID == "" {
				tenantID = reqClaims.OrgID
			}

			_, err = conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, false)", tenantID)
			if err != nil {
				http.Error(w, "failed to set tenant", http.StatusInternalServerError)
				return
			}

			// Check cache for already-provisioned user
			cacheKey := originalClaims.UserID + ":" + tenantID
			var user *storage.User
			if cached, ok := cache.Load(cacheKey); ok {
				user = cached.(*storage.User)
			} else {
				// Auto-provision user
				provClaims := &services.ProvisioningClaims{
					UserID: originalClaims.UserID,
					OrgID:  tenantID,
					Email:  originalClaims.Email,
					Name:   originalClaims.Name,
				}
				user, err = services.EnsureUserProvisioned(r.Context(), conn, provClaims)
				if err != nil {
					http.Error(w, "failed to provision user", http.StatusInternalServerError)
					return
				}
				cache.Store(cacheKey, user)
			}

			// Set internal user ID on the per-request copy
			reqClaims.UserID = user.ID

			ctx := storage.WithConn(r.Context(), conn)
			ctx = middleware.WithUser(ctx, user)
			ctx = context.WithValue(ctx, middleware.ClaimsKey, &reqClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// TestTenantIsolationE2E tests the full tenant isolation flow.
// Requires a running database - skip if DATABASE_URL not set.
func TestTenantIsolationE2E(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Define test tenants — TenantID must be set for keycloak mode
	claimsA := &middleware.Claims{
		UserID:   "user-a-e2e",
		OrgID:    "org-a-e2e",
		TenantID: "org-a-e2e",
		Email:    "a@example.com",
		Name:     "User A",
		Roles:    []string{"owner"},
	}
	claimsB := &middleware.Claims{
		UserID:   "user-b-e2e",
		OrgID:    "org-b-e2e",
		TenantID: "org-b-e2e",
		Email:    "b@example.com",
		Name:     "User B",
		Roles:    []string{"member"},
	}

	// Use mockTenantMiddleware for all subtests (auto-provisions users)
	t.Run("user A gets their own data", func(t *testing.T) {
		r := chi.NewRouter()
		r.Use(mockAuthMiddleware(claimsA))
		r.Use(mockTenantMiddleware(testAppPool()))
		r.Get("/api/me", handlers.GetMe)

		req := httptest.NewRequest("GET", "/api/me", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.MeResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, claimsA.OrgID, resp.TenantID)
		assert.Equal(t, claimsA.Email, resp.Email)
	})

	t.Run("user B gets their own data", func(t *testing.T) {
		r := chi.NewRouter()
		r.Use(mockAuthMiddleware(claimsB))
		r.Use(mockTenantMiddleware(testAppPool()))
		r.Get("/api/me", handlers.GetMe)

		req := httptest.NewRequest("GET", "/api/me", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.MeResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, claimsB.OrgID, resp.TenantID)
	})

	t.Run("users cannot access each other's data", func(t *testing.T) {
		// Provision both users with the superuser connection (bypasses RLS)
		setupConn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)

		provA := &services.ProvisioningClaims{
			UserID: claimsA.UserID,
			OrgID:  claimsA.OrgID,
			Email:  claimsA.Email,
			Name:   claimsA.Name,
		}
		provB := &services.ProvisioningClaims{
			UserID: claimsB.UserID,
			OrgID:  claimsB.OrgID,
			Email:  claimsB.Email,
			Name:   claimsB.Name,
		}

		userA, err := services.EnsureUserProvisioned(ctx, setupConn, provA)
		require.NoError(t, err)

		_, err = services.EnsureUserProvisioned(ctx, setupConn, provB)
		require.NoError(t, err)
		setupConn.Release()

		// Use the non-superuser pool for RLS checks
		pool := testAppPool()
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set context to user A's tenant
		_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claimsA.OrgID)
		require.NoError(t, err)

		// Try to get user A by ID - should succeed
		user, err := storage.GetUserByID(ctx, conn, userA.ID)
		require.NoError(t, err)
		assert.Equal(t, userA.ID, user.ID, "Should find own user")

		// Query all users - should only see tenant A's users
		users, err := storage.ListUsersByTenant(ctx, conn)
		require.NoError(t, err)

		for _, u := range users {
			assert.Equal(t, claimsA.OrgID, u.TenantID, "Should only see own tenant's users")
		}
	})
}
