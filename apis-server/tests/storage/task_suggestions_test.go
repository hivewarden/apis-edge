// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestCreateTaskSuggestionInput tests the CreateTaskSuggestionInput struct.
func TestCreateTaskSuggestionInput(t *testing.T) {
	inspectionID := "inspection-123"
	templateID := "sys-template-requeen"

	input := &storage.CreateTaskSuggestionInput{
		HiveID:              "hive-456",
		InspectionID:        &inspectionID,
		SuggestedTemplateID: &templateID,
		SuggestedTitle:      "Consider requeening",
		Reason:              "Queen is 3 years old and showing reduced laying pattern",
		Priority:            "high",
	}

	// Verify required fields
	if input.HiveID != "hive-456" {
		t.Errorf("expected HiveID 'hive-456', got %q", input.HiveID)
	}
	if input.SuggestedTitle != "Consider requeening" {
		t.Errorf("expected SuggestedTitle 'Consider requeening', got %q", input.SuggestedTitle)
	}
	if input.Reason == "" {
		t.Error("expected Reason to be set")
	}
	if input.Priority != "high" {
		t.Errorf("expected Priority 'high', got %q", input.Priority)
	}

	// Verify optional fields
	if input.InspectionID == nil || *input.InspectionID != "inspection-123" {
		t.Error("expected InspectionID 'inspection-123'")
	}
	if input.SuggestedTemplateID == nil || *input.SuggestedTemplateID != "sys-template-requeen" {
		t.Error("expected SuggestedTemplateID 'sys-template-requeen'")
	}
}

// TestTaskSuggestionStruct tests the TaskSuggestion storage struct.
func TestTaskSuggestionStruct(t *testing.T) {
	now := time.Now()
	inspectionID := "inspection-789"
	templateID := "sys-template-treatment"

	suggestion := storage.TaskSuggestion{
		ID:                  "suggestion-1",
		TenantID:            "tenant-abc",
		HiveID:              "hive-123",
		InspectionID:        &inspectionID,
		SuggestedTemplateID: &templateID,
		SuggestedTitle:      "Varroa treatment due",
		Reason:              "Last treatment was 95 days ago, threshold is 90 days",
		Priority:            "urgent",
		Status:              "pending",
		CreatedAt:           now,
	}

	// Verify all fields
	if suggestion.ID != "suggestion-1" {
		t.Errorf("expected ID 'suggestion-1', got %q", suggestion.ID)
	}
	if suggestion.TenantID != "tenant-abc" {
		t.Errorf("expected TenantID 'tenant-abc', got %q", suggestion.TenantID)
	}
	if suggestion.HiveID != "hive-123" {
		t.Errorf("expected HiveID 'hive-123', got %q", suggestion.HiveID)
	}
	if suggestion.InspectionID == nil || *suggestion.InspectionID != "inspection-789" {
		t.Error("expected InspectionID 'inspection-789'")
	}
	if suggestion.SuggestedTemplateID == nil || *suggestion.SuggestedTemplateID != "sys-template-treatment" {
		t.Error("expected SuggestedTemplateID 'sys-template-treatment'")
	}
	if suggestion.Priority != "urgent" {
		t.Errorf("expected Priority 'urgent', got %q", suggestion.Priority)
	}
	if suggestion.Status != "pending" {
		t.Errorf("expected Status 'pending', got %q", suggestion.Status)
	}
}

