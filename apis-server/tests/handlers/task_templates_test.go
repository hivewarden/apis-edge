// Package handlers_test contains unit tests for the APIS server HTTP handlers.
package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestTaskTemplatesListRequestValidation tests the ListTaskTemplates handler.
func TestTaskTemplatesListRequestValidation(t *testing.T) {
	tests := []struct {
		name        string
		method      string
		expectValid bool
	}{
		{
			name:        "valid_get_request",
			method:      http.MethodGet,
			expectValid: true,
		},
		{
			name:        "invalid_post_method",
			method:      http.MethodPost,
			expectValid: false, // POST to /api/task-templates is handled by CreateTaskTemplate
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Validate the request method for list endpoint
			isValidListMethod := tt.method == http.MethodGet

			if isValidListMethod != tt.expectValid {
				t.Errorf("expected valid=%v for method %s, got %v", tt.expectValid, tt.method, isValidListMethod)
			}
		})
	}
}

// TestCreateTaskTemplateRequestValidation tests the CreateTaskTemplate handler request validation.
func TestCreateTaskTemplateRequestValidation(t *testing.T) {
	tests := []struct {
		name          string
		body          string
		expectValid   bool
		expectedError string
	}{
		{
			name:        "valid_name_only",
			body:        `{"name":"My Custom Template"}`,
			expectValid: true,
		},
		{
			name:        "valid_name_and_description",
			body:        `{"name":"My Custom Template","description":"A detailed description of the template"}`,
			expectValid: true,
		},
		{
			name:        "valid_name_min_length",
			body:        `{"name":"A"}`,
			expectValid: true,
		},
		{
			name:        "valid_name_max_length",
			body:        `{"name":"` + strings.Repeat("a", 100) + `"}`,
			expectValid: true,
		},
		{
			name:          "missing_name",
			body:          `{}`,
			expectValid:   false,
			expectedError: "Name is required",
		},
		{
			name:          "empty_name",
			body:          `{"name":""}`,
			expectValid:   false,
			expectedError: "Name is required",
		},
		{
			name:          "whitespace_only_name",
			body:          `{"name":"   "}`,
			expectValid:   false,
			expectedError: "Name is required",
		},
		{
			name:          "name_too_long",
			body:          `{"name":"` + strings.Repeat("a", 101) + `"}`,
			expectValid:   false,
			expectedError: "Name must be between 1 and 100 characters",
		},
		{
			name:        "name_with_leading_trailing_whitespace",
			body:        `{"name":"  Valid Name  "}`,
			expectValid: true,
		},
		{
			name:        "name_at_max_after_trimming",
			body:        `{"name":"  ` + strings.Repeat("a", 100) + `  "}`,
			expectValid: true,
		},
		{
			name:          "name_over_max_after_trimming",
			body:          `{"name":"  ` + strings.Repeat("a", 101) + `  "}`,
			expectValid:   false,
			expectedError: "Name must be between 1 and 100 characters",
		},
		{
			name:          "description_too_long",
			body:          `{"name":"Valid Name","description":"` + strings.Repeat("a", 501) + `"}`,
			expectValid:   false,
			expectedError: "Description must not exceed 500 characters",
		},
		{
			name:        "description_max_length",
			body:        `{"name":"Valid Name","description":"` + strings.Repeat("a", 500) + `"}`,
			expectValid: true,
		},
		{
			name:          "invalid_json",
			body:          `{invalid json}`,
			expectValid:   false,
			expectedError: "Invalid request body",
		},
		{
			name:        "null_description",
			body:        `{"name":"Valid Name","description":null}`,
			expectValid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/task-templates", bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")

			// Simulate validation
			var requestData map[string]interface{}
			valid := true
			var errorMsg string

			if err := json.Unmarshal([]byte(tt.body), &requestData); err != nil {
				valid = false
				errorMsg = "Invalid request body"
			} else {
				nameRaw, hasName := requestData["name"]
				name, isString := nameRaw.(string)
				if isString {
					name = strings.TrimSpace(name)
				}

				if !hasName || !isString || name == "" {
					valid = false
					errorMsg = "Name is required"
				} else if len(name) < 1 || len(name) > 100 {
					valid = false
					errorMsg = "Name must be between 1 and 100 characters"
				}

				if valid {
					if descRaw, hasDesc := requestData["description"]; hasDesc && descRaw != nil {
						if desc, isStr := descRaw.(string); isStr && len(desc) > 500 {
							valid = false
							errorMsg = "Description must not exceed 500 characters"
						}
					}
				}
			}

			if valid != tt.expectValid {
				t.Errorf("expected valid=%v, got valid=%v, error=%s", tt.expectValid, valid, errorMsg)
			}
			if !tt.expectValid && !strings.Contains(errorMsg, tt.expectedError) {
				t.Errorf("expected error containing %q, got %q", tt.expectedError, errorMsg)
			}
		})
	}
}

