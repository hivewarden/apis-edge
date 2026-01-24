// Package secrets provides a unified interface for reading secrets from OpenBao or environment variables.
//
// # Configuration
//
// Set these environment variables to configure the secrets source:
//
//   - SECRETS_SOURCE: "openbao" (default) or "env"
//   - OPENBAO_ADDR: OpenBao server address (default: http://localhost:8200)
//   - OPENBAO_TOKEN: Authentication token
//   - OPENBAO_SECRET_PATH: Base path for secrets (default: secret/data/apis)
//
// # Connecting to External OpenBao
//
// To connect to a different OpenBao instance, simply change OPENBAO_ADDR and OPENBAO_TOKEN.
// No code changes required.
//
// Example:
//
//	OPENBAO_ADDR=https://openbao.example.com:8200
//	OPENBAO_TOKEN=hvs.your-token
//	OPENBAO_SECRET_PATH=secret/data/myapp
package secrets

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/rs/zerolog/log"
)

// Config holds the secrets configuration.
type Config struct {
	Source     string // "openbao" or "env"
	Addr       string // OpenBao address
	Token      string // OpenBao token
	SecretPath string // Base path for secrets in OpenBao
}

// Client reads secrets from the configured source.
type Client struct {
	config     Config
	httpClient *http.Client
}

// NewClient creates a new secrets client from environment variables.
// This is the primary entry point - just call NewClient() and it configures itself.
func NewClient() *Client {
	config := Config{
		Source:     getEnv("SECRETS_SOURCE", "openbao"),
		Addr:       getEnv("OPENBAO_ADDR", "http://localhost:8200"),
		Token:      getEnv("OPENBAO_TOKEN", ""),
		SecretPath: getEnv("OPENBAO_SECRET_PATH", "secret/data/apis"),
	}

	client := &Client{
		config: config,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}

	log.Info().
		Str("source", config.Source).
		Str("addr", config.Addr).
		Str("path", config.SecretPath).
		Msg("Secrets client initialized")

	return client
}

// GetDatabaseConfig returns database connection configuration.
// Reads from OpenBao path: {SECRET_PATH}/database
func (c *Client) GetDatabaseConfig() (*DatabaseConfig, error) {
	if c.config.Source == "env" {
		return c.getDatabaseConfigFromEnv(), nil
	}
	return c.getDatabaseConfigFromOpenBao()
}

// DatabaseConfig holds database connection parameters.
type DatabaseConfig struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
}

// ConnectionString returns a PostgreSQL connection string.
func (d *DatabaseConfig) ConnectionString() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		d.User, d.Password, d.Host, d.Port, d.Name)
}

func (c *Client) getDatabaseConfigFromEnv() *DatabaseConfig {
	log.Debug().Msg("Reading database config from environment")
	return &DatabaseConfig{
		Host:     getEnv("YSQL_HOST", "yugabytedb"),
		Port:     getEnv("YSQL_PORT", "5433"),
		Name:     getEnv("YSQL_DB", "apis"),
		User:     getEnv("YSQL_USER", "apis"),
		Password: getEnv("YSQL_PASSWORD", ""),
	}
}

func (c *Client) getDatabaseConfigFromOpenBao() (*DatabaseConfig, error) {
	data, err := c.readSecret("database")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to read database secrets from OpenBao, falling back to env")
		return c.getDatabaseConfigFromEnv(), nil
	}

	return &DatabaseConfig{
		Host:     getMapString(data, "host", "yugabytedb"),
		Port:     getMapString(data, "port", "5433"),
		Name:     getMapString(data, "name", "apis"),
		User:     getMapString(data, "user", "apis"),
		Password: getMapString(data, "password", ""),
	}, nil
}

// GetZitadelConfig returns Zitadel identity provider configuration.
// Reads from OpenBao path: {SECRET_PATH}/zitadel
func (c *Client) GetZitadelConfig() (*ZitadelConfig, error) {
	if c.config.Source == "env" {
		return c.getZitadelConfigFromEnv(), nil
	}
	return c.getZitadelConfigFromOpenBao()
}

// ZitadelConfig holds Zitadel configuration.
type ZitadelConfig struct {
	Masterkey     string
	AdminUsername string
	AdminPassword string
	Issuer        string
}

func (c *Client) getZitadelConfigFromEnv() *ZitadelConfig {
	log.Debug().Msg("Reading Zitadel config from environment")
	return &ZitadelConfig{
		Masterkey:     getEnv("ZITADEL_MASTERKEY", ""),
		AdminUsername: getEnv("ZITADEL_ADMIN_USERNAME", "admin"),
		AdminPassword: getEnv("ZITADEL_ADMIN_PASSWORD", ""),
		Issuer:        getEnv("ZITADEL_ISSUER", "http://localhost:8080"),
	}
}

func (c *Client) getZitadelConfigFromOpenBao() (*ZitadelConfig, error) {
	data, err := c.readSecret("zitadel")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to read Zitadel secrets from OpenBao, falling back to env")
		return c.getZitadelConfigFromEnv(), nil
	}

	return &ZitadelConfig{
		Masterkey:     getMapString(data, "masterkey", ""),
		AdminUsername: getMapString(data, "admin_username", "admin"),
		AdminPassword: getMapString(data, "admin_password", ""),
		Issuer:        getEnv("ZITADEL_ISSUER", "http://localhost:8080"), // Issuer is not a secret
	}, nil
}

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

// Helper functions

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
