// Package integration contains httptest integration tests for APIS server handlers.
// Clips endpoints are partially testable via httptest. UploadClip requires UnitAuth
// middleware (device API key auth) and file I/O, which makes it difficult to test
// in this integration test setup. We test ListClips validation, GetClipVideo/Thumbnail
// 404 paths, and DeleteClip 404 paths.
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

// setupClipsRouter creates a Chi router with auth middleware and clip routes.
// Note: UploadClip is NOT included because it uses UnitAuth middleware (device API key),
// not the standard user auth middleware used in these tests.
func setupClipsRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites
	r.Post("/api/sites", handlers.CreateSite)

	// Clip routes (user-facing, not device upload)
	r.Get("/api/clips", handlers.ListClips)
	r.Get("/api/clips/{id}/video", handlers.GetClipVideo)
	r.Get("/api/clips/{id}/thumbnail", handlers.GetClipThumbnail)
	r.Delete("/api/clips/{id}", handlers.DeleteClip)

	return r
}

func TestClipsEndpoints(t *testing.T) {
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
		UserID:   "test-clips-user",
		OrgID:    "test-tenant-clips",
		TenantID: "test-tenant-clips",
		Email:    "clips@test.com",
		Name:     "Clips Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupClipsRouter(claims)

	// Create a site for clip listing
	var siteID string
	t.Run("setup: create site for clips", func(t *testing.T) {
		siteBody := `{"name":"Clips Test Site","timezone":"Europe/Brussels"}`
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(siteBody))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var siteResp handlers.SiteDataResponse
		json.NewDecoder(rec.Body).Decode(&siteResp)
		siteID = siteResp.Data.ID
	})

	t.Run("list clips missing site_id returns 400", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/clips", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("list clips with valid site_id returns 200", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteID, nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.ClipsListResponse
		err := json.NewDecoder(rec.Body).Decode(&resp)
		require.NoError(t, err)

		assert.NotNil(t, resp.Data)
		assert.Equal(t, 0, resp.Meta.Total) // No clips uploaded yet
	})

	t.Run("list clips with non-existent site_id returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/clips?site_id=00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("list clips with invalid page returns 400", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteID+"&page=-1", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("list clips with invalid per_page returns 400", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteID+"&per_page=999", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("list clips with invalid from date returns 400", func(t *testing.T) {
		require.NotEmpty(t, siteID)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteID+"&from=not-a-date", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("get non-existent clip video returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/clips/00000000-0000-0000-0000-000000000099/video", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("get non-existent clip thumbnail returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/clips/00000000-0000-0000-0000-000000000099/thumbnail", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("delete non-existent clip returns 404", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/clips/00000000-0000-0000-0000-000000000099", nil)
		rec := httptest.NewRecorder()

		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
