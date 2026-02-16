// Package handlers_test contains tests for APIS server HTTP handlers.
package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
)

// resetAuthConfig resets the auth configuration between tests.
func resetAuthConfig() {
	config.ResetAuthConfig()
}

// ============================================================================
// AuthConfigResponse for test parsing
// ============================================================================

type authConfigResponse struct {
	Mode              string `json:"mode"`
	SetupRequired     *bool  `json:"setup_required,omitempty"`
	KeycloakAuthority string `json:"keycloak_authority,omitempty"`
	ClientID          string `json:"client_id,omitempty"`
}

// ============================================================================
// Local Mode Tests
// ============================================================================

func TestGetAuthConfig_LocalMode_NoUsers(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Create handler with nil pool (simulates no database or empty database)
	handler := handlers.NewAuthConfigHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var result authConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify mode is local
	if result.Mode != "local" {
		t.Errorf("expected mode 'local', got %q", result.Mode)
	}

	// Verify setup_required is present (true because no pool means no users)
	if result.SetupRequired == nil {
		t.Error("expected setup_required to be present in local mode")
	} else if !*result.SetupRequired {
		// With nil pool, setup_required defaults to true
		t.Error("expected setup_required to be true when no database connection")
	}

	// Verify keycloak fields are NOT present
	if result.KeycloakAuthority != "" {
		t.Errorf("expected empty keycloak_authority in local mode, got %q", result.KeycloakAuthority)
	}
	if result.ClientID != "" {
		t.Errorf("expected empty client_id in local mode, got %q", result.ClientID)
	}
}

func TestGetAuthConfig_LocalMode_ResponseFormat(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	resp := w.Result()

	// Verify Content-Type header
	contentType := resp.Header.Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got %q", contentType)
	}

	// Verify JSON structure matches expected format
	var rawJSON map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&rawJSON); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Must have "mode" field
	if _, ok := rawJSON["mode"]; !ok {
		t.Error("response must include 'mode' field")
	}

	// In local mode, must have "setup_required" field
	if _, ok := rawJSON["setup_required"]; !ok {
		t.Error("local mode response must include 'setup_required' field")
	}
}

// TestGetAuthConfig_LocalMode_WithUsersPresent tests that setup_required is false
// when users already exist in the default tenant. This test requires an actual
// database connection with seeded user data.
//
// Note: This is a documentation-level test case. Full integration testing with
// a real database and seeded users should be done in integration tests.
// The handler logic for this case is tested via the checkSetupRequired method
// which returns false when count > 0.
//
// The behavior is:
// - No database pool (nil) -> setup_required = true
// - Database pool with 0 users -> setup_required = true
// - Database pool with users -> setup_required = false
func TestGetAuthConfig_LocalMode_SetupRequiredLogic(t *testing.T) {
	t.Run("nil pool returns setup_required true", func(t *testing.T) {
		resetAuthConfig()
		defer resetAuthConfig()

		t.Setenv("AUTH_MODE", "local")
		t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

		if err := config.InitAuthConfig(); err != nil {
			t.Fatalf("init failed: %v", err)
		}

		// nil pool should default to setup_required=true
		handler := handlers.NewAuthConfigHandler(nil)
		req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
		w := httptest.NewRecorder()

		handler.GetAuthConfig(w, req)

		var result authConfigResponse
		if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}

		if result.SetupRequired == nil || !*result.SetupRequired {
			t.Error("expected setup_required to be true when no database pool")
		}
	})

	// Note: Testing setup_required=false requires integration test with real DB
	// and seeded users. See tests/integration/auth_config_integration_test.go
	// for full coverage.
}

// ============================================================================
// Keycloak Mode Tests
// ============================================================================

