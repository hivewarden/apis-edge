// Package integration contains integration tests for the APIS server.
// rls_sites_test.go — P0-002: RLS isolation tests for the sites table.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestRLSSitesIsolation tests that RLS enforces tenant isolation on the sites table.
// Tenant A's sites must be invisible and inaccessible to Tenant B.
func TestRLSSitesIsolation(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Define two separate tenants
	claimsA := &middleware.Claims{
		UserID:   "site-rls-user-a",
		OrgID:    "site-rls-org-a",
		TenantID: "site-rls-org-a",
		Email:    "site-a@example.com",
		Name:     "Site User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "site-rls-user-b",
		OrgID:    "site-rls-org-b",
		TenantID: "site-rls-org-b",
		Email:    "site-b@example.com",
		Name:     "Site User B",
		Roles:    []string{"admin"},
	}

	// Provision both users so tenant middleware works
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// --- Step 1: Create a site as Tenant A ---
	var siteAID string
	t.Run("Tenant A creates a site", func(t *testing.T) {
		body := `{"name":"Apiary Alpha","timezone":"Europe/Brussels"}`
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, "Expected 201 Created, got %d: %s", rec.Code, rec.Body.String())

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		siteAID = resp.Data.ID
		assert.NotEmpty(t, siteAID)
		assert.Equal(t, "Apiary Alpha", resp.Data.Name)
	})

	// --- Step 2: Tenant A can list and see its own site ---
	t.Run("Tenant A can list its own sites", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/sites", handlers.ListSites)

		req := httptest.NewRequest("GET", "/api/sites", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SitesListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		found := false
		for _, site := range resp.Data {
			if site.ID == siteAID {
				found = true
			}
		}
		assert.True(t, found, "Tenant A should see its own site in the list")
	})

	// --- Step 3: Tenant B cannot list Tenant A's sites ---
	t.Run("Tenant B cannot see Tenant A sites in list", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/sites", handlers.ListSites)

		req := httptest.NewRequest("GET", "/api/sites", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SitesListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		for _, site := range resp.Data {
			assert.NotEqual(t, siteAID, site.ID, "Tenant B must not see Tenant A's site")
		}
	})

	// --- Step 4: Tenant B cannot GET Tenant A's site by ID ---
	t.Run("Tenant B cannot get Tenant A site by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/sites/{id}", handlers.GetSite)

		req := httptest.NewRequest("GET", "/api/sites/"+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code, "Tenant B should get 404 for Tenant A's site")
	})

	// --- Step 5: Tenant B cannot UPDATE Tenant A's site ---
	t.Run("Tenant B cannot update Tenant A site", func(t *testing.T) {
		body := `{"name":"Hacked Site"}`
		r := setupRouter(claimsB)
		r.Put("/api/sites/{id}", handlers.UpdateSite)

		req := httptest.NewRequest("PUT", "/api/sites/"+siteAID, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code, "Tenant B should get 404 when updating Tenant A's site")
	})

	// --- Step 6: Tenant B cannot DELETE Tenant A's site ---
	t.Run("Tenant B cannot delete Tenant A site", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/sites/{id}", handlers.DeleteSite)

		req := httptest.NewRequest("DELETE", "/api/sites/"+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code, "Tenant B should get 404 when deleting Tenant A's site")
	})

	// --- Step 7: Verify Tenant A's site is still intact ---
	t.Run("Tenant A site still exists after B's attempts", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/sites/{id}", handlers.GetSite)

		req := httptest.NewRequest("GET", "/api/sites/"+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		assert.Equal(t, "Apiary Alpha", resp.Data.Name, "Site should be unchanged after Tenant B's attack attempts")
	})
}

// setupRouter creates a chi router with mock auth and real tenant middleware.
// Uses the non-superuser appPool when available so RLS policies are enforced.
func setupRouter(claims *middleware.Claims) *chi.Mux {
	pool := appPool
	if pool == nil {
		pool = storage.DB
	}
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(pool))
	return r
}

// provisionUser ensures a user and tenant exist in the database.
// Uses the superuser connection (storage.DB) so RLS doesn't interfere with setup.
func provisionUser(t *testing.T, ctx context.Context, conn *pgxpool.Conn, claims *middleware.Claims) {
	t.Helper()

	// Set tenant context so RLS-enabled tables allow the insert
	tenantID := claims.TenantID
	if tenantID == "" {
		tenantID = claims.OrgID
	}
	_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	require.NoError(t, err, "Failed to set tenant_id for provisioning")

	prov := &services.ProvisioningClaims{
		UserID: claims.UserID,
		OrgID:  tenantID,
		Email:  claims.Email,
		Name:   claims.Name,
	}
	_, err = services.EnsureUserProvisioned(ctx, conn, prov)
	require.NoError(t, err, "Failed to provision user %s", claims.UserID)
}
