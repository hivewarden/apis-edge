// Package integration contains integration tests for the APIS server.
// rls_inspections_test.go — P0-004: RLS isolation tests for the inspections table.
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

// TestRLSInspectionsIsolation tests that RLS enforces tenant isolation on inspections.
// Tenant A's inspections must be invisible and inaccessible to Tenant B.
func TestRLSInspectionsIsolation(t *testing.T) {
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
		UserID:   "insp-rls-user-a",
		OrgID:    "insp-rls-org-a",
		TenantID: "insp-rls-org-a",
		Email:    "insp-a@example.com",
		Name:     "Inspection User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "insp-rls-user-b",
		OrgID:    "insp-rls-org-b",
		TenantID: "insp-rls-org-b",
		Email:    "insp-b@example.com",
		Name:     "Inspection User B",
		Roles:    []string{"admin"},
	}

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// Create site and hive for Tenant A
	var siteAID, hiveAID string
	t.Run("setup: create site and hive for Tenant A", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)
		r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

		// Create site
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(`{"name":"Insp RLS Site","timezone":"UTC"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var siteResp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&siteResp))
		siteAID = siteResp.Data.ID

		// Create hive
		req = httptest.NewRequest("POST", "/api/sites/"+siteAID+"/hives", bytes.NewBufferString(`{"name":"Insp RLS Hive"}`))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var hiveResp handlers.HiveDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&hiveResp))
		hiveAID = hiveResp.Data.ID
	})

	// Create an inspection as Tenant A
	var inspAID string
	t.Run("Tenant A creates an inspection", func(t *testing.T) {
		body := `{"inspected_at":"2025-08-15","queen_seen":true,"honey_level":"high"}`
		r := setupRouter(claimsA)
		r.Post("/api/hives/{hive_id}/inspections", handlers.CreateInspection)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveAID+"/inspections", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.InspectionDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		inspAID = resp.Data.ID
		assert.NotEmpty(t, inspAID)
	})

	// Tenant B cannot list Tenant A's inspections (hive is invisible via RLS)
	t.Run("Tenant B cannot list Tenant A inspections", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/hives/{hive_id}/inspections", handlers.ListInspectionsByHive)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveAID+"/inspections", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Hive not found for Tenant B (RLS hides it)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot GET Tenant A's inspection by ID
	t.Run("Tenant B cannot get Tenant A inspection by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/inspections/{id}", handlers.GetInspection)

		req := httptest.NewRequest("GET", "/api/inspections/"+inspAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot UPDATE Tenant A's inspection
	t.Run("Tenant B cannot update Tenant A inspection", func(t *testing.T) {
		body := `{"honey_level":"low"}`
		r := setupRouter(claimsB)
		r.Put("/api/inspections/{id}", handlers.UpdateInspection)

		req := httptest.NewRequest("PUT", "/api/inspections/"+inspAID, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot DELETE Tenant A's inspection
	t.Run("Tenant B cannot delete Tenant A inspection", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/inspections/{id}", handlers.DeleteInspection)

		req := httptest.NewRequest("DELETE", "/api/inspections/"+inspAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Verify inspection is still intact
	t.Run("Tenant A inspection is still intact", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/inspections/{id}", handlers.GetInspection)

		req := httptest.NewRequest("GET", "/api/inspections/"+inspAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.InspectionDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, inspAID, resp.Data.ID)
	})
}
