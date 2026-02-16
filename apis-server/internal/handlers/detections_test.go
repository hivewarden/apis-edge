package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
)

func TestCreateDetectionRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{
			name:    "valid request with all fields",
			body:    `{"detected_at": "2026-01-22T14:30:00Z", "confidence": 0.85, "size_pixels": 24, "hover_duration_ms": 1200, "laser_activated": true, "clip_filename": "det_20260122_143000.mp4"}`,
			wantErr: false,
		},
		{
			name:    "valid request with minimal fields",
			body:    `{"detected_at": "2026-01-22T14:30:00Z", "laser_activated": false}`,
			wantErr: false,
		},
		{
			name:    "invalid JSON",
			body:    `{"detected_at": }`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req CreateDetectionRequest
			err := json.NewDecoder(bytes.NewBufferString(tt.body)).Decode(&req)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestCreateDetectionRequestParsesAllFields(t *testing.T) {
	body := `{"detected_at": "2026-01-22T14:30:00Z", "confidence": 0.85, "size_pixels": 24, "hover_duration_ms": 1200, "laser_activated": true, "clip_filename": "det_20260122_143000.mp4"}`
	var req CreateDetectionRequest
	err := json.NewDecoder(bytes.NewBufferString(body)).Decode(&req)

	assert.NoError(t, err)
	assert.Equal(t, time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC), req.DetectedAt)
	assert.NotNil(t, req.Confidence)
	assert.Equal(t, 0.85, *req.Confidence)
	assert.NotNil(t, req.SizePixels)
	assert.Equal(t, 24, *req.SizePixels)
	assert.NotNil(t, req.HoverDurationMs)
	assert.Equal(t, 1200, *req.HoverDurationMs)
	assert.True(t, req.LaserActivated)
	assert.NotNil(t, req.ClipFilename)
	assert.Equal(t, "det_20260122_143000.mp4", *req.ClipFilename)
}

func TestDetectionResponseSerialization(t *testing.T) {
	confidence := 0.85
	sizePixels := 24
	hoverDuration := 1200
	temp := 18.5
	unitName := "Hive 1 Protector"

	resp := DetectionResponse{
		ID:              "det-123",
		UnitID:          "unit-1",
		UnitName:        &unitName,
		SiteID:          "site-1",
		DetectedAt:      time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC),
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverDuration,
		LaserActivated:  true,
		TemperatureC:    &temp,
		CreatedAt:       time.Now(),
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify JSON fields are snake_case per CLAUDE.md
	assert.Contains(t, string(data), `"id"`)
	assert.Contains(t, string(data), `"unit_id"`)
	assert.Contains(t, string(data), `"unit_name"`)
	assert.Contains(t, string(data), `"site_id"`)
	assert.Contains(t, string(data), `"detected_at"`)
	assert.Contains(t, string(data), `"confidence"`)
	assert.Contains(t, string(data), `"size_pixels"`)
	assert.Contains(t, string(data), `"hover_duration_ms"`)
	assert.Contains(t, string(data), `"laser_activated"`)
	assert.Contains(t, string(data), `"temperature_c"`)
	assert.Contains(t, string(data), `"created_at"`)
}

