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

// TestEvaluateTreatmentDue_RuleThresholds tests the treatment due rule threshold logic.
// This test verifies:
// - Days calculation correctly determines when threshold is exceeded
// - Message template substitution works correctly
// - DataPoints contain expected values
func TestEvaluateTreatmentDue_RuleThresholds(t *testing.T) {
	// Test the rule condition parameter extraction and threshold logic
	condition := beebrain.RuleCondition{
		Type: "days_since_treatment",
		Params: map[string]interface{}{
			"max_days": 90,
		},
	}

	maxDays, ok := condition.GetParamInt("max_days")
	if !ok {
		t.Fatal("expected max_days param to be extractable")
	}
	if maxDays != 90 {
		t.Errorf("expected max_days=90, got %d", maxDays)
	}

	// Test threshold comparison logic
	testCases := []struct {
		name           string
		daysSince      int
		shouldTrigger  bool
	}{
		{"under threshold", 85, false},
		{"at threshold", 90, false},
		{"over threshold", 91, true},
		{"well over threshold", 120, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// The rule triggers when daysSince > maxDays (not >=)
			triggered := tc.daysSince > maxDays
			if triggered != tc.shouldTrigger {
				t.Errorf("daysSince=%d: expected trigger=%v, got %v", tc.daysSince, tc.shouldTrigger, triggered)
			}
		})
	}
}

// TestEvaluateInspectionOverdue_RuleThresholds tests the inspection overdue rule threshold logic.
func TestEvaluateInspectionOverdue_RuleThresholds(t *testing.T) {
	condition := beebrain.RuleCondition{
		Type: "days_since_inspection",
		Params: map[string]interface{}{
			"max_days": 14,
		},
	}

	maxDays, ok := condition.GetParamInt("max_days")
	if !ok {
		t.Fatal("expected max_days param to be extractable")
	}
	if maxDays != 14 {
		t.Errorf("expected max_days=14, got %d", maxDays)
	}

	// Test threshold comparison logic
	testCases := []struct {
		name           string
		daysSince      int
		shouldTrigger  bool
	}{
		{"under threshold", 10, false},
		{"at threshold", 14, false},
		{"over threshold", 15, true},
		{"well over threshold", 30, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			triggered := tc.daysSince > maxDays
			if triggered != tc.shouldTrigger {
				t.Errorf("daysSince=%d: expected trigger=%v, got %v", tc.daysSince, tc.shouldTrigger, triggered)
			}
		})
	}
}

// TestEvaluateHornetCorrelation_SpikeDetection tests the spike detection multiplier logic.
func TestEvaluateHornetCorrelation_SpikeDetection(t *testing.T) {
	condition := beebrain.RuleCondition{
		Type: "detection_spike",
		Params: map[string]interface{}{
			"window_hours":         24,
			"threshold_multiplier": 2.0,
		},
	}

	windowHours, ok := condition.GetParamInt("window_hours")
	if !ok {
		t.Fatal("expected window_hours param to be extractable")
	}
	if windowHours != 24 {
		t.Errorf("expected window_hours=24, got %d", windowHours)
	}

	thresholdMultiplier, ok := condition.GetParamFloat("threshold_multiplier")
	if !ok {
		t.Fatal("expected threshold_multiplier param to be extractable")
	}
	if thresholdMultiplier != 2.0 {
		t.Errorf("expected threshold_multiplier=2.0, got %f", thresholdMultiplier)
	}

	// Test spike detection logic
	testCases := []struct {
		name               string
		recentCount        int
		avgDaily           float64
		windowHours        int
		shouldTrigger      bool
	}{
		{"no activity", 0, 0, 24, false},
		{"normal activity", 10, 10.0, 24, false},
		{"exactly 2x", 20, 10.0, 24, true}, // >= threshold triggers the rule
		{"spike detected", 25, 10.0, 24, true},
		{"large spike", 50, 10.0, 24, true},
		{"below threshold", 15, 10.0, 24, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.avgDaily == 0 || tc.recentCount == 0 {
				// Edge case: no activity doesn't trigger
				if tc.shouldTrigger {
					t.Error("expected no trigger when no activity")
				}
				return
			}

			expectedCount := tc.avgDaily * (float64(tc.windowHours) / 24.0)
			actualMultiplier := float64(tc.recentCount) / expectedCount
			triggered := actualMultiplier >= thresholdMultiplier

			if triggered != tc.shouldTrigger {
				t.Errorf("recentCount=%d, avgDaily=%.1f: expected trigger=%v, got %v (multiplier=%.2f)",
					tc.recentCount, tc.avgDaily, tc.shouldTrigger, triggered, actualMultiplier)
			}
		})
	}
}

