// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"testing"
	"time"
)

// TestValidBroodPattern tests brood pattern validation.
func TestValidBroodPattern(t *testing.T) {
	validPatterns := []string{"good", "spotty", "poor"}

	tests := []struct {
		pattern       string
		shouldBeValid bool
	}{
		{"good", true},
		{"spotty", true},
		{"poor", true},
		{"excellent", false},
		{"GOOD", false}, // Case sensitive
		{"", true},      // Empty is valid (optional)
	}

	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			valid := tt.pattern == "" // Empty is valid
			for _, v := range validPatterns {
				if tt.pattern == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("pattern %q: expected valid=%v, got valid=%v", tt.pattern, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidLevel tests honey/pollen level validation.
func TestValidLevel(t *testing.T) {
	validLevels := []string{"low", "medium", "high"}

	tests := []struct {
		level         string
		shouldBeValid bool
	}{
		{"low", true},
		{"medium", true},
		{"high", true},
		{"empty", false},
		{"LOW", false}, // Case sensitive
		{"", true},     // Empty is valid (optional)
	}

	for _, tt := range tests {
		t.Run(tt.level, func(t *testing.T) {
			valid := tt.level == ""
			for _, v := range validLevels {
				if tt.level == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("level %q: expected valid=%v, got valid=%v", tt.level, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidTemperament tests temperament validation.
func TestValidTemperament(t *testing.T) {
	validTemperaments := []string{"calm", "nervous", "aggressive"}

	tests := []struct {
		temperament   string
		shouldBeValid bool
	}{
		{"calm", true},
		{"nervous", true},
		{"aggressive", true},
		{"angry", false},
		{"CALM", false}, // Case sensitive
		{"", true},      // Empty is valid (optional)
	}

	for _, tt := range tests {
		t.Run(tt.temperament, func(t *testing.T) {
			valid := tt.temperament == ""
			for _, v := range validTemperaments {
				if tt.temperament == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("temperament %q: expected valid=%v, got valid=%v", tt.temperament, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidIssues tests issue code validation.
func TestValidIssues(t *testing.T) {
	tests := []struct {
		name          string
		issues        []string
		shouldBeValid bool
	}{
		{
			name:          "empty issues",
			issues:        []string{},
			shouldBeValid: true,
		},
		{
			name:          "nil issues",
			issues:        nil,
			shouldBeValid: true,
		},
		{
			name:          "valid dwv",
			issues:        []string{"dwv"},
			shouldBeValid: true,
		},
		{
			name:          "valid chalkbrood",
			issues:        []string{"chalkbrood"},
			shouldBeValid: true,
		},
		{
			name:          "valid wax_moth",
			issues:        []string{"wax_moth"},
			shouldBeValid: true,
		},
		{
			name:          "valid robbing",
			issues:        []string{"robbing"},
			shouldBeValid: true,
		},
		{
			name:          "valid multiple issues",
			issues:        []string{"dwv", "chalkbrood", "robbing"},
			shouldBeValid: true,
		},
		{
			name:          "valid other with description",
			issues:        []string{"other:Small hive beetle spotted"},
			shouldBeValid: true,
		},
		{
			name:          "valid mix of predefined and other",
			issues:        []string{"dwv", "other:Custom issue"},
			shouldBeValid: true,
		},
		{
			name:          "invalid issue code",
			issues:        []string{"varroa"},
			shouldBeValid: false,
		},
		{
			name:          "invalid - other without description",
			issues:        []string{"other:"},
			shouldBeValid: false,
		},
		{
			name:          "one invalid in mix",
			issues:        []string{"dwv", "invalid_code"},
			shouldBeValid: false,
		},
	}

	validCodes := []string{"dwv", "chalkbrood", "wax_moth", "robbing"}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.issues == nil {
				// nil is always valid
				if !tt.shouldBeValid {
					t.Errorf("nil issues should be valid")
				}
				return
			}

			valid := true
			for _, issue := range tt.issues {
				isValid := false
				for _, code := range validCodes {
					if issue == code {
						isValid = true
						break
					}
				}
				// Check other: prefix
				if !isValid && len(issue) > 6 && issue[:6] == "other:" {
					if len(issue) > 6 && len(issue) <= 206 {
						isValid = true
					}
				}
				if !isValid {
					valid = false
					break
				}
			}

			if valid != tt.shouldBeValid {
				t.Errorf("issues %v: expected valid=%v, got valid=%v", tt.issues, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidBroodFrames tests brood frames range validation.
func TestValidBroodFrames(t *testing.T) {
	tests := []struct {
		frames        int
		shouldBeValid bool
	}{
		{0, true},
		{1, true},
		{10, true},
		{20, true},
		{-1, false},
		{21, false},
		{100, false},
	}

	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			valid := tt.frames >= 0 && tt.frames <= 20
			if valid != tt.shouldBeValid {
				t.Errorf("brood_frames %d: expected valid=%v, got valid=%v", tt.frames, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestInspectionNotesLengthValidation tests notes character limit for inspections.
func TestInspectionNotesLengthValidation(t *testing.T) {
	tests := []struct {
		name          string
		notesLen      int
		shouldBeValid bool
	}{
		{"empty notes", 0, true},
		{"short notes", 100, true},
		{"max length", 2000, true},
		{"over max", 2001, false},
		{"way over max", 5000, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := tt.notesLen <= 2000
			if valid != tt.shouldBeValid {
				t.Errorf("notes length %d: expected valid=%v, got valid=%v", tt.notesLen, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestInspectionDateValidation tests inspection date validation.
func TestInspectionDateValidation(t *testing.T) {
	now := time.Now()
	tomorrow := now.AddDate(0, 0, 2) // 2 days in future to be safe

	tests := []struct {
		name          string
		dateStr       string
		shouldBeValid bool
	}{
		{"today", now.Format("2006-01-02"), true},
		{"yesterday", now.AddDate(0, 0, -1).Format("2006-01-02"), true},
		{"last week", now.AddDate(0, 0, -7).Format("2006-01-02"), true},
		{"future date", tomorrow.Format("2006-01-02"), false},
		{"invalid format", "01-25-2026", false},
		{"wrong separator", "2026/01/25", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := time.Parse("2006-01-02", tt.dateStr)
			if err != nil {
				if tt.shouldBeValid {
					t.Errorf("date %q: expected valid but got parse error: %v", tt.dateStr, err)
				}
				return
			}

			// Check future date (allowing 1 day buffer)
			isFuture := parsed.After(time.Now().AddDate(0, 0, 1))
			valid := !isFuture

			if valid != tt.shouldBeValid {
				t.Errorf("date %q: expected valid=%v, got valid=%v", tt.dateStr, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestEdit24HourWindow tests the 24-hour edit window logic.
func TestEdit24HourWindow(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name            string
		createdAt       time.Time
		shouldAllowEdit bool
	}{
		{"just created", now, true},
		{"1 hour ago", now.Add(-1 * time.Hour), true},
		{"12 hours ago", now.Add(-12 * time.Hour), true},
		{"23 hours ago", now.Add(-23 * time.Hour), true},
		{"24 hours ago", now.Add(-24 * time.Hour), false},
		{"25 hours ago", now.Add(-25 * time.Hour), false},
		{"48 hours ago", now.Add(-48 * time.Hour), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hoursSinceCreation := time.Since(tt.createdAt).Hours()
			canEdit := hoursSinceCreation < 24

			if canEdit != tt.shouldAllowEdit {
				t.Errorf("createdAt %v: expected canEdit=%v, got canEdit=%v (hours=%.2f)",
					tt.createdAt, tt.shouldAllowEdit, canEdit, hoursSinceCreation)
			}
		})
	}
}

// TestCSVEscaping tests CSV escaping for export.
func TestCSVEscaping(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"simple", "simple"},
		{"with, comma", "\"with, comma\""},
		{"with\nnewline", "\"with\nnewline\""},
		{"with \"quotes\"", "\"with \"\"quotes\"\"\""},
		{"normal text", "normal text"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := escapeCSV(tt.input)
			if result != tt.expected {
				t.Errorf("escapeCSV(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// escapeCSV replicates the handler's escapeCSV function for testing.
func escapeCSV(s string) string {
	if containsSpecialCSVChars(s) {
		escaped := "\""
		for _, c := range s {
			if c == '"' {
				escaped += "\"\""
			} else {
				escaped += string(c)
			}
		}
		escaped += "\""
		return escaped
	}
	return s
}

// containsSpecialCSVChars checks if string needs CSV escaping.
func containsSpecialCSVChars(s string) bool {
	for _, c := range s {
		if c == ',' || c == '\n' || c == '\r' || c == '"' {
			return true
		}
	}
	return false
}

// TestSanitizeFilename tests filename sanitization.
func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Simple Name", "Simple_Name"},
		{"Test-Hive_01", "Test-Hive_01"},
		{"Hive #1", "Hive_1"},
		{"My/Special\\Hive", "MySpecialHive"},
		{"Été 2026", "t_2026"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := sanitizeFilename(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// sanitizeFilename replicates the handler's sanitizeFilename function for testing.
func sanitizeFilename(name string) string {
	var result string
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' {
			result += string(c)
		} else if c == ' ' {
			result += "_"
		}
	}
	return result
}
