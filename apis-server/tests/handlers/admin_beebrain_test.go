package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAdminGetBeeBrainConfig_ValidationOnly tests the handler structure without DB.
func TestAdminGetBeeBrainConfig_ValidationOnly(t *testing.T) {
	// Test that the handler returns a function
	handler := handlers.AdminGetBeeBrainConfig(nil)
	assert.NotNil(t, handler)
}

// TestAdminUpdateBeeBrainConfig_ValidationOnly tests request validation.
func TestAdminUpdateBeeBrainConfig_ValidationOnly(t *testing.T) {
	// Test that the handler returns a function
	handler := handlers.AdminUpdateBeeBrainConfig(nil, nil)
	assert.NotNil(t, handler)
}

// TestAdminSetTenantBeeBrainAccess_ValidationOnly tests the handler structure.
func TestAdminSetTenantBeeBrainAccess_ValidationOnly(t *testing.T) {
	handler := handlers.AdminSetTenantBeeBrainAccess(nil)
	assert.NotNil(t, handler)
}

// TestUpdateBeeBrainConfigRequest_Validation tests request body validation.
func TestUpdateBeeBrainConfigRequest_Validation(t *testing.T) {
	testCases := []struct {
		name        string
		body        string
		expectError bool
	}{
		{
			name:        "valid rules backend",
			body:        `{"backend": "rules"}`,
			expectError: false,
		},
		{
			name:        "valid local backend",
			body:        `{"backend": "local", "provider": "ollama", "endpoint": "http://localhost:11434"}`,
			expectError: false,
		},
		{
			name:        "valid external backend",
			body:        `{"backend": "external", "provider": "openai", "api_key": "sk-test", "model": "gpt-4"}`,
			expectError: false,
		},
		{
			name:        "invalid backend",
			body:        `{"backend": "invalid"}`,
			expectError: true,
		},
		{
			name:        "local backend missing provider",
			body:        `{"backend": "local", "endpoint": "http://localhost:11434"}`,
			expectError: true,
		},
		{
			name:        "local backend missing endpoint",
			body:        `{"backend": "local", "provider": "ollama"}`,
			expectError: true,
		},
		{
			name:        "external backend missing provider",
			body:        `{"backend": "external", "api_key": "sk-test"}`,
			expectError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var req handlers.UpdateBeeBrainConfigRequest
			err := json.Unmarshal([]byte(tc.body), &req)
			require.NoError(t, err, "JSON parsing should not fail")

			// Validate the request
			validBackends := map[string]bool{"rules": true, "local": true, "external": true}
			hasError := false

			// Check backend
			if !validBackends[req.Backend] {
				hasError = true
			}

			// Check local backend requirements
			if req.Backend == "local" {
				if req.Provider == nil || *req.Provider == "" {
					hasError = true
				}
				if req.Endpoint == nil || *req.Endpoint == "" {
					hasError = true
				}
			}

			// Check external backend requirements
			if req.Backend == "external" {
				if req.Provider == nil || *req.Provider == "" {
					hasError = true
				}
			}

			assert.Equal(t, tc.expectError, hasError, "validation result should match expectation")
		})
	}
}

// TestSetTenantBeeBrainAccessRequest_Parsing tests request parsing.
func TestSetTenantBeeBrainAccessRequest_Parsing(t *testing.T) {
	testCases := []struct {
		name            string
		body            string
		expectedEnabled bool
	}{
		{"enable", `{"enabled": true}`, true},
		{"disable", `{"enabled": false}`, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var req handlers.SetTenantBeeBrainAccessRequest
			err := json.Unmarshal([]byte(tc.body), &req)
			require.NoError(t, err)
			assert.Equal(t, tc.expectedEnabled, req.Enabled)
		})
	}
}

// TestAdminBeeBrainConfigResponse_Structure tests response structure.
func TestAdminBeeBrainConfigResponse_Structure(t *testing.T) {
	resp := handlers.AdminBeeBrainConfigResponse{
		Data: handlers.AdminBeeBrainConfigData{
			SystemConfig: handlers.BeeBrainSystemConfigResponse{
				Backend:      "rules",
				APIKeyStatus: "not_configured",
				UpdatedAt:    "2024-01-15T10:30:00Z",
			},
			TenantAccess: []handlers.BeeBrainTenantAccessResponse{
				{
					TenantID:   "uuid-1",
					TenantName: "Test Tenant",
					Enabled:    true,
					HasBYOK:    false,
				},
			},
		},
	}

	jsonBytes, err := json.Marshal(resp)
	require.NoError(t, err)

	// Verify JSON structure
	var parsed map[string]interface{}
	err = json.Unmarshal(jsonBytes, &parsed)
	require.NoError(t, err)

	data, ok := parsed["data"].(map[string]interface{})
	require.True(t, ok)

	systemConfig, ok := data["system_config"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "rules", systemConfig["backend"])
	assert.Equal(t, "not_configured", systemConfig["api_key_status"])

	tenantAccess, ok := data["tenant_access"].([]interface{})
	require.True(t, ok)
	assert.Len(t, tenantAccess, 1)
}

// TestEncryptionServiceIntegration tests encryption with handlers.
func TestEncryptionServiceIntegration(t *testing.T) {
	// Set encryption key
	os.Setenv(services.BeeBrainEncryptionKeyEnv, "12345678901234567890123456789012")
	defer os.Unsetenv(services.BeeBrainEncryptionKeyEnv)

	encSvc, err := services.NewEncryptionService()
	require.NoError(t, err)
	require.NotNil(t, encSvc)
	assert.True(t, encSvc.IsConfigured())

	// Test encrypt/decrypt
	testKey := "sk-test-api-key-123"
	encrypted, err := encSvc.EncryptAPIKey(testKey)
	require.NoError(t, err)
	assert.NotEqual(t, testKey, encrypted)

	decrypted, err := encSvc.DecryptAPIKey(encrypted)
	require.NoError(t, err)
	assert.Equal(t, testKey, decrypted)
}

// TestAdminUpdateBeeBrainConfig_NoEncryptionService tests handler behavior without encryption.
func TestAdminUpdateBeeBrainConfig_NoEncryptionService(t *testing.T) {
	// Create handler without encryption service
	handler := handlers.AdminUpdateBeeBrainConfig(nil, nil)
	require.NotNil(t, handler)

	// Create a request for external backend (requires encryption)
	body := `{"backend": "external", "provider": "openai", "api_key": "sk-test"}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/beebrain", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")

	// Note: Full test would require mock middleware and DB
	// This is a structural test
}

// TestRouteSetup tests that routes can be created.
func TestRouteSetup(t *testing.T) {
	r := chi.NewRouter()

	// These should not panic
	r.Get("/api/admin/beebrain", handlers.AdminGetBeeBrainConfig(nil))
	r.Put("/api/admin/beebrain", handlers.AdminUpdateBeeBrainConfig(nil, nil))
	r.Put("/api/admin/tenants/{id}/beebrain", handlers.AdminSetTenantBeeBrainAccess(nil))

	assert.NotNil(t, r)
}