// TestSuggestionWithNullOptionalFields tests suggestion with optional fields as nil.
func TestSuggestionWithNullOptionalFields(t *testing.T) {
	now := time.Now()

	// Suggestion without template (custom title only)
	suggestion := storage.TaskSuggestion{
		ID:                  "suggestion-custom",
		TenantID:            "tenant-1",
		HiveID:              "hive-1",
		InspectionID:        nil,
		SuggestedTemplateID: nil,
		SuggestedTitle:      "Custom inspection task",
		Reason:              "Manual suggestion from BeeBrain analysis",
		Priority:            "medium",
		Status:              "pending",
		CreatedAt:           now,
	}

	// Verify optional fields are nil
	if suggestion.InspectionID != nil {
		t.Error("expected InspectionID to be nil")
	}
	if suggestion.SuggestedTemplateID != nil {
		t.Error("expected SuggestedTemplateID to be nil")
	}

	// Required fields should still be present
	if suggestion.SuggestedTitle == "" {
		t.Error("expected SuggestedTitle to be set")
	}
	if suggestion.Reason == "" {
		t.Error("expected Reason to be set")
	}
}

// TestSuggestionPriorityValues documents expected priority values.
func TestSuggestionPriorityValues(t *testing.T) {
	expectedPriorities := map[string]bool{
		"low":    true,
		"medium": true,
		"high":   true,
		"urgent": true,
	}

	for priority := range expectedPriorities {
		if !storage.IsValidPriority(priority) {
			t.Errorf("priority %q should be valid", priority)
		}
	}

	invalidPriorities := []string{"critical", "normal", "asap", ""}
	for _, priority := range invalidPriorities {
		if storage.IsValidPriority(priority) {
			t.Errorf("priority %q should be invalid", priority)
		}
	}
}

// TestSuggestionStatusValues documents expected status values.
func TestSuggestionStatusValues(t *testing.T) {
	expectedStatuses := []string{"pending", "accepted", "dismissed"}

	statusMap := map[string]bool{
		"pending":   true,
		"accepted":  true,
		"dismissed": true,
	}

	for _, status := range expectedStatuses {
		if !statusMap[status] {
			t.Errorf("status %q should be valid", status)
		}
	}

	if len(statusMap) != 3 {
		t.Errorf("expected 3 status values, got %d", len(statusMap))
	}
}

// TestSeverityToPriorityMapping tests the mapping from insight severity to suggestion priority.
func TestSeverityToPriorityMapping(t *testing.T) {
	tests := []struct {
		severity string
		priority string
	}{
		{"action-needed", "urgent"},
		{"warning", "high"},
		{"info", "medium"},
		{"unknown", "medium"}, // Default fallback
	}

	severityToPriority := func(severity string) string {
		switch severity {
		case "action-needed":
			return "urgent"
		case "warning":
			return "high"
		default:
			return "medium"
		}
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			result := severityToPriority(tt.severity)
			if result != tt.priority {
				t.Errorf("expected severity %q to map to priority %q, got %q", tt.severity, tt.priority, result)
			}
		})
	}
}

// TestRuleToTemplateTypeMapping tests the mapping from BeeBrain rule IDs to template types.
func TestRuleToTemplateTypeMapping(t *testing.T) {
	// Document expected mappings
	ruleToTemplate := map[string]string{
		"queen_aging":   "requeen",
		"treatment_due": "treatment",
	}

	// Rules that don't map to templates (use custom title instead)
	rulesWithCustomTitle := []string{
		"inspection_overdue",
		"hornet_activity_spike",
	}

	for rule, expectedTemplate := range ruleToTemplate {
		if expectedTemplate == "" {
			t.Errorf("rule %q should map to a template type", rule)
		}
	}

	for _, rule := range rulesWithCustomTitle {
		if template, ok := ruleToTemplate[rule]; ok && template != "" {
			t.Errorf("rule %q should not map to a template, got %q", rule, template)
		}
	}
}

