package storage_test

import (
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsValidCause(t *testing.T) {
	tests := []struct {
		name     string
		cause    string
		expected bool
	}{
		{"valid starvation", storage.CauseStarvation, true},
		{"valid varroa", storage.CauseVarroa, true},
		{"valid queen failure", storage.CauseQueenFailure, true},
		{"valid pesticide", storage.CausePesticide, true},
		{"valid swarming", storage.CauseSwarming, true},
		{"valid robbing", storage.CauseRobbing, true},
		{"valid unknown", storage.CauseUnknown, true},
		{"valid other", storage.CauseOther, true},
		{"invalid empty", "", false},
		{"invalid random", "disease", false},
		{"invalid uppercase", "VARROA", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := storage.IsValidCause(tt.cause)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsValidSymptom(t *testing.T) {
	tests := []struct {
		name     string
		symptom  string
		expected bool
	}{
		{"valid no_bees", storage.SymptomNoBees, true},
		{"valid dead_bees_entrance", storage.SymptomDeadBeesEntrance, true},
		{"valid deformed_wings", storage.SymptomDeformedWings, true},
		{"valid robbing_evidence", storage.SymptomRobbingEvidence, true},
		{"valid moldy_frames", storage.SymptomMoldyFrames, true},
		{"valid empty_stores", storage.SymptomEmptyStores, true},
		{"valid dead_brood", storage.SymptomDeadBrood, true},
		{"valid chalk_brood", storage.SymptomChalkBrood, true},
		{"valid shb_evidence", storage.SymptomSHBEvidence, true},
		{"valid wax_moth", storage.SymptomWaxMoth, true},
		{"invalid empty", "", false},
		{"invalid random", "sick_bees", false},
		{"invalid uppercase", "NO_BEES", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := storage.IsValidSymptom(tt.symptom)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestAreValidSymptoms(t *testing.T) {
	tests := []struct {
		name     string
		symptoms []string
		expected bool
	}{
		{"empty array", []string{}, true},
		{"single valid", []string{storage.SymptomNoBees}, true},
		{"multiple valid", []string{storage.SymptomNoBees, storage.SymptomDeadBeesEntrance, storage.SymptomDeformedWings}, true},
		{"all valid symptoms", storage.ValidSymptoms, true},
		{"single invalid", []string{"invalid"}, false},
		{"mix valid and invalid", []string{storage.SymptomNoBees, "invalid"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := storage.AreValidSymptoms(tt.symptoms)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCauseDisplayNames(t *testing.T) {
	// Ensure all valid causes have display names
	for _, cause := range storage.ValidCauses {
		displayName, ok := storage.CauseDisplayNames[cause]
		require.True(t, ok, "Cause %s should have a display name", cause)
		assert.NotEmpty(t, displayName, "Display name for %s should not be empty", cause)
	}

	// Test specific expected values
	assert.Equal(t, "Starvation", storage.CauseDisplayNames[storage.CauseStarvation])
	assert.Equal(t, "Varroa/Mites", storage.CauseDisplayNames[storage.CauseVarroa])
	assert.Equal(t, "Queen Failure", storage.CauseDisplayNames[storage.CauseQueenFailure])
	assert.Equal(t, "Pesticide Exposure", storage.CauseDisplayNames[storage.CausePesticide])
	assert.Equal(t, "Swarming (absconded)", storage.CauseDisplayNames[storage.CauseSwarming])
	assert.Equal(t, "Robbing", storage.CauseDisplayNames[storage.CauseRobbing])
	assert.Equal(t, "Unknown", storage.CauseDisplayNames[storage.CauseUnknown])
	assert.Equal(t, "Other (specify)", storage.CauseDisplayNames[storage.CauseOther])
}

func TestSymptomDisplayNames(t *testing.T) {
	// Ensure all valid symptoms have display names
	for _, symptom := range storage.ValidSymptoms {
		displayName, ok := storage.SymptomDisplayNames[symptom]
		require.True(t, ok, "Symptom %s should have a display name", symptom)
		assert.NotEmpty(t, displayName, "Display name for %s should not be empty", symptom)
	}

	// Test specific expected values
	assert.Equal(t, "No bees remaining", storage.SymptomDisplayNames[storage.SymptomNoBees])
	assert.Equal(t, "Dead bees at entrance/inside", storage.SymptomDisplayNames[storage.SymptomDeadBeesEntrance])
	assert.Equal(t, "Deformed wings visible", storage.SymptomDisplayNames[storage.SymptomDeformedWings])
	assert.Equal(t, "Evidence of robbing (wax debris)", storage.SymptomDisplayNames[storage.SymptomRobbingEvidence])
	assert.Equal(t, "Empty honey stores", storage.SymptomDisplayNames[storage.SymptomEmptyStores])
}

func TestValidCausesCompleteness(t *testing.T) {
	// Ensure ValidCauses contains all expected values
	expectedCauses := []string{
		"starvation", "varroa", "queen_failure", "pesticide",
		"swarming", "robbing", "unknown", "other",
	}

	assert.Equal(t, len(expectedCauses), len(storage.ValidCauses))

	for _, cause := range expectedCauses {
		assert.Contains(t, storage.ValidCauses, cause, "ValidCauses should contain %s", cause)
	}
}

func TestValidSymptomsCompleteness(t *testing.T) {
	// Ensure ValidSymptoms contains all expected values
	expectedSymptoms := []string{
		"no_bees", "dead_bees_entrance", "deformed_wings", "robbing_evidence",
		"moldy_frames", "empty_stores", "dead_brood", "chalk_brood",
		"shb_evidence", "wax_moth",
	}

	assert.Equal(t, len(expectedSymptoms), len(storage.ValidSymptoms))

	for _, symptom := range expectedSymptoms {
		assert.Contains(t, storage.ValidSymptoms, symptom, "ValidSymptoms should contain %s", symptom)
	}
}
