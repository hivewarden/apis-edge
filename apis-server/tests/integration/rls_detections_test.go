// Package integration contains integration tests for the APIS server.
// rls_detections_test.go — P0-006: RLS isolation tests for the detections table.
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

// TestRLSDetectionsIsolation tests that RLS enforces tenant isolation on detections.
// Detections created under Tenant A's site must be invisible to Tenant B.
//
// Note: Detections are created by units via the unit auth flow (X-API-Key header),
// but listed/read via the dashboard JWT flow. We test the JWT-authenticated
// list/get endpoints that dashboard users access.
func TestRLSDetectionsIsolation(t *testing.T) {
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
		UserID:   "det-rls-user-a",
		OrgID:    "det-rls-org-a",
		TenantID: "det-rls-org-a",
		Email:    "det-a@example.com",
		Name:     "Detection User A",
		Roles:    []string{"admin"},
	}
	claimsB := &middleware.Claims{
		UserID:   "det-rls-user-b",
		OrgID:    "det-rls-org-b",
		TenantID: "det-rls-org-b",
		Email:    "det-b@example.com",
		Name:     "Detection User B",
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

		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBufferString(`{"name":"Det RLS Site","timezone":"UTC"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		var resp handlers.SiteDataResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		siteAID = resp.Data.ID
	})

	// Insert a detection directly via storage layer (simulating unit upload)
	var detectionAID string
	t.Run("setup: insert detection for Tenant A via storage", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set tenant context for RLS
		_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claimsA.TenantID)
		require.NoError(t, err)

		// We need a unit to associate the detection with (use unique serial).
		var unitID string
		serial := fmt.Sprintf("DET-UNIT-A-%d", time.Now().UnixNano()%100000)
		err = conn.QueryRow(ctx,
			`INSERT INTO units (tenant_id, serial, name, api_key_hash, api_key_prefix, site_id)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			claimsA.TenantID, serial, "Det Unit A", "fakehash-det-a", "det-a", siteAID,
		).Scan(&unitID)
		require.NoError(t, err)

		// Insert a detection
		err = conn.QueryRow(ctx,
			`INSERT INTO detections (tenant_id, unit_id, site_id, detected_at, confidence, laser_activated)
			 VALUES ($1, $2, $3, NOW(), 0.95, true)
			 RETURNING id`,
			claimsA.TenantID, unitID, siteAID,
		).Scan(&detectionAID)
		require.NoError(t, err)
		assert.NotEmpty(t, detectionAID)
	})

	// Tenant A can list its own detections
	t.Run("Tenant A can list its own detections", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/detections", handlers.ListDetections)

		req := httptest.NewRequest("GET", "/api/detections?site_id="+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		var resp handlers.DetectionListResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.GreaterOrEqual(t, len(resp.Data), 1, "Tenant A should see at least 1 detection")
	})

	// Tenant B cannot list Tenant A's detections (site is invisible via RLS)
	t.Run("Tenant B cannot list Tenant A detections", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/detections", handlers.ListDetections)

		req := httptest.NewRequest("GET", "/api/detections?site_id="+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		// Should get 404 since the site is invisible to Tenant B
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot GET Tenant A's detection by ID
	t.Run("Tenant B cannot get Tenant A detection by ID", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/detections/{id}", handlers.GetDetectionByID)

		req := httptest.NewRequest("GET", "/api/detections/"+detectionAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Tenant B cannot access Tenant A's detection stats
	t.Run("Tenant B cannot get Tenant A detection stats", func(t *testing.T) {
		r := setupRouter(claimsB)
		r.Get("/api/detections/stats", handlers.GetDetectionStats)

		req := httptest.NewRequest("GET", "/api/detections/stats?site_id="+siteAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	// Verify Tenant A can still access its detection
	t.Run("Tenant A can still access its detection", func(t *testing.T) {
		r := setupRouter(claimsA)
		r.Get("/api/detections/{id}", handlers.GetDetectionByID)

		req := httptest.NewRequest("GET", "/api/detections/"+detectionAID, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
	})
}