func TestGetAuthConfig_KeycloakMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	expectedIssuer := "https://keycloak.example.com/realms/honeybee"
	expectedClientID := "apis-dashboard"

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", expectedIssuer)
	t.Setenv("KEYCLOAK_CLIENT_ID", expectedClientID)

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var result authConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify mode is keycloak
	if result.Mode != "keycloak" {
		t.Errorf("expected mode 'keycloak', got %q", result.Mode)
	}

	// Verify keycloak fields are present
	if result.KeycloakAuthority != expectedIssuer {
		t.Errorf("expected keycloak_authority %q, got %q", expectedIssuer, result.KeycloakAuthority)
	}
	if result.ClientID != expectedClientID {
		t.Errorf("expected client_id %q, got %q", expectedClientID, result.ClientID)
	}

	// Verify setup_required is NOT present in keycloak mode
	if result.SetupRequired != nil {
		t.Error("expected setup_required to be absent in keycloak mode")
	}
}

func TestGetAuthConfig_KeycloakMode_ResponseFormat(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	resp := w.Result()

	// Verify JSON structure
	var rawJSON map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&rawJSON); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Must have "mode" field
	if _, ok := rawJSON["mode"]; !ok {
		t.Error("response must include 'mode' field")
	}

	// In keycloak mode, must have "keycloak_authority" and "client_id" fields
	if _, ok := rawJSON["keycloak_authority"]; !ok {
		t.Error("keycloak mode response must include 'keycloak_authority' field")
	}
	if _, ok := rawJSON["client_id"]; !ok {
		t.Error("keycloak mode response must include 'client_id' field")
	}

	// Should NOT have "setup_required" field
	if _, ok := rawJSON["setup_required"]; ok {
		t.Error("keycloak mode response should NOT include 'setup_required' field")
	}
}

// ============================================================================
// Public Access Tests
// ============================================================================

func TestGetAuthConfig_PublicAccess(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)

	// Request WITHOUT any auth headers
	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	// Should succeed without authentication
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 for public endpoint, got %d", resp.StatusCode)
	}
}

func TestGetAuthConfig_SupportsGETMethod(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)

	// Test GET method
	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("GET should succeed, got status %d", resp.StatusCode)
	}
}

// ============================================================================
// GetAuthConfigFunc Tests
// ============================================================================

func TestGetAuthConfigFunc_ReturnsValidHandler(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// GetAuthConfigFunc returns an http.HandlerFunc
	handlerFunc := handlers.GetAuthConfigFunc(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handlerFunc(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var result authConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if result.Mode != "local" {
		t.Errorf("expected mode 'local', got %q", result.Mode)
	}
}

// ============================================================================
// Helper Function Tests
// ============================================================================

func TestNewAuthConfigHandler_AcceptsNilPool(t *testing.T) {
	// Handler should be creatable with nil pool (for testing or when DB not needed)
	handler := handlers.NewAuthConfigHandler(nil)
	if handler == nil {
		t.Error("handler should not be nil even with nil pool")
	}
}

// ============================================================================
// JSON Serialization Tests
// ============================================================================

func TestAuthConfigResponse_LocalModeOmitsKeycloakFields(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	// Check that keycloak fields are not present in JSON output
	body := w.Body.String()
	if body == "" {
		t.Fatal("empty response body")
	}

	// These fields should NOT appear in local mode response
	if strings.Contains(body, "keycloak_authority") {
		t.Error("local mode response should not include 'keycloak_authority' field")
	}
	if strings.Contains(body, "client_id") {
		t.Error("local mode response should not include 'client_id' field")
	}
}

func TestAuthConfigResponse_KeycloakModeOmitsSetupRequired(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	handler := handlers.NewAuthConfigHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	w := httptest.NewRecorder()

	handler.GetAuthConfig(w, req)

	// Check that setup_required field is not present in JSON output
	body := w.Body.String()
	if body == "" {
		t.Fatal("empty response body")
	}

	// setup_required should NOT appear in keycloak mode response
	if strings.Contains(body, "setup_required") {
		t.Error("keycloak mode response should not include 'setup_required' field")
	}
}
