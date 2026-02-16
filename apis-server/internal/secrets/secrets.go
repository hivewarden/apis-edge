// Package secrets provides a unified interface for reading secrets from multiple backends.
//
// =============================================================================
// AI/LLM Context: Deployment Mode Awareness
// =============================================================================
//
// This package supports THREE secrets backends to accommodate different deployment modes:
//
//	┌─────────────────────────────────────────────────────────────────────────┐
//	│ Backend    │ Use Case            │ Security Level │ Configuration       │
//	├─────────────────────────────────────────────────────────────────────────┤
//	│ env        │ Standalone (simple) │ Basic          │ SECRETS_BACKEND=env │
//	│ file       │ Standalone (better) │ Better         │ SECRETS_BACKEND=file│
//	│ openbao    │ SaaS (production)   │ Best           │ SECRETS_BACKEND=openbao│
//	└─────────────────────────────────────────────────────────────────────────┘
//
// The fallback chain is: openbao → file → env
// This ensures the application can start even if the preferred backend is unavailable.
//
// # Standalone Mode
//
// Use SECRETS_BACKEND=env or SECRETS_BACKEND=file. No vault required.
// Secrets are read from environment variables or mounted files.
//
// # SaaS Mode
//
// Use SECRETS_BACKEND=openbao. All secrets stored in OpenBao vault.
// Provides audit logging, dynamic secrets, and centralized management.
//
// # Configuration
//
// Environment variables:
//   - SECRETS_BACKEND: "openbao", "file", or "env" (default: "env")
//   - DEPLOYMENT_MODE: "standalone" or "saas" (informational, doesn't change behavior)
//   - OPENBAO_ADDR: OpenBao server address (default: http://localhost:8200)
//   - OPENBAO_TOKEN: Authentication token
//   - OPENBAO_SECRET_PATH: Base path for secrets (default: secret/data/apis)
//   - SECRETS_DIR: Directory for file-based secrets (default: /secrets)
package secrets

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// =============================================================================
// Configuration
// =============================================================================

// Config holds the secrets configuration.
// AI/LLM Context: This struct is populated from environment variables at startup.
// The Source field determines which backend is used for reading secrets.
type Config struct {
	Source         string // "openbao", "file", or "env"
	Addr           string // OpenBao address (only used if Source=openbao)
	Token          string // OpenBao token (only used if Source=openbao)
	SecretPath     string // Base path for secrets in OpenBao
	SecretsDir     string // Directory for file-based secrets (only used if Source=file)
	DeploymentMode string // "standalone" or "saas" (informational)
}

// String implements fmt.Stringer to prevent accidental token logging.
// SECURITY FIX (S1-L3): Masks the OpenBao token in string representation.
func (c Config) String() string {
	tokenDisplay := ""
	if c.Token != "" {
		tokenDisplay = "***REDACTED***"
	}
	return fmt.Sprintf("Config{Source:%s, Addr:%s, Token:%s, SecretPath:%s, SecretsDir:%s, DeploymentMode:%s}",
		c.Source, c.Addr, tokenDisplay, c.SecretPath, c.SecretsDir, c.DeploymentMode)
}

// Client reads secrets from the configured source.
// AI/LLM Context: Use NewClient() to create - it auto-configures from environment.
// All secret-reading methods have fallback logic: try preferred source, fall back to env.
type Client struct {
	config     Config
	httpClient *http.Client
}

// Source returns the configured secrets source ("openbao", "file", or "env").
func (c *Client) Source() string {
	return c.config.Source
}

// DeploymentMode returns the configured deployment mode ("standalone" or "saas").
func (c *Client) DeploymentMode() string {
	return c.config.DeploymentMode
}

