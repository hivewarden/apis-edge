package handlers

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCreateUnitRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name:    "valid request with all fields",
			body:    `{"serial": "APIS-001", "name": "Garden Unit", "site_id": "site-123"}`,
			wantErr: false,
		},
		{
			name:    "valid request with minimal fields",
			body:    `{"serial": "APIS-001"}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			body:    `{"serial": }`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CreateUnitRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&req)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestUpdateUnitRequestPartialFields(t *testing.T) {
	// Test that only provided fields are set
	body := `{"name": "Updated Name"}`
	var req UpdateUnitRequest
	err := json.NewDecoder(bytes.NewBufferString(body)).Decode(&req)

	assert.NoError(t, err)
	assert.NotNil(t, req.Name)
	assert.Equal(t, "Updated Name", *req.Name)
	assert.Nil(t, req.SiteID)
}

func TestUnitResponseSerialization(t *testing.T) {
	name := "Test Unit"
	siteID := "site-123"
	siteName := "Home Apiary"

	resp := UnitResponse{
		ID:       "unit-abc123",
		Serial:   "APIS-001",
		Name:     &name,
		SiteID:   &siteID,
		SiteName: &siteName,
		Status:   "online",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify JSON fields are snake_case per CLAUDE.md
	assert.Contains(t, string(data), `"id"`)
	assert.Contains(t, string(data), `"serial"`)
	assert.Contains(t, string(data), `"name"`)
	assert.Contains(t, string(data), `"site_id"`)
	assert.Contains(t, string(data), `"site_name"`)
	assert.Contains(t, string(data), `"status"`)
}

func TestUnitCreateResponseIncludesAPIKey(t *testing.T) {
	resp := UnitCreateResponse{
		ID:     "unit-abc123",
		Serial: "APIS-001",
		APIKey: "apis_testkey1234567890abcdef12345678",
		Status: "offline",
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify API key is included
	assert.Contains(t, string(data), `"api_key"`)
	assert.Contains(t, string(data), "apis_testkey1234567890abcdef12345678")
}

func TestUnitResponseOmitsNullFields(t *testing.T) {
	resp := UnitResponse{
		ID:     "unit-abc123",
		Serial: "APIS-001",
		Status: "offline",
		// Name, SiteID, SiteName, FirmwareVersion, LastSeen left nil
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify null fields are omitted (omitempty)
	assert.NotContains(t, string(data), `"name"`)
	assert.NotContains(t, string(data), `"site_id"`)
	assert.NotContains(t, string(data), `"site_name"`)
	assert.NotContains(t, string(data), `"firmware_version"`)
	assert.NotContains(t, string(data), `"last_seen"`)
}

func TestUnitsListResponseFormat(t *testing.T) {
	name := "Unit 1"
	resp := UnitsListResponse{
		Data: []UnitResponse{
			{ID: "1", Serial: "APIS-001", Name: &name, Status: "online"},
			{ID: "2", Serial: "APIS-002", Status: "offline"},
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

func TestAPIKeyResponseFormat(t *testing.T) {
	w := httptest.NewRecorder()

	resp := APIKeyResponse{
		Warning: "Save this API key securely",
	}
	resp.Data.APIKey = "apis_newkey1234567890abcdef12345678"

	respondJSON(w, resp, 200)

	var parsed map[string]any
	err := json.NewDecoder(w.Body).Decode(&parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	assert.Contains(t, parsed, "warning")

	data, ok := parsed["data"].(map[string]any)
	assert.True(t, ok)
	assert.Contains(t, data, "api_key")
}

// Heartbeat handler tests (Story 2.3)

func TestHeartbeatRequestParsing(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name:    "full payload",
			body:    `{"firmware_version": "1.2.3", "uptime_seconds": 3600, "detection_count_since_last": 5, "cpu_temp": 42.5, "free_heap": 128000, "local_time": "2026-01-22T14:30:00Z"}`,
			wantErr: false,
		},
		{
			name:    "minimal payload (empty)",
			body:    `{}`,
			wantErr: false,
		},
		{
			name:    "partial payload - firmware only",
			body:    `{"firmware_version": "2.0.0"}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			body:    `{"firmware_version": }`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req HeartbeatRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&req)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestHeartbeatRequestOptionalFields(t *testing.T) {
	body := `{"firmware_version": "1.2.3", "uptime_seconds": 3600}`
	var req HeartbeatRequest
	err := json.NewDecoder(bytes.NewBufferString(body)).Decode(&req)

	assert.NoError(t, err)
	assert.NotNil(t, req.FirmwareVersion)
	assert.Equal(t, "1.2.3", *req.FirmwareVersion)
	assert.NotNil(t, req.UptimeSeconds)
	assert.Equal(t, int64(3600), *req.UptimeSeconds)
	// Optional fields should be nil when not provided
	assert.Nil(t, req.CPUTemp)
	assert.Nil(t, req.FreeHeap)
	assert.Nil(t, req.LocalTime)
}

func TestHeartbeatResponseSerialization(t *testing.T) {
	driftMs := int64(5000)
	resp := HeartbeatResponse{
		ServerTime:  "2026-01-22T14:30:05Z",
		TimeDriftMs: &driftMs,
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify JSON fields are snake_case
	assert.Contains(t, string(data), `"server_time"`)
	assert.Contains(t, string(data), `"time_drift_ms"`)
	assert.Contains(t, string(data), "2026-01-22T14:30:05Z")
	assert.Contains(t, string(data), "5000")
}

func TestHeartbeatResponseOmitsTimeDriftWhenNil(t *testing.T) {
	resp := HeartbeatResponse{
		ServerTime: "2026-01-22T14:30:05Z",
		// TimeDriftMs not set (nil)
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// TimeDriftMs should be omitted
	assert.NotContains(t, string(data), `"time_drift_ms"`)
}

func TestHeartbeatDataResponseFormat(t *testing.T) {
	driftMs := int64(5000)
	resp := HeartbeatDataResponse{
		Data: HeartbeatResponse{
			ServerTime:  "2026-01-22T14:30:05Z",
			TimeDriftMs: &driftMs,
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify wrapped in "data" object per CLAUDE.md API format
	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	inner, ok := parsed["data"].(map[string]any)
	assert.True(t, ok)
	assert.Contains(t, inner, "server_time")
}

func TestExtractClientIP_XForwardedFor(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/units/heartbeat", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.50, 70.41.3.18, 150.172.238.178")

	ip := extractClientIP(req)
	// Should return first IP (original client)
	assert.Equal(t, "203.0.113.50", ip)
}

func TestExtractClientIP_XForwardedForSingle(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/units/heartbeat", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.50")

	ip := extractClientIP(req)
	assert.Equal(t, "203.0.113.50", ip)
}

func TestExtractClientIP_XRealIP(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/units/heartbeat", nil)
	req.Header.Set("X-Real-IP", "192.168.1.100")

	ip := extractClientIP(req)
	assert.Equal(t, "192.168.1.100", ip)
}

func TestExtractClientIP_RemoteAddr(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/units/heartbeat", nil)
	req.RemoteAddr = "10.0.0.5:12345"

	ip := extractClientIP(req)
	// Should strip port
	assert.Equal(t, "10.0.0.5", ip)
}

func TestExtractClientIP_Precedence(t *testing.T) {
	// X-Forwarded-For takes precedence over X-Real-IP
	req := httptest.NewRequest("POST", "/api/units/heartbeat", nil)
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	req.Header.Set("X-Real-IP", "5.6.7.8")
	req.RemoteAddr = "9.10.11.12:443"

	ip := extractClientIP(req)
	assert.Equal(t, "1.2.3.4", ip)
}
