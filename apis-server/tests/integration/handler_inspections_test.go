// Package integration contains httptest integration tests for APIS server handlers.
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

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// setupInspectionsRouter creates a Chi router with auth middleware and inspection routes.
func setupInspectionsRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Inspection routes
	r.Post("/api/hives/{hive_id}/inspections", handlers.CreateInspection)
	r.Get("/api/hives/{hive_id}/inspections", handlers.ListInspectionsByHive)
	r.Get("/api/inspections/{id}", handlers.GetInspection)
	r.Put("/api/inspections/{id}", handlers.UpdateInspection)
	r.Delete("/api/inspections/{id}", handlers.DeleteInspection)
	r.Get("/api/hives/{hive_id}/inspections/export", handlers.ExportInspections)

	return r
}

func TestInspectionsCRUD(t *testing.T) {
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

	claims := &middleware.Claims{
		UserID:   "test-insp-user",
		OrgID:    "test-tenant-insp",
		TenantID: "test-tenant-insp",
		Email:    "insp@test.com",
		Name:     "Inspection Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupInspectionsRouter(claims)

	// Create prerequisite site and hive
	var hiveID string

	t.Run("setup: create site and hive for inspections", func(t *testing.T) {
		siteBody := map[string]interface{}{
			"name":     "Inspection Test Site",
			"timezone": "Europe/Brussels",
		}
		bodyBytes, _ := json.Marshal(siteBody)
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var siteResp handlers.SiteDataResponse
		json.NewDecoder(rec.Body).Decode(&siteResp)
		siteID := siteResp.Data.ID

		hiveBody := map[string]interface{}{
			"name": "Inspection Test Hive",
		}
		bodyBytes, _ = json.Marshal(hiveBody)
		req = httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var hiveResp handlers.HiveDataResponse
		json.NewDecoder(rec.Body).Decode(&hiveResp)
		hiveID = hiveResp.Data.ID
	})

	var createdInspectionID string

	t.Run("create inspection returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		queenSeen := true
		eggsSeen := true
		body := map[string]interface{}{
			"inspected_at":  "2026-02-15",
			"queen_seen":    queenSeen,
			"eggs_seen":     eggsSeen,
			"brood_pattern": "good",
			"honey_level":   "medium",
			"pollen_level":  "high",
			"temperament":   "calm",
			"brood_frames":  5,
			"notes":         "Healthy colony, no issues.",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/inspections", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.InspectionDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, hiveID, resp.Data.HiveID)
		assert.Equal(t, "2026-02-15", resp.Data.InspectedAt)
		assert.NotNil(t, resp.Data.QueenSeen)
		assert.True(t, *resp.Data.QueenSeen)
		assert.NotNil(t, resp.Data.BroodPattern)
		assert.Equal(t, "good", *resp.Data.BroodPattern)

		createdInspectionID = resp.Data.ID
	})

	t.Run("create inspection with invalid brood pattern returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"brood_pattern": "excellent",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/inspections", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create inspection with invalid temperament returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"temperament": "angry",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/inspections", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create inspection on non-existent hive returns 404", func(t *testing.T) {
		body := map[string]interface{}{}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/00000000-0000-0000-0000-000000000099/inspections", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list inspections by hive returns 200", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/inspections", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.InspectionsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("get inspection by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdInspectionID)

		req := httptest.NewRequest("GET", "/api/inspections/"+createdInspectionID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.InspectionDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdInspectionID, resp.Data.ID)
	})

	t.Run("get non-existent inspection returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/inspections/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update inspection within 24h window returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdInspectionID)

		body := map[string]interface{}{
			"honey_level": "high",
			"notes":       "Updated: very healthy colony!",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/inspections/"+createdInspectionID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.InspectionDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data.HoneyLevel)
		assert.Equal(t, "high", *resp.Data.HoneyLevel)
	})

	t.Run("export inspections as CSV returns 200 with correct content type", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/inspections/export", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "text/csv", rec.Header().Get("Content-Type"))
		assert.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
		assert.Contains(t, rec.Header().Get("Content-Disposition"), ".csv")

		// Verify CSV has header row
		body := rec.Body.String()
		assert.Contains(t, body, "Date,Queen Seen,Eggs Seen")
	})

	t.Run("export inspections for non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099/inspections/export", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete inspection returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdInspectionID)

		req := httptest.NewRequest("DELETE", "/api/inspections/"+createdInspectionID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent inspection returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/inspections/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