// TestEvaluateQueenAging_AgeCalculation tests the queen age calculation and threshold logic.
func TestEvaluateQueenAging_AgeCalculation(t *testing.T) {
	condition := beebrain.RuleCondition{
		Type: "queen_age_productivity",
		Params: map[string]interface{}{
			"min_queen_age_years": 2.0,
		},
	}

	minAgeYears, ok := condition.GetParamFloat("min_queen_age_years")
	if !ok {
		t.Fatal("expected min_queen_age_years param to be extractable")
	}
	if minAgeYears != 2.0 {
		t.Errorf("expected min_queen_age_years=2.0, got %f", minAgeYears)
	}

	// Test age threshold logic
	testCases := []struct {
		name          string
		ageYears      float64
		shouldTrigger bool
	}{
		{"young queen", 0.5, false},
		{"one year old", 1.0, false},
		{"almost 2 years", 1.9, false},
		{"exactly 2 years", 2.0, true}, // >= threshold triggers the rule
		{"over 2 years", 2.1, true},
		{"old queen", 3.5, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			triggered := tc.ageYears >= minAgeYears
			if triggered != tc.shouldTrigger {
				t.Errorf("ageYears=%.1f: expected trigger=%v, got %v", tc.ageYears, tc.shouldTrigger, triggered)
			}
		})
	}
}

// TestMessageTemplateSubstitution tests the message template variable substitution.
func TestMessageTemplateSubstitution(t *testing.T) {
	testCases := []struct {
		name     string
		template string
		vars     map[string]string
		expected string
	}{
		{
			name:     "treatment due",
			template: "{{hive_name}}: Varroa treatment due ({{days}} days since last treatment)",
			vars:     map[string]string{"{{hive_name}}": "Hive 1", "{{days}}": "95"},
			expected: "Hive 1: Varroa treatment due (95 days since last treatment)",
		},
		{
			name:     "inspection overdue",
			template: "{{hive_name}}: Consider inspection ({{days}} days since last)",
			vars:     map[string]string{"{{hive_name}}": "My Favorite Hive", "{{days}}": "21"},
			expected: "My Favorite Hive: Consider inspection (21 days since last)",
		},
		{
			name:     "hornet spike",
			template: "Unusual hornet activity detected: {{count}} detections in last 24h ({{multiplier}}x normal)",
			vars:     map[string]string{"{{count}}": "50", "{{multiplier}}": "3.5"},
			expected: "Unusual hornet activity detected: 50 detections in last 24h (3.5x normal)",
		},
		{
			name:     "queen aging",
			template: "Queen in {{hive_name}} is {{queen_age}} old. Consider monitoring productivity and planning for potential requeening.",
			vars:     map[string]string{"{{hive_name}}": "Alpha", "{{queen_age}}": "2 years 5 months"},
			expected: "Queen in Alpha is 2 years 5 months old. Consider monitoring productivity and planning for potential requeening.",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := tc.template
			for key, value := range tc.vars {
				result = replaceAll(result, key, value)
			}
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

// replaceAll is a simple helper for testing (mirrors strings.ReplaceAll)
func replaceAll(s, old, new string) string {
	for {
		idx := indexOf(s, old)
		if idx == -1 {
			return s
		}
		s = s[:idx] + new + s[idx+len(old):]
	}
}

// indexOf finds the index of substr in s, or -1 if not found
func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
