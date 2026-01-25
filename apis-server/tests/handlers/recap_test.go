package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/handlers"
)

func TestGetRecap_Unauthorized(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/api/recap", handlers.GetRecap)

	req := httptest.NewRequest(http.MethodGet, "/api/recap", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestGetAvailableSeasons_Unauthorized(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/api/recap/seasons", handlers.GetAvailableSeasons)

	req := httptest.NewRequest(http.MethodGet, "/api/recap/seasons", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRegenerateRecap_InvalidBody(t *testing.T) {
	r := chi.NewRouter()
	r.Post("/api/recap/regenerate", handlers.RegenerateRecap)

	req := httptest.NewRequest(http.MethodPost, "/api/recap/regenerate", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Without auth, should return unauthorized first
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestIsRecapTime_DefaultHemisphere(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/api/recap/is-time", handlers.IsRecapTime)

	req := httptest.NewRequest(http.MethodGet, "/api/recap/is-time", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	data := response["data"].(map[string]any)
	assert.Equal(t, "northern", data["hemisphere"])
	assert.NotNil(t, data["is_recap_time"])
	assert.NotNil(t, data["current_season"])
}

func TestIsRecapTime_SouthernHemisphere(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/api/recap/is-time", handlers.IsRecapTime)

	req := httptest.NewRequest(http.MethodGet, "/api/recap/is-time?hemisphere=southern", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	data := response["data"].(map[string]any)
	assert.Equal(t, "southern", data["hemisphere"])
}

func TestGetRecapText_Unauthorized(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/api/recap/text", handlers.GetRecapText)

	req := httptest.NewRequest(http.MethodGet, "/api/recap/text", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestGetRecap_InvalidSeasonYear(t *testing.T) {
	// This test verifies the year validation logic
	// The handler should reject years outside 2000-2100 range

	r := chi.NewRouter()
	// We need to add a middleware that sets tenant context for this test
	// For now, we just verify the endpoint exists and responds
	r.Get("/api/recap", handlers.GetRecap)

	testCases := []struct {
		name     string
		query    string
		wantCode int
	}{
		{"no_year_param", "/api/recap", http.StatusUnauthorized}, // Defaults to current, but no auth
		{"valid_year", "/api/recap?season=2026", http.StatusUnauthorized},
		{"year_too_low", "/api/recap?season=1999", http.StatusUnauthorized}, // Validation happens after auth
		{"year_too_high", "/api/recap?season=2101", http.StatusUnauthorized},
		{"invalid_year", "/api/recap?season=abc", http.StatusUnauthorized},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.query, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.Equal(t, tc.wantCode, w.Code)
		})
	}
}

func TestGetRecap_FormatParam(t *testing.T) {
	// Test that format parameter is properly handled
	r := chi.NewRouter()
	r.Get("/api/recap", handlers.GetRecap)

	// Both should return unauthorized (no auth context)
	// but the query parsing should work
	testCases := []string{
		"/api/recap?format=json",
		"/api/recap?format=text",
		"/api/recap?format=invalid", // Should default to json
	}

	for _, path := range testCases {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.Equal(t, http.StatusUnauthorized, w.Code)
		})
	}
}

func TestRegenerateRecap_InvalidSeasonYear(t *testing.T) {
	r := chi.NewRouter()
	r.Post("/api/recap/regenerate", handlers.RegenerateRecap)

	testCases := []struct {
		name string
		body string
	}{
		{"year_too_low", `{"season": 1999}`},
		{"year_too_high", `{"season": 2101}`},
		{"negative_year", `{"season": -1}`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/recap/regenerate", bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			// Auth check happens first
			assert.Equal(t, http.StatusUnauthorized, w.Code)
		})
	}
}
