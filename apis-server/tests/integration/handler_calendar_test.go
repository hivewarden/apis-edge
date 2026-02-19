package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupCalendarRouter(claims *middleware.Claims) *chi.Mux {
	r := chi.NewRouter()
	r.Use(mockAuthMiddleware(claims))
	r.Use(mockTenantMiddleware(testAppPool()))

	// Prerequisites: sites, hives, inspections, treatments
	r.Post("/api/sites", handlers.CreateSite)
	r.Post("/api/sites/{site_id}/hives", handlers.CreateHive)
	r.Post("/api/hives/{hive_id}/inspections", handlers.CreateInspection)
	r.Post("/api/treatments", handlers.CreateTreatment)

	// Calendar endpoint under test
	r.Get("/api/calendar", handlers.GetCalendar)

	return r
}

func TestCalendarInspectionsAndFiltering(t *testing.T) {
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
		UserID:   "test-cal-user",
		OrgID:    "test-tenant-cal",
		TenantID: "test-tenant-cal",
		Email:    "cal@test.com",
		Name:     "Calendar Tester",
		Role:     "admin",
		Roles:    []string{"admin"},
	}

	router := setupCalendarRouter(claims)

	// Shared IDs across subtests
	var site1ID, site2ID string
	var hive1ID, hive2ID, hive3ID string

	now := time.Now()
	thisMonth := now.Format("2006-01")
	startDate := thisMonth + "-01"
	endDate := thisMonth + "-28"
	inspectionDate := thisMonth + "-10"
	treatmentDate := thisMonth + "-12"

	t.Run("setup: create two sites with hives", func(t *testing.T) {
		// Site 1 with two hives
		siteBody, _ := json.Marshal(map[string]interface{}{
			"name":     "Calendar Test Site Alpha",
			"timezone": "Europe/Brussels",
		})
		req := httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(siteBody))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		var siteResp handlers.SiteDataResponse
		json.NewDecoder(rec.Body).Decode(&siteResp)
		site1ID = siteResp.Data.ID

		hiveBody, _ := json.Marshal(map[string]interface{}{"name": "Alpha Hive 1"})
		req = httptest.NewRequest("POST", "/api/sites/"+site1ID+"/hives", bytes.NewBuffer(hiveBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
		var hiveResp handlers.HiveDataResponse
		json.NewDecoder(rec.Body).Decode(&hiveResp)
		hive1ID = hiveResp.Data.ID

		hiveBody, _ = json.Marshal(map[string]interface{}{"name": "Alpha Hive 2"})
		req = httptest.NewRequest("POST", "/api/sites/"+site1ID+"/hives", bytes.NewBuffer(hiveBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
		json.NewDecoder(rec.Body).Decode(&hiveResp)
		hive2ID = hiveResp.Data.ID

		// Site 2 with one hive
		siteBody, _ = json.Marshal(map[string]interface{}{
			"name":     "Calendar Test Site Beta",
			"timezone": "Europe/Brussels",
		})
		req = httptest.NewRequest("POST", "/api/sites", bytes.NewBuffer(siteBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
		json.NewDecoder(rec.Body).Decode(&siteResp)
		site2ID = siteResp.Data.ID

		hiveBody, _ = json.Marshal(map[string]interface{}{"name": "Beta Hive 1"})
		req = httptest.NewRequest("POST", "/api/sites/"+site2ID+"/hives", bytes.NewBuffer(hiveBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
		json.NewDecoder(rec.Body).Decode(&hiveResp)
		hive3ID = hiveResp.Data.ID
	})

	t.Run("setup: create inspections and treatments", func(t *testing.T) {
		// Inspection on hive1 (site1)
		inspBody, _ := json.Marshal(map[string]interface{}{
			"inspected_at": inspectionDate,
			"brood_frames": 6,
			"honey_level":  "high",
			"issues":       []string{"small_hive_beetles"},
		})
		req := httptest.NewRequest("POST", "/api/hives/"+hive1ID+"/inspections", bytes.NewBuffer(inspBody))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		// Inspection on hive3 (site2)
		inspBody, _ = json.Marshal(map[string]interface{}{
			"inspected_at": inspectionDate,
			"honey_level":  "low",
		})
		req = httptest.NewRequest("POST", "/api/hives/"+hive3ID+"/inspections", bytes.NewBuffer(inspBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)

		// Treatment on hive2 (site1)
		treatBody, _ := json.Marshal(map[string]interface{}{
			"hive_ids":       []string{hive2ID},
			"treated_at":     treatmentDate,
			"treatment_type": "oxalic_acid",
		})
		req = httptest.NewRequest("POST", "/api/treatments", bytes.NewBuffer(treatBody))
		req.Header.Set("Content-Type", "application/json")
		rec = httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code)
	})

	t.Run("no filter returns all events including inspections", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		// Should have at least: 2 inspections + 1 treatment
		var inspCount, treatCount int
		for _, ev := range resp.Data {
			switch ev.Type {
			case "inspection_past":
				inspCount++
				assert.NotNil(t, ev.HiveID, "inspection event should have hive_id")
				assert.NotNil(t, ev.HiveName, "inspection event should have hive_name")
				assert.NotNil(t, ev.Metadata, "inspection event should have metadata")
				assert.Contains(t, ev.Metadata, "inspection_id")
				assert.Contains(t, ev.Metadata, "issues_count")
			case "treatment_past":
				treatCount++
			}
		}
		assert.GreaterOrEqual(t, inspCount, 2, "should have at least 2 inspection events")
		assert.GreaterOrEqual(t, treatCount, 1, "should have at least 1 treatment event")
	})

	t.Run("inspection metadata includes brood_frames and honey_level", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate+"&hive_id="+hive1ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		var found bool
		for _, ev := range resp.Data {
			if ev.Type == "inspection_past" {
				found = true
				assert.Equal(t, float64(6), ev.Metadata["brood_frames"])
				assert.Equal(t, "high", ev.Metadata["honey_level"])
				assert.Equal(t, float64(1), ev.Metadata["issues_count"])
				break
			}
		}
		assert.True(t, found, "should find an inspection_past event for hive1")
	})

	t.Run("site_id filter returns only that site's events", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate+"&site_id="+site1ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		// Site1 has hive1 (inspection) and hive2 (treatment)
		for _, ev := range resp.Data {
			if ev.HiveID != nil {
				assert.True(t, *ev.HiveID == hive1ID || *ev.HiveID == hive2ID,
					"filtered events should only belong to site1 hives, got hive_id=%s", *ev.HiveID)
			}
		}

		// Should NOT contain hive3's inspection (site2)
		for _, ev := range resp.Data {
			if ev.HiveID != nil {
				assert.NotEqual(t, hive3ID, *ev.HiveID, "site1 filter should exclude site2 hive events")
			}
		}
	})

	t.Run("hive_id filter returns only that hive's events", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate+"&hive_id="+hive3ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		// Only hive3 events (one inspection from site2)
		var inspCount int
		for _, ev := range resp.Data {
			if ev.HiveID != nil {
				assert.Equal(t, hive3ID, *ev.HiveID, "hive_id filter should only return that hive's events")
			}
			if ev.Type == "inspection_past" {
				inspCount++
			}
		}
		assert.Equal(t, 1, inspCount, "should have exactly 1 inspection for hive3")
	})

	t.Run("hive_id filter with no matching events returns empty", func(t *testing.T) {
		fakeID := "00000000-0000-0000-0000-000000000099"
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate+"&hive_id="+fakeID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		// Should have no hive-specific events (may still have global reminders without hive_id)
		for _, ev := range resp.Data {
			if ev.HiveID != nil {
				t.Errorf("expected no hive events for fake hive_id, got event type=%s hive_id=%s", ev.Type, *ev.HiveID)
			}
		}
	})

	t.Run("site_id filter includes site_id and site_name in events", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate+"&site_id="+site1ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)

		// At least one event should have site_id populated
		var foundSiteID bool
		for _, ev := range resp.Data {
			if ev.SiteID != nil {
				foundSiteID = true
				assert.Equal(t, site1ID, *ev.SiteID)
				assert.NotNil(t, ev.SiteName)
				assert.Equal(t, "Calendar Test Site Alpha", *ev.SiteName)
				break
			}
		}
		assert.True(t, foundSiteID, "filtered events should include site_id and site_name")
	})

	t.Run("backward compat: no filter params still works", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start="+startDate+"&end="+endDate, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.NewDecoder(rec.Body).Decode(&resp)
		assert.NotNil(t, resp.Data, "data should not be nil")
	})

	t.Run("missing start/end still returns 400", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
