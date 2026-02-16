// Package testutil provides shared test utilities for the APIS server tests.
// These utilities help set up consistent test environments for both auth modes.
package testutil

import (
	"os"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/jermoo/apis/apis-server/internal/config"
)

// TestJWTSecret is a secure secret used for test JWT generation.
// It meets the minimum 32-character requirement.
const TestJWTSecret = "test-secret-key-must-be-at-least-32-characters-long"

// TestKeycloakIssuer is a mock Keycloak issuer URL for testing.
const TestKeycloakIssuer = "http://localhost:8080"

// TestKeycloakClientID is a mock Keycloak client ID for testing.
const TestKeycloakClientID = "test-client-id"

// SetupLocalMode configures the test environment for local authentication mode.
// It sets the required environment variables and initializes the auth config.
// Returns a cleanup function that must be called when the test completes.
// The cleanup function restores the original environment variables.
//
// Usage:
//
//	func TestMyFeature(t *testing.T) {
//	    cleanup := testutil.SetupLocalMode(t)
//	    defer cleanup()
//	    // ... test code
//	}
func SetupLocalMode(t *testing.T) func() {
	t.Helper()

	// Save original values
	origAuthMode := os.Getenv("AUTH_MODE")
	origJWTSecret := os.Getenv("JWT_SECRET")

	// Reset any existing config
	config.ResetAuthConfig()

	// Set local mode environment variables
	os.Setenv("AUTH_MODE", "local")
	os.Setenv("JWT_SECRET", TestJWTSecret)

	// Initialize auth config
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("testutil.SetupLocalMode: failed to init auth config: %v", err)
	}

	// Return cleanup function that restores original values
	return func() {
		config.ResetAuthConfig()
		if origAuthMode != "" {
			os.Setenv("AUTH_MODE", origAuthMode)
		} else {
			os.Unsetenv("AUTH_MODE")
		}
		if origJWTSecret != "" {
			os.Setenv("JWT_SECRET", origJWTSecret)
		} else {
			os.Unsetenv("JWT_SECRET")
		}
	}
}

// SetupKeycloakMode configures the test environment for Keycloak (SaaS) authentication mode.
// It sets the required environment variables with mock values and initializes the auth config.
// Returns a cleanup function that must be called when the test completes.
// The cleanup function restores the original environment variables.
//
// Usage:
//
//	func TestSuperAdminFeature(t *testing.T) {
//	    cleanup := testutil.SetupKeycloakMode(t)
//	    defer cleanup()
//	    // ... test code
//	}
func SetupKeycloakMode(t *testing.T) func() {
	t.Helper()

	// Save original values
	origAuthMode := os.Getenv("AUTH_MODE")
	origJWTSecret := os.Getenv("JWT_SECRET")
	origIssuer := os.Getenv("KEYCLOAK_ISSUER")
	origClientID := os.Getenv("KEYCLOAK_CLIENT_ID")
	origSuperAdmins := os.Getenv("SUPER_ADMIN_EMAILS")

	// Reset any existing config
	config.ResetAuthConfig()

	// Set Keycloak mode environment variables
	os.Setenv("AUTH_MODE", "keycloak")
	os.Setenv("JWT_SECRET", TestJWTSecret)
	os.Setenv("KEYCLOAK_ISSUER", TestKeycloakIssuer)
	os.Setenv("KEYCLOAK_CLIENT_ID", TestKeycloakClientID)

	// Initialize auth config
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("testutil.SetupKeycloakMode: failed to init auth config: %v", err)
	}

	// Return cleanup function that restores original values
	return func() {
		config.ResetAuthConfig()
		restoreEnvVar("AUTH_MODE", origAuthMode)
		restoreEnvVar("JWT_SECRET", origJWTSecret)
		restoreEnvVar("KEYCLOAK_ISSUER", origIssuer)
		restoreEnvVar("KEYCLOAK_CLIENT_ID", origClientID)
		restoreEnvVar("SUPER_ADMIN_EMAILS", origSuperAdmins)
	}
}

