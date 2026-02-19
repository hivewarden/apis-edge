package services

import (
	"context"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestEnsureUserProvisioned tests user provisioning.
// Requires a running database - skip if DATABASE_URL not set.
func TestEnsureUserProvisioned(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations first
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Acquire a connection
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	// Cleanup test data (defer runs before CloseDB in LIFO order)
	defer func() {
		cleanupConn, err := storage.DB.Acquire(ctx)
		if err != nil {
			return
		}
		defer cleanupConn.Release()
		cleanupConn.Exec(ctx, `DELETE FROM users WHERE external_user_id LIKE 'test-%'`)
		cleanupConn.Exec(ctx, `DELETE FROM tenants WHERE id LIKE 'test-%'`)
	}()

	t.Run("creates tenant and user on first login", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "test-user-" + t.Name(),
			OrgID:  "test-org-" + t.Name(),
			Email:  "test@example.com",
			Name:   "Test User",
		}

		// Set tenant context first (as the middleware does)
		_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claims.OrgID)
		require.NoError(t, err)

		user, err := EnsureUserProvisioned(ctx, conn, claims)
		require.NoError(t, err)
		assert.NotEmpty(t, user.ID)
		assert.Equal(t, claims.OrgID, user.TenantID)
		assert.Equal(t, claims.UserID, user.ExternalUserID)
		assert.Equal(t, claims.Email, user.Email)
		assert.Equal(t, claims.Name, user.Name)
	})

	t.Run("returns existing user on subsequent login", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "test-user-existing",
			OrgID:  "test-org-existing",
			Email:  "existing@example.com",
			Name:   "Existing User",
		}

		// Set tenant context first (as the middleware does)
		_, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", claims.OrgID)
		require.NoError(t, err)

		// First call creates user
		user1, err := EnsureUserProvisioned(ctx, conn, claims)
		require.NoError(t, err)

		// Second call returns same user
		user2, err := EnsureUserProvisioned(ctx, conn, claims)
		require.NoError(t, err)

		assert.Equal(t, user1.ID, user2.ID)
	})

	t.Run("fails with nil claims", func(t *testing.T) {
		_, err := EnsureUserProvisioned(ctx, conn, nil)
		assert.Error(t, err)
	})

	t.Run("fails with empty UserID", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "",
			OrgID:  "test-org",
			Email:  "test@example.com",
			Name:   "Test",
		}
		_, err := EnsureUserProvisioned(ctx, conn, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "UserID")
	})

	t.Run("fails with empty OrgID", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "test-user",
			OrgID:  "",
			Email:  "test@example.com",
			Name:   "Test",
		}
		_, err := EnsureUserProvisioned(ctx, conn, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "OrgID")
	})

	t.Run("fails with empty Email", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "test-user",
			OrgID:  "test-org",
			Email:  "",
			Name:   "Test",
		}
		_, err := EnsureUserProvisioned(ctx, conn, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "Email")
	})
}

// TestRLSIsolation tests Row-Level Security tenant isolation.
// Requires a running database - skip if DATABASE_URL not set.
func TestRLSIsolation(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations first
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Cleanup test data (defer runs before CloseDB in LIFO order)
	defer func() {
		cleanupConn, err := storage.DB.Acquire(ctx)
		if err != nil {
			return
		}
		defer cleanupConn.Release()
		cleanupConn.Exec(ctx, `DELETE FROM users WHERE external_user_id LIKE '%rls-test'`)
		cleanupConn.Exec(ctx, `DELETE FROM tenants WHERE id LIKE '%rls-test'`)
	}()

	// Create two tenants with users
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	tenantA := &ProvisioningClaims{
		UserID: "user-a-rls-test",
		OrgID:  "org-a-rls-test",
		Email:  "a@example.com",
		Name:   "User A",
	}
	tenantB := &ProvisioningClaims{
		UserID: "user-b-rls-test",
		OrgID:  "org-b-rls-test",
		Email:  "b@example.com",
		Name:   "User B",
	}

	// Provision user A with tenant context set
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantA.OrgID)
	require.NoError(t, err)
	userA, err := EnsureUserProvisioned(ctx, conn, tenantA)
	require.NoError(t, err)

	// Provision user B with tenant context set
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantB.OrgID)
	require.NoError(t, err)
	userB, err := EnsureUserProvisioned(ctx, conn, tenantB)
	require.NoError(t, err)

	// RLS assertions need a non-superuser pool (superusers bypass RLS)
	appPool := buildAppPool(t, ctx)
	if appPool == nil {
		t.Skip("non-superuser 'apis' role not available - skipping RLS assertions")
	}
	defer appPool.Close()

	t.Run("tenant A cannot see tenant B users", func(t *testing.T) {
		rlsConn, err := appPool.Acquire(ctx)
		require.NoError(t, err)
		defer rlsConn.Release()

		// Set tenant context to A
		_, err = rlsConn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantA.OrgID)
		require.NoError(t, err)

		// Query users - should only see tenant A's user
		users, err := storage.ListUsersByTenant(ctx, rlsConn)
		require.NoError(t, err)

		// Should only see user A
		var foundA, foundB bool
		for _, u := range users {
			if u.ID == userA.ID {
				foundA = true
			}
			if u.ID == userB.ID {
				foundB = true
			}
		}
		assert.True(t, foundA, "Should find user A")
		assert.False(t, foundB, "Should NOT find user B")
	})

	t.Run("no tenant_id returns empty results", func(t *testing.T) {
		rlsConn, err := appPool.Acquire(ctx)
		require.NoError(t, err)
		defer rlsConn.Release()

		// Empty tenant context — RLS should block everything
		_, err = rlsConn.Exec(ctx, "SELECT set_config('app.tenant_id', '', false)")
		require.NoError(t, err)

		// Query users - should return empty (fail-safe)
		users, err := storage.ListUsersByTenant(ctx, rlsConn)
		require.NoError(t, err)
		assert.Empty(t, users, "No tenant context should return no users")
	})
}

// buildAppPool creates a non-superuser pool for RLS-enforced assertions.
// Returns nil if the apis role isn't available.
func buildAppPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil
	}
	u, err := url.Parse(dbURL)
	if err != nil {
		return nil
	}
	u.User = url.UserPassword("apis", "apis")
	cfg, err := pgxpool.ParseConfig(u.String())
	if err != nil {
		return nil
	}
	cfg.MaxConns = 3
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil
	}
	return pool
}
