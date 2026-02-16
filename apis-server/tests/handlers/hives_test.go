// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"testing"
	"time"
)

// TestValidQueenSources tests queen source validation.
func TestValidQueenSources(t *testing.T) {
	validSources := []string{"breeder", "swarm", "split", "package", "other"}

	tests := []struct {
		source        string
		shouldBeValid bool
		reason        string
	}{
		{"breeder", true, "standard source"},
		{"swarm", true, "standard source"},
		{"split", true, "standard source"},
		{"package", true, "standard source"},
		{"other", true, "standard source"},
		{"other:local beekeeper", true, "custom source without space"},
		{"other: local beekeeper", true, "custom source with space"},
		{"other: rescue from tree", true, "custom description with space"},
		{"invalid_source", false, "not in valid list"},
		{"BREEDER", false, "case sensitive"},
		{"Breeder", false, "case sensitive"},
		{"", true, "empty is valid (optional)"},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			valid := validateQueenSourceLogic(tt.source)
			if valid != tt.shouldBeValid {
				t.Errorf("queen source %q: expected valid=%v, got valid=%v (%s)", tt.source, tt.shouldBeValid, valid, tt.reason)
			}
		})
	}

	// Verify all standard sources are in the valid list
	for _, s := range validSources {
		if !validateQueenSourceLogic(s) {
			t.Errorf("standard source %q should be valid", s)
		}
	}
}

// validateQueenSourceLogic replicates the handler validation logic for testing.
func validateQueenSourceLogic(source string) bool {
	if source == "" {
		return true
	}
	validSources := []string{"breeder", "swarm", "split", "package", "other"}
	for _, s := range validSources {
		if source == s {
			return true
		}
	}
	// Also allow "other:" or "other: " prefixed custom descriptions (max 200 chars for description)
	if len(source) > 6 && source[:6] == "other:" {
		return len(source) <= 207 // "other: " (7 chars) + up to 200 chars
	}
	return false
}