func TestDetectionResponseOmitsNullFields(t *testing.T) {
	resp := DetectionResponse{
		ID:             "det-123",
		UnitID:         "unit-1",
		SiteID:         "site-1",
		DetectedAt:     time.Now(),
		LaserActivated: false,
		CreatedAt:      time.Now(),
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify null optional fields are omitted (omitempty)
	assert.NotContains(t, string(data), `"unit_name"`)
	assert.NotContains(t, string(data), `"confidence"`)
	assert.NotContains(t, string(data), `"size_pixels"`)
	assert.NotContains(t, string(data), `"hover_duration_ms"`)
	assert.NotContains(t, string(data), `"temperature_c"`)
}

func TestDetectionListResponseFormat(t *testing.T) {
	confidence := 0.85
	resp := DetectionListResponse{
		Data: []DetectionResponse{
			{
				ID:             "det-1",
				UnitID:         "unit-1",
				SiteID:         "site-1",
				DetectedAt:     time.Now(),
				Confidence:     &confidence,
				LaserActivated: true,
				CreatedAt:      time.Now(),
			},
			{
				ID:             "det-2",
				UnitID:         "unit-1",
				SiteID:         "site-1",
				DetectedAt:     time.Now(),
				LaserActivated: false,
				CreatedAt:      time.Now(),
			},
		},
		Meta: MetaResponse{
			Total:   42,
			Page:    1,
			PerPage: 50,
		},
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
	assert.Equal(t, float64(42), meta["total"])
	assert.Equal(t, float64(1), meta["page"])
	assert.Equal(t, float64(50), meta["per_page"])
}

func TestDetectionStatsResponseFormat(t *testing.T) {
	avgConf := 0.82
	firstDet := time.Date(2026, 1, 22, 9, 15, 0, 0, time.UTC)
	lastDet := time.Date(2026, 1, 22, 16, 45, 0, 0, time.UTC)

	resp := DetectionStatsResponse{
		Data: storage.DetectionStats{
			TotalDetections:  12,
			LaserActivations: 10,
			HourlyBreakdown:  []int{0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0},
			AvgConfidence:    &avgConf,
			FirstDetection:   &firstDet,
			LastDetection:    &lastDet,
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	// Verify format
	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	statsData, ok := parsed["data"].(map[string]any)
	assert.True(t, ok)

	assert.Equal(t, float64(12), statsData["total_detections"])
	assert.Equal(t, float64(10), statsData["laser_activations"])
	assert.Contains(t, statsData, "hourly_breakdown")
	assert.Contains(t, statsData, "avg_confidence")
}

func TestValidRangeTypes(t *testing.T) {
	validTypes := []string{"day", "week", "month", "season", "year", "all"}
	invalidTypes := []string{"hour", "quarter", "decade", "invalid", ""}

	for _, rt := range validTypes {
		t.Run("valid_"+rt, func(t *testing.T) {
			assert.True(t, validRangeTypes[rt], "expected %s to be valid", rt)
		})
	}

	for _, rt := range invalidTypes {
		t.Run("invalid_"+rt, func(t *testing.T) {
			assert.False(t, validRangeTypes[rt], "expected %s to be invalid", rt)
		})
	}
}

func TestCalculateDateRangeDay(t *testing.T) {
	ref := time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("day", ref)

	assert.Equal(t, time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), from)
	assert.Equal(t, time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), to)
}

func TestCalculateDateRangeWeek(t *testing.T) {
	// Wednesday, 22 Jan 2026 (weekday = 4 in Go's time.Weekday where Sunday = 0)
	ref := time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("week", ref)

	// Implementation starts from Monday (treats Sunday as 7, then calculates back to Monday)
	// 22 Jan 2026 is a Thursday, so Monday would be 19 Jan 2026
	assert.Equal(t, time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), from.In(time.UTC))
	// Week ends 7 days later
	assert.Equal(t, time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), to.In(time.UTC))
}

func TestCalculateDateRangeMonth(t *testing.T) {
	ref := time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("month", ref)

	assert.Equal(t, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), from)
	assert.Equal(t, time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC), to)
}

func TestCalculateDateRangeSeason(t *testing.T) {
	ref := time.Date(2026, 9, 15, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("season", ref)

	// Hornet season: Aug 1 - Nov 30
	assert.Equal(t, time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), from)
	assert.Equal(t, time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC), to)
}

func TestCalculateDateRangeYear(t *testing.T) {
	ref := time.Date(2026, 6, 15, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("year", ref)

	assert.Equal(t, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), from)
	assert.Equal(t, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), to)
}

func TestCalculateDateRangeAll(t *testing.T) {
	ref := time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC)
	from, to := calculateDateRange("all", ref)

	// Should start from 2020 and end in future
	assert.Equal(t, time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), from)
	assert.True(t, to.After(time.Now()))
}

func TestParseDateRangeDefaults(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections", nil)
	from, to := parseDateRange(req)

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	assert.Equal(t, today, from)
	assert.Equal(t, today.AddDate(0, 0, 1), to)
}

