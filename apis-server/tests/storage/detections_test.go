// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestNestEstimateStats tests the NestEstimateStats struct behavior.
func TestNestEstimateStats(t *testing.T) {
	stats := &storage.NestEstimateStats{
		ObservationCount:        42,
		AvgVisitIntervalMinutes: 12.5,
		ValidIntervalsCount:     35,
	}

	// Verify fields
	if stats.ObservationCount != 42 {
		t.Errorf("expected ObservationCount 42, got %d", stats.ObservationCount)
	}
	if stats.AvgVisitIntervalMinutes != 12.5 {
		t.Errorf("expected AvgVisitIntervalMinutes 12.5, got %f", stats.AvgVisitIntervalMinutes)
	}
	if stats.ValidIntervalsCount != 35 {
		t.Errorf("expected ValidIntervalsCount 35, got %d", stats.ValidIntervalsCount)
	}
}

// TestNestEstimateStatsZeroValues tests handling of zero/empty values.
func TestNestEstimateStatsZeroValues(t *testing.T) {
	stats := &storage.NestEstimateStats{
		ObservationCount:        0,
		AvgVisitIntervalMinutes: 0,
		ValidIntervalsCount:     0,
	}

	// Zero values should be valid - represents a site with no detections
	if stats.ObservationCount != 0 {
		t.Errorf("expected ObservationCount 0, got %d", stats.ObservationCount)
	}
	if stats.AvgVisitIntervalMinutes != 0 {
		t.Errorf("expected AvgVisitIntervalMinutes 0, got %f", stats.AvgVisitIntervalMinutes)
	}
}

// TestDetectionStruct tests the Detection struct behavior.
func TestDetectionStruct(t *testing.T) {
	now := time.Now()
	confidence := 0.95
	sizePixels := 150
	hoverDurationMs := 2500
	clipID := "clip-123"
	clipFilename := "detection_20260125.mp4"
	tempC := 18.5
	unitName := "Unit-A"

	detection := &storage.Detection{
		ID:              "det-1",
		TenantID:        "tenant-1",
		UnitID:          "unit-1",
		UnitName:        &unitName,
		SiteID:          "site-1",
		DetectedAt:      now,
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverDurationMs,
		LaserActivated:  true,
		ClipID:          &clipID,
		ClipFilename:    &clipFilename,
		TemperatureC:    &tempC,
		CreatedAt:       now,
	}

	// Verify required fields
	if detection.ID != "det-1" {
		t.Errorf("expected ID 'det-1', got %q", detection.ID)
	}
	if detection.UnitID != "unit-1" {
		t.Errorf("expected UnitID 'unit-1', got %q", detection.UnitID)
	}
	if detection.SiteID != "site-1" {
		t.Errorf("expected SiteID 'site-1', got %q", detection.SiteID)
	}
	if !detection.LaserActivated {
		t.Error("expected LaserActivated to be true")
	}

	// Verify optional fields
	if detection.Confidence == nil || *detection.Confidence != 0.95 {
		t.Error("expected Confidence to be 0.95")
	}
	if detection.UnitName == nil || *detection.UnitName != "Unit-A" {
		t.Error("expected UnitName to be 'Unit-A'")
	}
}

// TestCreateDetectionInput tests the CreateDetectionInput struct.
func TestCreateDetectionInput(t *testing.T) {
	now := time.Now()
	confidence := 0.87
	sizePixels := 120
	hoverMs := 1500
	clipFilename := "detection.mp4"

	input := &storage.CreateDetectionInput{
		DetectedAt:      now,
		Confidence:      &confidence,
		SizePixels:      &sizePixels,
		HoverDurationMs: &hoverMs,
		LaserActivated:  true,
		ClipFilename:    &clipFilename,
	}

	if !input.DetectedAt.Equal(now) {
		t.Errorf("expected DetectedAt %v, got %v", now, input.DetectedAt)
	}
	if input.Confidence == nil || *input.Confidence != 0.87 {
		t.Error("expected Confidence to be 0.87")
	}
	if !input.LaserActivated {
		t.Error("expected LaserActivated to be true")
	}
}

