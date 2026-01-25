// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestCreateInsightInput tests the CreateInsightInput struct.
func TestCreateInsightInput(t *testing.T) {
	hiveID := "hive-123"

	input := &storage.CreateInsightInput{
		HiveID:          &hiveID,
		RuleID:          "treatment_due",
		Severity:        "action-needed",
		Message:         "Varroa treatment due",
		SuggestedAction: "Schedule treatment",
		DataPoints: map[string]interface{}{
			"days_since_treatment": 95,
			"threshold_days":       90,
		},
	}

	// Verify required fields
	if input.RuleID != "treatment_due" {
		t.Errorf("expected RuleID 'treatment_due', got %q", input.RuleID)
	}
	if input.Severity != "action-needed" {
		t.Errorf("expected Severity 'action-needed', got %q", input.Severity)
	}
	if input.Message != "Varroa treatment due" {
		t.Errorf("expected Message 'Varroa treatment due', got %q", input.Message)
	}

	// Verify optional fields
	if input.HiveID == nil || *input.HiveID != "hive-123" {
		t.Error("expected HiveID 'hive-123'")
	}
	if input.DataPoints["days_since_treatment"] != 95 {
		t.Error("expected days_since_treatment=95 in DataPoints")
	}
}

// TestInsightStruct tests the Insight storage struct.
func TestInsightStruct(t *testing.T) {
	now := time.Now()
	hiveID := "hive-456"
	hiveName := "Test Hive"
	dismissedAt := now.Add(24 * time.Hour)
	snoozedUntil := now.Add(7 * 24 * time.Hour)

	insight := storage.Insight{
		ID:              "insight-1",
		TenantID:        "tenant-abc",
		HiveID:          &hiveID,
		HiveName:        &hiveName,
		RuleID:          "inspection_overdue",
		Severity:        "info",
		Message:         "Consider inspection",
		SuggestedAction: "Schedule inspection",
		DataPoints: map[string]interface{}{
			"days_since_inspection": 18,
			"threshold_days":        14,
		},
		CreatedAt:    now,
		DismissedAt:  &dismissedAt,
		SnoozedUntil: &snoozedUntil,
	}

	// Verify all fields
	if insight.ID != "insight-1" {
		t.Errorf("expected ID 'insight-1', got %q", insight.ID)
	}
	if insight.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", insight.TenantID)
	}
	if insight.HiveID == nil || *insight.HiveID != "hive-456" {
		t.Error("expected HiveID 'hive-456'")
	}
	if insight.HiveName == nil || *insight.HiveName != "Test Hive" {
		t.Error("expected HiveName 'Test Hive'")
	}
	if insight.RuleID != "inspection_overdue" {
		t.Errorf("expected RuleID 'inspection_overdue', got %q", insight.RuleID)
	}
	if insight.Severity != "info" {
		t.Errorf("expected Severity 'info', got %q", insight.Severity)
	}
	if insight.DismissedAt == nil {
		t.Error("expected DismissedAt to be set")
	}
	if insight.SnoozedUntil == nil {
		t.Error("expected SnoozedUntil to be set")
	}
}

// TestInsightWithNullOptionalFields tests insight with optional fields as nil.
func TestInsightWithNullOptionalFields(t *testing.T) {
	now := time.Now()

	// Tenant-wide insight (no hive)
	insight := storage.Insight{
		ID:              "insight-global",
		TenantID:        "tenant-1",
		HiveID:          nil,
		HiveName:        nil,
		RuleID:          "system_alert",
		Severity:        "warning",
		Message:         "System-wide alert",
		SuggestedAction: "Check system",
		DataPoints:      map[string]interface{}{},
		CreatedAt:       now,
		DismissedAt:     nil,
		SnoozedUntil:    nil,
	}

	// Verify optional fields are nil
	if insight.HiveID != nil {
		t.Error("expected HiveID to be nil")
	}
	if insight.HiveName != nil {
		t.Error("expected HiveName to be nil")
	}
	if insight.DismissedAt != nil {
		t.Error("expected DismissedAt to be nil")
	}
	if insight.SnoozedUntil != nil {
		t.Error("expected SnoozedUntil to be nil")
	}
}

