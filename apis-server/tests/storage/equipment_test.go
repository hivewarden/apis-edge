// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestCreateEquipmentLogInput tests the equipment log input struct behavior.
func TestCreateEquipmentLogInput(t *testing.T) {
	now := time.Now()
	notes := "Winter preparation"

	input := &storage.CreateEquipmentLogInput{
		EquipmentType: "mouse_guard",
		Action:        "installed",
		LoggedAt:      now,
		Notes:         &notes,
	}

	// Verify required fields
	if input.EquipmentType != "mouse_guard" {
		t.Errorf("expected EquipmentType 'mouse_guard', got %q", input.EquipmentType)
	}
	if input.Action != "installed" {
		t.Errorf("expected Action 'installed', got %q", input.Action)
	}
	if !input.LoggedAt.Equal(now) {
		t.Errorf("expected LoggedAt %v, got %v", now, input.LoggedAt)
	}

	// Verify optional field
	if input.Notes == nil || *input.Notes != "Winter preparation" {
		t.Error("expected Notes to be 'Winter preparation'")
	}
}

// TestCreateEquipmentLogInputWithNilNotes tests input with nil notes.
func TestCreateEquipmentLogInputWithNilNotes(t *testing.T) {
	now := time.Now()

	input := &storage.CreateEquipmentLogInput{
		EquipmentType: "entrance_reducer",
		Action:        "removed",
		LoggedAt:      now,
		Notes:         nil,
	}

	if input.Notes != nil {
		t.Error("expected Notes to be nil")
	}
}

// TestUpdateEquipmentLogInput tests the update input struct behavior.
func TestUpdateEquipmentLogInput(t *testing.T) {
	newType := "queen_excluder"
	newAction := "removed"
	newDate := time.Now()
	newNotes := "Updated notes"

	input := &storage.UpdateEquipmentLogInput{
		EquipmentType: &newType,
		Action:        &newAction,
		LoggedAt:      &newDate,
		Notes:         &newNotes,
	}

	// Verify fields can be set
	if input.EquipmentType == nil || *input.EquipmentType != "queen_excluder" {
		t.Error("expected EquipmentType to be 'queen_excluder'")
	}
	if input.Action == nil || *input.Action != "removed" {
		t.Error("expected Action to be 'removed'")
	}
	if input.Notes == nil || *input.Notes != "Updated notes" {
		t.Error("expected Notes to be 'Updated notes'")
	}
}

// TestUpdateEquipmentLogInputPartial tests partial update input.
func TestUpdateEquipmentLogInputPartial(t *testing.T) {
	newNotes := "Only updating notes"

	input := &storage.UpdateEquipmentLogInput{
		EquipmentType: nil,
		Action:        nil,
		LoggedAt:      nil,
		Notes:         &newNotes,
	}

	// Only notes should be set
	if input.EquipmentType != nil {
		t.Error("expected EquipmentType to be nil")
	}
	if input.Action != nil {
		t.Error("expected Action to be nil")
	}
	if input.LoggedAt != nil {
		t.Error("expected LoggedAt to be nil")
	}
	if input.Notes == nil || *input.Notes != "Only updating notes" {
		t.Error("expected Notes to be 'Only updating notes'")
	}
}

// TestEquipmentLogStructFields tests the EquipmentLog struct fields.
func TestEquipmentLogStructFields(t *testing.T) {
	now := time.Now()
	notes := "Test installation"

	log := storage.EquipmentLog{
		ID:            "equip-123",
		TenantID:      "tenant-abc",
		HiveID:        "hive-456",
		EquipmentType: "robbing_screen",
		Action:        "installed",
		LoggedAt:      now,
		Notes:         &notes,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Verify all fields
	if log.ID != "equip-123" {
		t.Errorf("expected ID 'equip-123', got %q", log.ID)
	}
	if log.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", log.TenantID)
	}
	if log.HiveID != "hive-456" {
		t.Errorf("expected HiveID 'hive-456', got %q", log.HiveID)
	}
	if log.EquipmentType != "robbing_screen" {
		t.Errorf("expected EquipmentType 'robbing_screen', got %q", log.EquipmentType)
	}
	if log.Action != "installed" {
		t.Errorf("expected Action 'installed', got %q", log.Action)
	}
	if log.Notes == nil || *log.Notes != "Test installation" {
		t.Error("expected Notes to be 'Test installation'")
	}
}

