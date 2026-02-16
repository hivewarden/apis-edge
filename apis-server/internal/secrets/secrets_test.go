package secrets

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

// =============================================================================
// Database Config Tests
// =============================================================================

func TestClient_GetDatabaseConfig_Env(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "env")
	t.Setenv("YSQL_HOST", "db.example")
	t.Setenv("YSQL_PORT", "5433")
	t.Setenv("YSQL_DB", "apis")
	t.Setenv("YSQL_USER", "apis")
	t.Setenv("YSQL_PASSWORD", "pw")

	cfg, err := NewClient().GetDatabaseConfig()
	require.NoError(t, err)
	require.Equal(t, "db.example", cfg.Host)
	require.Equal(t, "5433", cfg.Port)
	require.Equal(t, "apis", cfg.Name)
	require.Equal(t, "apis", cfg.User)
	require.Equal(t, "pw", cfg.Password)
}

func TestClient_GetDatabaseConfig_OpenBao(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "openbao")
	t.Setenv("OPENBAO_TOKEN", "test-token")
	t.Setenv("OPENBAO_SECRET_PATH", "secret/data/apis")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/secret/data/apis/database", r.URL.Path)
		require.Equal(t, "test-token", r.Header.Get("X-Vault-Token"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"data":{"host":"yugabytedb","port":"5433","name":"apis","user":"apis","password":"apisdev"}}}`))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("OPENBAO_ADDR", srv.URL)

	cfg, err := NewClient().GetDatabaseConfig()
	require.NoError(t, err)
	require.Equal(t, "yugabytedb", cfg.Host)
	require.Equal(t, "5433", cfg.Port)
	require.Equal(t, "apis", cfg.Name)
	require.Equal(t, "apis", cfg.User)
	require.Equal(t, "apisdev", cfg.Password)
}

func TestClient_GetDatabaseConfig_OpenBaoFallback(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "openbao")
	t.Setenv("OPENBAO_TOKEN", "test-token")
	t.Setenv("OPENBAO_SECRET_PATH", "secret/data/apis")
	t.Setenv("YSQL_HOST", "db.example")
	t.Setenv("YSQL_PORT", "5433")
	t.Setenv("YSQL_DB", "apis")
	t.Setenv("YSQL_USER", "apis")
	t.Setenv("YSQL_PASSWORD", "pw")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("OPENBAO_ADDR", srv.URL)

	cfg, err := NewClient().GetDatabaseConfig()
	require.NoError(t, err)
	require.Equal(t, "db.example", cfg.Host)
	require.Equal(t, "5433", cfg.Port)
	require.Equal(t, "apis", cfg.Name)
	require.Equal(t, "apis", cfg.User)
	require.Equal(t, "pw", cfg.Password)
}

// =============================================================================
// Client Tests
// =============================================================================

func TestClient_Source(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "env")
	require.Equal(t, "env", NewClient().Source())

	t.Setenv("SECRETS_BACKEND", "openbao")
	require.Equal(t, "openbao", NewClient().Source())
}

// =============================================================================
// Keycloak Config Tests — Env Backend
// =============================================================================

func TestClient_GetKeycloakConfig_Env(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "env")
	t.Setenv("KEYCLOAK_ISSUER", "https://keycloak.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "apis-dashboard")
	t.Setenv("KEYCLOAK_CLIENT_SECRET", "super-secret-client")
	t.Setenv("KEYCLOAK_ADMIN", "myadmin")
	t.Setenv("KEYCLOAK_ADMIN_PASSWORD", "admin-pass-123")

	cfg, err := NewClient().GetKeycloakConfig()
	require.NoError(t, err)
	require.Equal(t, "https://keycloak.example.com/realms/honeybee", cfg.Issuer)
	require.Equal(t, "apis-dashboard", cfg.ClientID)
	require.Equal(t, "super-secret-client", cfg.ClientSecret)
	require.Equal(t, "myadmin", cfg.AdminUsername)
	require.Equal(t, "admin-pass-123", cfg.AdminPassword)
}

func TestClient_GetKeycloakConfig_Env_DefaultValues(t *testing.T) {
	// Minimal env — only SECRETS_BACKEND set
	t.Setenv("SECRETS_BACKEND", "env")

	cfg, err := NewClient().GetKeycloakConfig()
	require.NoError(t, err)
	require.Equal(t, "http://localhost:8080", cfg.Issuer)
	require.Equal(t, "", cfg.ClientID)
	require.Equal(t, "", cfg.ClientSecret)
	require.Equal(t, "admin", cfg.AdminUsername)
	require.Equal(t, "", cfg.AdminPassword)
}

// =============================================================================
// Keycloak Config Tests — OpenBao Backend
// =============================================================================

func TestClient_GetKeycloakConfig_OpenBao(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "openbao")
	t.Setenv("OPENBAO_TOKEN", "test-token")
	t.Setenv("OPENBAO_SECRET_PATH", "secret/data/apis")

	var requestedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		require.Equal(t, "test-token", r.Header.Get("X-Vault-Token"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"data":{
			"issuer":"https://keycloak.example.com/realms/honeybee",
			"client_id":"apis-dashboard",
			"client_secret":"openbao-client-secret",
			"admin_username":"kc-admin",
			"admin_password":"kc-admin-pass"
		}}}`))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("OPENBAO_ADDR", srv.URL)

	cfg, err := NewClient().GetKeycloakConfig()
	require.NoError(t, err)

	// Verify the request path uses "keycloak"
	require.Equal(t, "/v1/secret/data/apis/keycloak", requestedPath)

	require.Equal(t, "https://keycloak.example.com/realms/honeybee", cfg.Issuer)
	require.Equal(t, "apis-dashboard", cfg.ClientID)
	require.Equal(t, "openbao-client-secret", cfg.ClientSecret)
	require.Equal(t, "kc-admin", cfg.AdminUsername)
	require.Equal(t, "kc-admin-pass", cfg.AdminPassword)
}

