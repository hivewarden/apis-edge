// Package testutil_test contains tests for the testutil package itself.
package testutil_test

import (
	"os"
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/tests/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSetupLocalMode tests that SetupLocalMode correctly configures local auth mode.
func TestSetupLocalMode(t *testing.T) {
	cleanup := testutil.SetupLocalMode(t)
	defer cleanup()

	// Verify auth mode is set correctly
	assert.Equal(t, "local", config.AuthMode())
	assert.True(t, config.IsLocalAuth())
	assert.False(t, config.IsSaaSMode())

	// Verify JWT secret is set
	assert.Equal(t, testutil.TestJWTSecret, config.JWTSecret())
}

// TestSetupLocalMode_RestoresEnvVars tests that cleanup restores original env vars.
func TestSetupLocalMode_RestoresEnvVars(t *testing.T) {
	// Set a custom value first
	os.Setenv("AUTH_MODE", "original-mode")
	defer os.Unsetenv("AUTH_MODE")

	cleanup := testutil.SetupLocalMode(t)

	// Verify it was changed
	assert.Equal(t, "local", os.Getenv("AUTH_MODE"))

	// Run cleanup
	cleanup()

	// Verify it was restored
	assert.Equal(t, "original-mode", os.Getenv("AUTH_MODE"))
}

// TestSetupKeycloakMode tests that SetupKeycloakMode correctly configures Keycloak auth mode.
func TestSetupKeycloakMode(t *testing.T) {
	cleanup := testutil.SetupKeycloakMode(t)
	defer cleanup()

	// Verify auth mode is set correctly
	assert.Equal(t, "keycloak", config.AuthMode())
	assert.False(t, config.IsLocalAuth())
	assert.True(t, config.IsSaaSMode())

	// Verify Keycloak config is set
	assert.Equal(t, testutil.TestKeycloakIssuer, config.KeycloakIssuer())
	assert.Equal(t, testutil.TestKeycloakClientID, config.KeycloakClientID())
}

// TestSetupKeycloakModeWithSuperAdmin tests super admin configuration.
func TestSetupKeycloakModeWithSuperAdmin(t *testing.T) {
	cleanup := testutil.SetupKeycloakModeWithSuperAdmin(t, "admin@example.com,superuser@test.com")
	defer cleanup()

	// Verify super admin emails are set
	assert.True(t, config.IsSuperAdmin("admin@example.com"))
	assert.True(t, config.IsSuperAdmin("superuser@test.com"))
	assert.True(t, config.IsSuperAdmin("ADMIN@EXAMPLE.COM")) // Case insensitive
	assert.False(t, config.IsSuperAdmin("other@example.com"))
}

// TestSkipFunctions_Behavior tests the skip functions work correctly.
// Note: We can't directly test that Skip() is called because it uses SkipNow()
// which halts the test. Instead, we test the underlying mode detection logic.
func TestSkipFunctions_Behavior(t *testing.T) {
	orig := os.Getenv("AUTH_MODE")
	defer func() {
		if orig != "" {
			os.Setenv("AUTH_MODE", orig)
		} else {
			os.Unsetenv("AUTH_MODE")
		}
	}()

	t.Run("IsLocalMode returns true when AUTH_MODE=local", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "local")
		assert.True(t, testutil.IsLocalMode())
	})

	t.Run("IsLocalMode returns true when AUTH_MODE is empty", func(t *testing.T) {
		os.Unsetenv("AUTH_MODE")
		assert.True(t, testutil.IsLocalMode())
	})

	t.Run("IsLocalMode returns false when AUTH_MODE=keycloak", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "keycloak")
		assert.False(t, testutil.IsLocalMode())
	})

	t.Run("IsKeycloakMode returns true when AUTH_MODE=keycloak", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "keycloak")
		assert.True(t, testutil.IsKeycloakMode())
	})

	t.Run("IsKeycloakMode returns false when AUTH_MODE=local", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "local")
		assert.False(t, testutil.IsKeycloakMode())
	})

	t.Run("IsSaaSMode returns true for keycloak", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "keycloak")
		assert.True(t, testutil.IsSaaSMode())
	})

	t.Run("IsSaaSMode returns false for local", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "local")
		assert.False(t, testutil.IsSaaSMode())
	})
}

// TestDefaultTestUser tests the default test user factory.
func TestDefaultTestUser(t *testing.T) {
	user := testutil.DefaultTestUser()

	assert.NotEmpty(t, user.UserID)
	assert.NotEmpty(t, user.TenantID)
	assert.NotEmpty(t, user.Email)
	assert.NotEmpty(t, user.Name)
	assert.Equal(t, "admin", user.Role)
}