// TestSeverityValues documents expected severity values.
func TestSeverityValues(t *testing.T) {
	expectedSeverities := map[string]bool{
		"info":          true,
		"warning":       true,
		"action-needed": true,
	}

	for severity := range expectedSeverities {
		if !expectedSeverities[severity] {
			t.Errorf("severity %q should be valid", severity)
		}
	}

	if len(expectedSeverities) != 3 {
		t.Errorf("expected 3 severity levels, got %d", len(expectedSeverities))
	}
}

// TestDataPointsJSONStructure tests the DataPoints JSONB field structure.
func TestDataPointsJSONStructure(t *testing.T) {
	// Test various data point types
	dataPoints := map[string]interface{}{
		"days_since_treatment": 95,
		"threshold_days":       90,
		"last_treatment_date":  "2025-10-15",
		"last_treatment_type":  "oxalic_acid",
		"queen_age_years":      2.5,
		"is_urgent":            true,
	}

	// Verify type assertions work
	if days, ok := dataPoints["days_since_treatment"].(int); !ok || days != 95 {
		t.Error("expected days_since_treatment=95 as int")
	}
	if date, ok := dataPoints["last_treatment_date"].(string); !ok || date != "2025-10-15" {
		t.Error("expected last_treatment_date as string")
	}
	if age, ok := dataPoints["queen_age_years"].(float64); !ok || age != 2.5 {
		t.Error("expected queen_age_years=2.5 as float64")
	}
	if urgent, ok := dataPoints["is_urgent"].(bool); !ok || !urgent {
		t.Error("expected is_urgent=true as bool")
	}
}

// TestRuleIDValues documents expected rule IDs from rules.yaml.
func TestRuleIDValues(t *testing.T) {
	expectedRuleIDs := []string{
		"queen_aging",
		"treatment_due",
		"inspection_overdue",
		"hornet_activity_spike",
	}

	if len(expectedRuleIDs) != 4 {
		t.Errorf("expected 4 rule IDs, got %d", len(expectedRuleIDs))
	}

	// Verify all expected rule IDs
	ruleIDMap := make(map[string]bool)
	for _, id := range expectedRuleIDs {
		ruleIDMap[id] = true
	}

	for _, expected := range []string{"queen_aging", "treatment_due", "inspection_overdue", "hornet_activity_spike"} {
		if !ruleIDMap[expected] {
			t.Errorf("expected rule ID %q not found", expected)
		}
	}
}

// TestInsightTimestamps tests timestamp handling in insights.
func TestInsightTimestamps(t *testing.T) {
	now := time.Now()
	created := now.Add(-24 * time.Hour)     // Created yesterday
	snoozed := now.Add(7 * 24 * time.Hour)  // Snoozed for 7 days
	dismissed := now.Add(-1 * time.Hour)    // Dismissed an hour ago

	insight := storage.Insight{
		ID:           "insight-ts",
		TenantID:     "tenant-1",
		RuleID:       "test",
		Severity:     "info",
		Message:      "Test",
		CreatedAt:    created,
		SnoozedUntil: &snoozed,
		DismissedAt:  &dismissed,
	}

	// Verify timestamps
	if !insight.CreatedAt.Equal(created) {
		t.Errorf("expected CreatedAt %v, got %v", created, insight.CreatedAt)
	}
	if insight.SnoozedUntil == nil || !insight.SnoozedUntil.Equal(snoozed) {
		t.Errorf("expected SnoozedUntil %v", snoozed)
	}
	if insight.DismissedAt == nil || !insight.DismissedAt.Equal(dismissed) {
		t.Errorf("expected DismissedAt %v", dismissed)
	}

	// Verify relative timing
	if !insight.CreatedAt.Before(now) {
		t.Error("CreatedAt should be before now")
	}
	if !insight.SnoozedUntil.After(now) {
		t.Error("SnoozedUntil should be after now")
	}
	if !insight.DismissedAt.Before(now) {
		t.Error("DismissedAt should be before now")
	}
}
