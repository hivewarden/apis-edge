package storage_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// randomSuffix generates a random hex string to avoid ID conflicts in parallel test runs
func randomSuffix() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// TestDualAuthMigrations tests all migrations for dual authentication mode.
// Requires a running PostgreSQL/YugabyteDB database - set DATABASE_URL env var.
func TestDualAuthMigrations(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()
	err := storage.InitDB(ctx)
	require.NoError(t, err)
	defer storage.CloseDB()

	// Run all migrations
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Test groups
	t.Run("UsersTableModifications", func(t *testing.T) {
		testUsersTableModifications(t, ctx)
	})

	t.Run("AuditLogTable", func(t *testing.T) {
		testAuditLogTable(t, ctx)
	})

	t.Run("InviteTokensTable", func(t *testing.T) {
		testInviteTokensTable(t, ctx)
	})

	t.Run("BeebrainConfigTable", func(t *testing.T) {
		testBeebrainConfigTable(t, ctx)
	})

	t.Run("ImpersonationLogTable", func(t *testing.T) {
		testImpersonationLogTable(t, ctx)
	})

	t.Run("TenantLimitsTable", func(t *testing.T) {
		testTenantLimitsTable(t, ctx)
	})

	t.Run("MigrationIdempotency", func(t *testing.T) {
		testMigrationIdempotency(t, ctx)
	})
}

// testUsersTableModifications verifies all new columns and constraints on users table
func testUsersTableModifications(t *testing.T, ctx context.Context) {
	// Check all required columns exist with correct types (includes new AND original columns)
	columns := map[string]string{
		// Original columns that should be preserved
		"id":                   "text",
		"tenant_id":            "text",
		"external_user_id":     "text",
		"email":                "text",
		"created_at":           "timestamp with time zone",
		// New columns added by migration
		"password_hash":        "character varying",
		"role":                 "text",
		"is_active":            "boolean",
		"must_change_password": "boolean",
		"invited_by":           "text",
		"invited_at":           "timestamp with time zone",
		"last_login_at":        "timestamp with time zone",
		"display_name":         "text",
		"updated_at":           "timestamp with time zone",
	}

	for col, expectedType := range columns {
		var dataType string
		err := storage.DB.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'users' AND column_name = $1
		`, col).Scan(&dataType)
		require.NoError(t, err, "Column %s should exist", col)
		assert.Equal(t, expectedType, dataType, "Column %s should have type %s", col, expectedType)
	}

	// Verify column rename worked: 'name' should NOT exist
	var nameExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'users' AND column_name = 'name'
		)
	`).Scan(&nameExists)
	require.NoError(t, err)
	assert.False(t, nameExists, "Column 'name' should have been renamed to 'display_name'")

	// Verify external_user_id is nullable
	var isNullable string
	err = storage.DB.QueryRow(ctx, `
		SELECT is_nullable FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'external_user_id'
	`).Scan(&isNullable)
	require.NoError(t, err)
	assert.Equal(t, "YES", isNullable, "external_user_id should be nullable")

	// Verify role CHECK constraint exists
	var constraintExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.check_constraints
			WHERE constraint_name = 'chk_users_role'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "chk_users_role constraint should exist")

	// Verify unique index on (tenant_id, email) exists
	var indexExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM pg_indexes
			WHERE tablename = 'users' AND indexname = 'idx_users_tenant_email_unique'
		)
	`).Scan(&indexExists)
	require.NoError(t, err)
	assert.True(t, indexExists, "idx_users_tenant_email_unique index should exist")

	// Verify unique index on external_user_id (for non-null values) exists
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM pg_indexes
			WHERE tablename = 'users' AND indexname = 'idx_users_external_user_id_unique'
		)
	`).Scan(&indexExists)
	require.NoError(t, err)
	assert.True(t, indexExists, "idx_users_external_user_id_unique index should exist")

	// Functional test: verify partial unique index allows multiple NULLs
	// This is critical for local auth mode where external_user_id is NULL for all users
	testFunctionalPartialUniqueIndex(t, ctx)

	// Verify foreign key for invited_by exists
	var fkExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.table_constraints
			WHERE constraint_name = 'fk_users_invited_by' AND table_name = 'users'
		)
	`).Scan(&fkExists)
	require.NoError(t, err)
	assert.True(t, fkExists, "fk_users_invited_by foreign key should exist")

	// Verify updated_at trigger exists
	var triggerExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.triggers
			WHERE trigger_name = 'trg_users_updated_at' AND event_object_table = 'users'
		)
	`).Scan(&triggerExists)
	require.NoError(t, err)
	assert.True(t, triggerExists, "trg_users_updated_at trigger should exist")

	// Functional test: verify trigger actually updates updated_at
	testFunctionalUpdatedAtTrigger(t, ctx)
}

