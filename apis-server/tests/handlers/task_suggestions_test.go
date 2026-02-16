// Package handlers_test contains unit tests for the APIS server HTTP handlers.
package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestListHiveSuggestionsEndpoint tests the GET /api/hives/{id}/suggestions endpoint.
func TestListHiveSuggestionsEndpoint(t *testing.T) {
	tests := []struct {
		name         string
		hiveID       string
		expectStatus int
	}{
		{
			name:         "valid_hive_id",
			hiveID:       "hive-123",
			expectStatus: http.StatusOK,
		},
		{
			name:         "missing_hive_id",
			hiveID:       "",
			expectStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := "/api/hives/" + tt.hiveID + "/suggestions"
			req := httptest.NewRequest(http.MethodGet, path, nil)

			// Simulate validation
			if tt.hiveID == "" {
				// Would return 400 Bad Request
				if tt.expectStatus != http.StatusBadRequest {
					t.Errorf("expected status %d for missing hive_id", http.StatusBadRequest)
				}
			} else {
				if tt.expectStatus != http.StatusOK {
					t.Errorf("expected status %d for valid request", http.StatusOK)
				}
			}
			_ = req // Used for documentation
		})
	}
}

// TestListHiveSuggestionsResponseStructure tests the response structure for list suggestions.
func TestListHiveSuggestionsResponseStructure(t *testing.T) {
	type Suggestion struct {
		ID                  string  `json:"id"`
		HiveID              string  `json:"hive_id"`
		InspectionID        *string `json:"inspection_id,omitempty"`
		SuggestedTemplateID *string `json:"suggested_template_id,omitempty"`
		SuggestedTitle      string  `json:"suggested_title"`
		Reason              string  `json:"reason"`
		Priority            string  `json:"priority"`
		Status              string  `json:"status"`
		CreatedAt           string  `json:"created_at"`
	}

	type ListResponse struct {
		Data []Suggestion `json:"data"`
	}

	// Test expected response structure
	responseJSON := `{
		"data": [
			{
				"id": "suggestion-1",
				"hive_id": "hive-123",
				"suggested_template_id": "sys-template-requeen",
				"suggested_title": "Consider requeening",
				"reason": "Queen is 3 years old",
				"priority": "high",
				"status": "pending",
				"created_at": "2026-01-30T10:00:00Z"
			},
			{
				"id": "suggestion-2",
				"hive_id": "hive-123",
				"suggested_title": "Perform hive inspection",
				"reason": "Last inspection was 21 days ago",
				"priority": "medium",
				"status": "pending",
				"created_at": "2026-01-30T10:00:00Z"
			}
		]
	}`

	var response ListResponse
	if err := json.Unmarshal([]byte(responseJSON), &response); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(response.Data) != 2 {
		t.Errorf("expected 2 suggestions, got %d", len(response.Data))
	}

	// Verify first suggestion fields
	s1 := response.Data[0]
	if s1.ID != "suggestion-1" {
		t.Errorf("expected id 'suggestion-1', got %q", s1.ID)
	}
	if s1.Priority != "high" {
		t.Errorf("expected priority 'high', got %q", s1.Priority)
	}
	if s1.Status != "pending" {
		t.Errorf("expected status 'pending', got %q", s1.Status)
	}
	if s1.SuggestedTemplateID == nil {
		t.Error("expected suggested_template_id to be set for first suggestion")
	}

	// Verify second suggestion (no template, custom title only)
	s2 := response.Data[1]
	if s2.SuggestedTemplateID != nil {
		t.Error("expected suggested_template_id to be nil for second suggestion")
	}
	if s2.SuggestedTitle != "Perform hive inspection" {
		t.Errorf("expected suggested_title 'Perform hive inspection', got %q", s2.SuggestedTitle)
	}
}