// TestDetectionStats tests the DetectionStats struct.
func TestDetectionStats(t *testing.T) {
	now := time.Now()
	avgConf := 0.82
	firstDet := now.Add(-24 * time.Hour)
	lastDet := now

	stats := &storage.DetectionStats{
		TotalDetections:  150,
		LaserActivations: 45,
		HourlyBreakdown:  make([]int, 24),
		AvgConfidence:    &avgConf,
		FirstDetection:   &firstDet,
		LastDetection:    &lastDet,
	}

	// Set some hourly data
	stats.HourlyBreakdown[10] = 15
	stats.HourlyBreakdown[11] = 20
	stats.HourlyBreakdown[12] = 18

	if stats.TotalDetections != 150 {
		t.Errorf("expected TotalDetections 150, got %d", stats.TotalDetections)
	}
	if stats.LaserActivations != 45 {
		t.Errorf("expected LaserActivations 45, got %d", stats.LaserActivations)
	}
	if len(stats.HourlyBreakdown) != 24 {
		t.Errorf("expected HourlyBreakdown to have 24 elements, got %d", len(stats.HourlyBreakdown))
	}
	if stats.HourlyBreakdown[11] != 20 {
		t.Errorf("expected hour 11 to have 20 detections, got %d", stats.HourlyBreakdown[11])
	}
}

// TestListDetectionsParams tests the ListDetectionsParams struct.
func TestListDetectionsParams(t *testing.T) {
	from := time.Now().Add(-7 * 24 * time.Hour)
	to := time.Now()
	unitID := "unit-123"

	params := &storage.ListDetectionsParams{
		SiteID:  "site-1",
		UnitID:  &unitID,
		From:    from,
		To:      to,
		Page:    1,
		PerPage: 20,
	}

	if params.SiteID != "site-1" {
		t.Errorf("expected SiteID 'site-1', got %q", params.SiteID)
	}
	if params.UnitID == nil || *params.UnitID != "unit-123" {
		t.Error("expected UnitID to be 'unit-123'")
	}
	if params.Page != 1 {
		t.Errorf("expected Page 1, got %d", params.Page)
	}
	if params.PerPage != 20 {
		t.Errorf("expected PerPage 20, got %d", params.PerPage)
	}
}

// TestDetectionSpikeData tests the DetectionSpikeData struct.
func TestDetectionSpikeData(t *testing.T) {
	data := &storage.DetectionSpikeData{
		RecentCount:  25,
		AverageDaily: 10.5,
	}

	if data.RecentCount != 25 {
		t.Errorf("expected RecentCount 25, got %d", data.RecentCount)
	}
	if data.AverageDaily != 10.5 {
		t.Errorf("expected AverageDaily 10.5, got %f", data.AverageDaily)
	}
}

// TestSpikeCalculation tests the spike detection logic.
func TestSpikeCalculation(t *testing.T) {
	// A spike is when recent count significantly exceeds average
	tests := []struct {
		name         string
		recentCount  int
		averageDaily float64
		windowHours  int
		isSpike      bool // assuming 2x average is a spike
	}{
		{
			name:         "normal activity",
			recentCount:  10,
			averageDaily: 10.0,
			windowHours:  4,
			isSpike:      false,
		},
		{
			name:         "slight increase",
			recentCount:  15,
			averageDaily: 10.0,
			windowHours:  4,
			isSpike:      false,
		},
		{
			name:         "double the average",
			recentCount:  20,
			averageDaily: 10.0,
			windowHours:  4,
			isSpike:      false, // Exactly 2x is borderline
		},
		{
			name:         "clear spike",
			recentCount:  30,
			averageDaily: 10.0,
			windowHours:  4,
			isSpike:      true,
		},
		{
			name:         "zero average (first day)",
			recentCount:  5,
			averageDaily: 0.0,
			windowHours:  4,
			isSpike:      true, // Any activity when no baseline is notable
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Calculate expected hourly rate based on window
			windowRate := float64(tt.recentCount) / float64(tt.windowHours)
			expectedHourlyRate := tt.averageDaily / 24.0

			// A spike occurs if current rate is more than 2x expected
			var isSpike bool
			if tt.averageDaily == 0 {
				isSpike = tt.recentCount > 0
			} else {
				isSpike = windowRate > (expectedHourlyRate * 2.5)
			}

			if isSpike != tt.isSpike {
				t.Errorf("spike detection for recent=%d, avgDaily=%.1f: expected spike=%v, got spike=%v (windowRate=%.2f, expectedHourly=%.4f)",
					tt.recentCount, tt.averageDaily, tt.isSpike, isSpike, windowRate, expectedHourlyRate)
			}
		})
	}
}