// testFunctionalPartialUniqueIndex verifies that the partial unique index on external_user_id
// allows multiple NULL values (required for local auth mode)
func testFunctionalPartialUniqueIndex(t *testing.T, ctx context.Context) {
	// Create a test tenant first
	tenantID := "test-partial-idx-" + randomSuffix()
	_, err := storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Partial Index Test Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, tenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID)
	}()

	// Insert first user with NULL external_user_id
	user1ID := "test-user-null-1-" + randomSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, external_user_id)
		VALUES ($1, $2, 'null1@test.com', NULL)
	`, user1ID, tenantID)
	require.NoError(t, err, "First user with NULL external_user_id should insert successfully")
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, user1ID)
	}()

	// Insert second user with NULL external_user_id - this should succeed
	// because partial unique index only applies to non-NULL values
	user2ID := "test-user-null-2-" + randomSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, external_user_id)
		VALUES ($1, $2, 'null2@test.com', NULL)
	`, user2ID, tenantID)
	require.NoError(t, err, "Second user with NULL external_user_id should insert successfully (partial unique index allows multiple NULLs)")
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, user2ID)
	}()

	// Insert third user with a non-NULL external_user_id
	user3ID := "test-user-zid-1-" + randomSuffix()
	externalID := "external-" + randomSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, external_user_id)
		VALUES ($1, $2, 'zid1@test.com', $3)
	`, user3ID, tenantID, externalID)
	require.NoError(t, err, "User with unique external_user_id should insert successfully")
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, user3ID)
	}()

	// Try to insert a fourth user with the SAME external_user_id - this should FAIL
	user4ID := "test-user-zid-2-" + randomSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, external_user_id)
		VALUES ($1, $2, 'zid2@test.com', $3)
	`, user4ID, tenantID, externalID)
	assert.Error(t, err, "Duplicate non-NULL external_user_id should violate unique constraint")
}

