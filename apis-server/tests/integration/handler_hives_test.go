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

// setupHivesRouter creates a Chi router with auth middleware and hive routes.
func setupHivesRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Site routes (needed for setup)
	r.Post("/api/sites", handlers.CreateSite)

	// Hive routes
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)
	r.Get("/api/hives", handlers.ListHives)
	r.Get("/api/hives/{id}", handlers.GetHive)
	r.Put("/api/hives/{id}", handlers.UpdateHive)
	r.Delete("/api/hives/{id}", handlers.DeleteHive)

	return r
}

func TestHivesCRUD(t *testing.T) {
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
		UserID:   "test-hive-user",
		OrgID:    "test-tenant-hives",
		TenantID: "test-tenant-hives",
		Email:    "hive@test.com",
		Name:     "Hive Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupHivesRouter(claims)

	// First create a site to host hives
	var siteID string
	t.Run("setup: create site for hives", func(t *testing.T) {
		body := map[string]interface{}{
			"name":     "Hive Test Site",
			"timezone": "Europe/Brussels",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)
		siteID = resp.Data.ID
	})

	var createdHiveID string

	t.Run("create hive with valid data returns 201", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		queenDate := "2025-04-15"
		queenSource := "breeder"
		body := map[string]interface{}{
			"name":                "Queen Bee Hive",
			"queen_introduced_at": queenDate,
			"queen_source":        queenSource,
			"brood_boxes":         2,
			"honey_supers":       1,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.HiveDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, "Queen Bee Hive", resp.Data.Name)
		assert.Equal(t, siteID, resp.Data.SiteID)
		assert.Equal(t, 2, resp.Data.BroodBoxes)
		assert.Equal(t, 1, resp.Data.HoneySupers)

		createdHiveID = resp.Data.ID
	})

	t.Run("create hive missing name returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"brood_boxes": 1,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create hive with invalid queen source returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"name":         "Bad Queen",
			"queen_source": "stolen",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create hive with brood boxes out of range returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"name":        "Too Many Boxes",
			"brood_boxes": 5,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites/"+siteID+"/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create hive on non-existent site returns 404", func(t *testing.T) {
		body := map[string]interface{}{
			"name": "Orphan Hive",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites/00000000-0000-0000-0000-000000000099/hives", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list hives returns 200 with data and meta", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HivesListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("get hive by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdHiveID)

		req := httptest.NewRequest("GET", "/api/hives/"+createdHiveID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HiveDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdHiveID, resp.Data.ID)
		assert.Equal(t, "Queen Bee Hive", resp.Data.Name)
	})

	t.Run("get non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/hives/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update hive returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdHiveID)

		newName := "Updated Hive"
		body := map[string]interface{}{
			"name": newName,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/hives/"+createdHiveID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.HiveDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, newName, resp.Data.Name)
	})

	t.Run("update hive with invalid queen source returns 400", func(t *testing.T) {
		require.NotEmpty(t, createdHiveID)

		body := map[string]interface{}{
			"queen_source": "invalid_source",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/hives/"+createdHiveID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("delete hive returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdHiveID)

		req := httptest.NewRequest("DELETE", "/api/hives/"+createdHiveID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent hive returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/hives/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