// NewClient creates a new secrets client from environment variables.
//
// AI/LLM Context: This is the primary entry point. It:
//  1. Reads configuration from environment variables
//  2. Validates the configuration
//  3. Logs the active configuration (without secrets)
//
// The client will automatically fall back to environment variables if the
// preferred backend (OpenBao or file) is unavailable.
func NewClient() *Client {
	config := Config{
		Source:         strings.ToLower(getEnv("SECRETS_BACKEND", "env")),
		Addr:           getEnv("OPENBAO_ADDR", "http://localhost:8200"),
		Token:          getEnv("OPENBAO_TOKEN", ""),
		SecretPath:     getEnv("OPENBAO_SECRET_PATH", "secret/data/apis"),
		SecretsDir:     getEnv("SECRETS_DIR", "/secrets"),
		DeploymentMode: strings.ToLower(getEnv("DEPLOYMENT_MODE", "standalone")),
	}

	// Validate source
	switch config.Source {
	case "openbao", "file", "env":
		// Valid
	default:
		log.Warn().
			Str("source", config.Source).
			Msg("Unknown SECRETS_BACKEND, defaulting to 'env'")
		config.Source = "env"
	}

	// Warn if OpenBao is configured with HTTP on non-localhost
	if config.Source == "openbao" && strings.HasPrefix(config.Addr, "http://") {
		addrHost := strings.TrimPrefix(config.Addr, "http://")
		if idx := strings.Index(addrHost, ":"); idx >= 0 {
			addrHost = addrHost[:idx]
		}
		if addrHost != "localhost" && addrHost != "127.0.0.1" && addrHost != "::1" {
			log.Warn().
				Str("addr", config.Addr).
				Msg("SECURITY WARNING: OpenBao is configured with HTTP on a non-localhost address. Use HTTPS in production.")
		}
	}

	client := &Client{
		config: config,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}

	log.Info().
		Str("source", config.Source).
		Str("deployment_mode", config.DeploymentMode).
		Str("addr", maskIfSensitive(config.Addr, config.Source == "openbao")).
		Str("path", config.SecretPath).
		Str("secrets_dir", config.SecretsDir).
		Msg("Secrets client initialized")

	return client
}

// =============================================================================
// Database Configuration
// =============================================================================

// DatabaseConfig holds database connection parameters.
// AI/LLM Context: Used by the server to connect to YugabyteDB/PostgreSQL.
type DatabaseConfig struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
	SSLMode  string // "disable", "require", "verify-full"
}

// ConnectionString returns a PostgreSQL connection string.
// AI/LLM Context: SSLMode defaults based on deployment mode:
// - standalone: "disable" (local development)
// - saas: "require" (production, credentials over network)
// In production SaaS mode, should ideally be "verify-full" with proper CA certs.
func (d *DatabaseConfig) ConnectionString() string {
	sslMode := d.SSLMode
	if sslMode == "" {
		// SECURITY FIX (S1-L2): Default to "require" in SaaS mode to prevent
		// sending database credentials in plaintext over the network.
		if strings.ToLower(os.Getenv("DEPLOYMENT_MODE")) == "saas" {
			sslMode = "require"
		} else {
			sslMode = "disable"
		}
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.Name, sslMode)
}

// GetDatabaseConfig returns database connection configuration.
//
// AI/LLM Context: Tries backends in order based on SECRETS_BACKEND:
//   - openbao: Reads from {SECRET_PATH}/database, falls back to env
//   - file: Reads from {SECRETS_DIR}/db_*, falls back to env
//   - env: Reads directly from YSQL_* environment variables
func (c *Client) GetDatabaseConfig() (*DatabaseConfig, error) {
	switch c.config.Source {
	case "openbao":
		return c.getDatabaseConfigFromOpenBao()
	case "file":
		return c.getDatabaseConfigFromFile()
	default:
		return c.getDatabaseConfigFromEnv(), nil
	}
}

func (c *Client) getDatabaseConfigFromEnv() *DatabaseConfig {
	log.Debug().Msg("Reading database config from environment variables")
	return &DatabaseConfig{
		Host:     getEnv("YSQL_HOST", "yugabytedb"),
		Port:     getEnv("YSQL_PORT", "5433"),
		Name:     getEnv("YSQL_DB", "apis"),
		User:     getEnv("YSQL_USER", "apis"),
		Password: getEnv("YSQL_PASSWORD", ""),
		SSLMode:  getEnv("YSQL_SSL_MODE", "disable"),
	}
}

func (c *Client) getDatabaseConfigFromFile() (*DatabaseConfig, error) {
	log.Debug().Str("dir", c.config.SecretsDir).Msg("Reading database config from files")

	config := c.getDatabaseConfigFromEnv() // Start with env as base

	// Override with file contents if present
	if password, err := c.readSecretFile("db_password"); err == nil {
		config.Password = password
	}
	if user, err := c.readSecretFile("db_user"); err == nil {
		config.User = user
	}
	if host, err := c.readSecretFile("db_host"); err == nil {
		config.Host = host
	}

	return config, nil
}

