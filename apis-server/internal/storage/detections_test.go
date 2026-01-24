package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// Note: Full integration tests require database connection.
// These unit tests verify struct and error definitions.

func TestDetectionStructFields(t *testing.T) {
	// Verify Detection struct has all required fields
	confidence := 0.85
	sizePixels := 24
	hoverDuration := 1200
	temp := 22.5

	detection := Detection{
		ID:              "test-id",
		TenantID:        "tenant-1",
		UnitID:          "unit-1",
		SiteID:          "site-1",
		DetectedAt:      time.Now(),
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverDuration,
		LaserActivated:  true,
		TemperatureC:    &temp,
		CreatedAt:       time.Now(),
	}

	assert.Equal(t, "test-id", detection.ID)
	assert.Equal(t, "tenant-1", detection.TenantID)
	assert.Equal(t, "unit-1", detection.UnitID)
	assert.Equal(t, "site-1", detection.SiteID)
	assert.True(t, detection.LaserActivated)
	assert.NotNil(t, detection.Confidence)
	assert.Equal(t, 0.85, *detection.Confidence)
	assert.NotNil(t, detection.SizePixels)
	assert.Equal(t, 24, *detection.SizePixels)
	assert.NotNil(t, detection.HoverDurationMs)
	assert.Equal(t, 1200, *detection.HoverDurationMs)
	assert.NotNil(t, detection.TemperatureC)
	assert.Equal(t, 22.5, *detection.TemperatureC)
}

func TestDetectionWithMinimalFields(t *testing.T) {
	// Verify Detection can have minimal required fields only
	detection := Detection{
		ID:             "test-id",
		TenantID:       "tenant-1",
		UnitID:         "unit-1",
		SiteID:         "site-1",
		DetectedAt:     time.Now(),
		LaserActivated: false,
		CreatedAt:      time.Now(),
	}

	assert.Equal(t, "test-id", detection.ID)
	assert.False(t, detection.LaserActivated)
	assert.Nil(t, detection.Confidence)
	assert.Nil(t, detection.SizePixels)
	assert.Nil(t, detection.HoverDurationMs)
	assert.Nil(t, detection.ClipID)
	assert.Nil(t, detection.TemperatureC)
}

func TestCreateDetectionInputFields(t *testing.T) {
	confidence := 0.9
	sizePixels := 30
	hoverMs := 1500
	clipFilename := "det_20260124_143000.mp4"

	input := CreateDetectionInput{
		UnitID:          "unit-1",
		SiteID:          "site-1",
		DetectedAt:      "2026-01-24T14:30:00Z",
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverMs,
		LaserActivated:  true,
		ClipFilename:    &clipFilename,
	}

	assert.Equal(t, "unit-1", input.UnitID)
	assert.Equal(t, "site-1", input.SiteID)
	assert.Equal(t, "2026-01-24T14:30:00Z", input.DetectedAt)
	assert.True(t, input.LaserActivated)
	assert.NotNil(t, input.Confidence)
	assert.Equal(t, 0.9, *input.Confidence)
	assert.NotNil(t, input.ClipFilename)
	assert.Equal(t, "det_20260124_143000.mp4", *input.ClipFilename)
}

func TestDetectionStatsStructFields(t *testing.T) {
	avgConfidence := 0.82
	first := time.Now().Add(-24 * time.Hour)
	last := time.Now()

	stats := DetectionStats{
		TotalDetections:  12,
		LaserActivations: 10,
		HourlyBreakdown:  [24]int{0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0},
		AvgConfidence:    &avgConfidence,
		FirstDetection:   &first,
		LastDetection:    &last,
	}

	assert.Equal(t, 12, stats.TotalDetections)
	assert.Equal(t, 10, stats.LaserActivations)
	assert.NotNil(t, stats.AvgConfidence)
	assert.Equal(t, 0.82, *stats.AvgConfidence)
	assert.Equal(t, 2, stats.HourlyBreakdown[9])
	assert.Equal(t, 3, stats.HourlyBreakdown[10])
	assert.NotNil(t, stats.FirstDetection)
	assert.NotNil(t, stats.LastDetection)
}

func TestHourlyCountStruct(t *testing.T) {
	hourlyCount := HourlyCount{
		Hour:  14,
		Count: 8,
	}

	assert.Equal(t, 14, hourlyCount.Hour)
	assert.Equal(t, 8, hourlyCount.Count)
}

func TestDailyTrendStruct(t *testing.T) {
	trend := DailyTrend{
		Date:  "2026-01-24",
		Count: 15,
	}

	assert.Equal(t, "2026-01-24", trend.Date)
	assert.Equal(t, 15, trend.Count)
}

func TestTemperatureCorrelationStruct(t *testing.T) {
	correlation := TemperatureCorrelation{
		Date:         "2026-01-24",
		TemperatureC: 18.5,
		Count:        20,
	}

	assert.Equal(t, "2026-01-24", correlation.Date)
	assert.Equal(t, 18.5, correlation.TemperatureC)
	assert.Equal(t, 20, correlation.Count)
}

func TestDetectionListParamsDefaults(t *testing.T) {
	params := DetectionListParams{
		Limit:  20,
		Offset: 0,
	}

	assert.Equal(t, 20, params.Limit)
	assert.Equal(t, 0, params.Offset)
	assert.Nil(t, params.SiteID)
	assert.Nil(t, params.UnitID)
	assert.Nil(t, params.From)
	assert.Nil(t, params.To)
}

func TestDetectionListParamsWithFilters(t *testing.T) {
	siteID := "site-123"
	unitID := "unit-456"
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 23, 59, 59, 0, time.UTC)

	params := DetectionListParams{
		SiteID: &siteID,
		UnitID: &unitID,
		From:   &from,
		To:     &to,
		Limit:  50,
		Offset: 10,
	}

	assert.NotNil(t, params.SiteID)
	assert.Equal(t, "site-123", *params.SiteID)
	assert.NotNil(t, params.UnitID)
	assert.Equal(t, "unit-456", *params.UnitID)
	assert.NotNil(t, params.From)
	assert.NotNil(t, params.To)
	assert.Equal(t, 50, params.Limit)
	assert.Equal(t, 10, params.Offset)
}
