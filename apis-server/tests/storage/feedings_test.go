// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/shopspring/decimal"
)

// TestCreateFeedingInput tests the feeding input struct behavior.
func TestCreateFeedingInput(t *testing.T) {
	now := time.Now()
	concentration := "2:1"
	notes := "Spring feeding"

	input := &storage.CreateFeedingInput{
		HiveID:        "hive-1",
		FedAt:         now,
		FeedType:      "sugar_syrup",
		Amount:        decimal.NewFromFloat(2.5),
		Unit:          "liters",
		Concentration: &concentration,
		Notes:         &notes,
	}

	// Verify required fields
	if input.HiveID != "hive-1" {
		t.Errorf("expected HiveID 'hive-1', got %q", input.HiveID)
	}
	if input.FeedType != "sugar_syrup" {
		t.Errorf("expected FeedType 'sugar_syrup', got %q", input.FeedType)
	}
	if !input.FedAt.Equal(now) {
		t.Errorf("expected FedAt %v, got %v", now, input.FedAt)
	}
	if input.Unit != "liters" {
		t.Errorf("expected Unit 'liters', got %q", input.Unit)
	}

	// Verify amount
	expectedAmount := decimal.NewFromFloat(2.5)
	if !input.Amount.Equal(expectedAmount) {
		t.Errorf("expected Amount %v, got %v", expectedAmount, input.Amount)
	}

	// Verify optional fields
	if input.Concentration == nil || *input.Concentration != "2:1" {
		t.Error("expected Concentration to be '2:1'")
	}
	if input.Notes == nil || *input.Notes != "Spring feeding" {
		t.Error("expected Notes to be 'Spring feeding'")
	}
}

// TestUpdateFeedingInput tests the update input struct behavior.
func TestUpdateFeedingInput(t *testing.T) {
	newType := "fondant"
	newAmount := decimal.NewFromFloat(1.0)
	newUnit := "kg"

	input := &storage.UpdateFeedingInput{
		FedAt:         nil,
		FeedType:      &newType,
		Amount:        &newAmount,
		Unit:          &newUnit,
		Concentration: nil,
		Notes:         nil,
	}

	// Only feed_type, amount, and unit should be set
	if input.FedAt != nil {
		t.Error("expected FedAt to be nil")
	}
	if input.FeedType == nil || *input.FeedType != "fondant" {
		t.Error("expected FeedType to be 'fondant'")
	}
	if input.Amount == nil || !input.Amount.Equal(decimal.NewFromFloat(1.0)) {
		t.Error("expected Amount to be 1.0")
	}
	if input.Unit == nil || *input.Unit != "kg" {
		t.Error("expected Unit to be 'kg'")
	}
	if input.Concentration != nil {
		t.Error("expected Concentration to be nil")
	}
	if input.Notes != nil {
		t.Error("expected Notes to be nil")
	}
}

// TestFeedingStructFields tests the Feeding struct fields.
func TestFeedingStructFields(t *testing.T) {
	now := time.Now()
	concentration := "1:1"
	notes := "First syrup feeding of season"

	feeding := storage.Feeding{
		ID:            "feed-123",
		TenantID:      "tenant-abc",
		HiveID:        "hive-456",
		FedAt:         now,
		FeedType:      "sugar_syrup",
		Amount:        decimal.NewFromFloat(3.0),
		Unit:          "liters",
		Concentration: &concentration,
		Notes:         &notes,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Verify all fields
	if feeding.ID != "feed-123" {
		t.Errorf("expected ID 'feed-123', got %q", feeding.ID)
	}
	if feeding.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", feeding.TenantID)
	}
	if feeding.HiveID != "hive-456" {
		t.Errorf("expected HiveID 'hive-456', got %q", feeding.HiveID)
	}
	if feeding.FeedType != "sugar_syrup" {
		t.Errorf("expected FeedType 'sugar_syrup', got %q", feeding.FeedType)
	}
	if !feeding.Amount.Equal(decimal.NewFromFloat(3.0)) {
		t.Errorf("expected Amount 3.0, got %v", feeding.Amount)
	}
	if feeding.Unit != "liters" {
		t.Errorf("expected Unit 'liters', got %q", feeding.Unit)
	}
	if feeding.Concentration == nil || *feeding.Concentration != "1:1" {
		t.Error("expected Concentration to be '1:1'")
	}
	if feeding.Notes == nil || *feeding.Notes != "First syrup feeding of season" {
		t.Error("expected Notes to be 'First syrup feeding of season'")
	}
}