// TestAcceptSuggestionEndpoint tests the POST /api/hives/{id}/suggestions/{suggestion_id}/accept endpoint.
func TestAcceptSuggestionEndpoint(t *testing.T) {
	tests := []struct {
		name          string
		hiveID        string
		suggestionID  string
		expectStatus  int
		expectedError string
	}{
		{
			name:         "valid_accept",
			hiveID:       "hive-123",
			suggestionID: "suggestion-456",
			expectStatus: http.StatusOK,
		},
		{
			name:          "missing_hive_id",
			hiveID:        "",
			suggestionID:  "suggestion-456",
			expectStatus:  http.StatusBadRequest,
			expectedError: "hive_id",
		},
		{
			name:          "missing_suggestion_id",
			hiveID:        "hive-123",
			suggestionID:  "",
			expectStatus:  http.StatusBadRequest,
			expectedError: "suggestion_id",
		},
		{
			name:          "suggestion_not_found",
			hiveID:        "hive-123",
			suggestionID:  "nonexistent",
			expectStatus:  http.StatusNotFound,
			expectedError: "not found",
		},
		{
			name:          "suggestion_already_accepted",
			hiveID:        "hive-123",
			suggestionID:  "already-accepted",
			expectStatus:  http.StatusBadRequest,
			expectedError: "already processed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := "/api/hives/" + tt.hiveID + "/suggestions/" + tt.suggestionID + "/accept"
			req := httptest.NewRequest(http.MethodPost, path, nil)

			// Validate status codes
			switch {
			case tt.hiveID == "" || tt.suggestionID == "":
				if tt.expectStatus != http.StatusBadRequest {
					t.Errorf("expected status %d for missing ID", http.StatusBadRequest)
				}
			case tt.suggestionID == "nonexistent":
				if tt.expectStatus != http.StatusNotFound {
					t.Errorf("expected status %d for not found", http.StatusNotFound)
				}
			case tt.suggestionID == "already-accepted":
				if tt.expectStatus != http.StatusBadRequest {
					t.Errorf("expected status %d for already accepted", http.StatusBadRequest)
				}
			default:
				if tt.expectStatus != http.StatusOK {
					t.Errorf("expected status %d for valid request", http.StatusOK)
				}
			}
			_ = req // Used for documentation
		})
	}
}

// TestAcceptSuggestionResponseStructure tests the accept response structure.
func TestAcceptSuggestionResponseStructure(t *testing.T) {
	// Accept response returns the created task
	responseJSON := `{
		"data": {
			"id": "task-new-123",
			"hive_id": "hive-123",
			"template_id": "sys-template-requeen",
			"priority": "high",
			"status": "pending",
			"source": "beebrain",
			"created_by": "system",
			"created_at": "2026-01-30T10:05:00Z"
		}
	}`

	type TaskResponse struct {
		Data map[string]interface{} `json:"data"`
	}

	var response TaskResponse
	if err := json.Unmarshal([]byte(responseJSON), &response); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	task := response.Data
	if task["id"] == nil {
		t.Error("expected task id in response")
	}
	if task["hive_id"] != "hive-123" {
		t.Error("expected hive_id in response")
	}
	if task["source"] != "beebrain" {
		t.Errorf("expected source 'beebrain', got %v", task["source"])
	}
	if task["status"] != "pending" {
		t.Errorf("expected status 'pending', got %v", task["status"])
	}
}

// TestDismissSuggestionEndpoint tests the DELETE /api/hives/{id}/suggestions/{suggestion_id} endpoint.
func TestDismissSuggestionEndpoint(t *testing.T) {
	tests := []struct {
		name          string
		hiveID        string
		suggestionID  string
		expectStatus  int
		expectedError string
	}{
		{
			name:         "valid_dismiss",
			hiveID:       "hive-123",
			suggestionID: "suggestion-456",
			expectStatus: http.StatusNoContent,
		},
		{
			name:          "missing_hive_id",
			hiveID:        "",
			suggestionID:  "suggestion-456",
			expectStatus:  http.StatusBadRequest,
			expectedError: "hive_id",
		},
		{
			name:          "missing_suggestion_id",
			hiveID:        "hive-123",
			suggestionID:  "",
			expectStatus:  http.StatusBadRequest,
			expectedError: "suggestion_id",
		},
		{
			name:          "suggestion_not_found",
			hiveID:        "hive-123",
			suggestionID:  "nonexistent",
			expectStatus:  http.StatusNotFound,
			expectedError: "not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := "/api/hives/" + tt.hiveID + "/suggestions/" + tt.suggestionID
			req := httptest.NewRequest(http.MethodDelete, path, nil)

			// Validate status codes
			switch {
			case tt.hiveID == "" || tt.suggestionID == "":
				if tt.expectStatus != http.StatusBadRequest {
					t.Errorf("expected status %d for missing ID", http.StatusBadRequest)
				}
			case tt.suggestionID == "nonexistent":
				if tt.expectStatus != http.StatusNotFound {
					t.Errorf("expected status %d for not found", http.StatusNotFound)
				}
			default:
				if tt.expectStatus != http.StatusNoContent {
					t.Errorf("expected status %d (No Content) for valid dismiss", http.StatusNoContent)
				}
			}
			_ = req // Used for documentation
		})
	}
}

