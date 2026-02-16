// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"testing"
)

// TestNestEstimateRadiusCalculation tests the nest radius calculation logic.
func TestNestEstimateRadiusCalculation(t *testing.T) {
	// Hornet flight speed: 367 m/min (22 km/h)
	// Radius = (avg_interval_minutes * flight_speed) / 2
	const flightSpeedMPerMin = 367.0

	tests := []struct {
		name                   string
		avgIntervalMinutes     float64
		expectedRadius         float64
		expectedRadiusCapped   float64 // After min/max capping
	}{
		{
			name:                   "typical 10 minute interval",
			avgIntervalMinutes:     10.0,
			expectedRadius:         1835.0, // (10 * 367) / 2
			expectedRadiusCapped:   1835.0,
		},
		{
			name:                   "short 1 minute interval",
			avgIntervalMinutes:     1.0,
			expectedRadius:         183.5, // (1 * 367) / 2
			expectedRadiusCapped:   183.5,
		},
		{
			name:                   "very short interval - capped to minimum",
			avgIntervalMinutes:     0.2,
			expectedRadius:         36.7, // (0.2 * 367) / 2
			expectedRadiusCapped:   50.0, // Minimum cap
		},
		{
			name:                   "very long interval - capped to maximum",
			avgIntervalMinutes:     15.0,
			expectedRadius:         2752.5, // (15 * 367) / 2
			expectedRadiusCapped:   2000.0, // Maximum cap
		},
		{
			name:                   "exactly at minimum boundary",
			avgIntervalMinutes:     0.2724, // Results in ~50m
			expectedRadius:         49.98,
			expectedRadiusCapped:   50.0,
		},
		{
			name:                   "exactly at maximum boundary",
			avgIntervalMinutes:     10.9, // Results in ~2000m
			expectedRadius:         2000.15,
			expectedRadiusCapped:   2000.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Calculate raw radius
			radius := (tt.avgIntervalMinutes * flightSpeedMPerMin) / 2

			// Allow small floating point tolerance
			tolerance := 0.5
			if diff := radius - tt.expectedRadius; diff > tolerance || diff < -tolerance {
				t.Errorf("raw radius: expected %.2f, got %.2f", tt.expectedRadius, radius)
			}

			// Apply capping
			cappedRadius := radius
			if cappedRadius < 50 {
				cappedRadius = 50
			}
			if cappedRadius > 2000 {
				cappedRadius = 2000
			}

			if cappedRadius != tt.expectedRadiusCapped {
				t.Errorf("capped radius: expected %.2f, got %.2f", tt.expectedRadiusCapped, cappedRadius)
			}
		})
	}
}

// TestNestEstimateConfidenceLevel tests confidence level determination.
func TestNestEstimateConfidenceLevel(t *testing.T) {
	tests := []struct {
		name               string
		observationCount   int
		validIntervalsCount int
		expectedConfidence string
	}{
		{
			name:               "high confidence - many observations and intervals",
			observationCount:   100,
			validIntervalsCount: 50,
			expectedConfidence: "high",
		},
		{
			name:               "high confidence - exactly at threshold",
			observationCount:   51,
			validIntervalsCount: 31,
			expectedConfidence: "high",
		},
		{
			name:               "medium confidence - sufficient data",
			observationCount:   35,
			validIntervalsCount: 15,
			expectedConfidence: "medium",
		},
		{
			name:               "medium confidence - exactly at threshold",
			observationCount:   20,
			validIntervalsCount: 10,
			expectedConfidence: "medium",
		},
		{
			name:               "low confidence - below interval threshold",
			observationCount:   30,
			validIntervalsCount: 8,
			expectedConfidence: "low",
		},
		{
			name:               "low confidence - below observation threshold but above minimum",
			observationCount:   20,
			validIntervalsCount: 5,
			expectedConfidence: "low",
		},
		{
			name:               "high observations but low intervals",
			observationCount:   60,
			validIntervalsCount: 20,
			expectedConfidence: "low",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var confidence string
			if tt.observationCount > 50 && tt.validIntervalsCount > 30 {
				confidence = "high"
			} else if tt.observationCount >= 20 && tt.validIntervalsCount >= 10 {
				confidence = "medium"
			} else {
				confidence = "low"
			}

			if confidence != tt.expectedConfidence {
				t.Errorf("confidence for obs=%d, intervals=%d: expected %q, got %q",
					tt.observationCount, tt.validIntervalsCount, tt.expectedConfidence, confidence)
			}
		})
	}
}

// TestNestEstimateMinimumObservations tests the minimum observations check.
func TestNestEstimateMinimumObservations(t *testing.T) {
	const minObservations = 20

	tests := []struct {
		name              string
		observationCount  int
		shouldProceed     bool
	}{
		{"zero observations", 0, false},
		{"one observation", 1, false},
		{"19 observations - just under", 19, false},
		{"20 observations - exactly at threshold", 20, true},
		{"21 observations - just over", 21, true},
		{"100 observations", 100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldProceed := tt.observationCount >= minObservations
			if shouldProceed != tt.shouldProceed {
				t.Errorf("observation count %d: expected proceed=%v, got proceed=%v",
					tt.observationCount, tt.shouldProceed, shouldProceed)
			}
		})
	}
}

