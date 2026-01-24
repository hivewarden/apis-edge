// Package integration contains integration tests for the APIS server.
package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
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

// TestTenantIsolationE2E tests the full tenant isolation flow.
// Requires a running database - skip if DATABASE_URL not set.
func TestTenantIsolationE2E(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Define test tenants
	claimsA := &middleware.Claims{
		UserID: "user-a-e2e",
		OrgID:  "org-a-e2e",
		Email:  "a@example.com",
		Name:   "User A",
		Roles:  []string{"owner"},
	}
	claimsB := &middleware.Claims{
		UserID: "user-b-e2e",
		OrgID:  "org-b-e2e",
		Email:  "b@example.com",
		Name:   "User B",
		Roles:  []string{"member"},
	}

	t.Run("user A gets their own data", func(t *testing.T) {
		r := chi.NewRouter()
		r.Use(mockAuthMiddleware(claimsA))
		r.Use(middleware.TenantMiddleware(storage.DB))
		r.Get("/api/me", handlers.GetMe)

		req := httptest.NewRequest("GET", "/api/me", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.MeResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, claimsA.UserID, resp.UserID)
		assert.Equal(t, claimsA.OrgID, resp.TenantID)
		assert.Equal(t, claimsA.Email, resp.Email)
	})

	t.Run("user B gets their own data", func(t *testing.T) {
		r := chi.NewRouter()
		r.Use(mockAuthMiddleware(claimsB))
		r.Use(middleware.TenantMiddleware(storage.DB))
		r.Get("/api/me", handlers.GetMe)

		req := httptest.NewRequest("GET", "/api/me", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.MeResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, claimsB.UserID, resp.UserID)
		assert.Equal(t, claimsB.OrgID, resp.TenantID)
	})

	t.Run("users cannot access each other's data", func(t *testing.T) {
		// Acquire connection and check RLS
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Provision both users first
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

		userA, err := services.EnsureUserProvisioned(ctx, conn, provA)
		require.NoError(t, err)

		_, err = services.EnsureUserProvisioned(ctx, conn, provB)
		require.NoError(t, err)

		// Set context to user A's tenant
		_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", claimsA.OrgID)
		require.NoError(t, err)

		// Try to get user B by ID - should fail due to RLS
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
