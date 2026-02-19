// Package integration contains integration tests for the APIS server.
// rls_treatments_test.go — P0-005: RLS isolation tests for the treatments table.
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

// TestRLSTreatmentsIsolation tests that RLS enforces tenant isolation on treatments.
// Tenant A's treatments must be invisible and inaccessible to Tenant B.
func TestRLSTreatmentsIsolation(t *testing.T) {
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
		UserID:   "treat-rls-user-a",
		OrgID:    "treat-rls-org-a",
		TenantID: "treat-rls-org-a",
		Email:    "treat-a@example.com",
		Name:     "Treatment User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "treat-rls-user-b",
		OrgID:    "treat-rls-org-b",
		TenantID: "treat-rls-org-b",
		Email:    "treat-b@example.com",
		Name:     "Treatment User B",
		Roles:    []string{"admin"},
	}

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// Setup: create site and hive for Tenant A
	var hiveAID string
	t.Run("setup: create site and hive for Tenant A", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)
		r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

		// Create site
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(`{"name":"Treat RLS Site","timezone":"UTC"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var siteResp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&siteResp))
		siteID := siteResp.Data.ID

		// Create hive
		req = httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBufferString(`{"name":"Treat RLS Hive"}`))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var hiveResp handlers.HiveDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&hiveResp))
		hiveAID = hiveResp.Data.ID
	})

	// Create a treatment as Tenant A
	var treatmentAID string
	t.Run("Tenant A creates a treatment", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"hive_ids":       []string{hiveAID},
			"treated_at":     "2025-09-01",
			"treatment_type": "oxalic_acid",
			"method":         "vaporization",
		})
		r := setupRouter(claimsA)
		r.Post("/api/treatments", handlers.CreateTreatment)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.TreatmentsDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		require.Len(t, resp.Data, 1)
		treatmentAID = resp.Data[0].ID
		assert.NotEmpty(t, treatmentAID)
	})

	// Tenant B cannot list Tenant A's treatments (hive invisible via RLS)
	t.Run("Tenant B cannot list Tenant A treatments by hive", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/hives/{hive_id}/treatments", handlers.ListTreatmentsByHive)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveAID+"/treatments", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Hive not found for Tenant B via RLS
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot GET Tenant A's treatment by ID
	// The handler has defense-in-depth tenant check on top of RLS
	t.Run("Tenant B cannot get Tenant A treatment by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/treatments/{id}", handlers.GetTreatment)

		req := httptest.NewRequest("GET", "/api/treatments/"+treatmentAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot UPDATE Tenant A's treatment
	t.Run("Tenant B cannot update Tenant A treatment", func(t *testing.T) {
		body := `{"notes":"hacked"}`
		r := setupRouter(claimsB)
		r.Put("/api/treatments/{id}", handlers.UpdateTreatment)

		req := httptest.NewRequest("PUT", "/api/treatments/"+treatmentAID, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot DELETE Tenant A's treatment
	t.Run("Tenant B cannot delete Tenant A treatment", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/treatments/{id}", handlers.DeleteTreatment)

		req := httptest.NewRequest("DELETE", "/api/treatments/"+treatmentAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Verify treatment is still intact
	t.Run("Tenant A treatment is still intact", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/treatments/{id}", handlers.GetTreatment)

		req := httptest.NewRequest("GET", "/api/treatments/"+treatmentAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.TreatmentDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, treatmentAID, resp.Data.ID)
		assert.Equal(t, "oxalic_acid", resp.Data.TreatmentType)
	})
}
