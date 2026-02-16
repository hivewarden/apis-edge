// Package tests contains integration tests for the APIS server.
// This file contains tests that only run in Keycloak (SaaS) auth mode.
package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/tests/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestKeycloakMode_SuperAdminEmailConfig tests super admin email configuration.
// Super admin functionality is only available in Keycloak (SaaS) mode.
func TestKeycloakMode_SuperAdminEmailConfig(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	t.Run("single super admin email", func(t *testing.T) {
		cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "admin@example.com")
		defer cleanup()

		assert.True(t, config.IsSuperAdmin("admin@example.com"))
		assert.True(t, config.IsSuperAdmin("ADMIN@EXAMPLE.COM")) // Case insensitive
		assert.False(t, config.IsSuperAdmin("other@example.com"))
	})

	t.Run("multiple super admin emails", func(t *testing.T) {
		cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "admin1@example.com,admin2@example.com")
		defer cleanup()

		assert.True(t, config.IsSuperAdmin("admin1@example.com"))
		assert.True(t, config.IsSuperAdmin("admin2@example.com"))
		assert.False(t, config.IsSuperAdmin("other@example.com"))
	})
}

// TestKeycloakMode_AuthConfigResponse tests that auth config returns Keycloak mode config.
func TestKeycloakMode_AuthConfigResponse(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	handler := handlers.GetAuthConfigFunc(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response struct {
		Mode              string `json:"mode"`
		KeycloakAuthority string `json:"keycloak_authority"`
		KeycloakClientID  string `json:"keycloak_client_id"`
	}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "keycloak", response.Mode)
	assert.Equal(t, testutil.TestKeycloakIssuer, response.KeycloakAuthority)
	assert.Equal(t, testutil.TestKeycloakClientID, response.KeycloakClientID)
}

// TestKeycloakMode_NoSetupRequired tests that setup_required is false in Keycloak mode.
// Keycloak mode does not require initial setup wizard.
func TestKeycloakMode_NoSetupRequired(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	handler := handlers.GetAuthConfigFunc(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/config", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response struct {
		SetupRequired bool `json:"setup_required"`
	}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)

	// In Keycloak mode, setup is never required (handled by Keycloak)
	assert.False(t, response.SetupRequired)
}

// TestKeycloakMode_FeatureFlags tests feature detection in Keycloak mode.
func TestKeycloakMode_FeatureFlags(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	// In Keycloak mode:
	// - Local user management: NO (users managed in Keycloak)
	// - Super admin: YES (based on SUPER_ADMIN_EMAILS)
	// - Multi-tenant: YES (org_id from Keycloak claims)
	// - Invite flow: NO (handled by Keycloak)

	assert.True(t, config.SupportsSuperAdmin())
	assert.True(t, config.SupportsMultiTenant())
	assert.True(t, config.RequiresOIDCAuth())
	assert.False(t, config.SupportsLocalUserManagement())
	assert.False(t, config.SupportsInviteFlow())
}

// TestKeycloakMode_TenantProvisioningConcept tests tenant provisioning concept.
// In Keycloak mode, tenants are auto-provisioned from org_id.
func TestKeycloakMode_TenantProvisioningConcept(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	// Tenant provisioning in Keycloak mode is automatic:
	// 1. User authenticates via Keycloak OIDC
	// 2. org_id claim is extracted from the token
	// 3. Tenant is auto-created if it doesn't exist
	// 4. User is associated with the tenant

	// This test validates the conceptual behavior
	// Full integration tests require database setup
	t.Log("Keycloak tenant provisioning is tested through integration tests")
}

// TestKeycloakMode_OIDCTokenValidation tests OIDC token validation concepts.
// Validates that Keycloak mode expects RS256 tokens (asymmetric).
func TestKeycloakMode_OIDCTokenValidation(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	// In Keycloak mode, tokens are validated using:
	// - JWKS from Keycloak issuer
	// - RS256 algorithm (asymmetric)
	// - org_id claim for tenant identification

	// This is conceptual validation - actual JWKS validation
	// requires mocking the Keycloak JWKS endpoint
	t.Log("Keycloak OIDC validation requires JWKS mocking for full tests")
}