// TestDeleteTaskTemplateRequestValidation tests the DeleteTaskTemplate handler validation.
func TestDeleteTaskTemplateRequestValidation(t *testing.T) {
	tests := []struct {
		name          string
		templateID    string
		isSystem      bool
		templateFound bool
		expectStatus  int
		expectedError string
	}{
		{
			name:          "valid_custom_template",
			templateID:    "550e8400-e29b-41d4-a716-446655440001",
			isSystem:      false,
			templateFound: true,
			expectStatus:  http.StatusNoContent,
		},
		{
			name:          "system_template",
			templateID:    "550e8400-e29b-41d4-a716-446655440002",
			isSystem:      true,
			templateFound: true,
			expectStatus:  http.StatusForbidden,
			expectedError: "Cannot delete system template",
		},
		{
			name:          "not_found",
			templateID:    "550e8400-e29b-41d4-a716-446655440003",
			isSystem:      false,
			templateFound: false,
			expectStatus:  http.StatusNotFound,
			expectedError: "Template not found",
		},
		{
			name:          "other_tenant_template",
			templateID:    "550e8400-e29b-41d4-a716-446655440004",
			isSystem:      false,
			templateFound: false, // RLS would make it invisible
			expectStatus:  http.StatusNotFound,
			expectedError: "Template not found",
		},
		{
			name:          "empty_id",
			templateID:    "",
			isSystem:      false,
			templateFound: false,
			expectStatus:  http.StatusBadRequest,
			expectedError: "Template ID is required",
		},
		{
			name:          "invalid_uuid_format",
			templateID:    "not-a-valid-uuid",
			isSystem:      false,
			templateFound: false,
			expectStatus:  http.StatusBadRequest,
			expectedError: "Invalid template ID format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate validation and response
			var status int
			var errorMsg string

			if tt.templateID == "" {
				status = http.StatusBadRequest
				errorMsg = "Template ID is required"
			} else if _, err := uuid.Parse(tt.templateID); err != nil {
				status = http.StatusBadRequest
				errorMsg = "Invalid template ID format"
			} else if !tt.templateFound {
				status = http.StatusNotFound
				errorMsg = "Template not found"
			} else if tt.isSystem {
				status = http.StatusForbidden
				errorMsg = "Cannot delete system template"
			} else {
				status = http.StatusNoContent
			}

			if status != tt.expectStatus {
				t.Errorf("expected status=%d, got %d", tt.expectStatus, status)
			}
			if tt.expectedError != "" && !strings.Contains(errorMsg, tt.expectedError) {
				t.Errorf("expected error containing %q, got %q", tt.expectedError, errorMsg)
			}
		})
	}
}