// SetupKeycloakModeWithSuperAdmin configures Keycloak mode with super admin emails.
// This is useful for testing super-admin specific functionality.
// The cleanup function restores the original environment variables.
//
// Usage:
//
//	func TestSuperAdminPanel(t *testing.T) {
//	    cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "admin@example.com")
//	    defer cleanup()
//	    // ... test code
//	}
func SetupKeycloakModeWithSuperAdmin(t *testing.T, superAdminEmails string) func() {
	t.Helper()

	// Save original values
	origAuthMode := os.Getenv("AUTH_MODE")
	origJWTSecret := os.Getenv("JWT_SECRET")
	origIssuer := os.Getenv("KEYCLOAK_ISSUER")
	origClientID := os.Getenv("KEYCLOAK_CLIENT_ID")
	origSuperAdmins := os.Getenv("SUPER_ADMIN_EMAILS")

	// Reset any existing config
	config.ResetAuthConfig()

	// Set Keycloak mode environment variables
	os.Setenv("AUTH_MODE", "keycloak")
	os.Setenv("JWT_SECRET", TestJWTSecret)
	os.Setenv("KEYCLOAK_ISSUER", TestKeycloakIssuer)
	os.Setenv("KEYCLOAK_CLIENT_ID", TestKeycloakClientID)
	os.Setenv("SUPER_ADMIN_EMAILS", superAdminEmails)

	// Initialize auth config
	if err := config.InitAuthConfig(); err != nil {
		t.Fatalf("testutil.SetupKeycloakModeWithSuperAdmin: failed to init auth config: %v", err)
	}

	// Return cleanup function that restores original values
	return func() {
		config.ResetAuthConfig()
		restoreEnvVar("AUTH_MODE", origAuthMode)
		restoreEnvVar("JWT_SECRET", origJWTSecret)
		restoreEnvVar("KEYCLOAK_ISSUER", origIssuer)
		restoreEnvVar("KEYCLOAK_CLIENT_ID", origClientID)
		restoreEnvVar("SUPER_ADMIN_EMAILS", origSuperAdmins)
	}
}

// restoreEnvVar restores an environment variable to its original value.
// If the original value was empty, it unsets the variable.
func restoreEnvVar(key, originalValue string) {
	if originalValue != "" {
		os.Setenv(key, originalValue)
	} else {
		os.Unsetenv(key)
	}
}

// SkipIfNotLocalMode skips the test if not running in local auth mode.
// Use this at the start of tests that only apply to local mode.
//
// Usage:
//
//	func TestSetupWizard(t *testing.T) {
//	    testutil.SkipIfNotLocalMode(t)
//	    // ... test code for local mode only
//	}
func SkipIfNotLocalMode(t *testing.T) {
	t.Helper()

	mode := os.Getenv("AUTH_MODE")
	if mode == "" {
		// If AUTH_MODE is not set, default to running the test (backwards compatibility)
		return
	}

	if mode != "local" {
		t.Skipf("skipping test: requires local auth mode (current: %s)", mode)
	}
}

// SkipIfNotKeycloakMode skips the test if not running in Keycloak/SaaS auth mode.
// Use this at the start of tests that only apply to Keycloak/SaaS mode.
//
// Usage:
//
//	func TestSuperAdminAccess(t *testing.T) {
//	    testutil.SkipIfNotKeycloakMode(t)
//	    // ... test code for Keycloak mode only
//	}
func SkipIfNotKeycloakMode(t *testing.T) {
	t.Helper()

	mode := os.Getenv("AUTH_MODE")
	if mode != "keycloak" {
		t.Skipf("skipping test: requires keycloak auth mode (AUTH_MODE=%q)", mode)
	}
}

// TestUserClaims holds claims data for generating test JWTs.
type TestUserClaims struct {
	UserID   string
	TenantID string
	Email    string
	Name     string
	Role     string
}

// DefaultTestUser returns a default test user with admin role.
func DefaultTestUser() TestUserClaims {
	return TestUserClaims{
		UserID:   "test-user-123",
		TenantID: config.DefaultTenantID,
		Email:    "test@example.com",
		Name:     "Test User",
		Role:     "admin",
	}
}

// TestUserOptions provides options for creating test users.
type TestUserOptions struct {
	UserID   string
	TenantID string
	Email    string
	Name     string
	Role     string
}

// CreateTestUser creates a test user with the given options.
// Any fields not specified in opts will use default values.
// This satisfies AC5's requirement for CreateTestUser(t, opts).
//
// Usage:
//
//	user := testutil.CreateTestUser(t, testutil.TestUserOptions{
//	    Role: "member",
//	    Email: "member@example.com",
//	})
func CreateTestUser(t *testing.T, opts TestUserOptions) TestUserClaims {
	t.Helper()

	claims := DefaultTestUser()

	if opts.UserID != "" {
		claims.UserID = opts.UserID
	}
	if opts.TenantID != "" {
		claims.TenantID = opts.TenantID
	}
	if opts.Email != "" {
		claims.Email = opts.Email
	}
	if opts.Name != "" {
		claims.Name = opts.Name
	}
	if opts.Role != "" {
		claims.Role = opts.Role
	}

	return claims
}