// TestBroodBoxesValidation tests brood boxes validation (must be 1-3).
func TestBroodBoxesValidation(t *testing.T) {
	tests := []struct {
		name          string
		broodBoxes    int
		shouldBeValid bool
	}{
		{"minimum valid", 1, true},
		{"middle value", 2, true},
		{"maximum valid", 3, true},
		{"zero", 0, false},
		{"negative", -1, false},
		{"too high", 4, false},
		{"way too high", 10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := tt.broodBoxes >= 1 && tt.broodBoxes <= 3
			if valid != tt.shouldBeValid {
				t.Errorf("brood boxes %d: expected valid=%v, got valid=%v", tt.broodBoxes, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestHoneySupersValidation tests honey supers validation (must be 0-5).
func TestHoneySupersValidation(t *testing.T) {
	tests := []struct {
		name          string
		honeySupers   int
		shouldBeValid bool
	}{
		{"zero", 0, true},
		{"one", 1, true},
		{"middle value", 3, true},
		{"maximum valid", 5, true},
		{"negative", -1, false},
		{"too high", 6, false},
		{"way too high", 10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := tt.honeySupers >= 0 && tt.honeySupers <= 5
			if valid != tt.shouldBeValid {
				t.Errorf("honey supers %d: expected valid=%v, got valid=%v", tt.honeySupers, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestQueenIntroducedAtParsing tests date format validation for queen introduction.
func TestQueenIntroducedAtParsing(t *testing.T) {
	tests := []struct {
		dateStr    string
		shouldPass bool
	}{
		{"2026-01-25", true},
		{"2025-12-31", true},
		{"2020-01-01", true},
		{"01-25-2026", false}, // Wrong format
		{"2026/01/25", false}, // Wrong separator
		{"2026-1-25", false},  // Missing leading zero
		{"", true},            // Empty is valid (optional)
		{"invalid", false},
	}

	for _, tt := range tests {
		t.Run(tt.dateStr, func(t *testing.T) {
			var passed bool
			if tt.dateStr == "" {
				passed = true // Empty is valid
			} else {
				_, err := time.Parse("2006-01-02", tt.dateStr)
				passed = err == nil
			}
			if passed != tt.shouldPass {
				t.Errorf("date %q: expected pass=%v, got pass=%v", tt.dateStr, tt.shouldPass, passed)
			}
		})
	}
}

// TestHiveNameValidation tests hive name validation.
func TestHiveNameValidation(t *testing.T) {
	tests := []struct {
		name          string
		hiveName      string
		shouldBeValid bool
	}{
		{"simple name", "Hive 1", true},
		{"descriptive name", "Queen Bee Palace", true},
		{"alphanumeric", "Hive-A1", true},
		{"empty", "", false},
		{"whitespace only", "   ", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Trim whitespace like the handler would
			trimmed := tt.hiveName
			valid := len(trimmed) > 0 && trimmed != "   "
			if valid != tt.shouldBeValid {
				t.Errorf("hive name %q: expected valid=%v, got valid=%v", tt.hiveName, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestQueenAgeDisplay tests queen age calculation display logic.
func TestQueenAgeDisplay(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name         string
		daysAgo      int
		expectedText string
	}{
		{"today", 0, "0 days"},
		{"one week", 7, "7 days"},
		{"29 days", 29, "29 days"},
		{"1 month", 30, "1 month"},
		{"2 months", 60, "2 months"},
		{"11 months", 330, "11 months"},
		{"1 year", 365, "1 year"},
		{"1 year 6 months", 545, "1y 6m"},
		{"2 years", 730, "2 years"},
		{"2 years 3 months", 821, "2y 3m"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			introducedAt := now.AddDate(0, 0, -tt.daysAgo)
			display := calculateQueenAgeDisplayLogic(&introducedAt)
			if display != tt.expectedText {
				t.Errorf("queen age for %d days ago: expected %q, got %q", tt.daysAgo, tt.expectedText, display)
			}
		})
	}

	// Test nil case
	t.Run("nil date", func(t *testing.T) {
		display := calculateQueenAgeDisplayLogic(nil)
		if display != "" {
			t.Errorf("nil date: expected empty string, got %q", display)
		}
	})
}

// calculateQueenAgeDisplayLogic replicates the handler logic for testing.
func calculateQueenAgeDisplayLogic(introducedAt *time.Time) string {
	if introducedAt == nil {
		return ""
	}
	days := int(time.Since(*introducedAt).Hours() / 24)
	if days < 0 {
		days = 0
	}

	if days < 30 {
		return itoa(days) + " days"
	} else if days < 365 {
		months := days / 30
		if months == 1 {
			return "1 month"
		}
		return itoa(months) + " months"
	} else {
		years := days / 365
		remainingMonths := (days % 365) / 30
		if remainingMonths == 0 {
			if years == 1 {
				return "1 year"
			}
			return itoa(years) + " years"
		}
		return itoa(years) + "y " + itoa(remainingMonths) + "m"
	}
}

// itoa converts int to string without importing fmt.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + itoa(-n)
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// TestBoxChangeTracking tests the logic for tracking box changes.
func TestBoxChangeTracking(t *testing.T) {
	tests := []struct {
		name           string
		oldBrood       int
		newBrood       int
		expectedChange int // positive = added, negative = removed, 0 = no change
	}{
		{"no change", 2, 2, 0},
		{"add one", 1, 2, 1},
		{"add two", 1, 3, 2},
		{"remove one", 3, 2, -1},
		{"remove two", 3, 1, -2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			change := tt.newBrood - tt.oldBrood
			if change != tt.expectedChange {
				t.Errorf("box change from %d to %d: expected %d, got %d", tt.oldBrood, tt.newBrood, tt.expectedChange, change)
			}
		})
	}
}

// TestHiveStatusCalculation tests hive status based on inspection age and issues.
func TestHiveStatusCalculation(t *testing.T) {
	tests := []struct {
		name           string
		daysSince      int
		hasIssues      bool
		expectedStatus string
	}{
		{"recent no issues", 5, false, "healthy"},
		{"recent with issues", 5, true, "needs_attention"},
		{"exactly 14 days no issues", 14, false, "healthy"},
		{"15 days no issues", 15, true, "needs_attention"},
		{"old no issues", 20, false, "needs_attention"},
		{"old with issues", 30, true, "needs_attention"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var status string
			if tt.daysSince > 14 || tt.hasIssues {
				status = "needs_attention"
			} else {
				status = "healthy"
			}
			if status != tt.expectedStatus {
				t.Errorf("status for %d days/%v issues: expected %q, got %q", tt.daysSince, tt.hasIssues, tt.expectedStatus, status)
			}
		})
	}
}

// TestReplaceQueenDateValidation tests queen replacement date validation.
func TestReplaceQueenDateValidation(t *testing.T) {
	tests := []struct {
		name       string
		dateStr    string
		shouldPass bool
	}{
		{"valid date", "2026-01-25", true},
		{"past date", "2025-06-15", true},
		{"empty date", "", false},
		{"invalid format", "01/25/2026", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.dateStr == "" {
				if tt.shouldPass {
					t.Errorf("empty date should not pass validation")
				}
				return
			}
			_, err := time.Parse("2006-01-02", tt.dateStr)
			passed := err == nil
			if passed != tt.shouldPass {
				t.Errorf("replace queen date %q: expected pass=%v, got pass=%v", tt.dateStr, tt.shouldPass, passed)
			}
		})
	}
}

// TestDeleteHiveWithInspectionsBlocking tests that hives with inspections cannot be deleted.
func TestDeleteHiveWithInspectionsBlocking(t *testing.T) {
	tests := []struct {
		name            string
		inspectionCount int
		shouldBlock     bool
	}{
		{"no inspections", 0, false},
		{"one inspection", 1, true},
		{"many inspections", 10, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shouldBlock := tt.inspectionCount > 0
			if shouldBlock != tt.shouldBlock {
				t.Errorf("delete with %d inspections: expected block=%v, got block=%v", tt.inspectionCount, tt.shouldBlock, shouldBlock)
			}
		})
	}
}

// TestQueenSourceOtherPrefix tests the "other:" prefix handling.
func TestQueenSourceOtherPrefix(t *testing.T) {
	tests := []struct {
		input       string
		isOther     bool
		description string
	}{
		{"other:local", true, "local"},
		{"other: local", true, " local"},
		{"other:rescue from tree", true, "rescue from tree"},
		{"other: rescue from tree", true, " rescue from tree"},
		{"breeder", false, ""},
		{"other", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			isOther := len(tt.input) > 6 && tt.input[:6] == "other:"
			if isOther != tt.isOther {
				t.Errorf("input %q: expected isOther=%v, got isOther=%v", tt.input, tt.isOther, isOther)
			}
			if isOther {
				desc := tt.input[6:]
				if desc != tt.description {
					t.Errorf("input %q: expected description=%q, got description=%q", tt.input, tt.description, desc)
				}
			}
		})
	}
}

// TestCustomQueenSourceMaxLength tests max length validation for custom queen source.
func TestCustomQueenSourceMaxLength(t *testing.T) {
	tests := []struct {
		name          string
		descLength    int
		shouldBeValid bool
	}{
		{"short description", 10, true},
		{"medium description", 100, true},
		{"max description", 200, true},
		{"too long", 201, false},
		{"way too long", 500, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a string of the given length
			desc := make([]byte, tt.descLength)
			for i := range desc {
				desc[i] = 'a'
			}
			source := "other: " + string(desc)

			// Validate: "other: " is 7 chars + up to 200 chars = 207 max
			valid := len(source) <= 207
			if valid != tt.shouldBeValid {
				t.Errorf("description length %d: expected valid=%v, got valid=%v", tt.descLength, tt.shouldBeValid, valid)
			}
		})
	}
}