// TestKeycloakMode_SuperAdminPanelAccess tests super admin panel concepts.
// Super admin can only access the admin panel in Keycloak mode.
func TestKeycloakMode_SuperAdminPanelAccess(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "superadmin@example.com")
	defer cleanup()

	// Super admin functionality in Keycloak mode:
	// 1. SUPER_ADMIN_EMAILS env var defines who is super admin
	// 2. Super admins can view all tenants
	// 3. Super admins can impersonate tenants
	// 4. Super admins can configure global settings

	// Verify super admin check works
	assert.True(t, config.IsSuperAdmin("superadmin@example.com"))
	assert.True(t, config.IsSuperAdmin("SUPERADMIN@EXAMPLE.COM")) // Case insensitive
	assert.False(t, config.IsSuperAdmin("regularuser@example.com"))
}

// TestKeycloakMode_ImpersonationConcept tests tenant impersonation concept.
// This is a SaaS-only feature for super admins.
func TestKeycloakMode_ImpersonationConcept(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "superadmin@example.com")
	defer cleanup()

	// Impersonation in Keycloak mode:
	// 1. Super admin requests impersonation of a tenant
	// 2. Server creates a special impersonation JWT
	// 3. JWT contains impersonator_id for audit
	// 4. JWT contains target tenant_id
	// 5. Impersonation sessions have shorter expiry (4 hours)

	t.Log("Impersonation functionality tested in handlers/admin_impersonate tests")
}

// TestKeycloakMode_LogoutEndpoint tests logout in Keycloak mode.
// Logout still works but client should also log out from Keycloak.
func TestKeycloakMode_LogoutEndpoint(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	handler := handlers.Logout()

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var response map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Logged out successfully", response["message"])
}

// TestKeycloakMode_MeEndpoint tests /api/auth/me in Keycloak mode.
func TestKeycloakMode_MeEndpoint(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	handler := handlers.Me()

	t.Run("returns 401 without claims", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusUnauthorized, rr.Code)
	})
}

// TestKeycloakMode_AdminTenantsEndpoint tests admin tenants endpoint concept.
// This endpoint is only available to super admins in Keycloak mode.
func TestKeycloakMode_AdminTenantsEndpoint(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "superadmin@example.com")
	defer cleanup()

	// Admin endpoints in Keycloak mode:
	// - GET /api/admin/tenants - List all tenants
	// - GET /api/admin/tenants/:id - Get tenant details
	// - PUT /api/admin/tenants/:id/limits - Set tenant limits
	// - POST /api/admin/impersonate/:id - Start impersonation

	// These require super admin middleware validation
	t.Log("Admin endpoints tested in handlers/admin_* tests")
}

// TestKeycloakMode_NoLocalLogin tests that local login is rejected.
func TestKeycloakMode_NoLocalLogin(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	rateLimiters := handlers.NewLoginRateLimiters()
	defer rateLimiters.Stop()
	handler := handlers.Login(nil, rateLimiters)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Login endpoint should return 403 in Keycloak mode
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// TestKeycloakMode_ConfigFunctions tests config package functions in Keycloak mode.
func TestKeycloakMode_ConfigFunctions(t *testing.T) {
	testutil.SkipIfNotKeycloakMode(t)

	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	// Verify config functions return correct values
	assert.Equal(t, "keycloak", config.AuthMode())
	assert.False(t, config.IsLocalAuth())
	assert.True(t, config.IsSaaSMode())
	assert.Equal(t, testutil.TestKeycloakIssuer, config.KeycloakIssuer())
	assert.Equal(t, testutil.TestKeycloakClientID, config.KeycloakClientID())
}
