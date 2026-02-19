// Package integration contains integration tests for the APIS server.
// test_main_test.go — shared TestMain that initializes auth config for all tests.
package integration

import (
	"context"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// appPool is a non-superuser connection pool used for handler/RLS tests.
// Superusers bypass RLS, so we need a regular user role for tenant isolation.
// Falls back to nil if the apis role isn't available (CI without role setup).
var appPool *pgxpool.Pool

// TestMain initializes auth config before any integration test runs.
// The TenantMiddleware calls config.IsLocalAuth(), which panics
// if InitAuthConfig has not been called.
//
// We use keycloak mode because TenantMiddleware auto-provisions users
// in SaaS mode (via EnsureUserProvisioned), which is what integration
// tests need — the mock auth middleware injects claims, and the tenant
// middleware creates the user on first request. In local mode, users
// must already exist in the database, which adds unnecessary setup.
func TestMain(m *testing.M) {
	// Set required env vars for auth config if not already set
	if os.Getenv("AUTH_MODE") == "" {
		os.Setenv("AUTH_MODE", "keycloak")
	}
	if os.Getenv("JWT_SECRET") == "" {
		os.Setenv("JWT_SECRET", "test-secret-at-least-32-characters-long-for-ci")
	}
	if os.Getenv("KEYCLOAK_ISSUER") == "" {
		os.Setenv("KEYCLOAK_ISSUER", "http://localhost:8080/realms/test")
	}
	if os.Getenv("KEYCLOAK_CLIENT_ID") == "" {
		os.Setenv("KEYCLOAK_CLIENT_ID", "test-client")
	}

	if err := config.InitAuthConfig(); err != nil {
		// Already initialized is fine (e.g. if another init path ran first)
		_ = err
	}

	// Create a non-superuser pool for RLS-enforced tests.
	// The superuser (yugabyte) bypasses all RLS policies, so we need
	// a regular role (apis) for tests that verify tenant isolation.
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL != "" {
		appURL := replaceDBUser(dbURL, "apis", "apis")
		if appURL != "" {
			cfg, err := pgxpool.ParseConfig(appURL)
			if err == nil {
				cfg.MaxConns = 5
				pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
				if err == nil {
					appPool = pool
				}
			}
		}
	}

	code := m.Run()

	if appPool != nil {
		appPool.Close()
	}

	os.Exit(code)
}

// testAppPool returns the non-superuser pool for RLS-enforced tests.
// Falls back to storage.DB if the apis role isn't available.
func testAppPool() *pgxpool.Pool {
	if appPool != nil {
		return appPool
	}
	return storage.DB
}

// replaceDBUser replaces the user:password in a postgres URL.
func replaceDBUser(dbURL, user, password string) string {
	u, err := url.Parse(dbURL)
	if err != nil {
		return ""
	}
	u.User = url.UserPassword(user, password)
	return u.String()
}