// TestCreateTestUser tests the CreateTestUser function with options.
func TestCreateTestUser(t *testing.T) {
	t.Run("with empty options returns defaults", func(t *testing.T) {
		user := testutil.CreateTestUser(t, testutil.TestUserOptions{})

		defaultUser := testutil.DefaultTestUser()
		assert.Equal(t, defaultUser.UserID, user.UserID)
		assert.Equal(t, defaultUser.TenantID, user.TenantID)
		assert.Equal(t, defaultUser.Email, user.Email)
		assert.Equal(t, defaultUser.Name, user.Name)
		assert.Equal(t, defaultUser.Role, user.Role)
	})

	t.Run("with custom role", func(t *testing.T) {
		user := testutil.CreateTestUser(t, testutil.TestUserOptions{
			Role: "member",
		})

		assert.Equal(t, "member", user.Role)
		// Other fields should still have defaults
		assert.NotEmpty(t, user.UserID)
		assert.NotEmpty(t, user.Email)
	})

	t.Run("with all custom fields", func(t *testing.T) {
		user := testutil.CreateTestUser(t, testutil.TestUserOptions{
			UserID:   "custom-user-id",
			TenantID: "custom-tenant-id",
			Email:    "custom@example.com",
			Name:     "Custom User",
			Role:     "member",
		})

		assert.Equal(t, "custom-user-id", user.UserID)
		assert.Equal(t, "custom-tenant-id", user.TenantID)
		assert.Equal(t, "custom@example.com", user.Email)
		assert.Equal(t, "Custom User", user.Name)
		assert.Equal(t, "member", user.Role)
	})
}

// TestGenerateTestJWT tests JWT generation.
func TestGenerateTestJWT(t *testing.T) {
	claims := testutil.DefaultTestUser()
	token := testutil.GenerateTestJWT(t, claims)

	assert.NotEmpty(t, token)

	// Verify the token is valid
	parsedClaims, err := auth.ValidateLocalJWT(token, testutil.TestJWTSecret)
	require.NoError(t, err)

	assert.Equal(t, claims.UserID, parsedClaims.Subject)
	assert.Equal(t, claims.TenantID, parsedClaims.TenantID)
	assert.Equal(t, claims.Email, parsedClaims.Email)
	assert.Equal(t, claims.Name, parsedClaims.Name)
	assert.Equal(t, claims.Role, parsedClaims.Role)
}

// TestGenerateTestJWTWithExpiry tests JWT generation with custom expiry.
func TestGenerateTestJWTWithExpiry(t *testing.T) {
	claims := testutil.DefaultTestUser()
	token := testutil.GenerateTestJWTWithExpiry(t, claims, 5*time.Minute)

	assert.NotEmpty(t, token)

	// Verify the token is valid
	parsedClaims, err := auth.ValidateLocalJWT(token, testutil.TestJWTSecret)
	require.NoError(t, err)

	assert.Equal(t, claims.UserID, parsedClaims.Subject)
}

// TestGenerateExpiredTestJWT tests expired JWT generation.
func TestGenerateExpiredTestJWT(t *testing.T) {
	claims := testutil.DefaultTestUser()
	token := testutil.GenerateExpiredTestJWT(t, claims)

	assert.NotEmpty(t, token)

	// Verify the token is expired
	_, err := auth.ValidateLocalJWT(token, testutil.TestJWTSecret)
	assert.Error(t, err)
	assert.ErrorIs(t, err, auth.ErrTokenExpired)
}

// TestGetCurrentAuthMode tests auth mode detection.
func TestGetCurrentAuthMode(t *testing.T) {
	// Save and restore original
	orig := os.Getenv("AUTH_MODE")
	defer func() {
		if orig != "" {
			os.Setenv("AUTH_MODE", orig)
		} else {
			os.Unsetenv("AUTH_MODE")
		}
	}()

	t.Run("returns local when AUTH_MODE is empty", func(t *testing.T) {
		os.Unsetenv("AUTH_MODE")
		assert.Equal(t, "local", testutil.GetCurrentAuthMode())
	})

	t.Run("returns local when AUTH_MODE is local", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "local")
		assert.Equal(t, "local", testutil.GetCurrentAuthMode())
	})

	t.Run("returns keycloak when AUTH_MODE is keycloak", func(t *testing.T) {
		os.Setenv("AUTH_MODE", "keycloak")
		assert.Equal(t, "keycloak", testutil.GetCurrentAuthMode())
	})
}

// TestIsLocalMode tests local mode detection.
func TestIsLocalMode(t *testing.T) {
	orig := os.Getenv("AUTH_MODE")
	defer func() {
		if orig != "" {
			os.Setenv("AUTH_MODE", orig)
		} else {
			os.Unsetenv("AUTH_MODE")
		}
	}()

	os.Setenv("AUTH_MODE", "local")
	assert.True(t, testutil.IsLocalMode())

	os.Setenv("AUTH_MODE", "keycloak")
	assert.False(t, testutil.IsLocalMode())
}

// TestIsKeycloakMode tests Keycloak mode detection.
func TestIsKeycloakMode(t *testing.T) {
	orig := os.Getenv("AUTH_MODE")
	defer func() {
		if orig != "" {
			os.Setenv("AUTH_MODE", orig)
		} else {
			os.Unsetenv("AUTH_MODE")
		}
	}()

	os.Setenv("AUTH_MODE", "keycloak")
	assert.True(t, testutil.IsKeycloakMode())

	os.Setenv("AUTH_MODE", "local")
	assert.False(t, testutil.IsKeycloakMode())
}

// TestConstants verifies test constants have appropriate values.
func TestConstants(t *testing.T) {
	// JWT secret must be at least 32 characters
	assert.GreaterOrEqual(t, len(testutil.TestJWTSecret), 32)

	// Keycloak issuer should be a valid URL
	assert.Contains(t, testutil.TestKeycloakIssuer, "://")

	// Client ID should not be empty
	assert.NotEmpty(t, testutil.TestKeycloakClientID)
}
