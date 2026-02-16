// Package config_test contains unit tests for the APIS server config package.
package config_test

import (
	"strings"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/config"
)

// resetAuthConfig resets the auth configuration between tests.
func resetAuthConfig() {
	config.ResetAuthConfig()
}

// ============================================================================
// InitAuthConfig Tests
// ============================================================================

func TestInitAuthConfig_LocalModeValid(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	err := config.InitAuthConfig()
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if config.AuthMode() != "local" {
		t.Errorf("expected mode 'local', got %q", config.AuthMode())
	}
	if !config.IsLocalAuth() {
		t.Error("expected IsLocalAuth() to return true")
	}
	if config.IsSaaSMode() {
		t.Error("expected IsSaaSMode() to return false")
	}
}

func TestInitAuthConfig_KeycloakModeValid(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	err := config.InitAuthConfig()
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if config.AuthMode() != "keycloak" {
		t.Errorf("expected mode 'keycloak', got %q", config.AuthMode())
	}
	if config.IsLocalAuth() {
		t.Error("expected IsLocalAuth() to return false")
	}
	if !config.IsSaaSMode() {
		t.Error("expected IsSaaSMode() to return true")
	}
}

func TestInitAuthConfig_MissingAuthMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	// Don't set AUTH_MODE
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for missing AUTH_MODE")
	}
	if !strings.Contains(err.Error(), "AUTH_MODE") {
		t.Errorf("error should mention AUTH_MODE, got: %v", err)
	}
}

func TestInitAuthConfig_InvalidAuthMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "invalid")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for invalid AUTH_MODE")
	}
	if !strings.Contains(err.Error(), "invalid") {
		t.Errorf("error should mention invalid mode, got: %v", err)
	}
	if !strings.Contains(err.Error(), "keycloak") {
		t.Errorf("error should mention 'keycloak', got: %v", err)
	}
}

func TestInitAuthConfig_MissingJWTSecretLocalMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	// Don't set JWT_SECRET

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for missing JWT_SECRET in local mode")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("error should mention JWT_SECRET, got: %v", err)
	}
}

func TestInitAuthConfig_MissingKeycloakIssuer(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	// Don't set KEYCLOAK_ISSUER

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for missing KEYCLOAK_ISSUER in keycloak mode")
	}
	if !strings.Contains(err.Error(), "KEYCLOAK_ISSUER") {
		t.Errorf("error should mention KEYCLOAK_ISSUER, got: %v", err)
	}
}

func TestInitAuthConfig_MissingKeycloakClientID(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	// Don't set KEYCLOAK_CLIENT_ID

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for missing KEYCLOAK_CLIENT_ID in keycloak mode")
	}
	if !strings.Contains(err.Error(), "KEYCLOAK_CLIENT_ID") {
		t.Errorf("error should mention KEYCLOAK_CLIENT_ID, got: %v", err)
	}
}

func TestInitAuthConfig_JWTSecretTooShort(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "short") // Only 5 characters

	err := config.InitAuthConfig()
	if err == nil {
		t.Fatal("expected error for JWT_SECRET < 32 characters")
	}
	if !strings.Contains(err.Error(), "32") {
		t.Errorf("error should mention minimum length of 32, got: %v", err)
	}
}

func TestInitAuthConfig_DisableAuthBypassesValidation(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("DISABLE_AUTH", "true")
	// Don't set JWT_SECRET or Keycloak vars

	err := config.InitAuthConfig()
	if err != nil {
		t.Fatalf("DISABLE_AUTH=true should bypass validation, got error: %v", err)
	}

	if !config.IsAuthDisabled() {
		t.Error("expected IsAuthDisabled() to return true")
	}
}

func TestInitAuthConfig_DoubleInitFails(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	err := config.InitAuthConfig()
	if err != nil {
		t.Fatalf("first init should succeed, got: %v", err)
	}

	err = config.InitAuthConfig()
	if err == nil {
		t.Fatal("second init should fail")
	}
	if !strings.Contains(err.Error(), "already initialized") {
		t.Errorf("error should mention already initialized, got: %v", err)
	}
}

