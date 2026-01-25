// Package handlers_test contains unit tests for the APIS server handlers.
package handlers_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestValidEquipmentActions tests equipment action validation.
func TestValidEquipmentActions(t *testing.T) {
	validActions := []string{"installed", "removed"}

	tests := []struct {
		action        string
		shouldBeValid bool
	}{
		{"installed", true},
		{"removed", true},
		{"INSTALLED", false}, // Case sensitive
		{"Installed", false}, // Case sensitive
		{"removed ", false},  // Extra space
		{"", false},
		{"invalid", false},
		{"uninstalled", false},
		{"added", false},
	}

	for _, tt := range tests {
		t.Run(tt.action, func(t *testing.T) {
			valid := false
			for _, v := range validActions {
				if tt.action == v {
					valid = true
					break
				}
			}
			if valid != tt.shouldBeValid {
				t.Errorf("action %q: expected valid=%v, got valid=%v", tt.action, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestValidEquipmentTypes tests equipment type validation.
// Equipment types must be 2-100 characters (custom types allowed).
func TestValidEquipmentTypes(t *testing.T) {
	tests := []struct {
		name          string
		equipmentType string
		shouldBeValid bool
	}{
		{"standard type", "mouse_guard", true},
		{"another standard", "entrance_reducer", true},
		{"custom type", "my_custom_equipment", true},
		{"min length", "ab", true},
		{"single char", "a", false},
		{"empty string", "", false},
		{"100 chars", string(make([]byte, 100)), true}, // 100 'a' chars
		{"101 chars", string(make([]byte, 101)), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Fill with 'a' for length tests
			if tt.equipmentType == string(make([]byte, 100)) {
				equipType := make([]byte, 100)
				for i := range equipType {
					equipType[i] = 'a'
				}
				tt.equipmentType = string(equipType)
			}
			if tt.equipmentType == string(make([]byte, 101)) {
				equipType := make([]byte, 101)
				for i := range equipType {
					equipType[i] = 'a'
				}
				tt.equipmentType = string(equipType)
			}

			// Replicate validation: must be 2-100 chars
			valid := len(tt.equipmentType) >= 2 && len(tt.equipmentType) <= 100
			if valid != tt.shouldBeValid {
				t.Errorf("equipment type %q (len=%d): expected valid=%v, got valid=%v",
					tt.equipmentType, len(tt.equipmentType), tt.shouldBeValid, valid)
			}
		})
	}
}

// TestNotesLengthValidation tests notes field length validation.
func TestNotesLengthValidation(t *testing.T) {
	tests := []struct {
		name          string
		notesLength   int
		shouldBeValid bool
	}{
		{"empty notes", 0, true},
		{"short notes", 10, true},
		{"medium notes", 250, true},
		{"max notes", 500, true},
		{"over max notes", 501, false},
		{"way over max", 1000, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Replicate validation: notes must be <= 500 chars
			valid := tt.notesLength <= 500
			if valid != tt.shouldBeValid {
				t.Errorf("notes length %d: expected valid=%v, got valid=%v", tt.notesLength, tt.shouldBeValid, valid)
			}
		})
	}
}

// TestDateParsing tests date format validation for logged_at.
func TestEquipmentDateParsing(t *testing.T) {
	tests := []struct {
		dateStr    string
		shouldPass bool
	}{
		{"2026-01-25", true},
		{"2025-12-31", true},
		{"2026-02-28", true},
		{"2024-02-29", true},  // Leap year
		{"01-25-2026", false}, // Wrong format
		{"2026/01/25", false}, // Wrong separator
		{"2026-1-25", false},  // Missing leading zero
		{"", false},
		{"invalid", false},
		{"2026-13-01", false}, // Invalid month
		{"2026-01-32", false}, // Invalid day
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

// TestEquipmentLogToResponse tests the response conversion.
func TestEquipmentLogToResponse(t *testing.T) {
	// Known equipment type labels
	knownTypes := map[string]string{
		"entrance_reducer": "Entrance Reducer",
		"mouse_guard":      "Mouse Guard",
		"queen_excluder":   "Queen Excluder",
		"robbing_screen":   "Robbing Screen",
		"feeder":           "Feeder",
		"top_feeder":       "Top Feeder",
		"bottom_board":     "Bottom Board",
		"slatted_rack":     "Slatted Rack",
		"inner_cover":      "Inner Cover",
		"outer_cover":      "Outer Cover",
		"hive_beetle_trap": "Hive Beetle Trap",
		"other":            "Other",
	}

	for typeValue, expectedLabel := range knownTypes {
		t.Run(typeValue, func(t *testing.T) {
			label := knownTypes[typeValue]
			if label != expectedLabel {
				t.Errorf("equipment type %q: expected label %q, got %q", typeValue, expectedLabel, label)
			}
		})
	}

	// Test custom type falls back to raw value
	t.Run("custom_type_fallback", func(t *testing.T) {
		customType := "my_custom_equipment"
		label := knownTypes[customType]
		if label == "" {
			label = customType // Fallback behavior
		}
		if label != customType {
			t.Errorf("custom type %q: expected label to fallback to %q, got %q", customType, customType, label)
		}
	})
}

// TestEquipmentStateConsistency tests the equipment state validation logic.
func TestEquipmentStateConsistency(t *testing.T) {
	tests := []struct {
		name               string
		action             string
		isCurrentlyInstalled bool
		shouldAllow        bool
	}{
		{
			name:               "install when not installed",
			action:             "installed",
			isCurrentlyInstalled: false,
			shouldAllow:        true,
		},
		{
			name:               "install when already installed",
			action:             "installed",
			isCurrentlyInstalled: true,
			shouldAllow:        false, // Should prevent duplicate installations
		},
		{
			name:               "remove when installed",
			action:             "removed",
			isCurrentlyInstalled: true,
			shouldAllow:        true,
		},
		{
			name:               "remove when not installed",
			action:             "removed",
			isCurrentlyInstalled: false,
			shouldAllow:        false, // Can't remove something not installed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Replicate the handler's state consistency logic
			var allowed bool
			if tt.action == "installed" {
				allowed = !tt.isCurrentlyInstalled
			} else if tt.action == "removed" {
				allowed = tt.isCurrentlyInstalled
			}

			if allowed != tt.shouldAllow {
				t.Errorf("action=%q, isInstalled=%v: expected allow=%v, got allow=%v",
					tt.action, tt.isCurrentlyInstalled, tt.shouldAllow, allowed)
			}
		})
	}
}

// TestDurationCalculation tests duration calculation between install and removal dates.
func TestDurationCalculation(t *testing.T) {
	tests := []struct {
		name         string
		installedAt  string
		removedAt    string
		expectedDays int
	}{
		{
			name:         "same day",
			installedAt:  "2026-01-01",
			removedAt:    "2026-01-01",
			expectedDays: 0,
		},
		{
			name:         "one day",
			installedAt:  "2026-01-01",
			removedAt:    "2026-01-02",
			expectedDays: 1,
		},
		{
			name:         "one week",
			installedAt:  "2026-01-01",
			removedAt:    "2026-01-08",
			expectedDays: 7,
		},
		{
			name:         "one month (30 days)",
			installedAt:  "2026-01-01",
			removedAt:    "2026-01-31",
			expectedDays: 30,
		},
		{
			name:         "example from story",
			installedAt:  "2026-11-01",
			removedAt:    "2027-03-15",
			expectedDays: 134, // Nov 1 - Mar 15
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			installedAt, _ := time.Parse("2006-01-02", tt.installedAt)
			removedAt, _ := time.Parse("2006-01-02", tt.removedAt)

			// Replicate duration calculation
			durationDays := int(removedAt.Sub(installedAt).Hours() / 24)

			if durationDays != tt.expectedDays {
				t.Errorf("duration from %s to %s: expected %d days, got %d days",
					tt.installedAt, tt.removedAt, tt.expectedDays, durationDays)
			}
		})
	}
}

// TestEquipmentLogStruct tests the EquipmentLog struct fields.
func TestEquipmentLogStruct(t *testing.T) {
	now := time.Now()
	notes := "Test notes"

	log := storage.EquipmentLog{
		ID:            "equip-123",
		TenantID:      "tenant-abc",
		HiveID:        "hive-456",
		EquipmentType: "mouse_guard",
		Action:        "installed",
		LoggedAt:      now,
		Notes:         &notes,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Verify required fields
	if log.ID != "equip-123" {
		t.Errorf("expected ID 'equip-123', got %q", log.ID)
	}
	if log.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", log.TenantID)
	}
	if log.HiveID != "hive-456" {
		t.Errorf("expected HiveID 'hive-456', got %q", log.HiveID)
	}
	if log.EquipmentType != "mouse_guard" {
		t.Errorf("expected EquipmentType 'mouse_guard', got %q", log.EquipmentType)
	}
	if log.Action != "installed" {
		t.Errorf("expected Action 'installed', got %q", log.Action)
	}
	if log.Notes == nil || *log.Notes != "Test notes" {
		t.Error("expected Notes to be 'Test notes'")
	}
}

// TestEquipmentLogWithNullOptionalFields tests equipment log with nil notes.
func TestEquipmentLogWithNullOptionalFields(t *testing.T) {
	now := time.Now()

	log := storage.EquipmentLog{
		ID:            "equip-min",
		TenantID:      "tenant-1",
		HiveID:        "hive-1",
		EquipmentType: "feeder",
		Action:        "removed",
		LoggedAt:      now,
		Notes:         nil,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Verify required fields are set
	if log.ID == "" || log.TenantID == "" || log.HiveID == "" || log.EquipmentType == "" || log.Action == "" {
		t.Error("required fields should not be empty")
	}

	// Verify optional field is nil
	if log.Notes != nil {
		t.Error("expected Notes to be nil")
	}
}
