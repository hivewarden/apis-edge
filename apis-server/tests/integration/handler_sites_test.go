// Package integration contains httptest integration tests for APIS server handlers.
// These tests call actual handlers via httptest with a real database connection.
// Requires DATABASE_URL to be set; skipped otherwise.
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

// testClaimsAdmin returns admin claims for testing.
func testClaimsAdmin() *middleware.Claims {
	return &middleware.Claims{
		UserID:   "test-admin-user",
		OrgID:    "test-tenant-sites",
		TenantID: "test-tenant-sites",
		Email:    "admin@test.com",
		Name:     "Test Admin",
		Role:     "admin",
		Roles:    []string{"admin"},
	}
}

// setupSitesRouter creates a Chi router with auth middleware and site routes.
func setupSitesRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	r.Post("/api/sites", handlers.CreateSite)
	r.Get("/api/sites", handlers.ListSites)
	r.Get("/api/sites/{id}", handlers.GetSite)
	r.Put("/api/sites/{id}", handlers.UpdateSite)
	r.Delete("/api/sites/{id}", handlers.DeleteSite)

	return r
}

func TestSitesCRUD(t *testing.T) {
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

	claims := testClaimsAdmin()
	router := setupSitesRouter(claims)

	// Track created site IDs for cleanup
	var createdSiteID string

	t.Run("create site with valid data returns 201", func(t *testing.T) {
		body := map[string]interface{}{
			"name":     "Test Apiary",
			"latitude": 50.8503,
			"longitude": 4.3517,
			"timezone": "Europe/Brussels",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotEmpty(t, resp.Data.ID)
		assert.Equal(t, "Test Apiary", resp.Data.Name)
		assert.Equal(t, "Europe/Brussels", resp.Data.Timezone)
		assert.NotNil(t, resp.Data.Latitude)
		assert.InDelta(t, 50.8503, *resp.Data.Latitude, 0.001)
		assert.NotNil(t, resp.Data.Longitude)
		assert.InDelta(t, 4.3517, *resp.Data.Longitude, 0.001)

		createdSiteID = resp.Data.ID
	})

	t.Run("create site missing name returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"timezone": "Europe/Brussels",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)

		var errResp map[string]interface{}
		err := json.NewDecoder(rec.Body).Decode(&errResp)
		require.NoError(t, err)
		assert.Contains(t, errResp["error"], "Name is required")
	})

	t.Run("create site with invalid latitude returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"name":     "Bad Site",
			"latitude": 91.0,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("create site with invalid timezone returns 400", func(t *testing.T) {
		body := map[string]interface{}{
			"name":     "Bad Timezone Site",
			"timezone": "Invalid/Zone",
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("list sites returns 200 with data and meta", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sites", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SitesListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.GreaterOrEqual(t, resp.Meta.Total, 1)
	})

	t.Run("get site by ID returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdSiteID, "site must be created first")

		req := httptest.NewRequest("GET", "/api/sites/"+createdSiteID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, createdSiteID, resp.Data.ID)
		assert.Equal(t, "Test Apiary", resp.Data.Name)
	})

	t.Run("get non-existent site returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sites/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("update site partial fields returns 200", func(t *testing.T) {
		require.NotEmpty(t, createdSiteID, "site must be created first")

		newName := "Updated Apiary"
		body := map[string]interface{}{
			"name": newName,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/sites/"+createdSiteID, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.SiteDataResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.Equal(t, newName, resp.Data.Name)
		// Latitude should still be present from creation
		assert.NotNil(t, resp.Data.Latitude)
	})

	t.Run("update non-existent site returns 404", func(t *testing.T) {
		body := map[string]interface{}{"name": "Ghost"}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("PUT", "/api/sites/00000000-0000-0000-0000-000000000099", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete site returns 204", func(t *testing.T) {
		require.NotEmpty(t, createdSiteID, "site must be created first")

		req := httptest.NewRequest("DELETE", "/api/sites/"+createdSiteID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("delete non-existent site returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/sites/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("create site with name exceeding 200 chars returns 400", func(t *testing.T) {
		longName := ""
		for i := 0; i < 201; i++ {
			longName += "a"
		}
		body := map[string]interface{}{
			"name": longName,
		}
		bodyBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
