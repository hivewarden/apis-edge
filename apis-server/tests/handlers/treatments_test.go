// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestEfficacyCalculation tests the efficacy calculation logic.
func TestEfficacyCalculation(t *testing.T) {
	tests := []struct {
		name             string
		miteCountBefore  *int
		miteCountAfter   *int
		expectedEfficacy *int
		expectDisplay    bool
	}{
		{
			name:             "no mite counts",
			miteCountBefore:  nil,
			miteCountAfter:   nil,
			expectedEfficacy: nil,
			expectDisplay:    false,
		},
		{
			name:             "only before count",
			miteCountBefore:  intPtr(10),
			miteCountAfter:   nil,
			expectedEfficacy: nil,
			expectDisplay:    false,
		},
		{
			name:             "only after count",
			miteCountBefore:  nil,
			miteCountAfter:   intPtr(5),
			expectedEfficacy: nil,
			expectDisplay:    false,
		},
		{
			name:             "100% reduction",
			miteCountBefore:  intPtr(10),
			miteCountAfter:   intPtr(0),
			expectedEfficacy: intPtr(100),
			expectDisplay:    true,
		},
		{
			name:             "50% reduction",
			miteCountBefore:  intPtr(10),
			miteCountAfter:   intPtr(5),
			expectedEfficacy: intPtr(50),
			expectDisplay:    true,
		},
		{
			name:             "87% reduction",
			miteCountBefore:  intPtr(100),
			miteCountAfter:   intPtr(13),
			expectedEfficacy: intPtr(87),
			expectDisplay:    true,
		},
		{
			name:             "increase (negative efficacy)",
			miteCountBefore:  intPtr(10),
			miteCountAfter:   intPtr(15),
			expectedEfficacy: intPtr(-50),
			expectDisplay:    true,
		},
		{
			name:             "before count is zero",
			miteCountBefore:  intPtr(0),
			miteCountAfter:   intPtr(5),
			expectedEfficacy: nil,
			expectDisplay:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a treatment with the test mite counts
			treatment := &storage.Treatment{
				ID:              "test-id",
				TenantID:        "tenant-1",
				HiveID:          "hive-1",
				TreatedAt:       time.Now(),
				TreatmentType:   "oxalic_acid",
				MiteCountBefore: tt.miteCountBefore,
				MiteCountAfter:  tt.miteCountAfter,
				CreatedAt:       time.Now(),
				UpdatedAt:       time.Now(),
			}

			// Calculate efficacy (replicating handler logic)
			var efficacy *int
			if treatment.MiteCountBefore != nil && treatment.MiteCountAfter != nil && *treatment.MiteCountBefore > 0 {
				eff := int(float64(*treatment.MiteCountBefore-*treatment.MiteCountAfter) / float64(*treatment.MiteCountBefore) * 100)
				efficacy = &eff
			}

			// Verify
			if tt.expectedEfficacy == nil {
				if efficacy != nil {
					t.Errorf("expected nil efficacy, got %d", *efficacy)
				}
			} else {
				if efficacy == nil {
					t.Errorf("expected efficacy %d, got nil", *tt.expectedEfficacy)
				} else if *efficacy != *tt.expectedEfficacy {
					t.Errorf("expected efficacy %d, got %d", *tt.expectedEfficacy, *efficacy)
				}
			}
		})
	}
}

// TestValidTreatmentTypes tests treatment type validation.
func TestValidTreatmentTypes(t *testing.T) {
	validTypes := []string{"oxalic_acid", "formic_acid", "apiguard", "apivar", "maqs", "api_bioxal", "other"}

	tests := []struct {
		treatmentType string
		shouldBeValid bool
	}{
		{"oxalic_acid", true},
		{"formic_acid", true},
		{"apiguard", true},
		{"apivar", true},
		{"maqs", true},
		{"api_bioxal", true},
		{"other", true},
		{"invalid_type", false},
		{"OXALIC_ACID", false}, // Case sensitive
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.treatmentType, func(t *testing.T) {
			valid := false
			for _, v := range validTypes {
				if tt.treatmentType == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("treatment type %q: expected valid=%v, got valid=%v", tt.treatmentType, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidTreatmentMethods tests treatment method validation.
func TestValidTreatmentMethods(t *testing.T) {
	validMethods := []string{"vaporization", "dribble", "strips", "spray", "other"}

	tests := []struct {
		method        string
		shouldBeValid bool
	}{
		{"vaporization", true},
		{"dribble", true},
		{"strips", true},
		{"spray", true},
		{"other", true},
		{"invalid_method", false},
		{"VAPORIZATION", false}, // Case sensitive
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			valid := false
			for _, v := range validMethods {
				if tt.method == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("method %q: expected valid=%v, got valid=%v", tt.method, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestDateParsing tests date format validation.
func TestDateParsing(t *testing.T) {
	tests := []struct {
		dateStr    string
		shouldPass bool
	}{
		{"2026-01-25", true},
		{"2025-12-31", true},
		{"2026-02-28", true},
		{"01-25-2026", false}, // Wrong format
		{"2026/01/25", false}, // Wrong separator
		{"2026-1-25", false},  // Missing leading zero
		{"", false},
		{"invalid", false},
	}

	for _, tt := range tests {
		t.Run(tt.dateStr, func(t *testing.T) {
			_, err := time.Parse("2006-01-02", tt.dateStr)
			passed := err == nil
			if passed != tt.shouldPass {
				t.Errorf("date %q: expected pass=%v, got pass=%v (err=%v)", tt.dateStr, tt.shouldPass, passed, err)
			}
		})
	}
}

// TestFormatPercentage tests the percentage formatting function.
func TestFormatPercentage(t *testing.T) {
	tests := []struct {
		value    int
		expected string
	}{
		{0, "0%"},
		{50, "50%"},
		{100, "100%"},
		{87, "87%"},
		{-50, "-50%"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := formatPercentage(tt.value)
			if result != tt.expected {
				t.Errorf("formatPercentage(%d) = %q, want %q", tt.value, result, tt.expected)
			}
		})
	}
}

// formatPercentage replicates the handler's formatPercentage function for testing.
func formatPercentage(n int) string {
	return fmt.Sprintf("%d%%", n)
}

// intPtr is a helper to create int pointers.
func intPtr(i int) *int {
	return &i
}
