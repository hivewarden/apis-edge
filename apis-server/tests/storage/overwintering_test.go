package storage_test

import (
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsValidCondition(t *testing.T) {
	tests := []struct {
		name      string
		condition string
		expected  bool
	}{
		{"valid strong", "strong", true},
		{"valid medium", "medium", true},
		{"valid weak", "weak", true},
		{"invalid empty", "", false},
		{"invalid random", "excellent", false},
		{"invalid uppercase", "STRONG", false},
		{"invalid partial", "stron", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := storage.IsValidCondition(tt.condition)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsValidStoresRemaining(t *testing.T) {
	tests := []struct {
		name     string
		stores   string
		expected bool
	}{
		{"valid none", "none", true},
		{"valid low", "low", true},
		{"valid adequate", "adequate", true},
		{"valid plenty", "plenty", true},
		{"invalid empty", "", false},
		{"invalid random", "lots", false},
		{"invalid uppercase", "PLENTY", false},
		{"invalid partial", "adequa", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := storage.IsValidStoresRemaining(tt.stores)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestConditionDisplayNames(t *testing.T) {
	// Ensure all valid conditions have display names
	for _, condition := range storage.ValidConditions {
		displayName, ok := storage.ConditionDisplayNames[condition]
		require.True(t, ok, "Condition %s should have a display name", condition)
		assert.NotEmpty(t, displayName, "Display name for %s should not be empty", condition)
	}

	// Test specific expected values
	assert.Equal(t, "Strong", storage.ConditionDisplayNames["strong"])
	assert.Equal(t, "Medium", storage.ConditionDisplayNames["medium"])
	assert.Equal(t, "Weak", storage.ConditionDisplayNames["weak"])
}

func TestStoresDisplayNames(t *testing.T) {
	// Ensure all valid stores values have display names
	for _, stores := range storage.ValidStoresRemaining {
		displayName, ok := storage.StoresDisplayNames[stores]
		require.True(t, ok, "Stores value %s should have a display name", stores)
		assert.NotEmpty(t, displayName, "Display name for %s should not be empty", stores)
	}

	// Test specific expected values
	assert.Equal(t, "None", storage.StoresDisplayNames["none"])
	assert.Equal(t, "Low", storage.StoresDisplayNames["low"])
	assert.Equal(t, "Adequate", storage.StoresDisplayNames["adequate"])
	assert.Equal(t, "Plenty", storage.StoresDisplayNames["plenty"])
}

func TestValidConditionsCompleteness(t *testing.T) {
	// Ensure ValidConditions contains all expected values
	expectedConditions := []string{"strong", "medium", "weak"}

	assert.Equal(t, len(expectedConditions), len(storage.ValidConditions))

	for _, condition := range expectedConditions {
		assert.Contains(t, storage.ValidConditions, condition, "ValidConditions should contain %s", condition)
	}
}

func TestValidStoresRemainingCompleteness(t *testing.T) {
	// Ensure ValidStoresRemaining contains all expected values
	expectedStores := []string{"none", "low", "adequate", "plenty"}

	assert.Equal(t, len(expectedStores), len(storage.ValidStoresRemaining))

	for _, stores := range expectedStores {
		assert.Contains(t, storage.ValidStoresRemaining, stores, "ValidStoresRemaining should contain %s", stores)
	}
}

func TestGetWinterSeasonLabel(t *testing.T) {
	tests := []struct {
		season   int
		expected string
	}{
		{season: 2025, expected: "2025-2026"},
		{season: 2024, expected: "2024-2025"},
		{season: 2000, expected: "2000-2001"},
		{season: 2100, expected: "2100-2101"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := storage.GetWinterSeasonLabel(tt.season)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestOverwinteringRecordStruct verifies the struct has expected fields
func TestOverwinteringRecordStruct(t *testing.T) {
	record := storage.OverwinteringRecord{
		ID:           "test-id",
		TenantID:     "tenant-id",
		HiveID:       "hive-id",
		HiveName:     "Test Hive",
		WinterSeason: 2025,
		Survived:     true,
	}

	assert.Equal(t, "test-id", record.ID)
	assert.Equal(t, "tenant-id", record.TenantID)
	assert.Equal(t, "hive-id", record.HiveID)
	assert.Equal(t, "Test Hive", record.HiveName)
	assert.Equal(t, 2025, record.WinterSeason)
	assert.True(t, record.Survived)
	assert.Nil(t, record.Condition)
	assert.Nil(t, record.StoresRemaining)
	assert.Nil(t, record.FirstInspectionNotes)
}

// TestCreateOverwinteringInputStruct verifies the input struct
func TestCreateOverwinteringInputStruct(t *testing.T) {
	condition := "strong"
	stores := "adequate"
	notes := "Colony looks healthy"

	input := storage.CreateOverwinteringInput{
		HiveID:               "hive-id",
		WinterSeason:         2025,
		Survived:             true,
		Condition:            &condition,
		StoresRemaining:      &stores,
		FirstInspectionNotes: &notes,
	}

	assert.Equal(t, "hive-id", input.HiveID)
	assert.Equal(t, 2025, input.WinterSeason)
	assert.True(t, input.Survived)
	assert.Equal(t, "strong", *input.Condition)
	assert.Equal(t, "adequate", *input.StoresRemaining)
	assert.Equal(t, "Colony looks healthy", *input.FirstInspectionNotes)
}

// TestWinterReportStruct verifies the report struct fields
func TestWinterReportStruct(t *testing.T) {
	report := storage.WinterReport{
		WinterSeason:  2025,
		SeasonLabel:   "2025-2026",
		TotalHives:    3,
		SurvivedCount: 2,
		LostCount:     1,
		WeakCount:     0,
		SurvivalRate:  66.67,
		Is100Percent:  false,
		LostHives:     []storage.LostHiveSummary{},
		SurvivedHives: []storage.SurvivedHiveSummary{},
	}

	assert.Equal(t, 2025, report.WinterSeason)
	assert.Equal(t, "2025-2026", report.SeasonLabel)
	assert.Equal(t, 3, report.TotalHives)
	assert.Equal(t, 2, report.SurvivedCount)
	assert.Equal(t, 1, report.LostCount)
	assert.Equal(t, 0, report.WeakCount)
	assert.InDelta(t, 66.67, report.SurvivalRate, 0.01)
	assert.False(t, report.Is100Percent)
	assert.Nil(t, report.Comparison)
}

// TestWinterSurvivalTrendStruct verifies the trend struct fields
func TestWinterSurvivalTrendStruct(t *testing.T) {
	trend := storage.WinterSurvivalTrend{
		WinterSeason:  2025,
		SeasonLabel:   "2025-2026",
		SurvivalRate:  75.0,
		TotalHives:    4,
		SurvivedCount: 3,
	}

	assert.Equal(t, 2025, trend.WinterSeason)
	assert.Equal(t, "2025-2026", trend.SeasonLabel)
	assert.Equal(t, 75.0, trend.SurvivalRate)
	assert.Equal(t, 4, trend.TotalHives)
	assert.Equal(t, 3, trend.SurvivedCount)
}

// TestLostHiveSummaryStruct verifies the lost hive summary struct
func TestLostHiveSummaryStruct(t *testing.T) {
	summary := storage.LostHiveSummary{
		HiveID:        "hive-id",
		HiveName:      "Lost Hive",
		Cause:         "starvation",
		CauseDisplay:  "Starvation",
		HasPostMortem: true,
	}

	assert.Equal(t, "hive-id", summary.HiveID)
	assert.Equal(t, "Lost Hive", summary.HiveName)
	assert.Equal(t, "starvation", summary.Cause)
	assert.Equal(t, "Starvation", summary.CauseDisplay)
	assert.True(t, summary.HasPostMortem)
}

// TestSurvivedHiveSummaryStruct verifies the survived hive summary struct
func TestSurvivedHiveSummaryStruct(t *testing.T) {
	condition := "strong"
	stores := "adequate"
	notes := "Looking good"

	summary := storage.SurvivedHiveSummary{
		HiveID:               "hive-id",
		HiveName:             "Survived Hive",
		Condition:            &condition,
		ConditionDisplay:     "Strong",
		StoresRemaining:      &stores,
		StoresDisplay:        "Adequate",
		FirstInspectionNotes: &notes,
	}

	assert.Equal(t, "hive-id", summary.HiveID)
	assert.Equal(t, "Survived Hive", summary.HiveName)
	assert.Equal(t, "strong", *summary.Condition)
	assert.Equal(t, "Strong", summary.ConditionDisplay)
	assert.Equal(t, "adequate", *summary.StoresRemaining)
	assert.Equal(t, "Adequate", summary.StoresDisplay)
	assert.Equal(t, "Looking good", *summary.FirstInspectionNotes)
}

// TestWinterComparisonStruct verifies the comparison struct
func TestWinterComparisonStruct(t *testing.T) {
	comparison := storage.WinterComparison{
		PreviousSeason:       2024,
		PreviousSeasonLabel:  "2024-2025",
		PreviousSurvivalRate: 50.0,
		ChangePercent:        16.67,
		Improved:             true,
	}

	assert.Equal(t, 2024, comparison.PreviousSeason)
	assert.Equal(t, "2024-2025", comparison.PreviousSeasonLabel)
	assert.Equal(t, 50.0, comparison.PreviousSurvivalRate)
	assert.InDelta(t, 16.67, comparison.ChangePercent, 0.01)
	assert.True(t, comparison.Improved)
}

// Test100PercentSurvival verifies the Is100Percent flag
func Test100PercentSurvival(t *testing.T) {
	// When all hives survive
	report := storage.WinterReport{
		TotalHives:    3,
		SurvivedCount: 3,
		LostCount:     0,
		SurvivalRate:  100.0,
		Is100Percent:  true,
	}

	assert.Equal(t, report.TotalHives, report.SurvivedCount)
	assert.Equal(t, 0, report.LostCount)
	assert.True(t, report.Is100Percent)
	assert.Equal(t, 100.0, report.SurvivalRate)
}

// TestHiveWithOverwinteringRecordStruct verifies the hive with record struct
func TestHiveWithOverwinteringRecordStruct(t *testing.T) {
	// Hive without existing record
	hiveNoRecord := storage.HiveWithOverwinteringRecord{
		HiveID:         "hive-1",
		HiveName:       "Hive 1",
		ExistingRecord: nil,
	}

	assert.Equal(t, "hive-1", hiveNoRecord.HiveID)
	assert.Equal(t, "Hive 1", hiveNoRecord.HiveName)
	assert.Nil(t, hiveNoRecord.ExistingRecord)

	// Hive with existing record
	record := &storage.OverwinteringRecord{
		ID:           "record-id",
		HiveID:       "hive-2",
		WinterSeason: 2025,
		Survived:     true,
	}

	hiveWithRecord := storage.HiveWithOverwinteringRecord{
		HiveID:         "hive-2",
		HiveName:       "Hive 2",
		ExistingRecord: record,
	}

	assert.Equal(t, "hive-2", hiveWithRecord.HiveID)
	assert.Equal(t, "Hive 2", hiveWithRecord.HiveName)
	assert.NotNil(t, hiveWithRecord.ExistingRecord)
	assert.Equal(t, "record-id", hiveWithRecord.ExistingRecord.ID)
	assert.True(t, hiveWithRecord.ExistingRecord.Survived)
}
