package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupCalendarTestRouter creates a test router with calendar handlers
func setupCalendarTestRouter(conn *storage.TestConn, tenantID string) *chi.Mux {
	r := chi.NewRouter()

	// Add test middleware to inject tenant and connection
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithTenantID(r.Context(), tenantID)
			ctx = storage.WithConn(ctx, conn.Conn)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	// Register calendar routes
	r.Get("/api/calendar", handlers.GetCalendar)
	r.Post("/api/calendar/snooze-treatment", handlers.SnoozeTreatmentDue)
	r.Post("/api/calendar/skip-treatment", handlers.SkipTreatmentDue)
	r.Get("/api/reminders", handlers.ListReminders)
	r.Post("/api/reminders", handlers.CreateReminder)
	r.Get("/api/reminders/{id}", handlers.GetReminder)
	r.Put("/api/reminders/{id}", handlers.UpdateReminder)
	r.Delete("/api/reminders/{id}", handlers.DeleteReminder)
	r.Post("/api/reminders/{id}/snooze", handlers.SnoozeReminder)
	r.Post("/api/reminders/{id}/complete", handlers.CompleteReminder)
	r.Get("/api/settings/treatment-intervals", handlers.GetTreatmentIntervals)
	r.Put("/api/settings/treatment-intervals", handlers.UpdateTreatmentIntervals)

	return r
}

func TestGetCalendarMissingParams(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		queryParams    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing start and end",
			queryParams:    "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "start and end query params are required",
		},
		{
			name:           "missing end",
			queryParams:    "?start=2026-01-01",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "start and end query params are required",
		},
		{
			name:           "missing start",
			queryParams:    "?end=2026-01-31",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "start and end query params are required",
		},
		{
			name:           "invalid start date format",
			queryParams:    "?start=01-01-2026&end=2026-01-31",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid start date format",
		},
		{
			name:           "invalid end date format",
			queryParams:    "?start=2026-01-01&end=31/01/2026",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid end date format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/calendar"+tt.queryParams, nil)
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &resp)
			require.NoError(t, err)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestGetCalendarSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Make request with valid date range
	req := httptest.NewRequest("GET", "/api/calendar?start=2026-01-01&end=2026-01-31", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Should have data array (possibly empty)
	data, ok := resp["data"].([]interface{})
	assert.True(t, ok)
	assert.NotNil(t, data)
}

func TestCreateReminderSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	body := map[string]any{
		"title":         "Check for swarm cells",
		"due_at":        "2026-03-15",
		"reminder_type": "custom",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)

	var resp map[string]any
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)

	data := resp["data"].(map[string]any)
	assert.Equal(t, "Check for swarm cells", data["title"])
	assert.Equal(t, "2026-03-15", data["due_at"])
	assert.Equal(t, "custom", data["reminder_type"])
	assert.NotEmpty(t, data["id"])
}

func TestCreateReminderValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		body           map[string]any
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing title",
			body:           map[string]any{"due_at": "2026-02-15"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "title is required",
		},
		{
			name:           "missing due_at",
			body:           map[string]any{"title": "Check mites"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "due_at is required",
		},
		{
			name: "invalid reminder_type",
			body: map[string]any{
				"title":         "Test",
				"due_at":        "2026-02-15",
				"reminder_type": "invalid",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid reminder_type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &resp)
			require.NoError(t, err)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestGetReminderSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder first
	createBody := map[string]any{
		"title":  "Test reminder",
		"due_at": "2026-03-15",
	}
	jsonBody, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)
	require.Equal(t, http.StatusCreated, createRec.Code)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Get the reminder
	getReq := httptest.NewRequest("GET", "/api/reminders/"+reminderID, nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)

	assert.Equal(t, http.StatusOK, getRec.Code)

	var getResp map[string]any
	json.Unmarshal(getRec.Body.Bytes(), &getResp)
	data := getResp["data"].(map[string]any)
	assert.Equal(t, reminderID, data["id"])
	assert.Equal(t, "Test reminder", data["title"])
}

