package services

import (
	"context"
	"os"
	"testing"

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

	// Cleanup test data after all subtests complete
	t.Cleanup(func() {
		cleanupConn, _ := storage.DB.Acquire(ctx)
		defer cleanupConn.Release()
		// Delete test users and tenants (cascade will handle users)
		cleanupConn.Exec(ctx, `DELETE FROM users WHERE external_user_id LIKE 'test-%'`)
		cleanupConn.Exec(ctx, `DELETE FROM tenants WHERE id LIKE 'test-%'`)
	})

	t.Run("creates tenant and user on first login", func(t *testing.T) {
		claims := &ProvisioningClaims{
			UserID: "test-user-" + t.Name(),
			OrgID:  "test-org-" + t.Name(),
			Email:  "test@example.com",
			Name:   "Test User",
		}

		// Set tenant context first (as the middleware does)
		_, err := conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", claims.OrgID)
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
		_, err := conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", claims.OrgID)
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

	// Cleanup test data after all subtests complete
	t.Cleanup(func() {
		cleanupConn, _ := storage.DB.Acquire(ctx)
		defer cleanupConn.Release()
		cleanupConn.Exec(ctx, `DELETE FROM users WHERE external_user_id LIKE '%rls-test'`)
		cleanupConn.Exec(ctx, `DELETE FROM tenants WHERE id LIKE '%rls-test'`)
	})

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
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantA.OrgID)
	require.NoError(t, err)
	userA, err := EnsureUserProvisioned(ctx, conn, tenantA)
	require.NoError(t, err)

	// Provision user B with tenant context set
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantB.OrgID)
	require.NoError(t, err)
	userB, err := EnsureUserProvisioned(ctx, conn, tenantB)
	require.NoError(t, err)

	t.Run("tenant A cannot see tenant B users", func(t *testing.T) {
		// Set tenant context to A
		_, err := conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantA.OrgID)
		require.NoError(t, err)

		// Query users - should only see tenant A's user
		users, err := storage.ListUsersByTenant(ctx, conn)
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
		// Reset tenant context
		_, err := conn.Exec(ctx, "RESET app.tenant_id")
		require.NoError(t, err)

		// Query users - should return empty (fail-safe)
		users, err := storage.ListUsersByTenant(ctx, conn)
		require.NoError(t, err)
		assert.Empty(t, users, "No tenant context should return no users")
	})
}