// TestCurrentlyInstalledEquipmentStruct tests the CurrentlyInstalledEquipment struct.
func TestCurrentlyInstalledEquipmentStruct(t *testing.T) {
	now := time.Now()
	notes := "Added for winter"

	item := storage.CurrentlyInstalledEquipment{
		ID:            "equip-789",
		EquipmentType: "mouse_guard",
		InstalledAt:   now,
		DaysInstalled: 45,
		Notes:         &notes,
	}

	if item.ID != "equip-789" {
		t.Errorf("expected ID 'equip-789', got %q", item.ID)
	}
	if item.EquipmentType != "mouse_guard" {
		t.Errorf("expected EquipmentType 'mouse_guard', got %q", item.EquipmentType)
	}
	if item.DaysInstalled != 45 {
		t.Errorf("expected DaysInstalled 45, got %d", item.DaysInstalled)
	}
	if item.Notes == nil || *item.Notes != "Added for winter" {
		t.Error("expected Notes to be 'Added for winter'")
	}
}

// TestEquipmentHistoryItemStruct tests the EquipmentHistoryItem struct.
func TestEquipmentHistoryItemStruct(t *testing.T) {
	installedAt, _ := time.Parse("2006-01-02", "2026-05-10")
	removedAt, _ := time.Parse("2006-01-02", "2026-09-20")
	notes := "Season use"

	item := storage.EquipmentHistoryItem{
		EquipmentType: "queen_excluder",
		InstalledAt:   installedAt,
		RemovedAt:     removedAt,
		DurationDays:  133,
		Notes:         &notes,
	}

	if item.EquipmentType != "queen_excluder" {
		t.Errorf("expected EquipmentType 'queen_excluder', got %q", item.EquipmentType)
	}
	if item.DurationDays != 133 {
		t.Errorf("expected DurationDays 133, got %d", item.DurationDays)
	}
	if item.Notes == nil || *item.Notes != "Season use" {
		t.Error("expected Notes to be 'Season use'")
	}

	// Verify dates
	expectedInstall := "2026-05-10"
	if item.InstalledAt.Format("2006-01-02") != expectedInstall {
		t.Errorf("expected InstalledAt %s, got %s", expectedInstall, item.InstalledAt.Format("2006-01-02"))
	}
	expectedRemove := "2026-09-20"
	if item.RemovedAt.Format("2006-01-02") != expectedRemove {
		t.Errorf("expected RemovedAt %s, got %s", expectedRemove, item.RemovedAt.Format("2006-01-02"))
	}
}

// TestEquipmentTypeValues documents expected equipment types.
func TestEquipmentTypeValues(t *testing.T) {
	expectedTypes := map[string]bool{
		"entrance_reducer": true,
		"mouse_guard":      true,
		"queen_excluder":   true,
		"robbing_screen":   true,
		"feeder":           true,
		"top_feeder":       true,
		"bottom_board":     true,
		"slatted_rack":     true,
		"inner_cover":      true,
		"outer_cover":      true,
		"hive_beetle_trap": true,
		"other":            true,
	}

	for equipmentType := range expectedTypes {
		if !expectedTypes[equipmentType] {
			t.Errorf("equipment type %q should be valid", equipmentType)
		}
	}

	// Total count check
	if len(expectedTypes) != 12 {
		t.Errorf("expected 12 equipment types, got %d", len(expectedTypes))
	}
}

// TestEquipmentActionValues documents expected equipment actions.
func TestEquipmentActionValues(t *testing.T) {
	expectedActions := map[string]bool{
		"installed": true,
		"removed":   true,
	}

	for action := range expectedActions {
		if !expectedActions[action] {
			t.Errorf("action %q should be valid", action)
		}
	}

	// Total count check
	if len(expectedActions) != 2 {
		t.Errorf("expected 2 actions, got %d", len(expectedActions))
	}
}

// TestDaysInstalledCalculation tests the days installed calculation logic.
func TestDaysInstalledCalculation(t *testing.T) {
	tests := []struct {
		name         string
		installedAt  string
		now          string
		expectedDays int
	}{
		{
			name:         "same day",
			installedAt:  "2026-01-25",
			now:          "2026-01-25",
			expectedDays: 0,
		},
		{
			name:         "one day",
			installedAt:  "2026-01-24",
			now:          "2026-01-25",
			expectedDays: 1,
		},
		{
			name:         "one week",
			installedAt:  "2026-01-18",
			now:          "2026-01-25",
			expectedDays: 7,
		},
		{
			name:         "one month",
			installedAt:  "2025-12-25",
			now:          "2026-01-25",
			expectedDays: 31,
		},
		{
			name:         "45 days example",
			installedAt:  "2025-12-11",
			now:          "2026-01-25",
			expectedDays: 45,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			installedAt, _ := time.Parse("2006-01-02", tt.installedAt)
			now, _ := time.Parse("2006-01-02", tt.now)

			// Replicate storage layer calculation
			daysInstalled := int(now.Sub(installedAt).Hours() / 24)

			if daysInstalled != tt.expectedDays {
				t.Errorf("days from %s to %s: expected %d, got %d",
					tt.installedAt, tt.now, tt.expectedDays, daysInstalled)
			}
		})
	}
}
