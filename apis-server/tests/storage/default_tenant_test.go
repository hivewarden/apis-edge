// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// randomHex generates a random hex string for unique test identifiers.
func randomHex() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// resetAuthConfig resets the auth configuration between tests.
func resetAuthConfigForStorage() {
	config.ResetAuthConfig()
}

// ============================================================================
// EnsureDefaultTenantExists Tests
// ============================================================================

func TestEnsureDefaultTenantExists_CreatesTenantWhenMissing(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	// Initialize auth config for DefaultTenantUUID access
	resetAuthConfigForStorage()
	defer resetAuthConfigForStorage()
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	require.NoError(t, config.InitAuthConfig())

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations to ensure schema is ready
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// First, delete the default tenant if it exists (clean slate)
	defaultID := config.DefaultTenantUUID()
	_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, defaultID)
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)

	// Verify tenant doesn't exist
	var exists bool
	err = storage.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)`, defaultID).Scan(&exists)
	require.NoError(t, err)
	require.False(t, exists, "Default tenant should not exist before test")

	// Call EnsureDefaultTenantExists
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err)

	// Verify tenant now exists
	err = storage.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)`, defaultID).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "Default tenant should exist after EnsureDefaultTenantExists")

	// Verify tenant has correct attributes
	var name, plan string
	err = storage.DB.QueryRow(ctx, `SELECT name, plan FROM tenants WHERE id = $1`, defaultID).Scan(&name, &plan)
	require.NoError(t, err)
	assert.Equal(t, "Default Tenant", name)
	assert.Equal(t, "free", plan)

	// Cleanup
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)
}

func TestEnsureDefaultTenantExists_IdempotentWhenExists(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	// Initialize auth config
	resetAuthConfigForStorage()
	defer resetAuthConfigForStorage()
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	require.NoError(t, config.InitAuthConfig())

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	defaultID := config.DefaultTenantUUID()

	// Ensure clean slate
	_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, defaultID)
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)

	// Call EnsureDefaultTenantExists twice
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err, "First call should succeed")

	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err, "Second call should succeed (idempotent)")

	// Call a third time to be sure
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err, "Third call should succeed (idempotent)")

	// Verify only one tenant exists
	var count int
	err = storage.DB.QueryRow(ctx, `SELECT COUNT(*) FROM tenants WHERE id = $1`, defaultID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "Should only have one default tenant")

	// Cleanup
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)
}

func TestEnsureDefaultTenantExists_CorrectUUID(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	// Initialize auth config
	resetAuthConfigForStorage()
	defer resetAuthConfigForStorage()
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	require.NoError(t, config.InitAuthConfig())

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	defaultID := config.DefaultTenantUUID()

	// Clean slate
	_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, defaultID)
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)

	// Create tenant
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err)

	// Verify the UUID is exactly the expected one
	var tenantID string
	err = storage.DB.QueryRow(ctx, `SELECT id FROM tenants WHERE id = $1`, defaultID).Scan(&tenantID)
	require.NoError(t, err)
	assert.Equal(t, "00000000-0000-0000-0000-000000000000", tenantID, "Default tenant should have fixed UUID")

	// Cleanup
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)
}

// ============================================================================
// CountUsersInTenant Tests
// ============================================================================

func TestCountUsersInTenant_ReturnsZeroForEmptyTenant(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Create a test tenant with no users
	tenantID := "test-count-empty-" + randomHex()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Empty Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, tenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID)
	}()

	// Count users
	count, err := storage.CountUsersInTenant(ctx, storage.DB, tenantID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count, "Empty tenant should have 0 users")
}

func TestCountUsersInTenant_CountsUsersCorrectly(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Create a test tenant
	tenantID := "test-count-users-" + randomHex()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Test Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, tenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, tenantID)
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID)
	}()

	// Add 3 users
	for i := 0; i < 3; i++ {
		userID := "test-user-count-" + randomHex()
		email := "user" + randomHex() + "@test.com"
		_, err = storage.DB.Exec(ctx, `
			INSERT INTO users (id, tenant_id, email, display_name)
			VALUES ($1, $2, $3, 'Test User')
		`, userID, tenantID, email)
		require.NoError(t, err)
	}

	// Count users
	count, err := storage.CountUsersInTenant(ctx, storage.DB, tenantID)
	require.NoError(t, err)
	assert.Equal(t, int64(3), count, "Tenant should have 3 users")
}