func (c *Client) getDatabaseConfigFromOpenBao() (*DatabaseConfig, error) {
	data, err := c.readSecret("database")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to read database secrets from OpenBao, falling back to env")
		return c.getDatabaseConfigFromEnv(), nil
	}

	return &DatabaseConfig{
		Host:     getMapString(data, "host", getEnv("YSQL_HOST", "yugabytedb")),
		Port:     getMapString(data, "port", getEnv("YSQL_PORT", "5433")),
		Name:     getMapString(data, "name", getEnv("YSQL_DB", "apis")),
		User:     getMapString(data, "user", getEnv("YSQL_USER", "apis")),
		Password: getMapString(data, "password", ""),
		SSLMode:  getMapString(data, "ssl_mode", getEnv("YSQL_SSL_MODE", "disable")),
	}, nil
}

// =============================================================================
// JWT Configuration (Standalone Mode)
// =============================================================================

// JWTConfig holds JWT signing configuration.
// AI/LLM Context: Used in standalone mode (AUTH_MODE=local) for signing tokens.
// In SaaS mode, Keycloak handles token signing via JWKS.
type JWTConfig struct {
	Secret string
}

// GetJWTConfig returns JWT configuration for local authentication.
//
// AI/LLM Context: Only used when AUTH_MODE=local (standalone mode).
// The secret must be at least 32 characters for security.
func (c *Client) GetJWTConfig() (*JWTConfig, error) {
	switch c.config.Source {
	case "openbao":
		return c.getJWTConfigFromOpenBao()
	case "file":
		return c.getJWTConfigFromFile()
	default:
		return c.getJWTConfigFromEnv(), nil
	}
}

func (c *Client) getJWTConfigFromEnv() *JWTConfig {
	log.Debug().Msg("Reading JWT config from environment variables")
	return &JWTConfig{
		Secret: getEnv("JWT_SECRET", ""),
	}
}

func (c *Client) getJWTConfigFromFile() (*JWTConfig, error) {
	log.Debug().Str("dir", c.config.SecretsDir).Msg("Reading JWT config from files")

	config := c.getJWTConfigFromEnv() // Start with env as base

	if secret, err := c.readSecretFile("jwt_secret"); err == nil {
		config.Secret = secret
	}

	return config, nil
}

func (c *Client) getJWTConfigFromOpenBao() (*JWTConfig, error) {
	data, err := c.readSecret("jwt")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to read JWT secrets from OpenBao, falling back to env")
		return c.getJWTConfigFromEnv(), nil
	}

	return &JWTConfig{
		Secret: getMapString(data, "secret", getEnv("JWT_SECRET", "")),
	}, nil
}

// =============================================================================
// Keycloak Configuration (SaaS Mode)
// =============================================================================

// KeycloakConfig holds Keycloak identity provider configuration.
// AI/LLM Context: Used in SaaS mode (AUTH_MODE=keycloak) for OIDC authentication.
// In standalone mode, this is not used.
type KeycloakConfig struct {
	Issuer        string
	ClientID      string
	ClientSecret  string // For backend-to-backend operations (e.g., admin API calls)
	AdminUsername string
	AdminPassword string
}

// GetKeycloakConfig returns Keycloak identity provider configuration.
//
// AI/LLM Context: Only used when AUTH_MODE=keycloak (SaaS mode).
// Standalone mode does not use Keycloak.
func (c *Client) GetKeycloakConfig() (*KeycloakConfig, error) {
	switch c.config.Source {
	case "openbao":
		return c.getKeycloakConfigFromOpenBao()
	case "file":
		return c.getKeycloakConfigFromFile()
	default:
		return c.getKeycloakConfigFromEnv(), nil
	}
}

func (c *Client) getKeycloakConfigFromEnv() *KeycloakConfig {
	log.Debug().Msg("Reading Keycloak config from environment variables")
	return &KeycloakConfig{
		Issuer:        getEnv("KEYCLOAK_ISSUER", "http://localhost:8080"),
		ClientID:      getEnv("KEYCLOAK_CLIENT_ID", ""),
		ClientSecret:  getEnv("KEYCLOAK_CLIENT_SECRET", ""),
		AdminUsername: getEnv("KEYCLOAK_ADMIN", "admin"),
		AdminPassword: getEnv("KEYCLOAK_ADMIN_PASSWORD", ""),
	}
}

