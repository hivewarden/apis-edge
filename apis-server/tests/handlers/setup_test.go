// Package handlers_test contains tests for APIS server HTTP handlers.
package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
)

// ============================================================================
// SetupResponse for test parsing
// ============================================================================

type setupRequest struct {
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
}

type setupUserResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	TenantID string `json:"tenant_id"`
}

type setupResponse struct {
	User setupUserResponse `json:"user"`
}

type errorResponse struct {
	Error string `json:"error"`
	Code  int    `json:"code"`
}

// ============================================================================
// Setup Handler Tests - Validation
// ============================================================================

func TestSetup_NotInLocalMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	// Configure keycloak mode
	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.Setup(nil, nil)

	body := setupRequest{
		DisplayName: "Admin User",
		Email:       "admin@example.com",
		Password:    "securepassword123",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", resp.StatusCode)
	}

	var result errorResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result.Error == "" {
		t.Error("expected error message")
	}
}

func TestSetup_ValidationErrors(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Create handler with nil pool (simulates empty database, setup should be available)
	// Note: With nil pool, setup proceeds until it tries to create the user (fails with no DB)
	// However, validation errors should be caught before that point
	tests := []struct {
		name           string
		body           setupRequest
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing display name",
			body:           setupRequest{Email: "admin@example.com", Password: "securepassword123"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Display name is required",
		},
		{
			name:           "missing email",
			body:           setupRequest{DisplayName: "Admin", Password: "securepassword123"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Email is required",
		},
		{
			name:           "invalid email format",
			body:           setupRequest{DisplayName: "Admin", Email: "not-an-email", Password: "securepassword123"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid email format",
		},
		{
			name:           "password too short",
			body:           setupRequest{DisplayName: "Admin", Email: "admin@example.com", Password: "short"},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password must be at least 8 characters",
		},
		{
			name:           "empty password",
			body:           setupRequest{DisplayName: "Admin", Email: "admin@example.com", Password: ""},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "password is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := handlers.Setup(nil, nil)

			jsonBody, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler(w, req)

			resp := w.Result()
			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var result errorResponse
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}

			if result.Error == "" {
				t.Error("expected error message")
			}
		})
	}
}

func TestSetup_InvalidJSONBody(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.Setup(nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var result errorResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result.Error != "Invalid request body" {
		t.Errorf("expected 'Invalid request body' error, got %q", result.Error)
	}
}

func TestSetup_WhitespaceHandling(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.Setup(nil, nil)

	// Test that whitespace-only display name is rejected
	body := setupRequest{
		DisplayName: "   ",
		Email:       "admin@example.com",
		Password:    "securepassword123",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400 for whitespace-only name, got %d", resp.StatusCode)
	}
}

// ============================================================================
// Setup Handler Tests - Auth Mode Check
// ============================================================================

func TestSetup_RequiresLocalMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	// Set keycloak mode
	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://auth.example.com")
	t.Setenv("KEYCLOAK_CLIENT_ID", "test-client")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.Setup(nil, nil)

	body := setupRequest{
		DisplayName: "Admin",
		Email:       "admin@example.com",
		Password:    "securepassword123",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected status 403 for non-local mode, got %d", resp.StatusCode)
	}

	var result errorResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result.Error == "" {
		t.Error("expected error message about local mode")
	}
}

// ============================================================================
// Setup Handler Tests - Response Format
// ============================================================================

func TestSetup_ReturnsCorrectContentType(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.Setup(nil, nil)

	// Send valid request (will fail later due to no DB, but should return JSON)
	body := setupRequest{
		DisplayName: "Admin",
		Email:       "admin@example.com",
		Password:    "securepassword123",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler(w, req)

	resp := w.Result()

	// Verify Content-Type header
	contentType := resp.Header.Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got %q", contentType)
	}
}

// ============================================================================
// Setup Handler Tests - Email Normalization
// ============================================================================

func TestSetup_NormalizesEmail(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// This test validates that email validation works for various email formats
	// Full normalization test requires database integration
	tests := []struct {
		name  string
		email string
		valid bool
	}{
		{"normal email", "admin@example.com", true},
		{"uppercase email", "ADMIN@EXAMPLE.COM", true},
		{"mixed case", "Admin@Example.Com", true},
		{"with spaces", "  admin@example.com  ", true}, // Should be trimmed
		{"invalid format", "not-an-email", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := handlers.Setup(nil, nil)

			body := setupRequest{
				DisplayName: "Admin",
				Email:       tt.email,
				Password:    "securepassword123",
			}
			jsonBody, _ := json.Marshal(body)

			req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", bytes.NewReader(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler(w, req)

			resp := w.Result()
			if tt.valid {
				// Valid emails should pass validation (may fail later on DB)
				// They should NOT return 400 with "Invalid email format"
				if resp.StatusCode == http.StatusBadRequest {
					var result errorResponse
					json.NewDecoder(resp.Body).Decode(&result)
					if result.Error == "Invalid email format" || result.Error == "Email is required" {
						t.Errorf("email %q should be valid but got: %s", tt.email, result.Error)
					}
				}
			} else {
				// Invalid emails should return 400
				if resp.StatusCode != http.StatusBadRequest {
					t.Errorf("email %q should be invalid, got status %d", tt.email, resp.StatusCode)
				}
			}
		})
	}
}

// ============================================================================
// Integration Notes
// ============================================================================

// NOTE: Full integration tests for the setup endpoint require:
// 1. A real database connection
// 2. Empty users table (for successful setup)
// 3. Populated users table (for "already exists" test)
//
// These tests should be placed in tests/integration/setup_integration_test.go
// and use a test database fixture.
//
// Test cases for integration:
// - TestSetup_Success_CreatesAdminUser
// - TestSetup_Returns404_WhenUsersExist
// - TestSetup_SetsCookie_OnSuccess
// - TestSetup_CreatesJWT_WithCorrectClaims
