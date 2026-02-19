// Package integration contains integration tests for the APIS server.
package integration

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestResetAdminPassword tests the ResetAdminPassword storage function
// used by the ADMIN_RESET_PASSWORD startup feature.
// Requires a running database - skip if DATABASE_URL not set.
func TestResetAdminPassword(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Use a unique tenant ID for this test to avoid interference
	testTenantID := "test-tenant-admin-reset"

	// Provision the test tenant
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx,
		`INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
		testTenantID, "Admin Reset Test Tenant",
	)
	require.NoError(t, err)

	// Clean up any leftover users from previous test runs
	_, err = conn.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, testTenantID)
	require.NoError(t, err)
	conn.Release()

	t.Run("resets first admin password", func(t *testing.T) {
		// Create an admin user
		oldHash, err := auth.HashPassword("OldPassword123!")
		require.NoError(t, err)

		admin, err := storage.CreateFirstAdminAtomic(ctx, storage.DB, &storage.CreateLocalUserInput{
			TenantID:     testTenantID,
			Email:        "resetadmin@test.com",
			DisplayName:  "Reset Admin",
			PasswordHash: oldHash,
			Role:         "admin",
		})
		require.NoError(t, err)
		require.NotEmpty(t, admin.ID)

		// Reset the password
		newHash, err := auth.HashPassword("NewSecurePass456!")
		require.NoError(t, err)

		email, err := storage.ResetAdminPassword(ctx, storage.DB, testTenantID, newHash)
		require.NoError(t, err)
		assert.Equal(t, "resetadmin@test.com", email)

		// Verify the new password works
		c, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer c.Release()

		user, err := storage.GetUserByEmailWithPassword(ctx, c, testTenantID, "resetadmin@test.com")
		require.NoError(t, err)

		err = auth.VerifyPassword("NewSecurePass456!", user.PasswordHash)
		assert.NoError(t, err, "new password should verify successfully")

		// Verify must_change_password is set
		userFull, err := storage.GetUserByIDFull(ctx, c, user.ID)
		require.NoError(t, err)
		assert.True(t, userFull.MustChangePassword, "must_change_password should be true after reset")
		assert.True(t, userFull.IsActive, "is_active should be true after reset")

		// Clean up
		_, err = c.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, testTenantID)
		require.NoError(t, err)
	})

	t.Run("returns error when no admin exists", func(t *testing.T) {
		// Create only a member user (no admin)
		memberHash, err := auth.HashPassword("MemberPass123!")
		require.NoError(t, err)

		c, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)

		// Set tenant context for RLS
		_, err = c.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", testTenantID)
		require.NoError(t, err)

		_, err = storage.CreateLocalUser(ctx, c, &storage.CreateLocalUserInput{
			TenantID:     testTenantID,
			Email:        "member@test.com",
			DisplayName:  "Test Member",
			PasswordHash: memberHash,
			Role:         "member",
		})
		require.NoError(t, err)
		c.Release()

		// Attempt reset — should get ErrNoAdminUser
		newHash, err := auth.HashPassword("NewPass123!")
		require.NoError(t, err)

		_, err = storage.ResetAdminPassword(ctx, storage.DB, testTenantID, newHash)
		assert.ErrorIs(t, err, storage.ErrNoAdminUser)

		// Clean up
		c2, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		_, err = c2.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, testTenantID)
		require.NoError(t, err)
		c2.Release()
	})

	t.Run("returns error for empty tenant", func(t *testing.T) {
		// No users at all in this tenant
		newHash, err := auth.HashPassword("NewPass123!")
		require.NoError(t, err)

		_, err = storage.ResetAdminPassword(ctx, storage.DB, testTenantID, newHash)
		assert.ErrorIs(t, err, storage.ErrNoAdminUser)
	})

	t.Run("picks oldest admin when multiple exist", func(t *testing.T) {
		// Create two admin users — oldest first
		hash1, err := auth.HashPassword("AdminOne123!")
		require.NoError(t, err)

		admin1, err := storage.CreateFirstAdminAtomic(ctx, storage.DB, &storage.CreateLocalUserInput{
			TenantID:     testTenantID,
			Email:        "oldest-admin@test.com",
			DisplayName:  "Oldest Admin",
			PasswordHash: hash1,
			Role:         "admin",
		})
		require.NoError(t, err)

		// Create second admin via direct insert (CreateFirstAdminAtomic would fail since users exist)
		hash2, err := auth.HashPassword("AdminTwo123!")
		require.NoError(t, err)

		c, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		_, err = c.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", testTenantID)
		require.NoError(t, err)

		_, err = storage.CreateLocalUser(ctx, c, &storage.CreateLocalUserInput{
			TenantID:     testTenantID,
			Email:        "newer-admin@test.com",
			DisplayName:  "Newer Admin",
			PasswordHash: hash2,
			Role:         "admin",
		})
		require.NoError(t, err)
		c.Release()

		// Reset password — should pick oldest admin
		newHash, err := auth.HashPassword("ResetPass789!")
		require.NoError(t, err)

		email, err := storage.ResetAdminPassword(ctx, storage.DB, testTenantID, newHash)
		require.NoError(t, err)
		assert.Equal(t, "oldest-admin@test.com", email, "should pick the oldest admin")

		// Verify only the oldest admin's password was changed
		c2, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer c2.Release()

		// Oldest admin should have the new password
		oldest, err := storage.GetUserByEmailWithPassword(ctx, c2, testTenantID, "oldest-admin@test.com")
		require.NoError(t, err)
		err = auth.VerifyPassword("ResetPass789!", oldest.PasswordHash)
		assert.NoError(t, err, "oldest admin should have new password")

		// Newer admin should still have original password
		newer, err := storage.GetUserByEmailWithPassword(ctx, c2, testTenantID, "newer-admin@test.com")
		require.NoError(t, err)
		err = auth.VerifyPassword("AdminTwo123!", newer.PasswordHash)
		assert.NoError(t, err, "newer admin should still have original password")

		// Verify must_change_password only on oldest
		oldestFull, err := storage.GetUserByIDFull(ctx, c2, admin1.ID)
		require.NoError(t, err)
		assert.True(t, oldestFull.MustChangePassword, "oldest admin must_change_password should be true")

		// Clean up
		_, err = c2.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, testTenantID)
		require.NoError(t, err)
	})
}