func TestClient_GetKeycloakConfig_OpenBaoFallback(t *testing.T) {
	t.Setenv("SECRETS_BACKEND", "openbao")
	t.Setenv("OPENBAO_TOKEN", "test-token")
	t.Setenv("OPENBAO_SECRET_PATH", "secret/data/apis")
	t.Setenv("KEYCLOAK_ISSUER", "https://fallback.example.com/realms/honeybee")
	t.Setenv("KEYCLOAK_CLIENT_ID", "fallback-client")
	t.Setenv("KEYCLOAK_CLIENT_SECRET", "fallback-secret")
	t.Setenv("KEYCLOAK_ADMIN", "fallback-admin")
	t.Setenv("KEYCLOAK_ADMIN_PASSWORD", "fallback-pass")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("openbao down"))
	}))
	t.Cleanup(srv.Close)
	t.Setenv("OPENBAO_ADDR", srv.URL)

	cfg, err := NewClient().GetKeycloakConfig()
	require.NoError(t, err)

	// Should fall back to env vars
	require.Equal(t, "https://fallback.example.com/realms/honeybee", cfg.Issuer)
	require.Equal(t, "fallback-client", cfg.ClientID)
	require.Equal(t, "fallback-secret", cfg.ClientSecret)
	require.Equal(t, "fallback-admin", cfg.AdminUsername)
	require.Equal(t, "fallback-pass", cfg.AdminPassword)
}

// =============================================================================
// TestMain — Clean environment
// =============================================================================

func TestMain(m *testing.M) {
	// Ensure these tests do not inherit any potentially secret host env from the caller.
	for _, k := range []string{
		"OPENBAO_ADDR", "OPENBAO_TOKEN", "OPENBAO_SECRET_PATH", "SECRETS_BACKEND",
		"YSQL_HOST", "YSQL_PORT", "YSQL_DB", "YSQL_USER", "YSQL_PASSWORD",
		// Keycloak env vars
		"KEYCLOAK_ISSUER", "KEYCLOAK_CLIENT_ID", "KEYCLOAK_CLIENT_SECRET",
		"KEYCLOAK_ADMIN", "KEYCLOAK_ADMIN_PASSWORD",
	} {
		_ = os.Unsetenv(k)
	}
	os.Exit(m.Run())
}
