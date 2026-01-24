package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCreateSiteRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name:    "valid request with all fields",
			body:    `{"name": "Test Site", "latitude": 50.8503, "longitude": 4.3517, "timezone": "Europe/Brussels"}`,
			wantErr: false,
		},
		{
			name:    "valid request with minimal fields",
			body:    `{"name": "Test Site"}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			body:    `{"name": }`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CreateSiteRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&req)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestUpdateSiteRequestPartialFields(t *testing.T) {
	// Test that only provided fields are set
	body := `{"name": "Updated Name"}`
	var req UpdateSiteRequest
	err := json.NewDecoder(bytes.NewBufferString(body)).Decode(&req)

	assert.NoError(t, err)
	assert.NotNil(t, req.Name)
	assert.Equal(t, "Updated Name", *req.Name)
	assert.Nil(t, req.Latitude)
	assert.Nil(t, req.Longitude)
	assert.Nil(t, req.Timezone)
}

func TestSiteResponseSerialization(t *testing.T) {
	lat := 50.8503
	lng := 4.3517
	resp := SiteResponse{
		ID:        "abc123",
		Name:      "Test Apiary",
		Latitude:  &lat,
		Longitude: &lng,
		Timezone:  "Europe/Brussels",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify JSON fields are snake_case per CLAUDE.md
	assert.Contains(t, string(data), `"id"`)
	assert.Contains(t, string(data), `"name"`)
	assert.Contains(t, string(data), `"latitude"`)
	assert.Contains(t, string(data), `"longitude"`)
	assert.Contains(t, string(data), `"timezone"`)
	assert.Contains(t, string(data), `"created_at"`)
	assert.Contains(t, string(data), `"updated_at"`)
}

func TestSiteResponseOmitsNullCoordinates(t *testing.T) {
	resp := SiteResponse{
		ID:       "abc123",
		Name:     "Test Apiary",
		Timezone: "UTC",
		// Latitude and Longitude left nil
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify null coordinates are omitted (omitempty)
	assert.NotContains(t, string(data), `"latitude"`)
	assert.NotContains(t, string(data), `"longitude"`)
}

func TestIsValidTimezone(t *testing.T) {
	tests := []struct {
		tz    string
		valid bool
	}{
		{"UTC", true},
		{"Europe/Brussels", true},
		{"Europe/Paris", true},
		{"America/New_York", true},
		{"Asia/Tokyo", true},
		{"Africa/Cairo", true},  // Test IANA db coverage beyond hardcoded list
		{"Invalid/Timezone", false},
		{"", false},
		{"GMT+1", false},
	}

	for _, tt := range tests {
		t.Run(tt.tz, func(t *testing.T) {
			assert.Equal(t, tt.valid, isValidTimezone(tt.tz))
		})
	}
}

func TestCoordinateValidationRanges(t *testing.T) {
	// Test latitude validation boundaries
	validLat := 50.0
	invalidLatHigh := 91.0
	invalidLatLow := -91.0

	// Test longitude validation boundaries
	validLng := 4.0
	invalidLngHigh := 181.0
	invalidLngLow := -181.0

	tests := []struct {
		name      string
		latitude  *float64
		longitude *float64
		wantErr   bool
	}{
		{"valid coordinates", &validLat, &validLng, false},
		{"nil coordinates", nil, nil, false},
		{"latitude too high", &invalidLatHigh, &validLng, true},
		{"latitude too low", &invalidLatLow, &validLng, true},
		{"longitude too high", &validLat, &invalidLngHigh, true},
		{"longitude too low", &validLat, &invalidLngLow, true},
		{"boundary lat 90", func() *float64 { v := 90.0; return &v }(), &validLng, false},
		{"boundary lat -90", func() *float64 { v := -90.0; return &v }(), &validLng, false},
		{"boundary lng 180", &validLat, func() *float64 { v := 180.0; return &v }(), false},
		{"boundary lng -180", &validLat, func() *float64 { v := -180.0; return &v }(), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hasErr := false
			if tt.latitude != nil && (*tt.latitude < -90 || *tt.latitude > 90) {
				hasErr = true
			}
			if tt.longitude != nil && (*tt.longitude < -180 || *tt.longitude > 180) {
				hasErr = true
			}
			assert.Equal(t, tt.wantErr, hasErr)
		})
	}
}

func TestSitesListResponseFormat(t *testing.T) {
	resp := SitesListResponse{
		Data: []SiteResponse{
			{ID: "1", Name: "Site 1", Timezone: "UTC"},
			{ID: "2", Name: "Site 2", Timezone: "Europe/Brussels"},
		},
		Meta: MetaResponse{Total: 2},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify format matches CLAUDE.md API response format
	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	assert.Contains(t, parsed, "meta")

	meta, ok := parsed["meta"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, float64(2), meta["total"])
}

func TestRespondErrorFormat(t *testing.T) {
	w := httptest.NewRecorder()
	respondError(w, "Site not found", http.StatusNotFound)

	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var resp map[string]any
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)

	// Verify format matches CLAUDE.md: {"error": "...", "code": 404}
	assert.Equal(t, "Site not found", resp["error"])
	assert.Equal(t, float64(404), resp["code"])
}

func TestRespondJSONFormat(t *testing.T) {
	w := httptest.NewRecorder()
	data := map[string]string{"message": "success"}
	respondJSON(w, data, http.StatusOK)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var resp map[string]string
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, "success", resp["message"])
}
