// Package config provides configuration and build information for the APIS server.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

// Auth mode constants
const (
	// ModeLocal represents standalone/local authentication mode using local user database.
	ModeLocal = "local"
	// ModeKeycloak represents SaaS mode using Keycloak OIDC authentication.
	ModeKeycloak = "keycloak"
)

// DefaultTenantID is the fixed UUID used for the default tenant in local mode.
// The all-zeros UUID was chosen because:
// - It is instantly recognizable in logs and database queries
// - It is consistent across all standalone deployments (no coordination needed)
// - It is clearly distinct from any Keycloak organization ID
// - It simplifies documentation and troubleshooting
const DefaultTenantID = "00000000-0000-0000-0000-000000000000"

// minJWTSecretLength is the minimum required length for JWT secrets to ensure adequate entropy.
const minJWTSecretLength = 32

var (
	// authConfig holds the parsed authentication configuration.
	// It is initialized once at startup and never changes.
	authConfig *authConfigData
	authMu     sync.RWMutex
)

// authConfigData holds the parsed authentication configuration values.
type authConfigData struct {
	mode              string
	jwtSecret         string
	keycloakIssuer    string
	keycloakClientID  string
	superAdminEmails  []string
	disableAuth       bool
}

// InitAuthConfig initializes the authentication configuration from environment variables.
// This must be called once at startup before any other config functions are used.
// Returns an error if required configuration is missing or invalid.
func InitAuthConfig() error {
	authMu.Lock()
	defer authMu.Unlock()

	if authConfig != nil {
		return errors.New("config: AUTH_MODE already initialized, cannot reinitialize")
	}

	cfg := &authConfigData{}

	// Parse AUTH_MODE (required)
	mode := os.Getenv("AUTH_MODE")
	if mode == "" {
		return errors.New("config: AUTH_MODE is required, set to 'local' or 'keycloak'")
	}
	mode = strings.ToLower(strings.TrimSpace(mode))

	if mode != ModeLocal && mode != ModeKeycloak {
		return fmt.Errorf("config: invalid AUTH_MODE '%s' (must be 'local' or 'keycloak')", mode)
	}
	cfg.mode = mode

	// Parse DISABLE_AUTH (optional, for development)
	cfg.disableAuth = os.Getenv("DISABLE_AUTH") == "true"

	// Parse JWT_SECRET (required in both modes)
	cfg.jwtSecret = os.Getenv("JWT_SECRET")
	if cfg.jwtSecret == "" && !cfg.disableAuth {
		return errors.New("config: JWT_SECRET is required")
	}
	if cfg.jwtSecret != "" && len(cfg.jwtSecret) < minJWTSecretLength {
		return fmt.Errorf("config: JWT_SECRET must be at least %d characters (got %d)", minJWTSecretLength, len(cfg.jwtSecret))
	}

	// Mode-specific validation
	if mode == ModeKeycloak {
		// Keycloak mode requires KEYCLOAK_ISSUER and KEYCLOAK_CLIENT_ID
		cfg.keycloakIssuer = os.Getenv("KEYCLOAK_ISSUER")
		if cfg.keycloakIssuer == "" && !cfg.disableAuth {
			return errors.New("config: KEYCLOAK_ISSUER is required in keycloak mode")
		}

		cfg.keycloakClientID = os.Getenv("KEYCLOAK_CLIENT_ID")
		if cfg.keycloakClientID == "" && !cfg.disableAuth {
			return errors.New("config: KEYCLOAK_CLIENT_ID is required in keycloak mode")
		}

		// E15-H3: Enforce HTTPS for Keycloak issuer in production
		if cfg.keycloakIssuer != "" && !cfg.disableAuth {
			goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
			if goEnv == "production" && !strings.HasPrefix(cfg.keycloakIssuer, "https://") {
				return fmt.Errorf("config: KEYCLOAK_ISSUER must use HTTPS in production (got: %s)", cfg.keycloakIssuer)
			}
			if !strings.HasPrefix(cfg.keycloakIssuer, "https://") {
				log.Warn().Str("issuer", cfg.keycloakIssuer).
					Msg("KEYCLOAK_ISSUER uses HTTP — use HTTPS in production")
			}
		}

		// Parse SUPER_ADMIN_EMAILS (optional, comma-separated)
		superAdminEnv := os.Getenv("SUPER_ADMIN_EMAILS")
		if superAdminEnv != "" {
			emails := strings.Split(superAdminEnv, ",")
			cfg.superAdminEmails = make([]string, 0, len(emails))
			for _, email := range emails {
				email = strings.TrimSpace(strings.ToLower(email))
				if email != "" {
					cfg.superAdminEmails = append(cfg.superAdminEmails, email)
				}
			}
		}
	} else {
		// Local mode: Keycloak vars are ignored but may be present
		// Store them anyway in case they're used for something else
		cfg.keycloakIssuer = os.Getenv("KEYCLOAK_ISSUER")
		cfg.keycloakClientID = os.Getenv("KEYCLOAK_CLIENT_ID")
	}

	authConfig = cfg
	return nil
}

