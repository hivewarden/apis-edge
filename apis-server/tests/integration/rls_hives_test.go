// Package integration contains integration tests for the APIS server.
// rls_hives_test.go — P0-003: RLS isolation tests for the hives table.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestRLSHivesIsolation tests that RLS enforces tenant isolation on the hives table.
// Tenant A's hives must be invisible and inaccessible to Tenant B.
func TestRLSHivesIsolation(t *testing.T) {
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

	claimsA := &middleware.Claims{
		UserID:   "hive-rls-user-a",
		OrgID:    "hive-rls-org-a",
		TenantID: "hive-rls-org-a",
		Email:    "hive-a@example.com",
		Name:     "Hive User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "hive-rls-user-b",
		OrgID:    "hive-rls-org-b",
		TenantID: "hive-rls-org-b",
		Email:    "hive-b@example.com",
		Name:     "Hive User B",
		Roles:    []string{"admin"},
	}

	// Provision users
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// Step 1: Create a site for Tenant A (hives require a site)
	var siteAID string
	t.Run("Tenant A creates a site", func(t *testing.T) {
		body := `{"name":"Hive RLS Site A","timezone":"UTC"}`
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		siteAID = resp.Data.ID
	})

	// Step 2: Create a hive under Tenant A's site
	var hiveAID string
	t.Run("Tenant A creates a hive", func(t *testing.T) {
		body := `{"name":"Queen Bee Hive"}`
		r := setupRouter(claimsA)
		r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

		req := httptest.NewRequest("POST", "/api/sites/"+siteAID+"/hives", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.HiveDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		hiveAID = resp.Data.ID
		assert.NotEmpty(t, hiveAID)
		assert.Equal(t, "Queen Bee Hive", resp.Data.Name)
	})

	// Step 3: Tenant A can list its own hives
	t.Run("Tenant A can list its own hives", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/hives", handlers.ListHives)

		req := httptest.NewRequest("GET", "/api/hives", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.HivesListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))

		found := false
		for _, h := range resp.Data {
			if h.ID == hiveAID {
				found = true
			}
		}
		assert.True(t, found, "Tenant A should see its own hive")
	})

	// Step 4: Tenant B cannot see Tenant A's hives in list
	t.Run("Tenant B cannot see Tenant A hives", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/hives", handlers.ListHives)

		req := httptest.NewRequest("GET", "/api/hives", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.HivesListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))

		for _, h := range resp.Data {
			assert.NotEqual(t, hiveAID, h.ID, "Tenant B must not see Tenant A's hive")
		}
	})

	// Step 5: Tenant B cannot GET Tenant A's hive by ID
	t.Run("Tenant B cannot get Tenant A hive by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/hives/{id}", handlers.GetHive)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Step 6: Tenant B cannot UPDATE Tenant A's hive
	t.Run("Tenant B cannot update Tenant A hive", func(t *testing.T) {
		body := `{"name":"Hacked Hive"}`
		r := setupRouter(claimsB)
		r.Put("/api/hives/{id}", handlers.UpdateHive)

		req := httptest.NewRequest("PUT", "/api/hives/"+hiveAID, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Step 7: Tenant B cannot DELETE Tenant A's hive
	t.Run("Tenant B cannot delete Tenant A hive", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/hives/{id}", handlers.DeleteHive)

		req := httptest.NewRequest("DELETE", "/api/hives/"+hiveAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Step 8: Verify Tenant A's hive is still intact
	t.Run("Tenant A hive still exists after B's attempts", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/hives/{id}", handlers.GetHive)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.HiveDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "Queen Bee Hive", resp.Data.Name)
	})

	// Step 9: Tenant B cannot list hives by Tenant A's site
	t.Run("Tenant B cannot list hives by Tenant A site", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/sites/{site_id}/hives", handlers.ListHivesBySite)

		req := httptest.NewRequest("GET", "/api/sites/"+siteAID+"/hives", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Should get 404 because the site itself is invisible to Tenant B via RLS
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
