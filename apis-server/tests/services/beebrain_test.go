// Package services_test contains unit tests for the APIS server services.
package services_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/beebrain"
	"github.com/jermoo/apis/apis-server/internal/services"
)

// TestRulesLoaderCreation tests creating a rules loader with a valid config.
func TestRulesLoaderCreation(t *testing.T) {
	// Create a temporary rules file
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	rulesContent := `rules:
  - id: test_rule
    name: Test Rule
    description: A test rule
    condition:
      type: days_since_treatment
      params:
        max_days: 90
    severity: warning
    message_template: "Test message"
    suggested_action: "Take action"
`
	if err := os.WriteFile(rulesPath, []byte(rulesContent), 0644); err != nil {
		t.Fatalf("failed to write rules file: %v", err)
	}

	loader, err := beebrain.NewRulesLoader(rulesPath)
	if err != nil {
		t.Fatalf("failed to create rules loader: %v", err)
	}

	rules := loader.GetRules()
	if len(rules) != 1 {
		t.Errorf("expected 1 rule, got %d", len(rules))
	}

	if rules[0].ID != "test_rule" {
		t.Errorf("expected rule ID 'test_rule', got %q", rules[0].ID)
	}
}

// TestRulesLoaderInvalidFile tests creating a rules loader with an invalid file.
func TestRulesLoaderInvalidFile(t *testing.T) {
	_, err := beebrain.NewRulesLoader("/nonexistent/path/rules.yaml")
	if err == nil {
		t.Error("expected error for nonexistent file, got nil")
	}
}

// TestRulesLoaderInvalidYAML tests creating a rules loader with invalid YAML.
func TestRulesLoaderInvalidYAML(t *testing.T) {
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	invalidYAML := `not: valid: yaml: content`
	if err := os.WriteFile(rulesPath, []byte(invalidYAML), 0644); err != nil {
		t.Fatalf("failed to write rules file: %v", err)
	}

	_, err := beebrain.NewRulesLoader(rulesPath)
	if err == nil {
		t.Error("expected error for invalid YAML, got nil")
	}
}

// TestRulesLoaderMissingRuleID tests validation for missing rule ID.
func TestRulesLoaderMissingRuleID(t *testing.T) {
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	rulesContent := `rules:
  - name: Test Rule
    condition:
      type: days_since_treatment
    severity: warning
    message_template: "Test"
`
	if err := os.WriteFile(rulesPath, []byte(rulesContent), 0644); err != nil {
		t.Fatalf("failed to write rules file: %v", err)
	}

	_, err := beebrain.NewRulesLoader(rulesPath)
	if err == nil {
		t.Error("expected error for missing rule ID, got nil")
	}
}

// TestRulesLoaderInvalidSeverity tests validation for invalid severity.
func TestRulesLoaderInvalidSeverity(t *testing.T) {
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	rulesContent := `rules:
  - id: test_rule
    name: Test Rule
    condition:
      type: days_since_treatment
    severity: critical
    message_template: "Test"
`
	if err := os.WriteFile(rulesPath, []byte(rulesContent), 0644); err != nil {
		t.Fatalf("failed to write rules file: %v", err)
	}

	_, err := beebrain.NewRulesLoader(rulesPath)
	if err == nil {
		t.Error("expected error for invalid severity, got nil")
	}
}

// TestRuleConditionParamGetters tests the parameter getter methods.
func TestRuleConditionParamGetters(t *testing.T) {
	condition := beebrain.RuleCondition{
		Type: "test",
		Params: map[string]interface{}{
			"int_param":    90,
			"float_param":  2.5,
			"string_param": "hello",
			"int_as_float": 10.0, // YAML often parses integers as floats
		},
	}

	// Test GetParamInt
	intVal, ok := condition.GetParamInt("int_param")
	if !ok || intVal != 90 {
		t.Errorf("expected int_param=90, got %d (ok=%v)", intVal, ok)
	}

	// Test GetParamInt with float (should convert)
	intFromFloat, ok := condition.GetParamInt("int_as_float")
	if !ok || intFromFloat != 10 {
		t.Errorf("expected int_as_float=10, got %d (ok=%v)", intFromFloat, ok)
	}

	// Test GetParamFloat
	floatVal, ok := condition.GetParamFloat("float_param")
	if !ok || floatVal != 2.5 {
		t.Errorf("expected float_param=2.5, got %f (ok=%v)", floatVal, ok)
	}

	// Test GetParamString
	strVal, ok := condition.GetParamString("string_param")
	if !ok || strVal != "hello" {
		t.Errorf("expected string_param='hello', got %q (ok=%v)", strVal, ok)
	}

	// Test missing param
	_, ok = condition.GetParamInt("nonexistent")
	if ok {
		t.Error("expected ok=false for nonexistent param")
	}
}

// TestRulesHotReload tests that rules are reloaded when file changes.
func TestRulesHotReload(t *testing.T) {
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	// Create initial rules file
	initialRules := `rules:
  - id: rule_v1
    name: Rule V1
    condition:
      type: days_since_treatment
      params:
        max_days: 90
    severity: warning
    message_template: "Test"
    suggested_action: "Do something"
`
	if err := os.WriteFile(rulesPath, []byte(initialRules), 0644); err != nil {
		t.Fatalf("failed to write initial rules file: %v", err)
	}

	loader, err := beebrain.NewRulesLoader(rulesPath)
	if err != nil {
		t.Fatalf("failed to create rules loader: %v", err)
	}

	rules := loader.GetRules()
	if len(rules) != 1 || rules[0].ID != "rule_v1" {
		t.Errorf("expected initial rule 'rule_v1', got %v", rules)
	}

	// Update the rules file
	updatedRules := `rules:
  - id: rule_v2
    name: Rule V2
    condition:
      type: days_since_inspection
      params:
        max_days: 14
    severity: info
    message_template: "Updated test"
    suggested_action: "Do something else"
  - id: rule_v2b
    name: Rule V2b
    condition:
      type: days_since_treatment
      params:
        max_days: 60
    severity: action-needed
    message_template: "Another rule"
    suggested_action: "Act now"
`
	if err := os.WriteFile(rulesPath, []byte(updatedRules), 0644); err != nil {
		t.Fatalf("failed to write updated rules file: %v", err)
	}

	// Get rules again - should trigger reload
	rules = loader.GetRules()
	if len(rules) != 2 {
		t.Errorf("expected 2 rules after reload, got %d", len(rules))
	}
	if rules[0].ID != "rule_v2" {
		t.Errorf("expected first rule 'rule_v2', got %q", rules[0].ID)
	}
}