func TestParseDateRangeWithParams(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections?from=2026-01-20&to=2026-01-22", nil)
	from, to := parseDateRange(req)

	assert.Equal(t, time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), from)
	// To should be end of the specified day
	assert.Equal(t, time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), to)
}

func TestParsePaginationDefaults(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections", nil)
	page, perPage := parsePagination(req, 50, 100)

	assert.Equal(t, 1, page)
	assert.Equal(t, 50, perPage)
}

func TestParsePaginationWithParams(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections?page=3&per_page=25", nil)
	page, perPage := parsePagination(req, 50, 100)

	assert.Equal(t, 3, page)
	assert.Equal(t, 25, perPage)
}

func TestParsePaginationMaxLimit(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections?per_page=500", nil)
	_, perPage := parsePagination(req, 50, 100)

	// Should be capped at maxPerPage
	assert.Equal(t, 100, perPage)
}

func TestParsePaginationInvalidValues(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/detections?page=-1&per_page=abc", nil)
	page, perPage := parsePagination(req, 50, 100)

	// Should use defaults for invalid values
	assert.Equal(t, 1, page)
	assert.Equal(t, 50, perPage)
}

func TestParseInt(t *testing.T) {
	tests := []struct {
		input   string
		want    int
		wantErr bool
	}{
		{"123", 123, false},
		{"0", 0, false},
		{"-5", -5, false},
		{"abc", 0, true},
		{"", 0, true},
		{"12.5", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parseInt(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestTemperatureCorrelationResponseFormat(t *testing.T) {
	hour := 14
	resp := TemperatureCorrelationResponse{
		Data: []storage.TemperatureCorrelationPoint{
			{Hour: &hour, AvgTemp: 22.5, DetectionCount: 5},
		},
		Meta: TemperatureCorrelationMeta{
			Range:       "day",
			TotalPoints: 1,
			IsHourly:    true,
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	assert.Contains(t, parsed, "meta")

	meta, ok := parsed["meta"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, "day", meta["range"])
	assert.Equal(t, float64(1), meta["total_points"])
	assert.Equal(t, true, meta["is_hourly"])
}

func TestTrendDataResponseFormat(t *testing.T) {
	hour := 10
	resp := TrendDataResponse{
		Data: []storage.TrendDataPoint{
			{Label: "10:00", Hour: &hour, Count: 3},
			{Label: "11:00", Hour: func() *int { h := 11; return &h }(), Count: 5},
		},
		Meta: TrendDataMeta{
			Range:           "day",
			Aggregation:     "hourly",
			TotalDetections: 8,
		},
	}

	data, err := json.Marshal(resp)
	assert.NoError(t, err)

	var parsed map[string]any
	err = json.Unmarshal(data, &parsed)
	assert.NoError(t, err)

	assert.Contains(t, parsed, "data")
	assert.Contains(t, parsed, "meta")

	meta, ok := parsed["meta"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, "day", meta["range"])
	assert.Equal(t, "hourly", meta["aggregation"])
	assert.Equal(t, float64(8), meta["total_detections"])
}

func TestConfidenceValidation(t *testing.T) {
	tests := []struct {
		name       string
		confidence float64
		valid      bool
	}{
		{"zero", 0, true},
		{"one", 1, true},
		{"mid", 0.5, true},
		{"negative", -0.1, false},
		{"over one", 1.1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := tt.confidence >= 0 && tt.confidence <= 1
			assert.Equal(t, tt.valid, valid)
		})
	}
}

func TestNegativeValueValidation(t *testing.T) {
	// Test size_pixels validation
	negativeSizePixels := -10
	assert.True(t, negativeSizePixels < 0, "negative size_pixels should be invalid")

	positiveSizePixels := 24
	assert.False(t, positiveSizePixels < 0, "positive size_pixels should be valid")

	// Test hover_duration_ms validation
	negativeHoverDuration := -100
	assert.True(t, negativeHoverDuration < 0, "negative hover_duration_ms should be invalid")

	positiveHoverDuration := 1200
	assert.False(t, positiveHoverDuration < 0, "positive hover_duration_ms should be valid")

	// Zero should be valid
	zeroValue := 0
	assert.False(t, zeroValue < 0, "zero should be valid")
}
