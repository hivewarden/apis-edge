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

// setupTreatmentsRouter creates a Chi router with auth middleware and treatment routes.
func setupTreatmentsRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Treatment routes
	r.Post("/api/treatments", handlers.CreateTreatment)
	r.Get("/api/hives/{hive_id}/treatments", handlers.ListTreatmentsByHive)
	r.Get("/api/treatments/{id}", handlers.GetTreatment)
	r.Put("/api/treatments/{id}", handlers.UpdateTreatment)
	r.Delete("/api/treatments/{id}", handlers.DeleteTreatment)

	return r
}

func TestTreatmentsCRUD(t *testing.T) {
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
		UserID:   "test-treat-user",
		OrgID:    "test-tenant-treat",
		TenantID: "test-tenant-treat",
		Email:    "treat@test.com",
		Name:     "Treatment Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupTreatmentsRouter(claims)

	// Create prerequisite site and hive
	var hiveID string
	var hiveID2 string

	t.Run("setup: create site and two hives for treatments", func(t *testing.T) {
		siteBody := map[string]interface{}{
			"name":     "Treatment Test Site",
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

		// Create first hive
		hiveBody := map[string]interface{}{
			"name": "Treatment Test Hive 1",
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

		// Create second hive for batch tests
		hiveBody2 := map[string]interface{}{
			"name": "Treatment Test Hive 2",
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

	var createdTreatmentID string

	t.Run("create treatment for single hive returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		mitesBefore := 50
		mitesAfter := 5
		method := "vaporization"
		body := map[string]interface{}{
			"hive_ids":          []string{hiveID},
			"treated_at":        "2026-02-10",
			"treatment_type":    "oxalic_acid",
			"method":            method,
			"mite_count_before": mitesBefore,
			"mite_count_after":  mitesAfter,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.TreatmentsDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		require.Len(t, resp.Data, 1)
		assert.NotEmpty(t, resp.Data[0].ID)
		assert.Equal(t, hiveID, resp.Data[0].HiveID)
		assert.Equal(t, "oxalic_acid", resp.Data[0].TreatmentType)
		assert.Equal(t, "2026-02-10", resp.Data[0].TreatedAt)
		assert.NotNil(t, resp.Data[0].Method)
		assert.Equal(t, "vaporization", *resp.Data[0].Method)
		assert.NotNil(t, resp.Data[0].Efficacy)
		assert.Equal(t, 90, *resp.Data[0].Efficacy) // (50-5)/50 * 100 = 90%

		createdTreatmentID = resp.Data[0].ID
	})

	t.Run("create batch treatment for multiple hives returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)
		require.NotEmpty(t, hiveID2)

		body := map[string]interface{}{
			"hive_ids":       []string{hiveID, hiveID2},
			"treated_at":     "2026-02-11",
			"treatment_type": "formic_acid",
			"method":         "strips",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.TreatmentsDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Len(t, resp.Data, 2)
	})

	t.Run("create treatment missing hive_ids returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"treated_at":     "2026-02-10",
			"treatment_type": "oxalic_acid",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create treatment missing treated_at returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":       []string{hiveID},
			"treatment_type": "oxalic_acid",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create treatment missing treatment_type returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":   []string{hiveID},
			"treated_at": "2026-02-10",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create treatment with invalid treatment_type returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":       []string{hiveID},
			"treated_at":     "2026-02-10",
			"treatment_type": "bleach",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create treatment with invalid method returns 400", func(t *testing.T) {
		method := "injection"
		body := map[string]interface{}{
			"hive_ids":       []string{hiveID},
			"treated_at":     "2026-02-10",
			"treatment_type": "oxalic_acid",
			"method":         method,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create treatment on non-existent hive returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":       []string{"00000000-0000-0000-0000-000000000099"},
			"treated_at":     "2026-02-10",
			"treatment_type": "oxalic_acid",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list treatments by hive returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/treatments", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TreatmentsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list treatments for non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099/treatments", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get treatment by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdTreatmentID)

		req := httptest.NewRequest("GET", "/api/treatments/"+createdTreatmentID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TreatmentDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdTreatmentID, resp.Data.ID)
		assert.Equal(t, "oxalic_acid", resp.Data.TreatmentType)
	})

	t.Run("get non-existent treatment returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/treatments/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update treatment returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdTreatmentID)

		newType := "apiguard"
		body := map[string]interface{}{
			"treatment_type": newType,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/treatments/"+createdTreatmentID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.TreatmentDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, "apiguard", resp.Data.TreatmentType)
	})

	t.Run("update treatment with invalid type returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdTreatmentID)

		newType := "invalid_type"
		body := map[string]interface{}{
			"treatment_type": newType,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/treatments/"+createdTreatmentID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("update non-existent treatment returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"treatment_type": "apiguard",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/treatments/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete treatment returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdTreatmentID)

		req := httptest.NewRequest("DELETE", "/api/treatments/"+createdTreatmentID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent treatment returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/treatments/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