func TestCountUsersInTenant_OnlyCountsTenantUsers(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Create two test tenants
	tenant1ID := "test-count-t1-" + randomHex()
	tenant2ID := "test-count-t2-" + randomHex()

	for _, tenantID := range []string{tenant1ID, tenant2ID} {
		_, err = storage.DB.Exec(ctx, `
			INSERT INTO tenants (id, name, plan)
			VALUES ($1, 'Test Tenant', 'free')
			ON CONFLICT (id) DO NOTHING
		`, tenantID)
		require.NoError(t, err)
	}
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id IN ($1, $2)`, tenant1ID, tenant2ID)
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id IN ($1, $2)`, tenant1ID, tenant2ID)
	}()

	// Add 2 users to tenant1
	for i := 0; i < 2; i++ {
		userID := "test-user-t1-" + randomHex()
		email := "t1-user" + randomHex() + "@test.com"
		_, err = storage.DB.Exec(ctx, `
			INSERT INTO users (id, tenant_id, email, display_name)
			VALUES ($1, $2, $3, 'Test User')
		`, userID, tenant1ID, email)
		require.NoError(t, err)
	}

	// Add 5 users to tenant2
	for i := 0; i < 5; i++ {
		userID := "test-user-t2-" + randomHex()
		email := "t2-user" + randomHex() + "@test.com"
		_, err = storage.DB.Exec(ctx, `
			INSERT INTO users (id, tenant_id, email, display_name)
			VALUES ($1, $2, $3, 'Test User')
		`, userID, tenant2ID, email)
		require.NoError(t, err)
	}

	// Count users in tenant1 (should be 2, not 7)
	count1, err := storage.CountUsersInTenant(ctx, storage.DB, tenant1ID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), count1, "Tenant1 should have 2 users")

	// Count users in tenant2 (should be 5)
	count2, err := storage.CountUsersInTenant(ctx, storage.DB, tenant2ID)
	require.NoError(t, err)
	assert.Equal(t, int64(5), count2, "Tenant2 should have 5 users")
}

func TestCountUsersInTenant_ReturnsZeroForNonexistentTenant(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Count users for non-existent tenant
	nonexistentTenantID := "nonexistent-" + randomHex()
	count, err := storage.CountUsersInTenant(ctx, storage.DB, nonexistentTenantID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count, "Nonexistent tenant should have 0 users")
}

// ============================================================================
// Integration: Default Tenant with User Count
// ============================================================================

func TestDefaultTenant_SetupRequired(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	// Initialize auth config
	resetAuthConfigForStorage()
	defer resetAuthConfigForStorage()
	t.Setenv("AUTH_MODE", "local")
	t.Setenv("JWT_SECRET", "this-is-a-very-long-secret-for-testing-purposes-12345")
	require.NoError(t, config.InitAuthConfig())

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	defaultID := config.DefaultTenantUUID()

	// Clean slate
	_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, defaultID)
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)

	// Create default tenant
	err = storage.EnsureDefaultTenantExists(ctx, storage.DB)
	require.NoError(t, err)

	// Count should be 0 (setup required = true)
	count, err := storage.CountUsersInTenant(ctx, storage.DB, defaultID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count)
	assert.True(t, count == 0, "Setup should be required when no users exist")

	// Add a user
	userID := "test-user-setup-" + randomHex()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, display_name, role)
		VALUES ($1, $2, 'admin@local.test', 'Local Admin', 'admin')
	`, userID, defaultID)
	require.NoError(t, err)

	// Count should now be 1 (setup required = false)
	count, err = storage.CountUsersInTenant(ctx, storage.DB, defaultID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)
	assert.True(t, count > 0, "Setup should NOT be required when users exist")

	// Cleanup
	_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE tenant_id = $1`, defaultID)
	_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, defaultID)
}