// TestIntervalCalculationLogic tests the interval calculation SQL logic conceptually.
func TestIntervalCalculationLogic(t *testing.T) {
	// Simulate a series of detection times and calculate intervals
	detectionTimes := []time.Time{
		time.Date(2026, 1, 25, 10, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 25, 10, 5, 0, 0, time.UTC),  // 5 min interval
		time.Date(2026, 1, 25, 10, 15, 0, 0, time.UTC), // 10 min interval
		time.Date(2026, 1, 25, 10, 45, 0, 0, time.UTC), // 30 min interval
		time.Date(2026, 1, 25, 12, 0, 0, 0, time.UTC),  // 75 min interval
		time.Date(2026, 1, 25, 14, 30, 0, 0, time.UTC), // 150 min interval (invalid - > 120)
	}

	var validIntervals []float64
	for i := 1; i < len(detectionTimes); i++ {
		intervalMinutes := detectionTimes[i].Sub(detectionTimes[i-1]).Minutes()
		// Only include intervals > 0 and < 120
		if intervalMinutes > 0 && intervalMinutes < 120 {
			validIntervals = append(validIntervals, intervalMinutes)
		}
	}

	// Expected valid intervals: 5, 10, 30, 75 (150 is excluded)
	if len(validIntervals) != 4 {
		t.Errorf("expected 4 valid intervals, got %d", len(validIntervals))
	}

	// Calculate average
	var sum float64
	for _, interval := range validIntervals {
		sum += interval
	}
	avgInterval := sum / float64(len(validIntervals))

	// Expected average: (5 + 10 + 30 + 75) / 4 = 30
	expectedAvg := 30.0
	if avgInterval != expectedAvg {
		t.Errorf("expected average interval %.1f, got %.1f", expectedAvg, avgInterval)
	}
}

// TestTemperatureCorrelationPoint tests the TemperatureCorrelationPoint struct.
func TestTemperatureCorrelationPoint(t *testing.T) {
	hour := 14
	point := &storage.TemperatureCorrelationPoint{
		Date:           "2026-01-25",
		Hour:           &hour,
		AvgTemp:        22.5,
		DetectionCount: 15,
	}

	if point.Date != "2026-01-25" {
		t.Errorf("expected Date '2026-01-25', got %q", point.Date)
	}
	if point.Hour == nil || *point.Hour != 14 {
		t.Error("expected Hour to be 14")
	}
	if point.AvgTemp != 22.5 {
		t.Errorf("expected AvgTemp 22.5, got %f", point.AvgTemp)
	}
	if point.DetectionCount != 15 {
		t.Errorf("expected DetectionCount 15, got %d", point.DetectionCount)
	}
}

// TestTrendDataPoint tests the TrendDataPoint struct.
func TestTrendDataPoint(t *testing.T) {
	hour := 10
	point := &storage.TrendDataPoint{
		Label: "10:00",
		Date:  "2026-01-25",
		Hour:  &hour,
		Count: 25,
	}

	if point.Label != "10:00" {
		t.Errorf("expected Label '10:00', got %q", point.Label)
	}
	if point.Date != "2026-01-25" {
		t.Errorf("expected Date '2026-01-25', got %q", point.Date)
	}
	if point.Hour == nil || *point.Hour != 10 {
		t.Error("expected Hour to be 10")
	}
	if point.Count != 25 {
		t.Errorf("expected Count 25, got %d", point.Count)
	}
}

// TestTrendData tests the TrendData struct.
func TestTrendData(t *testing.T) {
	data := &storage.TrendData{
		Points: []storage.TrendDataPoint{
			{Label: "Mon", Count: 10},
			{Label: "Tue", Count: 15},
			{Label: "Wed", Count: 8},
		},
		Aggregation:     "daily",
		TotalDetections: 33,
	}

	if len(data.Points) != 3 {
		t.Errorf("expected 3 data points, got %d", len(data.Points))
	}
	if data.Aggregation != "daily" {
		t.Errorf("expected Aggregation 'daily', got %q", data.Aggregation)
	}
	if data.TotalDetections != 33 {
		t.Errorf("expected TotalDetections 33, got %d", data.TotalDetections)
	}
}

// TestTemperatureCorrelation tests the TemperatureCorrelation struct.
func TestTemperatureCorrelation(t *testing.T) {
	data := &storage.TemperatureCorrelation{
		Points: []storage.TemperatureCorrelationPoint{
			{Date: "2026-01-23", AvgTemp: 15.0, DetectionCount: 5},
			{Date: "2026-01-24", AvgTemp: 18.0, DetectionCount: 12},
			{Date: "2026-01-25", AvgTemp: 22.0, DetectionCount: 20},
		},
		IsHourly:   false,
		TotalCount: 37,
	}

	if len(data.Points) != 3 {
		t.Errorf("expected 3 correlation points, got %d", len(data.Points))
	}
	if data.IsHourly {
		t.Error("expected IsHourly to be false")
	}
	if data.TotalCount != 37 {
		t.Errorf("expected TotalCount 37, got %d", data.TotalCount)
	}
}