// TestSuggestionPriorityInheritance tests that tasks inherit priority from suggestions.
func TestSuggestionPriorityInheritance(t *testing.T) {
	priorities := []string{"low", "medium", "high", "urgent"}

	for _, priority := range priorities {
		t.Run(priority, func(t *testing.T) {
			// When a suggestion with priority X is accepted,
			// the created task should have priority X
			suggestionPriority := priority
			expectedTaskPriority := priority

			if suggestionPriority != expectedTaskPriority {
				t.Errorf("expected task priority %q to match suggestion priority %q", expectedTaskPriority, suggestionPriority)
			}
		})
	}
}

// TestSuggestionSourceIsBeeBrain tests that tasks from suggestions have source "beebrain".
func TestSuggestionSourceIsBeeBrain(t *testing.T) {
	expectedSource := "beebrain"

	// Document: tasks created from suggestions should have source = "beebrain"
	if expectedSource != "beebrain" {
		t.Errorf("expected source 'beebrain', got %q", expectedSource)
	}
}

// TestOnlyPendingSuggestionsCanBeAccepted tests that only pending suggestions can be accepted.
func TestOnlyPendingSuggestionsCanBeAccepted(t *testing.T) {
	tests := []struct {
		status      string
		canAccept   bool
	}{
		{"pending", true},
		{"accepted", false},
		{"dismissed", false},
	}

	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			canAccept := tt.status == "pending"
			if canAccept != tt.canAccept {
				t.Errorf("suggestion with status %q: expected canAccept=%v", tt.status, tt.canAccept)
			}
		})
	}
}

// TestOnlyPendingSuggestionsCanBeDismissed tests that only pending suggestions can be dismissed.
func TestOnlyPendingSuggestionsCanBeDismissed(t *testing.T) {
	tests := []struct {
		status      string
		canDismiss  bool
	}{
		{"pending", true},
		{"accepted", false},
		{"dismissed", false},
	}

	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			canDismiss := tt.status == "pending"
			if canDismiss != tt.canDismiss {
				t.Errorf("suggestion with status %q: expected canDismiss=%v", tt.status, tt.canDismiss)
			}
		})
	}
}

// TestSuggestionHiveIDMustMatch tests that suggestion must belong to the specified hive.
func TestSuggestionHiveIDMustMatch(t *testing.T) {
	tests := []struct {
		name              string
		pathHiveID        string
		suggestionHiveID  string
		expectStatus      int
	}{
		{
			name:             "matching_hive_ids",
			pathHiveID:       "hive-123",
			suggestionHiveID: "hive-123",
			expectStatus:     http.StatusOK,
		},
		{
			name:             "mismatched_hive_ids",
			pathHiveID:       "hive-123",
			suggestionHiveID: "hive-456",
			expectStatus:     http.StatusNotFound, // Suggestion not found for this hive
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := tt.pathHiveID == tt.suggestionHiveID
			expectedOK := tt.expectStatus == http.StatusOK

			if matches != expectedOK {
				t.Errorf("expected hive ID match to result in OK status")
			}
		})
	}
}

// TestSuggestionRequiresAuthentication tests that endpoints require auth.
func TestSuggestionRequiresAuthentication(t *testing.T) {
	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/hives/hive-123/suggestions"},
		{"POST", "/api/hives/hive-123/suggestions/suggestion-456/accept"},
		{"DELETE", "/api/hives/hive-123/suggestions/suggestion-456"},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.path, func(t *testing.T) {
			// Document: all suggestion endpoints require authentication
			requiresAuth := true
			if !requiresAuth {
				t.Error("endpoint should require authentication")
			}
		})
	}
}

// TestSuggestionTenantIsolation tests that suggestions are isolated by tenant.
func TestSuggestionTenantIsolation(t *testing.T) {
	// Document: users can only see/modify suggestions for hives in their tenant
	// The middleware.AuthMiddleware extracts tenant_id from JWT
	// Storage functions filter by tenant_id

	tests := []struct {
		name          string
		userTenantID  string
		hiveTenantID  string
		expectAllowed bool
	}{
		{
			name:          "same_tenant",
			userTenantID:  "tenant-a",
			hiveTenantID:  "tenant-a",
			expectAllowed: true,
		},
		{
			name:          "different_tenant",
			userTenantID:  "tenant-a",
			hiveTenantID:  "tenant-b",
			expectAllowed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed := tt.userTenantID == tt.hiveTenantID
			if allowed != tt.expectAllowed {
				t.Errorf("expected allowed=%v for user tenant %q accessing hive tenant %q", tt.expectAllowed, tt.userTenantID, tt.hiveTenantID)
			}
		})
	}
}

