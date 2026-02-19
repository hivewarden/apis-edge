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

// setupFeedingsRouter creates a Chi router with auth middleware and feeding routes.
func setupFeedingsRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)

	// Feeding routes
	r.Post("/api/feedings", handlers.CreateFeeding)
	r.Get("/api/hives/{hive_id}/feedings", handlers.ListFeedingsByHive)
	r.Get("/api/feedings/{id}", handlers.GetFeeding)
	r.Put("/api/feedings/{id}", handlers.UpdateFeeding)
	r.Delete("/api/feedings/{id}", handlers.DeleteFeeding)

	return r
}

func TestFeedingsCRUD(t *testing.T) {
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
		UserID:   "test-feed-user",
		OrgID:    "test-tenant-feed",
		TenantID: "test-tenant-feed",
		Email:    "feed@test.com",
		Name:     "Feeding Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupFeedingsRouter(claims)

	// Create prerequisite site and hive
	var hiveID string
	var hiveID2 string

	t.Run("setup: create site and two hives for feedings", func(t *testing.T) {
		siteBody := map[string]interface{}{
			"name":     "Feeding Test Site",
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
			"name": "Feeding Test Hive 1",
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
			"name": "Feeding Test Hive 2",
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

	var createdFeedingID string

	t.Run("create feeding for single hive returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		conc := "2:1"
		body := map[string]interface{}{
			"hive_ids":      []string{hiveID},
			"fed_at":        "2026-02-10",
			"feed_type":     "sugar_syrup",
			"amount":        2.5,
			"unit":          "liters",
			"concentration": conc,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.FeedingsDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		require.Len(t, resp.Data, 1)
		assert.NotEmpty(t, resp.Data[0].ID)
		assert.Equal(t, hiveID, resp.Data[0].HiveID)
		assert.Equal(t, "sugar_syrup", resp.Data[0].FeedType)
		assert.Equal(t, "2026-02-10", resp.Data[0].FedAt)
		assert.InDelta(t, 2.5, resp.Data[0].Amount, 0.01)
		assert.Equal(t, "liters", resp.Data[0].Unit)
		assert.NotNil(t, resp.Data[0].Concentration)
		assert.Equal(t, "2:1", *resp.Data[0].Concentration)

		createdFeedingID = resp.Data[0].ID
	})

	t.Run("create batch feeding for multiple hives returns 201", func(t *testing.T) {
		require.NotEmpty(t, hiveID)
		require.NotEmpty(t, hiveID2)

		body := map[string]interface{}{
			"hive_ids":  []string{hiveID, hiveID2},
			"fed_at":    "2026-02-11",
			"feed_type": "fondant",
			"amount":    1.0,
			"unit":      "kg",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.FeedingsDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Len(t, resp.Data, 2)
	})

	t.Run("create feeding missing hive_ids returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"fed_at":    "2026-02-10",
			"feed_type": "sugar_syrup",
			"amount":    2.5,
			"unit":      "liters",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create feeding missing fed_at returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":  []string{hiveID},
			"feed_type": "sugar_syrup",
			"amount":    2.5,
			"unit":      "liters",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create feeding with invalid feed_type returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":  []string{hiveID},
			"fed_at":    "2026-02-10",
			"feed_type": "chocolate",
			"amount":    1.0,
			"unit":      "kg",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create feeding with invalid unit returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":  []string{hiveID},
			"fed_at":    "2026-02-10",
			"feed_type": "fondant",
			"amount":    1.0,
			"unit":      "gallons",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create feeding with zero amount returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":  []string{hiveID},
			"fed_at":    "2026-02-10",
			"feed_type": "fondant",
			"amount":    0,
			"unit":      "kg",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create feeding on non-existent hive returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"hive_ids":  []string{"00000000-0000-0000-0000-000000000099"},
			"fed_at":    "2026-02-10",
			"feed_type": "fondant",
			"amount":    1.0,
			"unit":      "kg",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/feedings", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list feedings by hive returns 200", func(t *testing.T) {
		require.NotEmpty(t, hiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+hiveID+"/feedings", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.FeedingsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("list feedings for non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099/feedings", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get feeding by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdFeedingID)

		req := httptest.NewRequest("GET", "/api/feedings/"+createdFeedingID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.FeedingDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdFeedingID, resp.Data.ID)
		assert.Equal(t, "sugar_syrup", resp.Data.FeedType)
	})

	t.Run("get non-existent feeding returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/feedings/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update feeding amount returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdFeedingID)

		newAmount := 3.5
		body := map[string]interface{}{
			"amount": newAmount,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/feedings/"+createdFeedingID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.FeedingDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.InDelta(t, 3.5, resp.Data.Amount, 0.01)
	})

	t.Run("update feeding with invalid feed_type returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdFeedingID)

		feedType := "invalid_type"
		body := map[string]interface{}{
			"feed_type": feedType,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/feedings/"+createdFeedingID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("update non-existent feeding returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"amount": 1.0,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/feedings/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete feeding returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdFeedingID)

		req := httptest.NewRequest("DELETE", "/api/feedings/"+createdFeedingID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent feeding returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/feedings/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