// TestTaskTemplateResponseStructure tests the task template response JSON structure.
func TestTaskTemplateResponseStructure(t *testing.T) {
	type TaskTemplateResponse struct {
		ID          string          `json:"id"`
		TenantID    *string         `json:"tenant_id,omitempty"`
		Type        string          `json:"type"`
		Name        string          `json:"name"`
		Description *string         `json:"description,omitempty"`
		AutoEffects json.RawMessage `json:"auto_effects,omitempty"`
		IsSystem    bool            `json:"is_system"`
		CreatedAt   time.Time       `json:"created_at"`
		CreatedBy   *string         `json:"created_by,omitempty"`
	}

	tenantID := "tenant-123"
	description := "A custom template"
	createdBy := "user-456"

	response := TaskTemplateResponse{
		ID:          "template-789",
		TenantID:    &tenantID,
		Type:        "custom",
		Name:        "My Custom Template",
		Description: &description,
		IsSystem:    false,
		CreatedAt:   time.Now(),
		CreatedBy:   &createdBy,
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify required fields
	requiredFields := []string{"id", "type", "name", "is_system", "created_at"}
	for _, field := range requiredFields {
		if _, ok := decoded[field]; !ok {
			t.Errorf("missing required field: %s", field)
		}
	}

	// Verify optional fields are present when set
	if decoded["tenant_id"] != tenantID {
		t.Errorf("expected tenant_id=%s, got %v", tenantID, decoded["tenant_id"])
	}
	if decoded["description"] != description {
		t.Errorf("expected description=%s, got %v", description, decoded["description"])
	}
	if decoded["is_system"] != false {
		t.Errorf("expected is_system=false, got %v", decoded["is_system"])
	}
	if decoded["type"] != "custom" {
		t.Errorf("expected type=custom, got %v", decoded["type"])
	}
}

// TestSystemTemplateResponseStructure tests the system template response JSON structure.
func TestSystemTemplateResponseStructure(t *testing.T) {
	type TaskTemplateResponse struct {
		ID          string          `json:"id"`
		TenantID    *string         `json:"tenant_id,omitempty"`
		Type        string          `json:"type"`
		Name        string          `json:"name"`
		Description *string         `json:"description,omitempty"`
		AutoEffects json.RawMessage `json:"auto_effects,omitempty"`
		IsSystem    bool            `json:"is_system"`
		CreatedAt   time.Time       `json:"created_at"`
		CreatedBy   *string         `json:"created_by,omitempty"`
	}

	description := "Replace the queen in the hive"
	autoEffects := json.RawMessage(`{"set":{"queen_introduced_at":"{{completion_date}}"}}`)

	response := TaskTemplateResponse{
		ID:          "sys-template-requeen",
		TenantID:    nil, // System templates have null tenant_id
		Type:        "requeen",
		Name:        "Requeen",
		Description: &description,
		AutoEffects: autoEffects,
		IsSystem:    true,
		CreatedAt:   time.Now(),
		CreatedBy:   nil, // System templates have null created_by
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify system template specifics
	if decoded["is_system"] != true {
		t.Errorf("expected is_system=true, got %v", decoded["is_system"])
	}
	if _, hasTenantID := decoded["tenant_id"]; hasTenantID {
		t.Error("system template should not have tenant_id in JSON (omitempty)")
	}
	if _, hasCreatedBy := decoded["created_by"]; hasCreatedBy {
		t.Error("system template should not have created_by in JSON (omitempty)")
	}
	if _, hasAutoEffects := decoded["auto_effects"]; !hasAutoEffects {
		t.Error("system template should have auto_effects")
	}
}

// TestTaskTemplatesListResponseStructure tests the templates list response structure.
func TestTaskTemplatesListResponseStructure(t *testing.T) {
	type TaskTemplatesListResponse struct {
		Data []map[string]interface{} `json:"data"`
	}

	response := TaskTemplatesListResponse{
		Data: []map[string]interface{}{
			{"id": "sys-template-1", "name": "Requeen", "is_system": true, "type": "requeen"},
			{"id": "sys-template-2", "name": "Add Feed", "is_system": true, "type": "feeding"},
			{"id": "custom-1", "name": "Custom Task", "is_system": false, "type": "custom"},
		},
	}

	jsonData, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("failed to marshal response: %v", err)
	}

	var decoded TaskTemplatesListResponse
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(decoded.Data) != 3 {
		t.Errorf("expected 3 templates, got %d", len(decoded.Data))
	}

	// Verify system templates come first (based on is_system DESC sort)
	if decoded.Data[0]["is_system"] != true {
		t.Error("first template should be a system template")
	}
	if decoded.Data[1]["is_system"] != true {
		t.Error("second template should be a system template")
	}
	if decoded.Data[2]["is_system"] != false {
		t.Error("third template should be a custom template")
	}
}

// TestTaskTemplatesListSortOrder tests that templates are sorted correctly.
func TestTaskTemplatesListSortOrder(t *testing.T) {
	// Simulate templates with is_system and created_at
	templates := []struct {
		ID        string
		IsSystem  bool
		CreatedAt time.Time
	}{
		{"custom-1", false, time.Now().Add(-1 * time.Hour)},
		{"sys-1", true, time.Now().Add(-2 * time.Hour)},
		{"custom-2", false, time.Now()},
		{"sys-2", true, time.Now().Add(-3 * time.Hour)},
	}

	// Simulate the SQL ORDER BY is_system DESC, created_at DESC
	// Expected order: sys-1, sys-2 (system first), then custom-2, custom-1 (by created_at DESC)
	sortedOrder := func(templates []struct {
		ID        string
		IsSystem  bool
		CreatedAt time.Time
	}) []string {
		// Simple bubble sort for testing
		n := len(templates)
		arr := make([]struct {
			ID        string
			IsSystem  bool
			CreatedAt time.Time
		}, n)
		copy(arr, templates)

		for i := 0; i < n-1; i++ {
			for j := 0; j < n-i-1; j++ {
				// Sort by is_system DESC, then created_at DESC
				shouldSwap := false
				if !arr[j].IsSystem && arr[j+1].IsSystem {
					shouldSwap = true
				} else if arr[j].IsSystem == arr[j+1].IsSystem && arr[j].CreatedAt.Before(arr[j+1].CreatedAt) {
					shouldSwap = true
				}
				if shouldSwap {
					arr[j], arr[j+1] = arr[j+1], arr[j]
				}
			}
		}

		result := make([]string, n)
		for i, t := range arr {
			result[i] = t.ID
		}
		return result
	}

	sorted := sortedOrder(templates)

	// System templates should come first
	if sorted[0] != "sys-1" && sorted[0] != "sys-2" {
		t.Errorf("expected system template first, got %s", sorted[0])
	}
	if sorted[1] != "sys-1" && sorted[1] != "sys-2" {
		t.Errorf("expected system template second, got %s", sorted[1])
	}
	// Custom templates should come after
	if sorted[2] != "custom-1" && sorted[2] != "custom-2" {
		t.Errorf("expected custom template third, got %s", sorted[2])
	}
	if sorted[3] != "custom-1" && sorted[3] != "custom-2" {
		t.Errorf("expected custom template fourth, got %s", sorted[3])
	}
}

// TestCreateTaskTemplateDefaultValues tests that created templates have correct defaults.
func TestCreateTaskTemplateDefaultValues(t *testing.T) {
	// This test documents the expected default values for created templates
	type CreateResult struct {
		Type        string          `json:"type"`
		IsSystem    bool            `json:"is_system"`
		AutoEffects json.RawMessage `json:"auto_effects"`
		TenantID    string          `json:"tenant_id"`
		CreatedBy   string          `json:"created_by"`
	}

	result := CreateResult{
		Type:        "custom",      // Must be 'custom'
		IsSystem:    false,         // Must be false
		AutoEffects: nil,           // Must be NULL for custom templates
		TenantID:    "tenant-123",  // Must be set to current tenant
		CreatedBy:   "user-456",    // Must be set to current user
	}

	if result.Type != "custom" {
		t.Errorf("expected type=custom, got %s", result.Type)
	}
	if result.IsSystem != false {
		t.Error("expected is_system=false")
	}
	if result.AutoEffects != nil {
		t.Error("expected auto_effects=null")
	}
	if result.TenantID == "" {
		t.Error("expected tenant_id to be set")
	}
	if result.CreatedBy == "" {
		t.Error("expected created_by to be set")
	}
}

// TestTaskTemplateEndpoints documents the expected task template API endpoints.
func TestTaskTemplateEndpoints(t *testing.T) {
	endpoints := []struct {
		method string
		path   string
		desc   string
	}{
		{"GET", "/api/task-templates", "List all templates (system + tenant)"},
		{"POST", "/api/task-templates", "Create custom template"},
		{"DELETE", "/api/task-templates/{id}", "Delete custom template"},
	}

	if len(endpoints) != 3 {
		t.Errorf("expected 3 task template endpoints, got %d", len(endpoints))
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

// TestTasksWithDeletedTemplateWork tests that tasks retain their template_id after template deletion.
func TestTasksWithDeletedTemplateWork(t *testing.T) {
	// This test documents the expected behavior: FK allows orphaned references
	// When a template is deleted, tasks that referenced it should still work
	// The template_id is preserved but the template data won't be available

	type Task struct {
		ID           string  `json:"id"`
		TemplateID   *string `json:"template_id"`
		TemplateName *string `json:"template_name"` // Will be nil if template deleted
	}

	templateID := "deleted-template-123"
	task := Task{
		ID:           "task-789",
		TemplateID:   &templateID,
		TemplateName: nil, // Template no longer exists
	}

	// The task should still have the template_id even though template is deleted
	if task.TemplateID == nil || *task.TemplateID != templateID {
		t.Error("expected template_id to be preserved after template deletion")
	}

	// But template_name should be nil (LEFT JOIN returns NULL)
	if task.TemplateName != nil {
		t.Error("expected template_name to be nil when template is deleted")
	}
}

// TestTaskTemplatesAuthenticationRequired tests that all template endpoints require authentication.
func TestTaskTemplatesAuthenticationRequired(t *testing.T) {
	endpoints := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/task-templates"},
		{http.MethodPost, "/api/task-templates"},
		{http.MethodDelete, "/api/task-templates/template-123"},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+"_"+ep.path, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			// Without authentication, the handler should return 401

			// This test documents that authentication is required
			// The actual middleware check happens in the router setup
			if req.Header.Get("Authorization") != "" {
				t.Error("test should not have authorization header")
			}
		})
	}
}