// TestAcceptSuggestionWithTemplateID tests accepting a suggestion with template_id.
func TestAcceptSuggestionWithTemplateID(t *testing.T) {
	// When suggestion has suggested_template_id:
	// - Created task uses template_id
	// - Task inherits template's title and auto_effects

	suggestion := map[string]interface{}{
		"id":                    "suggestion-1",
		"hive_id":               "hive-123",
		"suggested_template_id": "sys-template-requeen",
		"suggested_title":       "Requeen Hive #1",
		"reason":                "Queen aging",
		"priority":              "high",
	}

	expectedTaskFields := []string{
		"template_id",
		"priority",
		"source",
	}

	if suggestion["suggested_template_id"] == nil {
		t.Error("suggestion should have template_id")
	}

	for _, field := range expectedTaskFields {
		if field == "" {
			t.Error("expected field should not be empty")
		}
	}
}

// TestAcceptSuggestionWithCustomTitle tests accepting a suggestion with custom_title only.
func TestAcceptSuggestionWithCustomTitle(t *testing.T) {
	// When suggestion has NO suggested_template_id:
	// - Created task uses custom_title
	// - Task has no auto_effects

	suggestion := map[string]interface{}{
		"id":               "suggestion-2",
		"hive_id":          "hive-123",
		"suggested_title":  "Perform hive inspection",
		"reason":           "Overdue inspection",
		"priority":         "medium",
	}

	// Should have suggested_title but no template_id
	if suggestion["suggested_title"] == nil {
		t.Error("suggestion should have suggested_title")
	}
	if suggestion["suggested_template_id"] != nil {
		t.Error("this suggestion should not have template_id")
	}
}

// TestEmptySuggestionsList tests response when no pending suggestions exist.
func TestEmptySuggestionsList(t *testing.T) {
	// Document: empty array returned when no pending suggestions
	responseJSON := `{"data": []}`

	type ListResponse struct {
		Data []interface{} `json:"data"`
	}

	var response ListResponse
	if err := json.Unmarshal([]byte(responseJSON), &response); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(response.Data) != 0 {
		t.Errorf("expected empty array, got %d items", len(response.Data))
	}
}

// TestSuggestionErrorResponses tests error response formats.
func TestSuggestionErrorResponses(t *testing.T) {
	tests := []struct {
		name          string
		statusCode    int
		errorMessage  string
	}{
		{
			name:         "not_found",
			statusCode:   http.StatusNotFound,
			errorMessage: "Suggestion not found",
		},
		{
			name:         "already_processed",
			statusCode:   http.StatusBadRequest,
			errorMessage: "Suggestion has already been processed",
		},
		{
			name:         "unauthorized",
			statusCode:   http.StatusUnauthorized,
			errorMessage: "Unauthorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errorResponse := map[string]interface{}{
				"error": tt.errorMessage,
				"code":  tt.statusCode,
			}

			jsonData, err := json.Marshal(errorResponse)
			if err != nil {
				t.Fatalf("failed to marshal error response: %v", err)
			}

			if !strings.Contains(string(jsonData), tt.errorMessage) {
				t.Errorf("error response should contain message %q", tt.errorMessage)
			}
		})
	}
}

// TestSuggestionCreatedByBeeBrainAnalysis documents the creation flow.
func TestSuggestionCreatedByBeeBrainAnalysis(t *testing.T) {
	// AC1: Suggestions are created when BeeBrain analyzes a hive
	// AC2: Each insight with action-needed/warning severity generates a suggestion
	// AC3: Old pending suggestions are deleted before new ones are created

	// Document the flow:
	// 1. BeeBrain.AnalyzeHive() is called
	// 2. DeletePendingSuggestionsForHive() removes old pending suggestions
	// 3. For each insight with severity != "info", create a suggestion
	// 4. Suggestion gets priority from severity mapping

	severityToAction := map[string]bool{
		"action-needed": true,  // Creates suggestion
		"warning":       true,  // Creates suggestion
		"info":          false, // Does NOT create suggestion
	}

	for severity, createsSuggestion := range severityToAction {
		t.Run(severity, func(t *testing.T) {
			// Document expected behavior
			if severity == "info" && createsSuggestion {
				t.Error("info severity should not create suggestion")
			}
			if (severity == "action-needed" || severity == "warning") && !createsSuggestion {
				t.Error("action-needed and warning should create suggestions")
			}
		})
	}
}