// ============================================================================
// SuperAdminEmails Parsing Tests
// ============================================================================

func TestSuperAdminEmails_SingleEmail(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "admin@example.com")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 1 {
		t.Fatalf("expected 1 email, got %d", len(emails))
	}
	if emails[0] != "admin@example.com" {
		t.Errorf("expected 'admin@example.com', got %q", emails[0])
	}
}

func TestSuperAdminEmails_MultipleEmails(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "admin1@example.com,admin2@example.com,admin3@example.com")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 3 {
		t.Fatalf("expected 3 emails, got %d", len(emails))
	}
	expected := []string{"admin1@example.com", "admin2@example.com", "admin3@example.com"}
	for i, email := range emails {
		if email != expected[i] {
			t.Errorf("expected %q at index %d, got %q", expected[i], i, email)
		}
	}
}

func TestSuperAdminEmails_TrimsWhitespace(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "  admin1@example.com  , admin2@example.com  ")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 2 {
		t.Fatalf("expected 2 emails, got %d", len(emails))
	}
	if emails[0] != "admin1@example.com" {
		t.Errorf("expected trimmed email, got %q", emails[0])
	}
}

func TestSuperAdminEmails_IgnoresEmptyEntries(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "admin1@example.com,,  ,admin2@example.com")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 2 {
		t.Fatalf("expected 2 emails (ignoring empty), got %d", len(emails))
	}
}

func TestSuperAdminEmails_LowercasesEmails(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "Admin@Example.COM")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 1 {
		t.Fatalf("expected 1 email, got %d", len(emails))
	}
	if emails[0] != "admin@example.com" {
		t.Errorf("expected lowercase email, got %q", emails[0])
	}
}

func TestSuperAdminEmails_EmptyInLocalMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	// Don't set SUPER_ADMIN_EMAILS

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	emails := config.SuperAdminEmails()
	if len(emails) != 0 {
		t.Errorf("expected empty list in local mode, got %d emails", len(emails))
	}
}

// ============================================================================
// IsSuperAdmin Tests
// ============================================================================

func TestIsSuperAdmin_MatchesEmail(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("SUPER_ADMIN_EMAILS", "admin@example.com,superuser@test.com")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	tests := []struct {
		email    string
		expected bool
	}{
		{"admin@example.com", true},
		{"superuser@test.com", true},
		{"ADMIN@EXAMPLE.COM", true},  // Case insensitive
		{"Admin@Example.Com", true},  // Case insensitive
		{"notadmin@example.com", false},
		{"admin@different.com", false},
		{"", false},
		{"   ", false},
	}

	for _, tt := range tests {
		result := config.IsSuperAdmin(tt.email)
		if result != tt.expected {
			t.Errorf("IsSuperAdmin(%q) = %v, expected %v", tt.email, result, tt.expected)
		}
	}
}

// ============================================================================
// Feature Detection Tests
// ============================================================================

func TestFeatureDetection_LocalMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Local mode features
	if !config.SupportsLocalUserManagement() {
		t.Error("local mode should support local user management")
	}
	if config.SupportsSuperAdmin() {
		t.Error("local mode should NOT support super admin")
	}
	if config.RequiresOIDCAuth() {
		t.Error("local mode should NOT require OIDC auth")
	}
	if config.SupportsMultiTenant() {
		t.Error("local mode should NOT support multi-tenant")
	}
	if !config.SupportsInviteFlow() {
		t.Error("local mode should support invite flow")
	}
}

func TestFeatureDetection_KeycloakMode(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	// Keycloak mode features
	if config.SupportsLocalUserManagement() {
		t.Error("keycloak mode should NOT support local user management")
	}
	if !config.SupportsSuperAdmin() {
		t.Error("keycloak mode should support super admin")
	}
	if !config.RequiresOIDCAuth() {
		t.Error("keycloak mode should require OIDC auth")
	}
	if !config.SupportsMultiTenant() {
		t.Error("keycloak mode should support multi-tenant")
	}
	if config.SupportsInviteFlow() {
		t.Error("keycloak mode should NOT support invite flow")
	}
}

