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

// setupEquipmentRouter creates a Chi router with auth middleware and equipment routes.
func setupEquipmentRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Equipment routes
	r.Post("/api/hives/{hive_id}/equipment", handlers.CreateEquipmentLog)
	r.Get("/api/hives/{hive_id}/equipment", handlers.ListEquipmentByHive)
	r.Get("/api/hives/{hive_id}/equipment/current", handlers.GetCurrentlyInstalled)
	r.Get("/api/hives/{hive_id}/equipment/history", handlers.GetEquipmentHistory)
	r.Get("/api/equipment/{id}", handlers.GetEquipmentLog)
	r.Put("/api/equipment/{id}", handlers.UpdateEquipmentLog)
	r.Delete("/api/equipment/{id}", handlers.DeleteEquipmentLog)

	return r
}

func TestEquipmentCRUD(t *testing.T) {
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
		UserID:   "test-equip-user",
		OrgID:    "test-tenant-equip",
		TenantID: "test-tenant-equip",
		Email:    "equip@test.com",
		Name:     "Equipment Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupEquipmentRouter(claims)

	// Create prerequisite site and hive
	var hiveID string

	t.Run("setup: create site and hive for equipment", func(t *testing.T) {
		siteBody := map[string]interface{}{
			"name":     "Equipment Test Site",
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
			"name": "Equipment Test Hive",
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

	var createdEquipmentID string

	t.Run("create equipment log install returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		body := map[string]interface{}{
			"equipment_type": "entrance_reducer",
			"action":         "installed",
			"logged_at":      "2026-02-10",
			"notes":          "Installed for winter protection",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.EquipmentLogDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, hiveID, resp.Data.HiveID)
		assert.Equal(t, "entrance_reducer", resp.Data.EquipmentType)
		assert.Equal(t, "Entrance Reducer", resp.Data.EquipmentLabel)
		assert.Equal(t, "installed", resp.Data.Action)
		assert.Equal(t, "2026-02-10", resp.Data.LoggedAt)

		createdEquipmentID = resp.Data.ID
	})

	t.Run("create equipment log with custom type returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		body := map[string]interface{}{
			"equipment_type": "custom_bee_blanket",
			"action":         "installed",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.EquipmentLogDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		// Custom type falls back to raw value for label
		assert.Equal(t, "custom_bee_blanket", resp.Data.EquipmentType)
		assert.Equal(t, "custom_bee_blanket", resp.Data.EquipmentLabel)
	})

	t.Run("create duplicate install returns 409 conflict", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		body := map[string]interface{}{
			"equipment_type": "entrance_reducer",
			"action":         "installed",
			"logged_at":      "2026-02-11",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("create equipment log missing equipment_type returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"action":    "installed",
			"logged_at": "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create equipment log missing action returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"equipment_type": "mouse_guard",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create equipment log with invalid action returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"equipment_type": "mouse_guard",
			"action":         "broken",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create equipment log with too short type returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"equipment_type": "x",
			"action":         "installed",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("remove non-installed equipment returns 409 conflict", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		body := map[string]interface{}{
			"equipment_type": "queen_excluder",
			"action":         "removed",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/"+hiveID+"/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("create equipment on non-existent hive returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"equipment_type": "mouse_guard",
			"action":         "installed",
			"logged_at":      "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/hives/00000000-0000-0000-0000-000000000099/equipment", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list equipment by hive returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/equipment", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.EquipmentLogsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list equipment for non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099/equipment", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get currently installed equipment returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/equipment/current", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CurrentlyInstalledListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		// Should have at least the entrance_reducer we installed
		assert.GreaterOrEqual(t, len(resp.Data), 1)
	})

	t.Run("get equipment history returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/equipment/history", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.EquipmentHistoryListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
	})

	t.Run("get equipment log by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdEquipmentID)

		req := httptest.NewRequest("GET", "/api/equipment/"+createdEquipmentID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.EquipmentLogDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdEquipmentID, resp.Data.ID)
		assert.Equal(t, "entrance_reducer", resp.Data.EquipmentType)
	})

	t.Run("get non-existent equipment log returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/equipment/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update equipment log notes returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdEquipmentID)

		updatedNotes := "Updated: still installed for winter"
		body := map[string]interface{}{
			"notes": updatedNotes,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/equipment/"+createdEquipmentID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.EquipmentLogDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data.Notes)
		assert.Equal(t, "Updated: still installed for winter", *resp.Data.Notes)
	})

	t.Run("update equipment log with invalid action returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdEquipmentID)

		action := "broken"
		body := map[string]interface{}{
			"action": action,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/equipment/"+createdEquipmentID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("update non-existent equipment log returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"notes": "ghost",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/equipment/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete equipment log returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdEquipmentID)

		req := httptest.NewRequest("DELETE", "/api/equipment/"+createdEquipmentID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent equipment log returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/equipment/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
