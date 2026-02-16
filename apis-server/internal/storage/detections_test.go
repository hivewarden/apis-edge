package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// Note: Full integration tests require database connection.
// These unit tests verify struct definitions and helper functions.

func TestDetectionStructFields(t *testing.T) {
	// Verify Detection struct has all required fields
	confidence := 0.85
	sizePixels := 24
	hoverDuration := 1200
	clipID := "clip-123"
	clipFilename := "det_20260122_143000.mp4"
	temp := 18.5
	unitName := "Hive 1 Protector"

	detection := Detection{
		ID:              "det-123",
		TenantID:        "tenant-1",
		UnitID:          "unit-1",
		UnitName:        &unitName,
		SiteID:          "site-1",
		DetectedAt:      time.Date(2026, 1, 22, 14, 30, 0, 0, time.UTC),
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverDuration,
		LaserActivated:  true,
		ClipID:          &clipID,
		ClipFilename:    &clipFilename,
		TemperatureC:    &temp,
		CreatedAt:       time.Now(),
	}

	assert.Equal(t, "det-123", detection.ID)
	assert.Equal(t, "tenant-1", detection.TenantID)
	assert.Equal(t, "unit-1", detection.UnitID)
	assert.Equal(t, "site-1", detection.SiteID)
	assert.NotNil(t, detection.Confidence)
	assert.Equal(t, 0.85, *detection.Confidence)
	assert.NotNil(t, detection.SizePixels)
	assert.Equal(t, 24, *detection.SizePixels)
	assert.NotNil(t, detection.HoverDurationMs)
	assert.Equal(t, 1200, *detection.HoverDurationMs)
	assert.True(t, detection.LaserActivated)
	assert.NotNil(t, detection.TemperatureC)
	assert.Equal(t, 18.5, *detection.TemperatureC)
	assert.NotNil(t, detection.UnitName)
	assert.Equal(t, "Hive 1 Protector", *detection.UnitName)
}

func TestDetectionMinimalFields(t *testing.T) {
	// Test detection with only required fields
	detection := Detection{
		ID:             "det-456",
		TenantID:       "tenant-1",
		UnitID:         "unit-1",
		SiteID:         "site-1",
		DetectedAt:     time.Now(),
		LaserActivated: false,
		CreatedAt:      time.Now(),
	}

	assert.Equal(t, "det-456", detection.ID)
	assert.Nil(t, detection.Confidence)
	assert.Nil(t, detection.SizePixels)
	assert.Nil(t, detection.HoverDurationMs)
	assert.Nil(t, detection.ClipID)
	assert.Nil(t, detection.ClipFilename)
	assert.Nil(t, detection.TemperatureC)
	assert.Nil(t, detection.UnitName)
	assert.False(t, detection.LaserActivated)
}

func TestCreateDetectionInputFields(t *testing.T) {
	confidence := 0.92
	sizePixels := 30
	hoverDuration := 800
	clipFilename := "det_20260123_091500.mp4"

	input := CreateDetectionInput{
		DetectedAt:      time.Date(2026, 1, 23, 9, 15, 0, 0, time.UTC),
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverDuration,
		LaserActivated:  true,
		ClipFilename:    &clipFilename,
	}

	assert.Equal(t, time.Date(2026, 1, 23, 9, 15, 0, 0, time.UTC), input.DetectedAt)
	assert.NotNil(t, input.Confidence)
	assert.Equal(t, 0.92, *input.Confidence)
	assert.NotNil(t, input.SizePixels)
	assert.Equal(t, 30, *input.SizePixels)
	assert.NotNil(t, input.HoverDurationMs)
	assert.Equal(t, 800, *input.HoverDurationMs)
	assert.True(t, input.LaserActivated)
	assert.NotNil(t, input.ClipFilename)
	assert.Equal(t, "det_20260123_091500.mp4", *input.ClipFilename)
}

func TestDetectionStatsStructure(t *testing.T) {
	avgConf := 0.82
	firstDet := time.Date(2026, 1, 22, 9, 15, 0, 0, time.UTC)
	lastDet := time.Date(2026, 1, 22, 16, 45, 0, 0, time.UTC)

	stats := DetectionStats{
		TotalDetections:  12,
		LaserActivations: 10,
		HourlyBreakdown:  []int{0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 1, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0},
		AvgConfidence:    &avgConf,
		FirstDetection:   &firstDet,
		LastDetection:    &lastDet,
	}

	assert.Equal(t, 12, stats.TotalDetections)
	assert.Equal(t, 10, stats.LaserActivations)
	assert.Len(t, stats.HourlyBreakdown, 24)
	assert.Equal(t, 2, stats.HourlyBreakdown[9])
	assert.Equal(t, 3, stats.HourlyBreakdown[10])
	assert.NotNil(t, stats.AvgConfidence)
	assert.Equal(t, 0.82, *stats.AvgConfidence)
	assert.NotNil(t, stats.FirstDetection)
	assert.NotNil(t, stats.LastDetection)
}