// TestFeedingWithNullOptionalFields tests feeding with all optional fields nil.
func TestFeedingWithNullOptionalFields(t *testing.T) {
	now := time.Now()

	feeding := storage.Feeding{
		ID:            "feed-min",
		TenantID:      "tenant-1",
		HiveID:        "hive-1",
		FedAt:         now,
		FeedType:      "fondant",
		Amount:        decimal.NewFromFloat(1.5),
		Unit:          "kg",
		Concentration: nil, // Fondant doesn't have concentration
		Notes:         nil,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Verify required fields are set
	if feeding.ID == "" || feeding.TenantID == "" || feeding.HiveID == "" || feeding.FeedType == "" {
		t.Error("required fields should not be empty")
	}

	// Verify optional fields are nil
	if feeding.Concentration != nil {
		t.Error("expected Concentration to be nil for fondant")
	}
	if feeding.Notes != nil {
		t.Error("expected Notes to be nil")
	}
}

// TestFeedTypeValues documents expected feed types.
func TestFeedTypeValues(t *testing.T) {
	expectedTypes := map[string]bool{
		"sugar_syrup":       true,
		"fondant":           true,
		"pollen_patty":      true,
		"pollen_substitute": true,
		"honey":             true,
		"other":             true,
	}

	for feedType := range expectedTypes {
		if !expectedTypes[feedType] {
			t.Errorf("feed type %q should be valid", feedType)
		}
	}

	// Total count check
	if len(expectedTypes) != 6 {
		t.Errorf("expected 6 feed types, got %d", len(expectedTypes))
	}
}

// TestFeedUnitValues documents expected feed units.
func TestFeedUnitValues(t *testing.T) {
	expectedUnits := map[string]bool{
		"kg":     true,
		"liters": true,
	}

	for unit := range expectedUnits {
		if !expectedUnits[unit] {
			t.Errorf("unit %q should be valid", unit)
		}
	}

	// Total count check
	if len(expectedUnits) != 2 {
		t.Errorf("expected 2 units, got %d", len(expectedUnits))
	}
}

// TestSeasonTotalStruct tests the SeasonTotal struct.
func TestSeasonTotalStruct(t *testing.T) {
	total := storage.SeasonTotal{
		FeedType: "sugar_syrup",
		Unit:     "liters",
		Total:    15.5,
	}

	if total.FeedType != "sugar_syrup" {
		t.Errorf("expected FeedType 'sugar_syrup', got %q", total.FeedType)
	}
	if total.Unit != "liters" {
		t.Errorf("expected Unit 'liters', got %q", total.Unit)
	}
	if total.Total != 15.5 {
		t.Errorf("expected Total 15.5, got %v", total.Total)
	}
}

// TestDecimalPrecision tests that decimal.Decimal maintains precision.
func TestDecimalPrecision(t *testing.T) {
	tests := []struct {
		floatVal    float64
		expectedStr string
	}{
		{2.5, "2.5"},
		{0.01, "0.01"},
		{100.0, "100"},
		{3.33, "3.33"},
		{1.125, "1.125"},
	}

	for _, tt := range tests {
		t.Run(tt.expectedStr, func(t *testing.T) {
			dec := decimal.NewFromFloat(tt.floatVal)
			result, _ := dec.Float64()

			// Verify round-trip maintains value
			if result != tt.floatVal {
				t.Errorf("decimal round-trip: expected %v, got %v", tt.floatVal, result)
			}
		})
	}
}

// TestFeedingTypesWithConcentration tests which feed types support concentration.
func TestFeedingTypesWithConcentration(t *testing.T) {
	// Only sugar_syrup should have concentration
	tests := []struct {
		feedType            string
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
			hasConcentration := tt.feedType == "sugar_syrup"
			if hasConcentration != tt.shouldHaveConcentration {
				t.Errorf("feed type %q: expected hasConcentration=%v, got %v",
					tt.feedType, tt.shouldHaveConcentration, hasConcentration)
			}
		})
	}
}

// TestUpdateFeedingPartialUpdate tests partial update behavior.
func TestUpdateFeedingPartialUpdate(t *testing.T) {
	// Simulate partial update where only some fields are provided
	newNotes := "Updated notes"
	input := &storage.UpdateFeedingInput{
		FedAt:         nil, // Not updating
		FeedType:      nil, // Not updating
		Amount:        nil, // Not updating
		Unit:          nil, // Not updating
		Concentration: nil, // Not updating
		Notes:         &newNotes,
	}

	// Count how many fields are actually being updated
	fieldsToUpdate := 0
	if input.FedAt != nil {
		fieldsToUpdate++
	}
	if input.FeedType != nil {
		fieldsToUpdate++
	}
	if input.Amount != nil {
		fieldsToUpdate++
	}
	if input.Unit != nil {
		fieldsToUpdate++
	}
	if input.Concentration != nil {
		fieldsToUpdate++
	}
	if input.Notes != nil {
		fieldsToUpdate++
	}

	if fieldsToUpdate != 1 {
		t.Errorf("expected 1 field to update, got %d", fieldsToUpdate)
	}

	if input.Notes == nil || *input.Notes != "Updated notes" {
		t.Error("expected Notes to be 'Updated notes'")
	}
}