// GenerateTestJWT creates a JWT token for testing purposes.
// It uses the test JWT secret and sets standard claims.
// This is useful for testing authenticated endpoints.
//
// Usage:
//
//	token := testutil.GenerateTestJWT(t, testutil.DefaultTestUser())
//	req.Header.Set("Authorization", "Bearer "+token)
func GenerateTestJWT(t *testing.T, claims TestUserClaims) string {
	t.Helper()

	now := time.Now()

	// Create claims structure matching LocalClaims
	tokenClaims := struct {
		jwt.Claims
		TenantID string `json:"tenant_id"`
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
	}{
		Claims: jwt.Claims{
			Subject:   claims.UserID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Expiry:    jwt.NewNumericDate(now.Add(time.Hour)),
			Issuer:    "apis-test",
		},
		TenantID: claims.TenantID,
		Email:    claims.Email,
		Name:     claims.Name,
		Role:     claims.Role,
	}

	// Create signer with HS256 algorithm
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(TestJWTSecret)},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	if err != nil {
		t.Fatalf("testutil.GenerateTestJWT: failed to create signer: %v", err)
	}

	// Sign and serialize the token
	tokenString, err := jwt.Signed(signer).Claims(tokenClaims).Serialize()
	if err != nil {
		t.Fatalf("testutil.GenerateTestJWT: failed to sign token: %v", err)
	}

	return tokenString
}

// GenerateTestJWTWithExpiry creates a JWT token with a custom expiry duration.
// Use this for testing token expiration scenarios.
func GenerateTestJWTWithExpiry(t *testing.T, claims TestUserClaims, expiry time.Duration) string {
	t.Helper()

	now := time.Now()

	tokenClaims := struct {
		jwt.Claims
		TenantID string `json:"tenant_id"`
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
	}{
		Claims: jwt.Claims{
			Subject:   claims.UserID,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Expiry:    jwt.NewNumericDate(now.Add(expiry)),
			Issuer:    "apis-test",
		},
		TenantID: claims.TenantID,
		Email:    claims.Email,
		Name:     claims.Name,
		Role:     claims.Role,
	}

	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(TestJWTSecret)},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	if err != nil {
		t.Fatalf("testutil.GenerateTestJWTWithExpiry: failed to create signer: %v", err)
	}

	tokenString, err := jwt.Signed(signer).Claims(tokenClaims).Serialize()
	if err != nil {
		t.Fatalf("testutil.GenerateTestJWTWithExpiry: failed to sign token: %v", err)
	}

	return tokenString
}

// GenerateExpiredTestJWT creates an already-expired JWT token.
// Use this for testing token validation rejection.
func GenerateExpiredTestJWT(t *testing.T, claims TestUserClaims) string {
	t.Helper()

	now := time.Now()

	tokenClaims := struct {
		jwt.Claims
		TenantID string `json:"tenant_id"`
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
	}{
		Claims: jwt.Claims{
			Subject:   claims.UserID,
			IssuedAt:  jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			NotBefore: jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			Expiry:    jwt.NewNumericDate(now.Add(-1 * time.Hour)), // Expired 1 hour ago
			Issuer:    "apis-test",
		},
		TenantID: claims.TenantID,
		Email:    claims.Email,
		Name:     claims.Name,
		Role:     claims.Role,
	}

	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(TestJWTSecret)},
		(&jose.SignerOptions{}).WithType("JWT"),
	)
	if err != nil {
		t.Fatalf("testutil.GenerateExpiredTestJWT: failed to create signer: %v", err)
	}

	tokenString, err := jwt.Signed(signer).Claims(tokenClaims).Serialize()
	if err != nil {
		t.Fatalf("testutil.GenerateExpiredTestJWT: failed to sign token: %v", err)
	}

	return tokenString
}

// GetCurrentAuthMode returns the current auth mode from environment.
// Returns "local" as default if AUTH_MODE is not set.
func GetCurrentAuthMode() string {
	mode := os.Getenv("AUTH_MODE")
	if mode == "" {
		return "local"
	}
	return mode
}

// IsLocalMode returns true if the current auth mode is "local".
func IsLocalMode() bool {
	return GetCurrentAuthMode() == "local"
}

// IsKeycloakMode returns true if the current auth mode is "keycloak".
func IsKeycloakMode() bool {
	return GetCurrentAuthMode() == "keycloak"
}

// IsSaaSMode returns true if the current auth mode is "keycloak".
func IsSaaSMode() bool {
	return GetCurrentAuthMode() == "keycloak"
}