func TestDetectionStatsEmptyBreakdown(t *testing.T) {
	stats := DetectionStats{
		TotalDetections:  0,
		LaserActivations: 0,
		HourlyBreakdown:  make([]int, 24),
	}

	assert.Equal(t, 0, stats.TotalDetections)
	assert.Len(t, stats.HourlyBreakdown, 24)
	for i := 0; i < 24; i++ {
		assert.Equal(t, 0, stats.HourlyBreakdown[i], "hour %d should be 0", i)
	}
	assert.Nil(t, stats.AvgConfidence)
	assert.Nil(t, stats.FirstDetection)
	assert.Nil(t, stats.LastDetection)
}

func TestListDetectionsParamsDefaults(t *testing.T) {
	params := ListDetectionsParams{
		SiteID:  "site-123",
		From:    time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC),
		To:      time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC),
		Page:    1,
		PerPage: 50,
	}

	assert.Equal(t, "site-123", params.SiteID)
	assert.Nil(t, params.UnitID)
	assert.Equal(t, 1, params.Page)
	assert.Equal(t, 50, params.PerPage)
}

func TestListDetectionsParamsWithUnitFilter(t *testing.T) {
	unitID := "unit-456"
	params := ListDetectionsParams{
		SiteID:  "site-123",
		UnitID:  &unitID,
		From:    time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC),
		To:      time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC),
		Page:    2,
		PerPage: 25,
	}

	assert.NotNil(t, params.UnitID)
	assert.Equal(t, "unit-456", *params.UnitID)
	assert.Equal(t, 2, params.Page)
	assert.Equal(t, 25, params.PerPage)
}

func TestTemperatureCorrelationPointHourly(t *testing.T) {
	hour := 14
	point := TemperatureCorrelationPoint{
		Hour:           &hour,
		AvgTemp:        22.5,
		DetectionCount: 5,
	}

	assert.NotNil(t, point.Hour)
	assert.Equal(t, 14, *point.Hour)
	assert.Equal(t, 22.5, point.AvgTemp)
	assert.Equal(t, 5, point.DetectionCount)
	assert.Empty(t, point.Date)
}

func TestTemperatureCorrelationPointDaily(t *testing.T) {
	point := TemperatureCorrelationPoint{
		Date:           "2026-01-22",
		AvgTemp:        18.3,
		DetectionCount: 12,
	}

	assert.Nil(t, point.Hour)
	assert.Equal(t, "2026-01-22", point.Date)
	assert.Equal(t, 18.3, point.AvgTemp)
	assert.Equal(t, 12, point.DetectionCount)
}

func TestTrendDataPointHourly(t *testing.T) {
	hour := 10
	point := TrendDataPoint{
		Label: "10:00",
		Hour:  &hour,
		Count: 3,
	}

	assert.Equal(t, "10:00", point.Label)
	assert.NotNil(t, point.Hour)
	assert.Equal(t, 10, *point.Hour)
	assert.Equal(t, 3, point.Count)
	assert.Empty(t, point.Date)
}

func TestTrendDataPointDaily(t *testing.T) {
	point := TrendDataPoint{
		Label: "Mon",
		Date:  "2026-01-20",
		Count: 15,
	}

	assert.Equal(t, "Mon", point.Label)
	assert.Nil(t, point.Hour)
	assert.Equal(t, "2026-01-20", point.Date)
	assert.Equal(t, 15, point.Count)
}

func TestTrendDataAggregationTypes(t *testing.T) {
	tests := []struct {
		name        string
		aggregation string
	}{
		{"hourly for day", "hourly"},
		{"daily for week/month", "daily"},
		{"weekly for season/year", "weekly"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := TrendData{
				Points:          []TrendDataPoint{},
				Aggregation:     tt.aggregation,
				TotalDetections: 0,
			}
			assert.Equal(t, tt.aggregation, data.Aggregation)
		})
	}
}

func TestNestEstimateStatsStructure(t *testing.T) {
	stats := NestEstimateStats{
		ObservationCount:        25,
		AvgVisitIntervalMinutes: 18.5,
		ValidIntervalsCount:     22,
	}

	assert.Equal(t, 25, stats.ObservationCount)
	assert.Equal(t, 18.5, stats.AvgVisitIntervalMinutes)
	assert.Equal(t, 22, stats.ValidIntervalsCount)
}

func TestNestEstimateStatsInsufficientData(t *testing.T) {
	stats := NestEstimateStats{
		ObservationCount:        1,
		AvgVisitIntervalMinutes: 0,
		ValidIntervalsCount:     0,
	}

	assert.Equal(t, 1, stats.ObservationCount)
	assert.Equal(t, 0.0, stats.AvgVisitIntervalMinutes)
	assert.Equal(t, 0, stats.ValidIntervalsCount)
}

func TestDetectionSpikeDataStructure(t *testing.T) {
	spike := DetectionSpikeData{
		RecentCount:  15,
		AverageDaily: 5.2,
	}

	assert.Equal(t, 15, spike.RecentCount)
	assert.Equal(t, 5.2, spike.AverageDaily)
}

func TestErrNotFoundUsedForDetections(t *testing.T) {
	// Verify ErrNotFound is appropriate for detection operations
	assert.NotNil(t, ErrNotFound)
	assert.Equal(t, "not found", ErrNotFound.Error())
}