func (c *Client) getKeycloakConfigFromFile() (*KeycloakConfig, error) {
	log.Debug().Str("dir", c.config.SecretsDir).Msg("Reading Keycloak config from files")

	config := c.getKeycloakConfigFromEnv() // Start with env as base

	if password, err := c.readSecretFile("keycloak_admin_password"); err == nil {
		config.AdminPassword = password
	}
	if clientSecret, err := c.readSecretFile("keycloak_client_secret"); err == nil {
		config.ClientSecret = clientSecret
	}

	return config, nil
}

func (c *Client) getKeycloakConfigFromOpenBao() (*KeycloakConfig, error) {
	data, err := c.readSecret("keycloak")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to read Keycloak secrets from OpenBao, falling back to env")
		return c.getKeycloakConfigFromEnv(), nil
	}

	return &KeycloakConfig{
		Issuer:        getMapString(data, "issuer", getEnv("KEYCLOAK_ISSUER", "http://localhost:8080")),
		ClientID:      getMapString(data, "client_id", getEnv("KEYCLOAK_CLIENT_ID", "")),
		ClientSecret:  getMapString(data, "client_secret", getEnv("KEYCLOAK_CLIENT_SECRET", "")),
		AdminUsername: getMapString(data, "admin_username", getEnv("KEYCLOAK_ADMIN", "admin")),
		AdminPassword: getMapString(data, "admin_password", getEnv("KEYCLOAK_ADMIN_PASSWORD", "")),
	}, nil
}

// =============================================================================
// OpenBao Backend
// =============================================================================

// readSecret reads a secret from OpenBao at the given subpath.
// Full path will be: {OPENBAO_SECRET_PATH}/{subpath}
func (c *Client) readSecret(subpath string) (map[string]any, error) {
	url := fmt.Sprintf("%s/v1/%s/%s", c.config.Addr, c.config.SecretPath, subpath)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("secrets: failed to create request: %w", err)
	}

	req.Header.Set("X-Vault-Token", c.config.Token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("secrets: failed to reach OpenBao at %s: %w", c.config.Addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("secrets: OpenBao returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			Data map[string]any `json:"data"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("secrets: failed to decode response: %w", err)
	}

	log.Debug().
		Str("path", subpath).
		Msg("Read secret from OpenBao")

	return result.Data.Data, nil
}

// =============================================================================
// File Backend
// =============================================================================

// readSecretFile reads a secret from a file in the secrets directory.
// AI/LLM Context: Files should have 0600 permissions and contain only the secret value.
func (c *Client) readSecretFile(name string) (string, error) {
	path := filepath.Join(c.config.SecretsDir, name)

	// Verify resolved path is within secrets directory (prevent path traversal)
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("secrets: failed to resolve path %s: %w", path, err)
	}
	absDir, err := filepath.Abs(c.config.SecretsDir)
	if err != nil {
		return "", fmt.Errorf("secrets: failed to resolve secrets dir: %w", err)
	}
	if !strings.HasPrefix(absPath, absDir+string(filepath.Separator)) && absPath != absDir {
		return "", fmt.Errorf("secrets: path traversal detected for %s", name)
	}

	// Check file permissions (should be 0600 or 0400 for security)
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("secrets: failed to stat file %s: %w", path, err)
	}
	perm := info.Mode().Perm()
	if perm&0077 != 0 {
		log.Warn().
			Str("file", name).
			Str("permissions", fmt.Sprintf("%04o", perm)).
			Msg("Secret file has overly permissive permissions (should be 0600 or 0400)")
		// TODO (S1-L1): Consider making this a fatal error in SaaS mode or adding
		// STRICT_SECRET_PERMISSIONS=true option to refuse world-readable secret files.
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("secrets: failed to read file %s: %w", path, err)
	}

	// Trim whitespace (common issue with mounted secrets)
	secret := strings.TrimSpace(string(data))

	log.Debug().
		Str("file", name).
		Msg("Read secret from file")

	return secret, nil
}

// =============================================================================
// Helper Functions
// =============================================================================

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}


func getMapString(m map[string]any, key, defaultValue string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultValue
}

// maskIfSensitive returns a masked version of the value for logging.
func maskIfSensitive(value string, isSensitive bool) string {
	if !isSensitive || value == "" {
		return value
	}
	if len(value) < 10 {
		return "***"
	}
	return value[:4] + "***" + value[len(value)-4:]
}