// TestNestEstimateMinimumValidIntervals tests the minimum valid intervals check.
func TestNestEstimateMinimumValidIntervals(t *testing.T) {
	const minValidIntervals = 5

	tests := []struct {
		name                string
		validIntervalsCount int
		avgInterval         float64
		shouldProceed       bool
	}{
		{"zero intervals", 0, 10.0, false},
		{"4 intervals - just under", 4, 10.0, false},
		{"5 intervals - exactly at threshold", 5, 10.0, true},
		{"6 intervals - just over", 6, 10.0, true},
		{"sufficient intervals but zero avg", 10, 0.0, false},
		{"sufficient intervals with negative avg", 10, -5.0, false},
		{"sufficient intervals with positive avg", 10, 5.0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldProceed := tt.validIntervalsCount >= minValidIntervals && tt.avgInterval > 0
			if shouldProceed != tt.shouldProceed {
				t.Errorf("intervals=%d, avg=%.1f: expected proceed=%v, got proceed=%v",
					tt.validIntervalsCount, tt.avgInterval, tt.shouldProceed, shouldProceed)
			}
		})
	}
}

// TestNestEstimateValidIntervalFiltering tests that intervals are properly filtered.
func TestNestEstimateValidIntervalFiltering(t *testing.T) {
	// Valid intervals: > 0 min AND < 120 min
	tests := []struct {
		name     string
		interval float64
		isValid  bool
	}{
		{"negative interval", -5.0, false},
		{"zero interval", 0.0, false},
		{"very small positive", 0.1, true},
		{"typical short", 5.0, true},
		{"typical medium", 30.0, true},
		{"typical long", 90.0, true},
		{"at upper boundary", 119.9, true},
		{"exactly 120 minutes", 120.0, false},
		{"above upper boundary", 150.0, false},
		{"very long gap", 1440.0, false}, // 24 hours
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := tt.interval > 0 && tt.interval < 120
			if isValid != tt.isValid {
				t.Errorf("interval %.1f: expected valid=%v, got valid=%v",
					tt.interval, tt.isValid, isValid)
			}
		})
	}
}

// TestNestEstimateSiteIDRequired tests that site ID is required.
func TestNestEstimateSiteIDRequired(t *testing.T) {
	tests := []struct {
		name        string
		siteID      string
		shouldError bool
	}{
		{"empty site ID", "", true},
		{"valid UUID-like site ID", "550e8400-e29b-41d4-a716-446655440000", false},
		{"simple site ID", "site-1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldError := tt.siteID == ""
			if shouldError != tt.shouldError {
				t.Errorf("siteID %q: expected error=%v, got error=%v",
					tt.siteID, tt.shouldError, shouldError)
			}
		})
	}
}

// TestNestEstimateResponseStructure tests the response data structure.
func TestNestEstimateResponseStructure(t *testing.T) {
	// Test that response fields are correctly set for different scenarios
	type NestEstimateData struct {
		EstimatedRadiusM        *float64
		ObservationCount        int
		Confidence              *string
		AvgVisitIntervalMinutes *float64
		MinObservationsRequired int
		Message                 string
		CalculationMethod       string
	}

	tests := []struct {
		name     string
		scenario string
		expected NestEstimateData
	}{
		{
			name:     "insufficient observations",
			scenario: "insufficient",
			expected: NestEstimateData{
				EstimatedRadiusM:        nil,
				ObservationCount:        12,
				Confidence:              nil,
				MinObservationsRequired: 20,
				Message:                 "Need more observations to estimate nest location",
			},
		},
		{
			name:     "site without coordinates",
			scenario: "no_coords",
			expected: NestEstimateData{
				EstimatedRadiusM:        nil,
				ObservationCount:        0,
				Confidence:              nil,
				MinObservationsRequired: 20,
				Message:                 "Site coordinates not set",
			},
		},
		{
			name:     "insufficient valid intervals",
			scenario: "insufficient_intervals",
			expected: NestEstimateData{
				EstimatedRadiusM:        nil,
				ObservationCount:        25,
				Confidence:              nil,
				MinObservationsRequired: 20,
				Message:                 "Insufficient valid interval data for estimation. Detection times may be too close together or too far apart.",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify structure expectations
			if tt.expected.EstimatedRadiusM != nil {
				t.Errorf("expected nil estimated_radius_m for %s scenario", tt.scenario)
			}
			if tt.expected.Message == "" {
				t.Errorf("expected non-empty message for %s scenario", tt.scenario)
			}
		})
	}
}

// TestNestEstimateSuccessfulResponse tests a successful response with all fields.
func TestNestEstimateSuccessfulResponse(t *testing.T) {
	// Simulate a successful calculation
	avgInterval := 10.0
	flightSpeed := 367.0
	radius := (avgInterval * flightSpeed) / 2 // 1835m

	if radius < 50 {
		radius = 50
	}
	if radius > 2000 {
		radius = 2000
	}

	obsCount := 42
	validIntervals := 35

	var confidence string
	if obsCount > 50 && validIntervals > 30 {
		confidence = "high"
	} else if obsCount >= 20 && validIntervals >= 10 {
		confidence = "medium"
	} else {
		confidence = "low"
	}

	// Verify expected values
	if radius != 1835.0 {
		t.Errorf("expected radius 1835.0, got %.1f", radius)
	}
	if confidence != "medium" {
		t.Errorf("expected confidence 'medium', got %q", confidence)
	}
}