// ResetAuthConfig resets the auth configuration for testing purposes.
// This should only be used in tests.
func ResetAuthConfig() {
	authMu.Lock()
	defer authMu.Unlock()
	authConfig = nil
}

// mustGetConfig returns the auth config, panicking if not initialized.
// IMPORTANT: This function must only be called while already holding authMu.RLock().
// It does not acquire any locks itself to avoid potential deadlocks.
func mustGetConfig() *authConfigData {
	if authConfig == nil {
		panic("config: auth not initialized - call InitAuthConfig first")
	}
	return authConfig
}

// AuthMode returns the current authentication mode ("local" or "keycloak").
// Panics if called before InitAuthConfig.
func AuthMode() string {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().mode
}

// IsLocalAuth returns true if running in local authentication mode.
// Panics if called before InitAuthConfig.
func IsLocalAuth() bool {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().mode == ModeLocal
}

// IsSaaSMode returns true if running in SaaS (Keycloak) mode.
// Panics if called before InitAuthConfig.
func IsSaaSMode() bool {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().mode == ModeKeycloak
}

// DefaultTenantUUID returns the fixed UUID for the default tenant in local mode.
// This is a constant and does not require initialization.
func DefaultTenantUUID() string {
	return DefaultTenantID
}

// JWTSecret returns the JWT signing secret.
// Panics if called before InitAuthConfig.
func JWTSecret() string {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().jwtSecret
}

// KeycloakIssuer returns the Keycloak issuer URL.
// Panics if called before InitAuthConfig.
func KeycloakIssuer() string {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().keycloakIssuer
}

// KeycloakClientID returns the Keycloak client ID.
// Panics if called before InitAuthConfig.
func KeycloakClientID() string {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().keycloakClientID
}

// SuperAdminEmails returns the list of super admin email addresses.
// Returns an empty slice if none are configured.
// Panics if called before InitAuthConfig.
func SuperAdminEmails() []string {
	authMu.RLock()
	defer authMu.RUnlock()
	cfg := mustGetConfig()
	// Return a copy to prevent mutation
	result := make([]string, len(cfg.superAdminEmails))
	copy(result, cfg.superAdminEmails)
	return result
}

// IsSuperAdmin checks if the given email is in the super admin list.
// Email comparison is case-insensitive.
// Panics if called before InitAuthConfig.
func IsSuperAdmin(email string) bool {
	authMu.RLock()
	defer authMu.RUnlock()
	cfg := mustGetConfig()

	email = strings.TrimSpace(strings.ToLower(email))
	for _, adminEmail := range cfg.superAdminEmails {
		if adminEmail == email {
			return true
		}
	}
	return false
}

// IsAuthDisabled returns true if authentication is disabled (DISABLE_AUTH=true).
// This is only for development mode and should never be true in production.
// Panics if called before InitAuthConfig.
func IsAuthDisabled() bool {
	authMu.RLock()
	defer authMu.RUnlock()
	return mustGetConfig().disableAuth
}
