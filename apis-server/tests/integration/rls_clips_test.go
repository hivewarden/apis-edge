// Package integration contains integration tests for the APIS server.
// rls_clips_test.go — P0-007: RLS isolation tests for the clips table.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestRLSClipsIsolation tests that RLS enforces tenant isolation on clips.
// Clips created by Tenant A's units must be invisible to Tenant B.
//
// Note: Clips are uploaded by units (X-API-Key) but listed/viewed/deleted
// via the dashboard JWT flow. We test the JWT-authenticated endpoints.
func TestRLSClipsIsolation(t *testing.T) {
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
		UserID:   "clip-rls-user-a",
		OrgID:    "clip-rls-org-a",
		TenantID: "clip-rls-org-a",
		Email:    "clip-a@example.com",
		Name:     "Clip User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "clip-rls-user-b",
		OrgID:    "clip-rls-org-b",
		TenantID: "clip-rls-org-b",
		Email:    "clip-b@example.com",
		Name:     "Clip User B",
		Roles:    []string{"admin"},
	}

	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	provisionUser(t, ctx, conn, claimsA)
	provisionUser(t, ctx, conn, claimsB)
	conn.Release()

	// Create a site for Tenant A
	var siteAID string
	t.Run("setup: create site for Tenant A", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Post("/api/sites", handlers.CreateSite)

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(`{"name":"Clip RLS Site","timezone":"UTC"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		siteAID = resp.Data.ID
	})

	// Insert a clip directly via SQL (simulating unit upload)
	var clipAID string
	t.Run("setup: insert clip for Tenant A via storage", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claimsA.TenantID)
		require.NoError(t, err)

		// Create a unit for the clip (use unique serial to avoid conflicts)
		var unitID string
		serial := fmt.Sprintf("CLIP-UNIT-A-%d", time.Now().UnixNano()%100000)
		err = conn.QueryRow(ctx,
			`INSERT INTO units (tenant_id, serial, name, api_key_hash, api_key_prefix, site_id)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			claimsA.TenantID, serial, "Clip Unit A", "fakehash-clip-a", "clip-a", siteAID,
		).Scan(&unitID)
		require.NoError(t, err)

		// Insert a clip record (no actual file needed for isolation test)
		err = conn.QueryRow(ctx,
			`INSERT INTO clips (tenant_id, unit_id, site_id, file_path, file_size_bytes, recorded_at)
			 VALUES ($1, $2, $3, '/data/clips/test/fake.mp4', 1024, NOW())
			 RETURNING id`,
			claimsA.TenantID, unitID, siteAID,
		).Scan(&clipAID)
		require.NoError(t, err)
		assert.NotEmpty(t, clipAID)
	})

	// Tenant A can list its own clips
	t.Run("Tenant A can list its own clips", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/clips", handlers.ListClips)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.ClipsListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.GreaterOrEqual(t, len(resp.Data), 1, "Tenant A should see at least 1 clip")
	})

	// Tenant B cannot list Tenant A's clips (site invisible via RLS)
	t.Run("Tenant B cannot list Tenant A clips", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/clips", handlers.ListClips)

		req := httptest.NewRequest("GET", "/api/clips?site_id="+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Site not found for Tenant B via RLS
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot DELETE Tenant A's clip
	t.Run("Tenant B cannot delete Tenant A clip", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Delete("/api/clips/{id}", handlers.DeleteClip)

		req := httptest.NewRequest("DELETE", "/api/clips/"+clipAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot get Tenant A's clip thumbnail
	t.Run("Tenant B cannot get Tenant A clip thumbnail", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/clips/{id}/thumbnail", handlers.GetClipThumbnail)

		req := httptest.NewRequest("GET", "/api/clips/"+clipAID+"/thumbnail", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot get Tenant A's clip video
	t.Run("Tenant B cannot get Tenant A clip video", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/clips/{id}/video", handlers.GetClipVideo)

		req := httptest.NewRequest("GET", "/api/clips/"+clipAID+"/video", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Verify clip still exists for Tenant A
	t.Run("Tenant A clip is still intact", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claimsA.TenantID)
		require.NoError(t, err)

		clip, err := storage.GetClip(ctx, conn, clipAID)
		require.NoError(t, err)
		assert.Equal(t, clipAID, clip.ID)
	})
}