// TestBeeBrainServiceCreation tests creating a BeeBrain service.
func TestBeeBrainServiceCreation(t *testing.T) {
	tmpDir := t.TempDir()
	rulesPath := filepath.Join(tmpDir, "rules.yaml")

	rulesContent := `rules:
  - id: test_rule
    name: Test Rule
    condition:
      type: days_since_treatment
      params:
        max_days: 90
    severity: warning
    message_template: "Test"
    suggested_action: "Test action"
`
	if err := os.WriteFile(rulesPath, []byte(rulesContent), 0644); err != nil {
		t.Fatalf("failed to write rules file: %v", err)
	}

	service, err := services.NewBeeBrainService(rulesPath)
	if err != nil {
		t.Fatalf("failed to create BeeBrain service: %v", err)
	}

	if service == nil {
		t.Error("expected non-nil service")
	}
}

// TestBeeBrainServiceCreationInvalidPath tests error handling for invalid rules path.
func TestBeeBrainServiceCreationInvalidPath(t *testing.T) {
	_, err := services.NewBeeBrainService("/nonexistent/rules.yaml")
	if err == nil {
		t.Error("expected error for invalid rules path, got nil")
	}
}

// TestInsightStruct tests the Insight struct fields.
func TestInsightStruct(t *testing.T) {
	hiveID := "hive-123"
	hiveName := "Test Hive"

	insight := services.Insight{
		ID:              "insight-1",
		HiveID:          &hiveID,
		HiveName:        &hiveName,
		RuleID:          "treatment_due",
		Severity:        "action-needed",
		Message:         "Test Hive: Treatment due (95 days since last treatment)",
		SuggestedAction: "Schedule treatment",
		DataPoints: map[string]interface{}{
			"days_since_treatment": 95,
			"threshold_days":       90,
		},
	}

	if insight.ID != "insight-1" {
		t.Errorf("expected ID 'insight-1', got %q", insight.ID)
	}
	if insight.HiveID == nil || *insight.HiveID != "hive-123" {
		t.Error("expected HiveID 'hive-123'")
	}
	if insight.Severity != "action-needed" {
		t.Errorf("expected severity 'action-needed', got %q", insight.Severity)
	}
	if insight.DataPoints["days_since_treatment"] != 95 {
		t.Error("expected days_since_treatment=95 in data points")
	}
}

// TestAnalysisResultStruct tests the AnalysisResult struct.
func TestAnalysisResultStruct(t *testing.T) {
	result := services.AnalysisResult{
		Summary:  "All looks good. No actions needed.",
		Insights: []services.Insight{},
		AllGood:  true,
	}

	if result.Summary != "All looks good. No actions needed." {
		t.Errorf("unexpected summary: %q", result.Summary)
	}
	if !result.AllGood {
		t.Error("expected AllGood=true")
	}
	if len(result.Insights) != 0 {
		t.Errorf("expected 0 insights, got %d", len(result.Insights))
	}
}

// TestHiveAnalysisResultStruct tests the HiveAnalysisResult struct.
func TestHiveAnalysisResultStruct(t *testing.T) {
	result := services.HiveAnalysisResult{
		HiveID:           "hive-1",
		HiveName:         "My Hive",
		HealthAssessment: "Excellent - No issues detected",
		Insights:         []services.Insight{},
		Recommendations:  []string{},
	}

	if result.HiveID != "hive-1" {
		t.Errorf("expected HiveID 'hive-1', got %q", result.HiveID)
	}
	if result.HealthAssessment != "Excellent - No issues detected" {
		t.Errorf("unexpected health assessment: %q", result.HealthAssessment)
	}
}

// TestValidSeverityLevels documents expected severity levels.
func TestValidSeverityLevels(t *testing.T) {
	validSeverities := []string{"info", "warning", "action-needed"}

	for _, severity := range validSeverities {
		// Just verify the values are what we expect
		switch severity {
		case "info", "warning", "action-needed":
			// valid
		default:
			t.Errorf("unexpected severity level: %q", severity)
		}
	}

	if len(validSeverities) != 3 {
		t.Errorf("expected 3 severity levels, got %d", len(validSeverities))
	}
}

// TestRuleConditionTypes documents expected condition types.
func TestRuleConditionTypes(t *testing.T) {
	expectedTypes := []string{
		"queen_age_productivity",
		"days_since_treatment",
		"days_since_inspection",
		"detection_spike",
	}

	if len(expectedTypes) != 4 {
		t.Errorf("expected 4 condition types, got %d", len(expectedTypes))
	}

	// Verify all expected types are present
	typeMap := make(map[string]bool)
	for _, ct := range expectedTypes {
		typeMap[ct] = true
	}

	for _, expected := range []string{"queen_age_productivity", "days_since_treatment", "days_since_inspection", "detection_spike"} {
		if !typeMap[expected] {
			t.Errorf("expected condition type %q not found", expected)
		}
	}
}