// ============================================================================
// Getter Tests
// ============================================================================

func TestJWTSecret_ReturnsConfiguredValue(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	expectedSecret := "this-is-a-very-long-secret-for-testing-purposes-12345"
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", expectedSecret)

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	if config.JWTSecret() != expectedSecret {
		t.Errorf("expected JWT secret %q, got %q", expectedSecret, config.JWTSecret())
	}
}

func TestKeycloakIssuer_ReturnsConfiguredValue(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	expectedIssuer := "https://keycloak.mycompany.com/realms/honeybee"
	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", expectedIssuer)
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	if config.KeycloakIssuer() != expectedIssuer {
		t.Errorf("expected issuer %q, got %q", expectedIssuer, config.KeycloakIssuer())
	}
}

func TestKeycloakClientID_ReturnsConfiguredValue(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	expectedClientID := "my-client-id"
	t.Setenv("AUTH_MODE", "keycloak")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", expectedClientID)

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	if config.KeycloakClientID() != expectedClientID {
		t.Errorf("expected client ID %q, got %q", expectedClientID, config.KeycloakClientID())
	}
}

func TestDefaultTenantUUID_ReturnsFixedValue(t *testing.T) {
	// DefaultTenantUUID is a constant and doesn't require initialization
	expected := "00000000-0000-0000-0000-000000000000"
	if config.DefaultTenantUUID() != expected {
		t.Errorf("expected default tenant ID %q, got %q", expected, config.DefaultTenantUUID())
	}
}

// ============================================================================
// Local Mode Regression Test
// ============================================================================

func TestInitAuthConfig_LocalModeRegression(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	// Comprehensive regression test for local mode after keycloak migration
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	err := config.InitAuthConfig()
	if err != nil {
		t.Fatalf("local mode init should succeed, got: %v", err)
	}

	if config.AuthMode() != "local" {
		t.Errorf("expected mode 'local', got %q", config.AuthMode())
	}
	if !config.IsLocalAuth() {
		t.Error("expected IsLocalAuth() true")
	}
	if config.IsSaaSMode() {
		t.Error("expected IsSaaSMode() false")
	}
	if !config.SupportsLocalUserManagement() {
		t.Error("expected SupportsLocalUserManagement() true")
	}
	if config.SupportsSuperAdmin() {
		t.Error("expected SupportsSuperAdmin() false")
	}
	if config.RequiresOIDCAuth() {
		t.Error("expected RequiresOIDCAuth() false")
	}
	if config.SupportsMultiTenant() {
		t.Error("expected SupportsMultiTenant() false")
	}
	if !config.SupportsInviteFlow() {
		t.Error("expected SupportsInviteFlow() true")
	}
}

// ============================================================================
// Edge Cases
// ============================================================================

func TestInitAuthConfig_ModeCaseInsensitive(t *testing.T) {
	tests := []struct {
		mode     string
		expected string
	}{
		{"LOCAL", "local"},
		{"Local", "local"},
		{"KEYCLOAK", "keycloak"},
		{"Keycloak", "keycloak"},
	}

	for _, tt := range tests {
		t.Run(tt.mode, func(t *testing.T) {
			resetAuthConfig()
			defer resetAuthConfig()

			t.Setenv("AUTH_MODE", tt.mode)
			t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
			if tt.expected == "keycloak" {
				t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
				t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
			}

			if err := config.InitAuthConfig(); err != nil {
				t.Fatalf("init failed: %v", err)
			}

			if config.AuthMode() != tt.expected {
				t.Errorf("expected mode %q, got %q", tt.expected, config.AuthMode())
			}
		})
	}
}

func TestInitAuthConfig_ModeWithWhitespace(t *testing.T) {
	resetAuthConfig()
	defer resetAuthConfig()

	t.Setenv("AUTH_MODE", "  local  ")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")

	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	if config.AuthMode() != "local" {
		t.Errorf("expected mode 'local', got %q", config.AuthMode())
	}
}