// testFunctionalUpdatedAtTrigger verifies that the updated_at column is automatically
// updated when a user row is modified
func testFunctionalUpdatedAtTrigger(t *testing.T, ctx context.Context) {
	// Create a test tenant first
	tenantID := "test-trigger-" + randomSuffix()
	_, err := storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Trigger Test Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, tenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID)
	}()

	// Insert a test user
	userID := "test-user-trigger-" + randomSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, display_name)
		VALUES ($1, $2, 'trigger@test.com', 'Trigger Tester')
	`, userID, tenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()

	// Get the initial updated_at value
	var initialUpdatedAt, afterUpdatedAt interface{}
	err = storage.DB.QueryRow(ctx, `
		SELECT updated_at FROM users WHERE id = $1
	`, userID).Scan(&initialUpdatedAt)
	require.NoError(t, err)
	require.NotNil(t, initialUpdatedAt, "updated_at should have a default value")

	// Wait a tiny bit to ensure timestamp changes (PostgreSQL timestamp precision)
	// Use pg_sleep for database-side delay to avoid test timing issues
	_, err = storage.DB.Exec(ctx, `SELECT pg_sleep(0.01)`)
	require.NoError(t, err)

	// Update the user
	_, err = storage.DB.Exec(ctx, `
		UPDATE users SET display_name = 'Updated Trigger Tester' WHERE id = $1
	`, userID)
	require.NoError(t, err)

	// Get the new updated_at value
	err = storage.DB.QueryRow(ctx, `
		SELECT updated_at FROM users WHERE id = $1
	`, userID).Scan(&afterUpdatedAt)
	require.NoError(t, err)

	// Verify updated_at was changed by the trigger
	assert.NotEqual(t, initialUpdatedAt, afterUpdatedAt, "Trigger should update updated_at on row modification")
}

// testAuditLogTable verifies audit_log table structure and constraints
func testAuditLogTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'audit_log'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "audit_log table should exist")

	// Check required columns
	columns := []string{"id", "tenant_id", "user_id", "action", "entity_type", "entity_id", "old_values", "new_values", "ip_address", "created_at"}
	for _, col := range columns {
		var colExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'audit_log' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "Column %s should exist in audit_log", col)
	}

	// Check RLS is enabled
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'audit_log'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on audit_log")

	// Check indexes exist
	indexes := []string{"idx_audit_log_tenant_created", "idx_audit_log_entity", "idx_audit_log_user"}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'audit_log' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on audit_log", idx)
	}

	// Check action CHECK constraint
	var constraintExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.check_constraints
			WHERE constraint_name = 'chk_audit_log_action'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "chk_audit_log_action constraint should exist")
}

// testInviteTokensTable verifies invite_tokens table structure and constraints
func testInviteTokensTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'invite_tokens'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "invite_tokens table should exist")

	// Check required columns
	columns := []string{"id", "tenant_id", "email", "role", "token", "created_by", "expires_at", "used_at", "created_at"}
	for _, col := range columns {
		var colExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'invite_tokens' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "Column %s should exist in invite_tokens", col)
	}

	// Check RLS is enabled
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'invite_tokens'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on invite_tokens")

	// Check indexes exist
	indexes := []string{"idx_invite_tokens_token", "idx_invite_tokens_tenant", "idx_invite_tokens_tenant_email"}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'invite_tokens' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on invite_tokens", idx)
	}

	// Check role CHECK constraint
	var constraintExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.check_constraints
			WHERE constraint_name = 'chk_invite_tokens_role'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "chk_invite_tokens_role constraint should exist")
}

// testBeebrainConfigTable verifies beebrain_config table structure and constraints
func testBeebrainConfigTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'beebrain_config'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "beebrain_config table should exist")

	// Check required columns
	columns := []string{"id", "tenant_id", "backend", "provider", "endpoint", "api_key_encrypted", "model", "is_tenant_override", "updated_at"}
	for _, col := range columns {
		var colExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'beebrain_config' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "Column %s should exist in beebrain_config", col)
	}

	// Check RLS is NOT enabled (intentionally)
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'beebrain_config'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.False(t, rlsEnabled, "RLS should NOT be enabled on beebrain_config (system table)")

	// Check backend CHECK constraint
	var constraintExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.check_constraints
			WHERE constraint_name = 'chk_beebrain_config_backend'
		)
	`).Scan(&constraintExists)
	require.NoError(t, err)
	assert.True(t, constraintExists, "chk_beebrain_config_backend constraint should exist")

	// Check unique index on tenant_id exists
	var indexExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM pg_indexes
			WHERE tablename = 'beebrain_config' AND indexname = 'idx_beebrain_config_tenant_unique'
		)
	`).Scan(&indexExists)
	require.NoError(t, err)
	assert.True(t, indexExists, "idx_beebrain_config_tenant_unique index should exist")

	// Check system default config was inserted
	var defaultExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM beebrain_config
			WHERE tenant_id IS NULL AND backend = 'rules'
		)
	`).Scan(&defaultExists)
	require.NoError(t, err)
	assert.True(t, defaultExists, "System default beebrain_config should exist")
}

