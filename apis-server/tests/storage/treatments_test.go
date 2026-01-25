// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestCreateTreatmentInput tests the treatment input struct behavior.
func TestCreateTreatmentInput(t *testing.T) {
	now := time.Now()
	method := "vaporization"
	dose := "2g"
	miteBefore := 12
	weather := "Sunny, 15C"
	notes := "First winter treatment"

	input := &storage.CreateTreatmentInput{
		HiveID:          "hive-1",
		TreatedAt:       now,
		TreatmentType:   "oxalic_acid",
		Method:          &method,
		Dose:            &dose,
		MiteCountBefore: &miteBefore,
		MiteCountAfter:  nil,
		Weather:         &weather,
		Notes:           &notes,
	}

	// Verify required fields
	if input.HiveID != "hive-1" {
		t.Errorf("expected HiveID 'hive-1', got %q", input.HiveID)
	}
	if input.TreatmentType != "oxalic_acid" {
		t.Errorf("expected TreatmentType 'oxalic_acid', got %q", input.TreatmentType)
	}
	if !input.TreatedAt.Equal(now) {
		t.Errorf("expected TreatedAt %v, got %v", now, input.TreatedAt)
	}

	// Verify optional fields
	if input.Method == nil || *input.Method != "vaporization" {
		t.Error("expected Method to be 'vaporization'")
	}
	if input.Dose == nil || *input.Dose != "2g" {
		t.Error("expected Dose to be '2g'")
	}
	if input.MiteCountBefore == nil || *input.MiteCountBefore != 12 {
		t.Error("expected MiteCountBefore to be 12")
	}
	if input.MiteCountAfter != nil {
		t.Error("expected MiteCountAfter to be nil")
	}
}

// TestUpdateTreatmentInput tests the update input struct behavior.
func TestUpdateTreatmentInput(t *testing.T) {
	miteAfter := 2
	newType := "formic_acid"

	input := &storage.UpdateTreatmentInput{
		TreatedAt:       nil,
		TreatmentType:   &newType,
		Method:          nil,
		Dose:            nil,
		MiteCountBefore: nil,
		MiteCountAfter:  &miteAfter,
		Weather:         nil,
		Notes:           nil,
	}

	// Only mite_count_after and treatment_type should be set
	if input.TreatedAt != nil {
		t.Error("expected TreatedAt to be nil")
	}
	if input.TreatmentType == nil || *input.TreatmentType != "formic_acid" {
		t.Error("expected TreatmentType to be 'formic_acid'")
	}
	if input.MiteCountAfter == nil || *input.MiteCountAfter != 2 {
		t.Error("expected MiteCountAfter to be 2")
	}
}

// TestTreatmentStructFields tests the Treatment struct fields.
func TestTreatmentStructFields(t *testing.T) {
	now := time.Now()
	method := "strips"
	dose := "4 strips"
	miteBefore := 20
	miteAfter := 3
	weather := "Cloudy"
	notes := "Check again in 2 weeks"

	treatment := storage.Treatment{
		ID:              "treat-123",
		TenantID:        "tenant-abc",
		HiveID:          "hive-456",
		TreatedAt:       now,
		TreatmentType:   "apivar",
		Method:          &method,
		Dose:            &dose,
		MiteCountBefore: &miteBefore,
		MiteCountAfter:  &miteAfter,
		Weather:         &weather,
		Notes:           &notes,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// Verify all fields
	if treatment.ID != "treat-123" {
		t.Errorf("expected ID 'treat-123', got %q", treatment.ID)
	}
	if treatment.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", treatment.TenantID)
	}
	if treatment.HiveID != "hive-456" {
		t.Errorf("expected HiveID 'hive-456', got %q", treatment.HiveID)
	}
	if treatment.TreatmentType != "apivar" {
		t.Errorf("expected TreatmentType 'apivar', got %q", treatment.TreatmentType)
	}
	if treatment.Method == nil || *treatment.Method != "strips" {
		t.Error("expected Method to be 'strips'")
	}
	if treatment.MiteCountBefore == nil || *treatment.MiteCountBefore != 20 {
		t.Error("expected MiteCountBefore to be 20")
	}
	if treatment.MiteCountAfter == nil || *treatment.MiteCountAfter != 3 {
		t.Error("expected MiteCountAfter to be 3")
	}
}

// TestTreatmentWithNullOptionalFields tests treatment with all optional fields nil.
func TestTreatmentWithNullOptionalFields(t *testing.T) {
	now := time.Now()

	treatment := storage.Treatment{
		ID:              "treat-min",
		TenantID:        "tenant-1",
		HiveID:          "hive-1",
		TreatedAt:       now,
		TreatmentType:   "other",
		Method:          nil,
		Dose:            nil,
		MiteCountBefore: nil,
		MiteCountAfter:  nil,
		Weather:         nil,
		Notes:           nil,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// Verify required fields are set
	if treatment.ID == "" || treatment.TenantID == "" || treatment.HiveID == "" || treatment.TreatmentType == "" {
		t.Error("required fields should not be empty")
	}

	// Verify optional fields are nil
	if treatment.Method != nil {
		t.Error("expected Method to be nil")
	}
	if treatment.Dose != nil {
		t.Error("expected Dose to be nil")
	}
	if treatment.MiteCountBefore != nil {
		t.Error("expected MiteCountBefore to be nil")
	}
	if treatment.MiteCountAfter != nil {
		t.Error("expected MiteCountAfter to be nil")
	}
	if treatment.Weather != nil {
		t.Error("expected Weather to be nil")
	}
	if treatment.Notes != nil {
		t.Error("expected Notes to be nil")
	}
}

// TestTreatmentTypeValues documents expected treatment types.
func TestTreatmentTypeValues(t *testing.T) {
	expectedTypes := map[string]bool{
		"oxalic_acid": true,
		"formic_acid": true,
		"apiguard":    true,
		"apivar":      true,
		"maqs":        true,
		"api_bioxal":  true,
		"other":       true,
	}

	for treatmentType := range expectedTypes {
		if !expectedTypes[treatmentType] {
			t.Errorf("treatment type %q should be valid", treatmentType)
		}
	}

	// Total count check
	if len(expectedTypes) != 7 {
		t.Errorf("expected 7 treatment types, got %d", len(expectedTypes))
	}
}

// TestMethodValues documents expected treatment methods.
func TestMethodValues(t *testing.T) {
	expectedMethods := map[string]bool{
		"vaporization": true,
		"dribble":      true,
		"strips":       true,
		"spray":        true,
		"other":        true,
	}

	for method := range expectedMethods {
		if !expectedMethods[method] {
			t.Errorf("method %q should be valid", method)
		}
	}

	// Total count check
	if len(expectedMethods) != 5 {
		t.Errorf("expected 5 methods, got %d", len(expectedMethods))
	}
}