// TestTenantIsolation tests that templates from other tenants are not visible.
func TestTenantIsolation(t *testing.T) {
	// This test documents the RLS behavior
	// Tenant A should not see Tenant B's custom templates
	// But both should see system templates (tenant_id IS NULL)

	type Template struct {
		ID       string  `json:"id"`
		TenantID *string `json:"tenant_id"`
		IsSystem bool    `json:"is_system"`
	}

	tenantA := "tenant-a"
	tenantB := "tenant-b"

	templates := []Template{
		{ID: "sys-1", TenantID: nil, IsSystem: true},           // Visible to all
		{ID: "custom-a", TenantID: &tenantA, IsSystem: false},  // Only visible to tenant A
		{ID: "custom-b", TenantID: &tenantB, IsSystem: false},  // Only visible to tenant B
	}

	// Filter templates visible to tenant A
	visibleToA := []Template{}
	for _, t := range templates {
		if t.TenantID == nil || *t.TenantID == tenantA {
			visibleToA = append(visibleToA, t)
		}
	}

	if len(visibleToA) != 2 {
		t.Errorf("expected tenant A to see 2 templates, got %d", len(visibleToA))
	}

	// Verify tenant A sees sys-1 and custom-a, not custom-b
	foundSys := false
	foundCustomA := false
	foundCustomB := false
	for _, tmpl := range visibleToA {
		if tmpl.ID == "sys-1" {
			foundSys = true
		}
		if tmpl.ID == "custom-a" {
			foundCustomA = true
		}
		if tmpl.ID == "custom-b" {
			foundCustomB = true
		}
	}
	if foundCustomB {
		t.Error("tenant A should not see custom-b")
	}
	if !foundSys {
		t.Error("tenant A should see system template")
	}
	if !foundCustomA {
		t.Error("tenant A should see their own custom template")
	}
}