func TestGetReminderNotFound(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	req := httptest.NewRequest("GET", "/api/reminders/non-existent-id", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSnoozeReminderSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder first
	createBody := map[string]any{
		"title":  "To snooze",
		"due_at": "2026-03-15",
	}
	jsonBody, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)
	require.Equal(t, http.StatusCreated, createRec.Code)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Snooze for 14 days
	snoozeBody := map[string]any{"days": 14}
	snoozeJson, _ := json.Marshal(snoozeBody)
	snoozeReq := httptest.NewRequest("POST", "/api/reminders/"+reminderID+"/snooze", bytes.NewReader(snoozeJson))
	snoozeReq.Header.Set("Content-Type", "application/json")
	snoozeRec := httptest.NewRecorder()
	router.ServeHTTP(snoozeRec, snoozeReq)

	assert.Equal(t, http.StatusOK, snoozeRec.Code)

	var snoozeResp map[string]any
	json.Unmarshal(snoozeRec.Body.Bytes(), &snoozeResp)
	data := snoozeResp["data"].(map[string]any)
	assert.NotNil(t, data["snoozed_until"])
}

func TestSnoozeReminderDefaultDays(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder
	createBody := map[string]any{
		"title":  "To snooze",
		"due_at": "2026-03-15",
	}
	jsonBody, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Snooze with days=0 (should default to 7)
	snoozeBody := map[string]any{"days": 0}
	snoozeJson, _ := json.Marshal(snoozeBody)
	snoozeReq := httptest.NewRequest("POST", "/api/reminders/"+reminderID+"/snooze", bytes.NewReader(snoozeJson))
	snoozeReq.Header.Set("Content-Type", "application/json")
	snoozeRec := httptest.NewRecorder()
	router.ServeHTTP(snoozeRec, snoozeReq)

	assert.Equal(t, http.StatusOK, snoozeRec.Code)
}

func TestCompleteReminderSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder
	createBody := map[string]any{
		"title":  "To complete",
		"due_at": "2026-03-15",
	}
	jsonBody, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Complete it
	completeReq := httptest.NewRequest("POST", "/api/reminders/"+reminderID+"/complete", nil)
	completeRec := httptest.NewRecorder()
	router.ServeHTTP(completeRec, completeReq)

	assert.Equal(t, http.StatusOK, completeRec.Code)

	var completeResp map[string]any
	json.Unmarshal(completeRec.Body.Bytes(), &completeResp)
	data := completeResp["data"].(map[string]any)
	assert.NotNil(t, data["completed_at"])
}

func TestDeleteReminderSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder
	createBody := map[string]any{
		"title":  "To delete",
		"due_at": "2026-03-15",
	}
	jsonBody, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Delete it
	deleteReq := httptest.NewRequest("DELETE", "/api/reminders/"+reminderID, nil)
	deleteRec := httptest.NewRecorder()
	router.ServeHTTP(deleteRec, deleteReq)

	assert.Equal(t, http.StatusNoContent, deleteRec.Code)

	// Verify it's gone
	getReq := httptest.NewRequest("GET", "/api/reminders/"+reminderID, nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	assert.Equal(t, http.StatusNotFound, getRec.Code)
}

func TestGetTreatmentIntervalsSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	req := httptest.NewRequest("GET", "/api/settings/treatment-intervals", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	data := resp["data"].(map[string]any)

	// Should have default intervals
	assert.NotNil(t, data["oxalic_acid"])
	assert.NotNil(t, data["formic_acid"])
}

func TestUpdateTreatmentIntervalsSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	body := map[string]any{
		"oxalic_acid": 120,
		"formic_acid": 45,
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest("PUT", "/api/settings/treatment-intervals", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	data := resp["data"].(map[string]any)

	// Should have updated intervals merged with defaults
	assert.Equal(t, float64(120), data["oxalic_acid"])
	assert.Equal(t, float64(45), data["formic_acid"])
}

func TestUpdateTreatmentIntervalsValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		body           map[string]any
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "interval is zero",
			body:           map[string]any{"oxalic_acid": 0},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "must be positive",
		},
		{
			name:           "interval is negative",
			body:           map[string]any{"formic_acid": -30},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "must be positive",
		},
		{
			name:           "interval exceeds 365",
			body:           map[string]any{"apiguard": 400},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "cannot exceed 365 days",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("PUT", "/api/settings/treatment-intervals", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			json.Unmarshal(rec.Body.Bytes(), &resp)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestSnoozeTreatmentDueSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a test hive
	hive, err := storage.CreateHive(nil, conn.Conn, tenantID, &storage.CreateHiveInput{
		Name: "Test Hive",
	})
	require.NoError(t, err)

	body := map[string]any{
		"hive_id":        hive.ID,
		"treatment_type": "oxalic_acid",
		"days":           14,
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/calendar/snooze-treatment", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.Equal(t, "Treatment due snoozed", resp["message"])
	assert.NotEmpty(t, resp["snoozed_until"])
}

func TestSnoozeTreatmentDueValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		body           map[string]any
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing hive_id",
			body:           map[string]any{"treatment_type": "oxalic_acid"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "hive_id and treatment_type are required",
		},
		{
			name:           "missing treatment_type",
			body:           map[string]any{"hive_id": "hive-1"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "hive_id and treatment_type are required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/calendar/snooze-treatment", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			json.Unmarshal(rec.Body.Bytes(), &resp)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestSkipTreatmentDueSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a hive first
	hive, err := storage.CreateHive(context.Background(), conn.Conn, tenantID, &storage.CreateHiveInput{
		Name: "Skip Test Hive",
	})
	require.NoError(t, err)

	// Skip the treatment due
	body := map[string]any{
		"hive_id":        hive.ID,
		"treatment_type": "oxalic_acid",
	}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/calendar/skip-treatment", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.Equal(t, "Treatment due skipped", resp["message"])
}

func TestSkipTreatmentDueValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		body           map[string]any
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing hive_id",
			body:           map[string]any{"treatment_type": "oxalic_acid"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "hive_id and treatment_type are required",
		},
		{
			name:           "missing treatment_type",
			body:           map[string]any{"hive_id": "hive-1"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "hive_id and treatment_type are required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/calendar/skip-treatment", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			json.Unmarshal(rec.Body.Bytes(), &resp)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestGetCalendarDateRangeValidation(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	tests := []struct {
		name           string
		queryParams    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "end before start",
			queryParams:    "?start=2026-02-15&end=2026-01-01",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "end date must be after start date",
		},
		{
			name:           "range exceeds 366 days",
			queryParams:    "?start=2024-01-01&end=2026-12-31",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "date range cannot exceed 366 days",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/calendar"+tt.queryParams, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.expectedStatus, rec.Code)

			var resp map[string]any
			err := json.Unmarshal(rec.Body.Bytes(), &resp)
			require.NoError(t, err)
			assert.Contains(t, resp["error"], tt.expectedError)
		})
	}
}

func TestGetCalendarWithInspectionEvents(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a site
	site, err := storage.CreateSite(context.Background(), conn.Conn, tenantID, &storage.CreateSiteInput{
		Name:     "Calendar Test Site",
		Timezone: "UTC",
	})
	require.NoError(t, err)

	// Create a hive in that site
	hive, err := storage.CreateHive(context.Background(), conn.Conn, tenantID, &storage.CreateHiveInput{
		SiteID: site.ID,
		Name:   "Calendar Test Hive",
	})
	require.NoError(t, err)

	// Create an inspection
	broodFrames := 5
	honeyLevel := "high"
	inspectedAt := time.Date(2026, 2, 10, 12, 0, 0, 0, time.UTC)
	_, err = storage.CreateInspection(context.Background(), conn.Conn, tenantID, &storage.CreateInspectionInput{
		HiveID:      hive.ID,
		InspectedAt: inspectedAt,
		BroodFrames: &broodFrames,
		HoneyLevel:  &honeyLevel,
		Issues:      []string{"mites", "wax_moths"},
	})
	require.NoError(t, err)

	// Fetch calendar for Feb 2026
	req := httptest.NewRequest("GET", "/api/calendar?start=2026-02-01&end=2026-02-28", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var resp handlers.CalendarResponse
	err = json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Find the inspection event
	var found bool
	for _, event := range resp.Data {
		if event.Type == "inspection_past" {
			found = true
			assert.Equal(t, "2026-02-10", event.Date)
			assert.Equal(t, "Inspection - Calendar Test Hive", event.Title)
			assert.NotNil(t, event.HiveID)
			assert.Equal(t, hive.ID, *event.HiveID)

			// Check metadata
			require.NotNil(t, event.Metadata)
			assert.NotEmpty(t, event.Metadata["inspection_id"])
			assert.Equal(t, float64(5), event.Metadata["brood_frames"])
			assert.Equal(t, "high", event.Metadata["honey_level"])
			assert.Equal(t, float64(2), event.Metadata["issues_count"])
			break
		}
	}
	assert.True(t, found, "Should find an inspection_past event in calendar")
}

func TestGetCalendarSiteFiltering(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create two sites
	siteA, err := storage.CreateSite(context.Background(), conn.Conn, tenantID, &storage.CreateSiteInput{
		Name: "Site Alpha", Timezone: "UTC",
	})
	require.NoError(t, err)

	siteB, err := storage.CreateSite(context.Background(), conn.Conn, tenantID, &storage.CreateSiteInput{
		Name: "Site Beta", Timezone: "UTC",
	})
	require.NoError(t, err)

	// Create a hive in each site
	hiveA, err := storage.CreateHive(context.Background(), conn.Conn, tenantID, &storage.CreateHiveInput{
		SiteID: siteA.ID, Name: "Hive A",
	})
	require.NoError(t, err)

	hiveB, err := storage.CreateHive(context.Background(), conn.Conn, tenantID, &storage.CreateHiveInput{
		SiteID: siteB.ID, Name: "Hive B",
	})
	require.NoError(t, err)

	// Create inspection on each hive
	inspDate := time.Date(2026, 3, 15, 10, 0, 0, 0, time.UTC)
	_, err = storage.CreateInspection(context.Background(), conn.Conn, tenantID, &storage.CreateInspectionInput{
		HiveID: hiveA.ID, InspectedAt: inspDate,
	})
	require.NoError(t, err)

	_, err = storage.CreateInspection(context.Background(), conn.Conn, tenantID, &storage.CreateInspectionInput{
		HiveID: hiveB.ID, InspectedAt: inspDate,
	})
	require.NoError(t, err)

	t.Run("no filter returns all events", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start=2026-03-01&end=2026-03-31", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)

		inspCount := 0
		for _, e := range resp.Data {
			if e.Type == "inspection_past" {
				inspCount++
			}
		}
		assert.Equal(t, 2, inspCount, "Should see inspections from both hives")
	})

	t.Run("site_id filter shows only that site", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start=2026-03-01&end=2026-03-31&site_id="+siteA.ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)

		for _, e := range resp.Data {
			if e.Type == "inspection_past" {
				assert.Equal(t, hiveA.ID, *e.HiveID, "Should only see Hive A")
				assert.NotNil(t, e.SiteID, "SiteID should be populated with filtering")
				assert.Equal(t, siteA.ID, *e.SiteID)
				assert.NotNil(t, e.SiteName, "SiteName should be populated with filtering")
				assert.Equal(t, "Site Alpha", *e.SiteName)
			}
		}
	})

	t.Run("hive_id filter shows only that hive", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/calendar?start=2026-03-01&end=2026-03-31&hive_id="+hiveB.ID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp handlers.CalendarResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)

		for _, e := range resp.Data {
			if e.Type == "inspection_past" {
				assert.Equal(t, hiveB.ID, *e.HiveID, "Should only see Hive B")
			}
		}
	})
}

func TestListRemindersSuccess(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create some reminders
	for i := 0; i < 3; i++ {
		body := map[string]any{
			"title":  "Reminder",
			"due_at": "2026-01-15",
		}
		jsonBody, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
	}

	// List reminders
	req := httptest.NewRequest("GET", "/api/reminders", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	var resp map[string]any
	json.Unmarshal(rec.Body.Bytes(), &resp)
	data := resp["data"].([]interface{})
	assert.Len(t, data, 3)
}

func TestListRemindersPendingFilter(t *testing.T) {
	conn, tenantID, cleanup := storage.SetupTestDB(t)
	defer cleanup()

	router := setupCalendarTestRouter(conn, tenantID)

	// Create a reminder and complete it
	body := map[string]any{
		"title":  "Completed one",
		"due_at": "2026-01-15",
	}
	jsonBody, _ := json.Marshal(body)
	createReq := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody))
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)

	var createResp map[string]any
	json.Unmarshal(createRec.Body.Bytes(), &createResp)
	reminderID := createResp["data"].(map[string]any)["id"].(string)

	// Complete it
	completeReq := httptest.NewRequest("POST", "/api/reminders/"+reminderID+"/complete", nil)
	completeRec := httptest.NewRecorder()
	router.ServeHTTP(completeRec, completeReq)

	// Create a pending reminder
	body2 := map[string]any{
		"title":  "Pending one",
		"due_at": "2026-01-15",
	}
	jsonBody2, _ := json.Marshal(body2)
	createReq2 := httptest.NewRequest("POST", "/api/reminders", bytes.NewReader(jsonBody2))
	createReq2.Header.Set("Content-Type", "application/json")
	createRec2 := httptest.NewRecorder()
	router.ServeHTTP(createRec2, createReq2)

	// List pending only
	listReq := httptest.NewRequest("GET", "/api/reminders?pending=true", nil)
	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)

	assert.Equal(t, http.StatusOK, listRec.Code)

	var listResp map[string]any
	json.Unmarshal(listRec.Body.Bytes(), &listResp)
	data := listResp["data"].([]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, "Pending one", data[0].(map[string]any)["title"])
}