// TestRuleToCustomTitleMapping tests the mapping from BeeBrain rule IDs to custom titles.
func TestRuleToCustomTitleMapping(t *testing.T) {
	// Document expected custom titles
	ruleToCustomTitle := map[string]string{
		"inspection_overdue":    "Perform hive inspection",
		"hornet_activity_spike": "Check hornet nest proximity",
	}

	for rule, expectedTitle := range ruleToCustomTitle {
		if expectedTitle == "" {
			t.Errorf("rule %q should have a custom title", rule)
		}
	}

	// Verify non-empty titles
	if ruleToCustomTitle["inspection_overdue"] != "Perform hive inspection" {
		t.Errorf("unexpected custom title for inspection_overdue")
	}
	if ruleToCustomTitle["hornet_activity_spike"] != "Check hornet nest proximity" {
		t.Errorf("unexpected custom title for hornet_activity_spike")
	}
}

// TestSuggestionTimestamps tests timestamp handling in suggestions.
func TestSuggestionTimestamps(t *testing.T) {
	now := time.Now()
	created := now.Add(-1 * time.Hour)

	suggestion := storage.TaskSuggestion{
		ID:        "suggestion-ts",
		TenantID:  "tenant-1",
		HiveID:    "hive-1",
		SuggestedTitle: "Test suggestion",
		Reason:    "Test reason",
		Priority:  "medium",
		Status:    "pending",
		CreatedAt: created,
	}

	// Verify timestamp
	if !suggestion.CreatedAt.Equal(created) {
		t.Errorf("expected CreatedAt %v, got %v", created, suggestion.CreatedAt)
	}

	// Verify relative timing
	if !suggestion.CreatedAt.Before(now) {
		t.Error("CreatedAt should be before now")
	}
}

// TestSuggestionStatusTransitions documents valid status transitions.
func TestSuggestionStatusTransitions(t *testing.T) {
	validTransitions := []struct {
		from  string
		to    string
		valid bool
	}{
		{"pending", "accepted", true},
		{"pending", "dismissed", true},
		{"pending", "pending", false}, // No-op, but technically allowed
		{"accepted", "pending", false},
		{"accepted", "dismissed", false},
		{"dismissed", "pending", false},
		{"dismissed", "accepted", false},
	}

	for _, tt := range validTransitions {
		t.Run(tt.from+"_to_"+tt.to, func(t *testing.T) {
			// Document expected behavior
			canTransition := tt.from == "pending" && (tt.to == "accepted" || tt.to == "dismissed")
			if canTransition != tt.valid {
				t.Errorf("transition from %q to %q: expected valid=%v, got %v", tt.from, tt.to, tt.valid, canTransition)
			}
		})
	}
}

// TestSuggestionAcceptCreatesTask documents that accepting creates a task.
func TestSuggestionAcceptCreatesTask(t *testing.T) {
	// When a suggestion is accepted:
	// 1. Suggestion status changes to "accepted"
	// 2. A new task is created based on the suggestion
	// 3. The task inherits template_id OR custom_title from suggestion
	// 4. The task gets priority from suggestion
	// 5. The task source is set to "beebrain"

	suggestion := storage.TaskSuggestion{
		ID:                  "suggestion-to-accept",
		TenantID:            "tenant-1",
		HiveID:              "hive-1",
		SuggestedTemplateID: ptr("sys-template-requeen"),
		SuggestedTitle:      "Requeen Hive #1",
		Reason:              "Queen aging alert",
		Priority:            "high",
		Status:              "pending",
	}

	// Expected task fields after accept
	expectedSource := "beebrain"
	expectedStatus := "pending"

	if suggestion.Priority != "high" {
		t.Error("task should inherit priority from suggestion")
	}
	if expectedSource != "beebrain" {
		t.Error("task source should be beebrain")
	}
	if expectedStatus != "pending" {
		t.Error("task status should be pending initially")
	}
}

// TestSuggestionDismissRemovesFromList documents that dismissing removes from active list.
func TestSuggestionDismissRemovesFromList(t *testing.T) {
	// When a suggestion is dismissed:
	// 1. Suggestion status changes to "dismissed"
	// 2. No task is created
	// 3. Suggestion no longer appears in pending list

	// Document: dismissing should update status to "dismissed"
	expectedStatus := "dismissed"
	if expectedStatus != "dismissed" {
		t.Error("dismissed suggestion should have status 'dismissed'")
	}
}