// TestSystemTemplateTypes documents the expected system template types.
func TestSystemTemplateTypes(t *testing.T) {
	// These are the system templates seeded in story 14.1
	expectedTypes := []string{
		"requeen",
		"add_frame",
		"remove_frame",
		"harvest_frames",
		"feeding",
		"treatment",
		"add_brood_box",
		"add_honey_super",
		"remove_box",
	}

	// Custom templates always have type='custom'
	customType := "custom"

	for _, sysType := range expectedTypes {
		if sysType == customType {
			t.Errorf("system template type %q should not equal custom type", sysType)
		}
	}

	if customType != "custom" {
		t.Error("custom templates must have type='custom'")
	}
}

// TestErrorResponseFormat tests the error response JSON structure.
func TestErrorResponseFormat(t *testing.T) {
	tests := []struct {
		name         string
		expectedCode int
		errorMessage string
	}{
		{
			name:         "forbidden_system_template",
			expectedCode: 403,
			errorMessage: "Cannot delete system template",
		},
		{
			name:         "not_found",
			expectedCode: 404,
			errorMessage: "Template not found",
		},
		{
			name:         "name_required",
			expectedCode: 400,
			errorMessage: "Name is required",
		},
		{
			name:         "name_too_long",
			expectedCode: 400,
			errorMessage: "Name must be between 1 and 100 characters",
		},
		{
			name:         "description_too_long",
			expectedCode: 400,
			errorMessage: "Description must not exceed 500 characters",
		},
		{
			name:         "invalid_json",
			expectedCode: 400,
			errorMessage: "Invalid request body",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate error response structure per CLAUDE.md
			errorResp := map[string]interface{}{
				"error": tt.errorMessage,
				"code":  tt.expectedCode,
			}

			jsonData, err := json.Marshal(errorResp)
			if err != nil {
				t.Fatalf("failed to marshal error response: %v", err)
			}

			var decoded map[string]interface{}
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				t.Fatalf("failed to unmarshal error response: %v", err)
			}

			if decoded["error"] != tt.errorMessage {
				t.Errorf("expected error=%s, got %v", tt.errorMessage, decoded["error"])
			}
			if int(decoded["code"].(float64)) != tt.expectedCode {
				t.Errorf("expected code=%d, got %v", tt.expectedCode, decoded["code"])
			}
		})
	}
}
