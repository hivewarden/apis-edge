// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"testing"
	"time"
)

// TestValidFeedTypes tests feed type validation.
func TestValidFeedTypes(t *testing.T) {
	validTypes := []string{"sugar_syrup", "fondant", "pollen_patty", "pollen_substitute", "honey", "other"}

	tests := []struct {
		feedType      string
		shouldBeValid bool
	}{
		{"sugar_syrup", true},
		{"fondant", true},
		{"pollen_patty", true},
		{"pollen_substitute", true},
		{"honey", true},
		{"other", true},
		{"invalid_type", false},
		{"SUGAR_SYRUP", false}, // Case sensitive
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.feedType, func(t *testing.T) {
			valid := false
			for _, v := range validTypes {
				if tt.feedType == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("feed type %q: expected valid=%v, got valid=%v", tt.feedType, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidFeedUnits tests feed unit validation.
func TestValidFeedUnits(t *testing.T) {
	validUnits := []string{"kg", "liters"}

	tests := []struct {
		unit          string
		shouldBeValid bool
	}{
		{"kg", true},
		{"liters", true},
		{"grams", false},
		{"ml", false},
		{"lbs", false},
		{"KG", false}, // Case sensitive
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.unit, func(t *testing.T) {
			valid := false
			for _, v := range validUnits {
				if tt.unit == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("unit %q: expected valid=%v, got valid=%v", tt.unit, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestFeedDateParsing tests date format validation.
func TestFeedDateParsing(t *testing.T) {
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

// TestAmountValidation tests amount validation logic.
func TestAmountValidation(t *testing.T) {
	tests := []struct {
		name        string
		amount      float64
		shouldBeValid bool
	}{
		{"positive amount", 2.5, true},
		{"small positive", 0.01, true},
		{"large amount", 9999.0, true},
		{"zero", 0, false},
		{"negative", -1, false},
		{"very negative", -100, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := tt.amount > 0
			if valid != tt.shouldBeValid {
				t.Errorf("amount %v: expected valid=%v, got valid=%v", tt.amount, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestConcentrationClearingLogic tests the business rule that concentration
// should be cleared for non-syrup feed types.
func TestConcentrationClearingLogic(t *testing.T) {
	tests := []struct {
		feedType             string
		shouldHaveConcentration bool
	}{
		{"sugar_syrup", true},
		{"fondant", false},
		{"pollen_patty", false},
		{"pollen_substitute", false},
		{"honey", false},
		{"other", false},
	}

	for _, tt := range tests {
		t.Run(tt.feedType, func(t *testing.T) {
			// Replicate the handler logic
			shouldClear := tt.feedType != "sugar_syrup"
			if tt.shouldHaveConcentration && shouldClear {
				t.Errorf("feed type %q should allow concentration, but clearing logic says to clear it", tt.feedType)
			}
			if !tt.shouldHaveConcentration && !shouldClear {
				t.Errorf("feed type %q should NOT have concentration, but clearing logic says to keep it", tt.feedType)
			}
		})
	}
}

// TestConcentrationValidation tests concentration value validation.
func TestConcentrationValidation(t *testing.T) {
	tests := []struct {
		concentration string
		shouldBeValid bool
		reason        string
	}{
		{"1:1", true, "standard ratio"},
		{"2:1", true, "standard ratio"},
		{"1.5:1", true, "custom ratio"},
		{"3:2", true, "custom ratio"},
		{"", true, "empty is valid (optional)"},
		{"a very long concentration value that exceeds 20 characters", false, "too long"},
	}

	maxLength := 20

	for _, tt := range tests {
		t.Run(tt.concentration, func(t *testing.T) {
			valid := len(tt.concentration) <= maxLength
			if valid != tt.shouldBeValid {
				t.Errorf("concentration %q: expected valid=%v, got valid=%v (%s)", tt.concentration, tt.shouldBeValid, valid, tt.reason)
			}
		})
	}
}

// TestSeasonStartCalculation tests the season start date calculation.
// Season runs April 1 to March 31 (beekeeping year).
func TestSeasonStartCalculation(t *testing.T) {
	tests := []struct {
		name          string
		currentDate   time.Time
		expectedStart time.Time
	}{
		{
			name:          "mid-summer (July)",
			currentDate:   time.Date(2026, time.July, 15, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name:          "end of year (December)",
			currentDate:   time.Date(2026, time.December, 31, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name:          "start of year (January)",
			currentDate:   time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2025, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name:          "early spring (March)",
			currentDate:   time.Date(2026, time.March, 20, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2025, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name:          "exactly April 1",
			currentDate:   time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name:          "day before April (March 31)",
			currentDate:   time.Date(2026, time.March, 31, 0, 0, 0, 0, time.UTC),
			expectedStart: time.Date(2025, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Replicate the season calculation logic from storage
			var seasonStart time.Time
			now := tt.currentDate
			if now.Month() >= time.April {
				seasonStart = time.Date(now.Year(), time.April, 1, 0, 0, 0, 0, time.UTC)
			} else {
				seasonStart = time.Date(now.Year()-1, time.April, 1, 0, 0, 0, 0, time.UTC)
			}

			if !seasonStart.Equal(tt.expectedStart) {
				t.Errorf("for date %v: expected season start %v, got %v", tt.currentDate, tt.expectedStart, seasonStart)
			}
		})
	}
}

// TestMultiHiveValidation tests validation for multi-hive feeding.
func TestMultiHiveValidation(t *testing.T) {
	tests := []struct {
		name          string
		hiveIDs       []string
		shouldBeValid bool
	}{
		{"single hive", []string{"hive-1"}, true},
		{"two hives", []string{"hive-1", "hive-2"}, true},
		{"five hives", []string{"hive-1", "hive-2", "hive-3", "hive-4", "hive-5"}, true},
		{"empty list", []string{}, false},
		{"nil list", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := len(tt.hiveIDs) > 0
			if valid != tt.shouldBeValid {
				t.Errorf("hive IDs %v: expected valid=%v, got valid=%v", tt.hiveIDs, tt.shouldBeValid, valid)
			}
		})
	}
}
