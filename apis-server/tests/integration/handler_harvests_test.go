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

// setupHarvestsRouter creates a Chi router with auth middleware and harvest routes.
func setupHarvestsRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Harvest routes
	r.Post("/api/harvests", handlers.CreateHarvest)
	r.Get("/api/hives/{hive_id}/harvests", handlers.ListHarvestsByHive)
	r.Get("/api/sites/{site_id}/harvests", handlers.ListHarvestsBySite)
	r.Get("/api/harvests/{id}", handlers.GetHarvest)
	r.Put("/api/harvests/{id}", handlers.UpdateHarvest)
	r.Delete("/api/harvests/{id}", handlers.DeleteHarvest)
	r.Get("/api/harvests/analytics", handlers.GetHarvestAnalytics)

	return r
}

func TestHarvestsCRUD(t *testing.T) {
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
		UserID:   "test-harvest-user",
		OrgID:    "test-tenant-harvest",
		TenantID: "test-tenant-harvest",
		Email:    "harvest@test.com",
		Name:     "Harvest Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupHarvestsRouter(claims)

	// Create prerequisite site and hives
	var siteID string
	var hiveID string
	var hiveID2 string

	t.Run("setup: create site and two hives for harvests", func(t *testing.T) {
		siteBody := map[string]interface{}{
			"name":     "Harvest Test Site",
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
		siteID = siteResp.Data.ID

		// Create first hive
		hiveBody := map[string]interface{}{
			"name": "Harvest Test Hive 1",
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

		// Create second hive
		hiveBody2 := map[string]interface{}{
			"name": "Harvest Test Hive 2",
		}
		bodyBytes, _ = json.Marshal(hiveBody2)
		req = httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var hiveResp2 handlers.HiveDataResponse
		json.NewDecoder(rec.Body).Decode(&hiveResp2)
		hiveID2 = hiveResp2.Data.ID
	})

	var createdHarvestID string

	t.Run("create harvest with breakdown returns 201", func(t *testing.T) {
		require.NotEmpty(t, siteID)
		require.NotEmpty(t, hiveID)
		require.NotEmpty(t, hiveID2)

		notes := "First harvest of the season"
		body := map[string]interface{}{
			"site_id":      siteID,
			"harvested_at": "2026-07-15",
			"total_kg":     25.0,
			"notes":        notes,
			"hive_breakdown": []map[string]interface{}{
				{
					"hive_id":   hiveID,
					"frames":    4,
					"amount_kg": 15.0,
				},
				{
					"hive_id":   hiveID2,
					"frames":    3,
					"amount_kg": 10.0,
				},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.HarvestDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, siteID, resp.Data.SiteID)
		assert.Equal(t, "2026-07-15", resp.Data.HarvestedAt)
		assert.InDelta(t, 25.0, resp.Data.TotalKg, 0.01)
		assert.NotNil(t, resp.Data.Notes)
		assert.Equal(t, "First harvest of the season", *resp.Data.Notes)
		assert.Len(t, resp.Data.Hives, 2)

		createdHarvestID = resp.Data.ID
	})

	t.Run("create harvest missing site_id returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"harvested_at": "2026-07-15",
			"total_kg":     10.0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": hiveID, "amount_kg": 10.0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create harvest missing harvested_at returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":  siteID,
			"total_kg": 10.0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": hiveID, "amount_kg": 10.0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create harvest missing hive_breakdown returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":      siteID,
			"harvested_at": "2026-07-15",
			"total_kg":     10.0,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create harvest with zero total_kg returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":      siteID,
			"harvested_at": "2026-07-15",
			"total_kg":     0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": hiveID, "amount_kg": 0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create harvest with breakdown sum mismatch returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":      siteID,
			"harvested_at": "2026-07-15",
			"total_kg":     25.0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": hiveID, "amount_kg": 10.0},
				{"hive_id": hiveID2, "amount_kg": 5.0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create harvest on non-existent site returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":      "00000000-0000-0000-0000-000000000099",
			"harvested_at": "2026-07-15",
			"total_kg":     10.0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": hiveID, "amount_kg": 10.0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("create harvest with non-existent hive in breakdown returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"site_id":      siteID,
			"harvested_at": "2026-07-15",
			"total_kg":     10.0,
			"hive_breakdown": []map[string]interface{}{
				{"hive_id": "00000000-0000-0000-0000-000000000099", "amount_kg": 10.0},
			},
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/harvests", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list harvests by hive returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/harvests", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HarvestsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list harvests by site returns 200", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		req := httptest.NewRequest("GET", "/api/sites/"+siteID+"/harvests", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HarvestsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list harvests for non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099/harvests", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list harvests for non-existent site returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sites/00000000-0000-0000-0000-000000000099/harvests", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get harvest by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdHarvestID)

		req := httptest.NewRequest("GET", "/api/harvests/"+createdHarvestID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HarvestDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdHarvestID, resp.Data.ID)
		assert.Equal(t, siteID, resp.Data.SiteID)
		assert.InDelta(t, 25.0, resp.Data.TotalKg, 0.01)
	})

	t.Run("get non-existent harvest returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/harvests/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update harvest notes returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdHarvestID)

		updatedNotes := "Updated harvest notes"
		body := map[string]interface{}{
			"notes": updatedNotes,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/harvests/"+createdHarvestID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HarvestDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data.Notes)
		assert.Equal(t, "Updated harvest notes", *resp.Data.Notes)
	})

	t.Run("update harvest with zero total_kg returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdHarvestID)

		zeroKg := 0.0
		body := map[string]interface{}{
			"total_kg": zeroKg,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/harvests/"+createdHarvestID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("update non-existent harvest returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"notes": "ghost",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/harvests/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get harvest analytics returns 200", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/harvests/analytics", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HarvestAnalyticsResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
	})

	t.Run("delete harvest returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdHarvestID)

		req := httptest.NewRequest("DELETE", "/api/harvests/"+createdHarvestID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent harvest returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/harvests/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