// testImpersonationLogTable verifies impersonation_log table structure
func testImpersonationLogTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'impersonation_log'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "impersonation_log table should exist")

	// Check required columns
	columns := []string{"id", "super_admin_id", "tenant_id", "started_at", "ended_at", "actions_taken"}
	for _, col := range columns {
		var colExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'impersonation_log' AND column_name = $1
			)
		`, col).Scan(&colExists)
		require.NoError(t, err)
		assert.True(t, colExists, "Column %s should exist in impersonation_log", col)
	}

	// Check RLS is NOT enabled (intentionally)
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'impersonation_log'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.False(t, rlsEnabled, "RLS should NOT be enabled on impersonation_log (super-admin only)")

	// Check indexes exist
	indexes := []string{"idx_impersonation_tenant", "idx_impersonation_admin", "idx_impersonation_active"}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'impersonation_log' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on impersonation_log", idx)
	}
}

// testTenantLimitsTable verifies tenant_limits table structure
func testTenantLimitsTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'tenant_limits'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "tenant_limits table should exist")

	// Check required columns with correct types
	columns := map[string]string{
		"tenant_id":         "text",
		"max_hives":         "integer",
		"max_storage_bytes": "bigint",
		"max_units":         "integer",
		"max_users":         "integer",
		"updated_at":        "timestamp with time zone",
	}

	for col, expectedType := range columns {
		var dataType string
		err := storage.DB.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'tenant_limits' AND column_name = $1
		`, col).Scan(&dataType)
		require.NoError(t, err, "Column %s should exist", col)
		assert.Equal(t, expectedType, dataType, "Column %s should have type %s", col, expectedType)
	}

	// Check RLS is NOT enabled (intentionally)
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'tenant_limits'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.False(t, rlsEnabled, "RLS should NOT be enabled on tenant_limits (system table)")

	// Check updated_at trigger exists
	var triggerExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.triggers
			WHERE trigger_name = 'trg_tenant_limits_updated_at' AND event_object_table = 'tenant_limits'
		)
	`).Scan(&triggerExists)
	require.NoError(t, err)
	assert.True(t, triggerExists, "trg_tenant_limits_updated_at trigger should exist")
}

// testMigrationIdempotency verifies migrations can be run multiple times without error
func testMigrationIdempotency(t *testing.T, ctx context.Context) {
	// Run migrations again - should succeed without error
	err := storage.RunMigrations(ctx)
	require.NoError(t, err, "Migrations should be idempotent - running twice should not error")

	// Run a third time for good measure
	err = storage.RunMigrations(ctx)
	require.NoError(t, err, "Migrations should be idempotent - running three times should not error")
}

// TestMigrationsPreserveExistingData tests that migrations don't destroy existing data
func TestMigrationsPreserveExistingData(t *testing.T) {
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

	// Use random suffixes to avoid conflicts in parallel test runs
	suffix := randomSuffix()
	tenantID := "test-tenant-migration-" + suffix
	userID := "test-user-migration-" + suffix

	// Create test tenant
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Migration Test Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, tenantID)
	require.NoError(t, err)

	// Create test user with new columns
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, display_name, role, is_active)
		VALUES ($1, $2, 'migration@test.com', 'Migration Tester', 'admin', true)
		ON CONFLICT (id) DO NOTHING
	`, userID, tenantID)
	require.NoError(t, err)

	// Run migrations again
	err = storage.RunMigrations(ctx)
	require.NoError(t, err)

	// Verify user data is preserved
	var email, displayName, role string
	var isActive bool
	err = storage.DB.QueryRow(ctx, `
		SELECT email, display_name, role, is_active
		FROM users WHERE id = $1
	`, userID).Scan(&email, &displayName, &role, &isActive)
	require.NoError(t, err)
	assert.Equal(t, "migration@test.com", email)
	assert.Equal(t, "Migration Tester", displayName)
	assert.Equal(t, "admin", role)
	assert.True(t, isActive)

	// Cleanup test data - log errors for debugging but don't fail test
	if _, err := storage.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Logf("Warning: cleanup failed for user %s: %v", userID, err)
	}
	if _, err := storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantID); err != nil {
		t.Logf("Warning: cleanup failed for tenant %s: %v", tenantID, err)
	}
}

// TestRLSPoliciesActive tests that RLS policies are correctly configured
func TestRLSPoliciesActive(t *testing.T) {
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

	// Tables that should have RLS enabled
	rlsTables := []string{"audit_log", "invite_tokens"}

	for _, table := range rlsTables {
		var rlsEnabled bool
		err := storage.DB.QueryRow(ctx, `
			SELECT relrowsecurity FROM pg_class
			WHERE relname = $1
		`, table).Scan(&rlsEnabled)
		require.NoError(t, err)
		assert.True(t, rlsEnabled, "RLS should be enabled on %s", table)

		// Check at least one policy exists
		var policyCount int
		err = storage.DB.QueryRow(ctx, `
			SELECT COUNT(*) FROM pg_policies
			WHERE tablename = $1
		`, table).Scan(&policyCount)
		require.NoError(t, err)
		assert.Greater(t, policyCount, 0, "At least one RLS policy should exist on %s", table)
	}

	// Tables that should NOT have RLS
	noRLSTables := []string{"beebrain_config", "impersonation_log", "tenant_limits"}

	for _, table := range noRLSTables {
		var rlsEnabled bool
		err := storage.DB.QueryRow(ctx, `
			SELECT relrowsecurity FROM pg_class
			WHERE relname = $1
		`, table).Scan(&rlsEnabled)
		require.NoError(t, err)
		assert.False(t, rlsEnabled, "RLS should NOT be enabled on %s (system table)", table)
	}
}