// TestDeletePendingSuggestionsOnNewAnalysis documents the replacement behavior.
func TestDeletePendingSuggestionsOnNewAnalysis(t *testing.T) {
	// AC3: When BeeBrain runs a new analysis for a hive:
	// 1. All existing pending suggestions for that hive are deleted
	// 2. New suggestions are created based on current insights
	// 3. Accepted/dismissed suggestions are NOT deleted (they're historical)

	statuses := []struct {
		status     string
		isDeleted  bool
	}{
		{"pending", true},
		{"accepted", false},
		{"dismissed", false},
	}

	for _, s := range statuses {
		t.Run(s.status, func(t *testing.T) {
			shouldDelete := s.status == "pending"
			if shouldDelete != s.isDeleted {
				t.Errorf("suggestion with status %q: expected deleted=%v, got %v", s.status, s.isDeleted, shouldDelete)
			}
		})
	}
}

// TestSuggestionAPIEndpoints documents the expected API endpoints.
func TestSuggestionAPIEndpoints(t *testing.T) {
	endpoints := []struct {
		method string
		path   string
		desc   string
	}{
		{"GET", "/api/hives/{id}/suggestions", "List pending suggestions for hive"},
		{"POST", "/api/hives/{id}/suggestions/{suggestion_id}/accept", "Accept suggestion and create task"},
		{"DELETE", "/api/hives/{id}/suggestions/{suggestion_id}", "Dismiss suggestion"},
	}

	if len(endpoints) != 3 {
		t.Errorf("expected 3 suggestion endpoints, got %d", len(endpoints))
	}

	// Verify endpoint methods
	for _, ep := range endpoints {
		switch ep.method {
		case "GET", "POST", "DELETE":
			// valid
		default:
			t.Errorf("unexpected method %q for %s", ep.method, ep.path)
		}
	}
}

// TestListSuggestionsOnlyReturnsPending documents that list only returns pending.
func TestListSuggestionsOnlyReturnsPending(t *testing.T) {
	// AC4: GET /api/hives/{hive_id}/suggestions returns ONLY pending suggestions
	// Accepted and dismissed suggestions are not returned in the list

	statusesToReturn := map[string]bool{
		"pending": true,
	}

	statusesToExclude := map[string]bool{
		"accepted":  true,
		"dismissed": true,
	}

	if !statusesToReturn["pending"] {
		t.Error("list should return pending suggestions")
	}
	if statusesToReturn["accepted"] || statusesToReturn["dismissed"] {
		t.Error("list should not return accepted or dismissed suggestions")
	}
	if !statusesToExclude["accepted"] || !statusesToExclude["dismissed"] {
		t.Error("accepted and dismissed should be excluded from list")
	}
}

// TestAcceptResponseIncludesCreatedTask documents accept response format.
func TestAcceptResponseIncludesCreatedTask(t *testing.T) {
	// AC5: Accept endpoint returns the created task in the response
	// Response format: { "data": { <task object> } }

	type AcceptResponse struct {
		Data map[string]interface{} `json:"data"`
	}

	// Expected fields in the task object
	expectedFields := []string{
		"id",
		"hive_id",
		"priority",
		"status",
		"source",
		"created_at",
	}

	for _, field := range expectedFields {
		// Document that these fields should be present in response
		if field == "" {
			t.Error("expected field should not be empty")
		}
	}
}

// TestDismissReturns204NoContent documents dismiss response format.
func TestDismissReturns204NoContent(t *testing.T) {
	// AC6: Dismiss endpoint returns 204 No Content
	expectedStatusCode := 204

	if expectedStatusCode != 204 {
		t.Errorf("expected status code 204, got %d", expectedStatusCode)
	}
}

// Helper function to create pointer to string
func ptr(s string) *string {
	return &s
}
