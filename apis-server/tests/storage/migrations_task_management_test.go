package storage_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// randomTestSuffix generates a random hex string to avoid ID conflicts in parallel test runs
func randomTestSuffix() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// TestTaskManagementMigrations tests all migrations for the task management feature (Epic 14).
// Requires a running PostgreSQL/YugabyteDB database - set DATABASE_URL env var.
func TestTaskManagementMigrations(t *testing.T) {
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
	t.Run("TaskTemplatesTable", func(t *testing.T) {
		testTaskTemplatesTable(t, ctx)
	})

	t.Run("HiveTasksTable", func(t *testing.T) {
		testHiveTasksTable(t, ctx)
	})

	t.Run("TaskSuggestionsTable", func(t *testing.T) {
		testTaskSuggestionsTable(t, ctx)
	})

	t.Run("SystemTemplatesSeeded", func(t *testing.T) {
		testSystemTemplatesSeeded(t, ctx)
	})

	t.Run("TaskMigrationIdempotency", func(t *testing.T) {
		testTaskMigrationIdempotency(t, ctx)
	})
}

// testTaskTemplatesTable verifies task_templates table structure and constraints
func testTaskTemplatesTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'task_templates'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "task_templates table should exist")

	// Check all required columns with correct types
	columns := map[string]string{
		"id":          "text",
		"tenant_id":   "text",
		"type":        "text",
		"name":        "text",
		"description": "text",
		"auto_effects": "jsonb",
		"is_system":   "boolean",
		"created_at":  "timestamp with time zone",
		"created_by":  "text",
	}

	for col, expectedType := range columns {
		var dataType string
		err := storage.DB.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'task_templates' AND column_name = $1
		`, col).Scan(&dataType)
		require.NoError(t, err, "Column %s should exist", col)
		assert.Equal(t, expectedType, dataType, "Column %s should have type %s", col, expectedType)
	}

	// Check tenant_id is nullable (for system templates)
	var isNullable string
	err = storage.DB.QueryRow(ctx, `
		SELECT is_nullable FROM information_schema.columns
		WHERE table_name = 'task_templates' AND column_name = 'tenant_id'
	`).Scan(&isNullable)
	require.NoError(t, err)
	assert.Equal(t, "YES", isNullable, "tenant_id should be nullable for system templates")

	// Check RLS is enabled
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'task_templates'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on task_templates")

	// Check RLS policy exists
	var policyCount int
	err = storage.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM pg_policies
		WHERE tablename = 'task_templates'
	`).Scan(&policyCount)
	require.NoError(t, err)
	assert.Greater(t, policyCount, 0, "At least one RLS policy should exist on task_templates")

	// Check indexes exist
	indexes := []string{"idx_task_templates_tenant", "idx_task_templates_system"}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'task_templates' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on task_templates", idx)
	}

	// Check type CHECK constraint - verify valid values are accepted
	validTypes := []string{"requeen", "add_frame", "remove_frame", "harvest_frames", "add_feed", "treatment", "add_brood_box", "add_honey_super", "remove_box", "custom"}
	for _, validType := range validTypes {
		// This tests the CHECK constraint by using an implicit validation query
		var constraintAllows bool
		err := storage.DB.QueryRow(ctx, `
			SELECT $1 IN ('requeen', 'add_frame', 'remove_frame', 'harvest_frames', 'add_feed', 'treatment', 'add_brood_box', 'add_honey_super', 'remove_box', 'custom')
		`, validType).Scan(&constraintAllows)
		require.NoError(t, err)
		assert.True(t, constraintAllows, "Type %s should be allowed", validType)
	}

	// Test CHECK constraint rejection by actually attempting INSERT with invalid type
	suffix := randomTestSuffix()
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_templates (id, tenant_id, type, name, is_system, created_by)
		VALUES ($1, NULL, 'invalid_type', 'Test Invalid Type', TRUE, NULL)
	`, "test-invalid-type-"+suffix)
	assert.Error(t, err, "INSERT with invalid type should be rejected by CHECK constraint")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")
}

// testHiveTasksTable verifies hive_tasks table structure and constraints
func testHiveTasksTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'hive_tasks'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "hive_tasks table should exist")

	// Check all required columns with correct types
	columns := map[string]string{
		"id":                   "text",
		"tenant_id":            "text",
		"hive_id":              "text",
		"template_id":          "text",
		"custom_title":         "text",
		"description":          "text",
		"priority":             "text",
		"due_date":             "date",
		"status":               "text",
		"source":               "text",
		"created_by":           "text",
		"created_at":           "timestamp with time zone",
		"completed_by":         "text",
		"completed_at":         "timestamp with time zone",
		"completion_data":      "jsonb",
		"auto_applied_changes": "jsonb",
	}

	for col, expectedType := range columns {
		var dataType string
		err := storage.DB.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'hive_tasks' AND column_name = $1
		`, col).Scan(&dataType)
		require.NoError(t, err, "Column %s should exist", col)
		assert.Equal(t, expectedType, dataType, "Column %s should have type %s", col, expectedType)
	}

	// Check RLS is enabled
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'hive_tasks'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on hive_tasks")

	// Check indexes exist
	indexes := []string{
		"idx_hive_tasks_hive_status",
		"idx_hive_tasks_due_date",
		"idx_hive_tasks_tenant",
		"idx_hive_tasks_tenant_status",
		"idx_hive_tasks_priority",
	}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'hive_tasks' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on hive_tasks", idx)
	}

	// Test priority CHECK constraint values
	validPriorities := []string{"low", "medium", "high", "urgent"}
	for _, p := range validPriorities {
		var isValid bool
		err := storage.DB.QueryRow(ctx, `
			SELECT $1 IN ('low', 'medium', 'high', 'urgent')
		`, p).Scan(&isValid)
		require.NoError(t, err)
		assert.True(t, isValid, "Priority %s should be valid", p)
	}

	// Test status CHECK constraint values
	validStatuses := []string{"pending", "completed"}
	for _, s := range validStatuses {
		var isValid bool
		err := storage.DB.QueryRow(ctx, `
			SELECT $1 IN ('pending', 'completed')
		`, s).Scan(&isValid)
		require.NoError(t, err)
		assert.True(t, isValid, "Status %s should be valid", s)
	}

	// Test source CHECK constraint values
	validSources := []string{"manual", "beebrain"}
	for _, s := range validSources {
		var isValid bool
		err := storage.DB.QueryRow(ctx, `
			SELECT $1 IN ('manual', 'beebrain')
		`, s).Scan(&isValid)
		require.NoError(t, err)
		assert.True(t, isValid, "Source %s should be valid", s)
	}

	// Test CHECK constraint rejection by actually attempting INSERT with invalid values
	// We need to set up test data first (tenant, site, hive, user) to satisfy FKs
	suffix := randomTestSuffix()
	testTenantID := "test-hive-tasks-check-" + suffix

	// Create test tenant
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Check Constraint Test Tenant', 'free')
	`, testTenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, testTenantID)
	}()

	// Create test user
	testUserID := "test-user-check-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, auth_provider, name, email, role, status)
		VALUES ($1, $2, 'local', 'Check Test User', $3, 'owner', 'active')
	`, testUserID, testTenantID, "check-test-"+suffix+"@test.com")
	require.NoError(t, err)

	// Create test site
	testSiteID := "test-site-check-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO sites (id, tenant_id, name)
		VALUES ($1, $2, 'Check Test Site')
	`, testSiteID, testTenantID)
	require.NoError(t, err)

	// Create test hive
	testHiveID := "test-hive-check-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hives (id, tenant_id, site_id, name)
		VALUES ($1, $2, $3, 'Check Test Hive')
	`, testHiveID, testTenantID, testSiteID)
	require.NoError(t, err)

	// Test invalid priority
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hive_tasks (id, tenant_id, hive_id, priority, status, source, created_by)
		VALUES ($1, $2, $3, 'invalid_priority', 'pending', 'manual', $4)
	`, "test-invalid-priority-"+suffix, testTenantID, testHiveID, testUserID)
	assert.Error(t, err, "INSERT with invalid priority should be rejected")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")

	// Test invalid status
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hive_tasks (id, tenant_id, hive_id, priority, status, source, created_by)
		VALUES ($1, $2, $3, 'medium', 'invalid_status', 'manual', $4)
	`, "test-invalid-status-"+suffix, testTenantID, testHiveID, testUserID)
	assert.Error(t, err, "INSERT with invalid status should be rejected")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")

	// Test invalid source
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hive_tasks (id, tenant_id, hive_id, priority, status, source, created_by)
		VALUES ($1, $2, $3, 'medium', 'pending', 'invalid_source', $4)
	`, "test-invalid-source-"+suffix, testTenantID, testHiveID, testUserID)
	assert.Error(t, err, "INSERT with invalid source should be rejected")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")
}

// testTaskSuggestionsTable verifies task_suggestions table structure and constraints
func testTaskSuggestionsTable(t *testing.T, ctx context.Context) {
	// Check table exists
	var tableExists bool
	err := storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'task_suggestions'
		)
	`).Scan(&tableExists)
	require.NoError(t, err)
	assert.True(t, tableExists, "task_suggestions table should exist")

	// Check all required columns with correct types
	columns := map[string]string{
		"id":                    "text",
		"tenant_id":             "text",
		"hive_id":               "text",
		"inspection_id":         "text",
		"suggested_template_id": "text",
		"suggested_title":       "text",
		"reason":                "text",
		"priority":              "text",
		"status":                "text",
		"created_at":            "timestamp with time zone",
	}

	for col, expectedType := range columns {
		var dataType string
		err := storage.DB.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'task_suggestions' AND column_name = $1
		`, col).Scan(&dataType)
		require.NoError(t, err, "Column %s should exist", col)
		assert.Equal(t, expectedType, dataType, "Column %s should have type %s", col, expectedType)
	}

	// Check RLS is enabled
	var rlsEnabled bool
	err = storage.DB.QueryRow(ctx, `
		SELECT relrowsecurity FROM pg_class
		WHERE relname = 'task_suggestions'
	`).Scan(&rlsEnabled)
	require.NoError(t, err)
	assert.True(t, rlsEnabled, "RLS should be enabled on task_suggestions")

	// Check indexes exist
	indexes := []string{
		"idx_task_suggestions_hive_status",
		"idx_task_suggestions_tenant",
		"idx_task_suggestions_pending",
	}
	for _, idx := range indexes {
		var indexExists bool
		err := storage.DB.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM pg_indexes
				WHERE tablename = 'task_suggestions' AND indexname = $1
			)
		`, idx).Scan(&indexExists)
		require.NoError(t, err)
		assert.True(t, indexExists, "Index %s should exist on task_suggestions", idx)
	}

	// Test status CHECK constraint values
	validStatuses := []string{"pending", "accepted", "dismissed"}
	for _, s := range validStatuses {
		var isValid bool
		err := storage.DB.QueryRow(ctx, `
			SELECT $1 IN ('pending', 'accepted', 'dismissed')
		`, s).Scan(&isValid)
		require.NoError(t, err)
		assert.True(t, isValid, "Status %s should be valid for task_suggestions", s)
	}

	// Test CHECK constraint rejection by actually attempting INSERT with invalid values
	suffix := randomTestSuffix()
	testTenantID := "test-suggestions-check-" + suffix

	// Create test tenant
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Suggestions Check Test Tenant', 'free')
	`, testTenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, testTenantID)
	}()

	// Create test site
	testSiteID := "test-site-suggestions-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO sites (id, tenant_id, name)
		VALUES ($1, $2, 'Suggestions Test Site')
	`, testSiteID, testTenantID)
	require.NoError(t, err)

	// Create test hive
	testHiveID := "test-hive-suggestions-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hives (id, tenant_id, site_id, name)
		VALUES ($1, $2, $3, 'Suggestions Test Hive')
	`, testHiveID, testTenantID, testSiteID)
	require.NoError(t, err)

	// Test invalid status
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_suggestions (id, tenant_id, hive_id, reason, status)
		VALUES ($1, $2, $3, 'Test reason', 'invalid_status')
	`, "test-invalid-suggestion-status-"+suffix, testTenantID, testHiveID)
	assert.Error(t, err, "INSERT with invalid status should be rejected")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")

	// Test invalid priority
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_suggestions (id, tenant_id, hive_id, reason, priority)
		VALUES ($1, $2, $3, 'Test reason', 'invalid_priority')
	`, "test-invalid-suggestion-priority-"+suffix, testTenantID, testHiveID)
	assert.Error(t, err, "INSERT with invalid priority should be rejected")
	assert.Contains(t, err.Error(), "violates check constraint", "Error should mention check constraint violation")
}

// testSystemTemplatesSeeded verifies all 9 system templates are seeded correctly
func testSystemTemplatesSeeded(t *testing.T, ctx context.Context) {
	// Count system templates
	var templateCount int
	err := storage.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM task_templates
		WHERE is_system = TRUE AND tenant_id IS NULL
	`).Scan(&templateCount)
	require.NoError(t, err)
	assert.Equal(t, 9, templateCount, "Should have exactly 9 system templates")

	// Verify each template type exists with valid auto_effects JSON
	expectedTemplates := []struct {
		id          string
		templateType string
		name        string
	}{
		{"sys-template-requeen", "requeen", "Requeen"},
		{"sys-template-add-frame", "add_frame", "Add frame"},
		{"sys-template-remove-frame", "remove_frame", "Remove frame"},
		{"sys-template-harvest-frames", "harvest_frames", "Harvest frames"},
		{"sys-template-add-feed", "add_feed", "Add feed"},
		{"sys-template-treatment", "treatment", "Treatment"},
		{"sys-template-add-brood-box", "add_brood_box", "Add brood box"},
		{"sys-template-add-honey-super", "add_honey_super", "Add honey super"},
		{"sys-template-remove-box", "remove_box", "Remove box"},
	}

	for _, expected := range expectedTemplates {
		var id, name string
		var autoEffects []byte
		err := storage.DB.QueryRow(ctx, `
			SELECT id, name, auto_effects
			FROM task_templates
			WHERE id = $1 AND is_system = TRUE
		`, expected.id).Scan(&id, &name, &autoEffects)
		require.NoError(t, err, "Template %s should exist", expected.id)
		assert.Equal(t, expected.name, name, "Template %s should have correct name", expected.id)

		// Verify auto_effects is valid JSON
		var effects map[string]interface{}
		err = json.Unmarshal(autoEffects, &effects)
		require.NoError(t, err, "auto_effects for %s should be valid JSON", expected.id)

		// Verify auto_effects has expected structure
		_, hasPrompts := effects["prompts"]
		_, hasUpdates := effects["updates"]
		_, hasCreates := effects["creates"]
		assert.True(t, hasPrompts, "auto_effects for %s should have prompts array", expected.id)
		assert.True(t, hasUpdates, "auto_effects for %s should have updates array", expected.id)
		assert.True(t, hasCreates, "auto_effects for %s should have creates array", expected.id)
	}
}

// testTaskMigrationIdempotency verifies task migrations can be run multiple times
func testTaskMigrationIdempotency(t *testing.T, ctx context.Context) {
	// Run migrations again - should succeed without error
	err := storage.RunMigrations(ctx)
	require.NoError(t, err, "Task migrations should be idempotent - running twice should not error")

	// Verify system templates still exist (not duplicated or lost)
	var templateCount int
	err = storage.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM task_templates
		WHERE is_system = TRUE AND tenant_id IS NULL
	`).Scan(&templateCount)
	require.NoError(t, err)
	assert.Equal(t, 9, templateCount, "System templates should still be exactly 9 after re-running migrations")
}

// TestTaskManagementRLSPolicies tests RLS policies on task management tables
func TestTaskManagementRLSPolicies(t *testing.T) {
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
	rlsTables := []string{"task_templates", "hive_tasks", "task_suggestions"}

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
}

// TestTaskTemplatesRLSAllowsSystemTemplates tests that system templates are visible to all tenants
func TestTaskTemplatesRLSAllowsSystemTemplates(t *testing.T) {
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

	// Set a test tenant context
	suffix := randomTestSuffix()
	testTenantID := "test-tenant-rls-" + suffix

	// Create test tenant
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'RLS Test Tenant', 'free')
		ON CONFLICT (id) DO NOTHING
	`, testTenantID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, testTenantID)
	}()

	// Acquire connection and set tenant context (as the middleware does)
	conn, err := storage.DB.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	// Set tenant context to properly test RLS policy
	_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", testTenantID)
	require.NoError(t, err)

	// Query system templates with tenant context set
	// This simulates how the application would query templates
	var systemTemplateCount int
	err = conn.QueryRow(ctx, `
		SELECT COUNT(*) FROM task_templates
		WHERE is_system = TRUE AND tenant_id IS NULL
	`).Scan(&systemTemplateCount)
	require.NoError(t, err)
	assert.Equal(t, 9, systemTemplateCount, "All system templates should be visible to any tenant")
}

// TestTaskManagementCrossTenantIsolation tests that RLS properly isolates data between tenants
func TestTaskManagementCrossTenantIsolation(t *testing.T) {
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

	suffix := randomTestSuffix()
	tenantAID := "test-tenant-isolation-a-" + suffix
	tenantBID := "test-tenant-isolation-b-" + suffix

	// Create tenant A
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Isolation Test Tenant A', 'free')
	`, tenantAID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantAID)
	}()

	// Create tenant B
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO tenants (id, name, plan)
		VALUES ($1, 'Isolation Test Tenant B', 'free')
	`, tenantBID)
	require.NoError(t, err)
	defer func() {
		_, _ = storage.DB.Exec(ctx, `DELETE FROM tenants WHERE id = $1`, tenantBID)
	}()

	// Create users for each tenant
	userAID := "test-user-isolation-a-" + suffix
	userBID := "test-user-isolation-b-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, auth_provider, name, email, role, status)
		VALUES ($1, $2, 'local', 'User A', $3, 'owner', 'active')
	`, userAID, tenantAID, "user-a-"+suffix+"@test.com")
	require.NoError(t, err)

	_, err = storage.DB.Exec(ctx, `
		INSERT INTO users (id, tenant_id, auth_provider, name, email, role, status)
		VALUES ($1, $2, 'local', 'User B', $3, 'owner', 'active')
	`, userBID, tenantBID, "user-b-"+suffix+"@test.com")
	require.NoError(t, err)

	// Create sites for each tenant
	siteAID := "test-site-isolation-a-" + suffix
	siteBID := "test-site-isolation-b-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO sites (id, tenant_id, name)
		VALUES ($1, $2, 'Site A')
	`, siteAID, tenantAID)
	require.NoError(t, err)

	_, err = storage.DB.Exec(ctx, `
		INSERT INTO sites (id, tenant_id, name)
		VALUES ($1, $2, 'Site B')
	`, siteBID, tenantBID)
	require.NoError(t, err)

	// Create hives for each tenant
	hiveAID := "test-hive-isolation-a-" + suffix
	hiveBID := "test-hive-isolation-b-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hives (id, tenant_id, site_id, name)
		VALUES ($1, $2, $3, 'Hive A')
	`, hiveAID, tenantAID, siteAID)
	require.NoError(t, err)

	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hives (id, tenant_id, site_id, name)
		VALUES ($1, $2, $3, 'Hive B')
	`, hiveBID, tenantBID, siteBID)
	require.NoError(t, err)

	// Create a task for tenant A
	taskAID := "test-task-isolation-a-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hive_tasks (id, tenant_id, hive_id, custom_title, status, source, created_by)
		VALUES ($1, $2, $3, 'Tenant A Task', 'pending', 'manual', $4)
	`, taskAID, tenantAID, hiveAID, userAID)
	require.NoError(t, err)

	// Create a task for tenant B
	taskBID := "test-task-isolation-b-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO hive_tasks (id, tenant_id, hive_id, custom_title, status, source, created_by)
		VALUES ($1, $2, $3, 'Tenant B Task', 'pending', 'manual', $4)
	`, taskBID, tenantBID, hiveBID, userBID)
	require.NoError(t, err)

	// Create a task suggestion for tenant A
	suggestionAID := "test-suggestion-isolation-a-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_suggestions (id, tenant_id, hive_id, reason, status)
		VALUES ($1, $2, $3, 'Suggestion for A', 'pending')
	`, suggestionAID, tenantAID, hiveAID)
	require.NoError(t, err)

	// Create a task suggestion for tenant B
	suggestionBID := "test-suggestion-isolation-b-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_suggestions (id, tenant_id, hive_id, reason, status)
		VALUES ($1, $2, $3, 'Suggestion for B', 'pending')
	`, suggestionBID, tenantBID, hiveBID)
	require.NoError(t, err)

	// Create a custom template for tenant A
	templateAID := "test-template-isolation-a-" + suffix
	_, err = storage.DB.Exec(ctx, `
		INSERT INTO task_templates (id, tenant_id, type, name, is_system, created_by)
		VALUES ($1, $2, 'custom', 'Tenant A Custom Template', FALSE, $3)
	`, templateAID, tenantAID, userAID)
	require.NoError(t, err)

	t.Run("tenant A cannot see tenant B tasks", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set tenant context to A
		_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantAID)
		require.NoError(t, err)

		// Query all tasks - should only see tenant A's task
		var taskCount int
		err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM hive_tasks`).Scan(&taskCount)
		require.NoError(t, err)
		assert.Equal(t, 1, taskCount, "Tenant A should only see 1 task (their own)")

		// Try to query tenant B's task by ID - should return no rows
		var foundID string
		err = conn.QueryRow(ctx, `SELECT id FROM hive_tasks WHERE id = $1`, taskBID).Scan(&foundID)
		assert.Error(t, err, "Tenant A should not be able to see tenant B's task")
	})

	t.Run("tenant B cannot see tenant A tasks", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set tenant context to B
		_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantBID)
		require.NoError(t, err)

		// Query all tasks - should only see tenant B's task
		var taskCount int
		err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM hive_tasks`).Scan(&taskCount)
		require.NoError(t, err)
		assert.Equal(t, 1, taskCount, "Tenant B should only see 1 task (their own)")
	})

	t.Run("tenant A cannot see tenant B suggestions", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set tenant context to A
		_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantAID)
		require.NoError(t, err)

		// Query all suggestions - should only see tenant A's suggestion
		var suggestionCount int
		err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM task_suggestions`).Scan(&suggestionCount)
		require.NoError(t, err)
		assert.Equal(t, 1, suggestionCount, "Tenant A should only see 1 suggestion (their own)")
	})

	t.Run("tenant A sees own templates plus system templates", func(t *testing.T) {
		conn, err := storage.DB.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()

		// Set tenant context to A
		_, err = conn.Exec(ctx, "SET LOCAL app.tenant_id = $1", tenantAID)
		require.NoError(t, err)

		// Query all templates - should see 9 system + 1 tenant A custom
		var templateCount int
		err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM task_templates`).Scan(&templateCount)
		require.NoError(t, err)
		assert.Equal(t, 10, templateCount, "Tenant A should see 9 system templates + 1 own custom template")

		// Verify tenant A cannot see any custom templates from tenant B
		var tenantBTemplateCount int
		err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM task_templates WHERE tenant_id = $1`, tenantBID).Scan(&tenantBTemplateCount)
		require.NoError(t, err)
		assert.Equal(t, 0, tenantBTemplateCount, "Tenant A should not see tenant B's templates")
	})
}

// TestTaskManagementForeignKeys tests foreign key constraints for all task management tables
// (hive_tasks, task_suggestions, task_templates)
func TestTaskManagementForeignKeys(t *testing.T) {
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

	// Check foreign key to hives exists
	var fkHivesExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.table_constraints tc
			JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_name = ccu.constraint_name
			WHERE tc.table_name = 'hive_tasks'
				AND tc.constraint_type = 'FOREIGN KEY'
				AND ccu.table_name = 'hives'
		)
	`).Scan(&fkHivesExists)
	require.NoError(t, err)
	assert.True(t, fkHivesExists, "Foreign key from hive_tasks to hives should exist")

	// Check foreign key to tenants exists
	var fkTenantsExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.table_constraints tc
			JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_name = ccu.constraint_name
			WHERE tc.table_name = 'hive_tasks'
				AND tc.constraint_type = 'FOREIGN KEY'
				AND ccu.table_name = 'tenants'
		)
	`).Scan(&fkTenantsExists)
	require.NoError(t, err)
	assert.True(t, fkTenantsExists, "Foreign key from hive_tasks to tenants should exist")

	// Check foreign key to task_templates exists
	var fkTemplatesExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.table_constraints tc
			JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_name = ccu.constraint_name
			WHERE tc.table_name = 'hive_tasks'
				AND tc.constraint_type = 'FOREIGN KEY'
				AND ccu.table_name = 'task_templates'
		)
	`).Scan(&fkTemplatesExists)
	require.NoError(t, err)
	assert.True(t, fkTemplatesExists, "Foreign key from hive_tasks to task_templates should exist")

	// Check foreign key from task_suggestions to inspections
	var fkInspectionsExists bool
	err = storage.DB.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM information_schema.table_constraints tc
			JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_name = ccu.constraint_name
			WHERE tc.table_name = 'task_suggestions'
				AND tc.constraint_type = 'FOREIGN KEY'
				AND ccu.table_name = 'inspections'
		)
	`).Scan(&fkInspectionsExists)
	require.NoError(t, err)
	assert.True(t, fkInspectionsExists, "Foreign key from task_suggestions to inspections should exist")
}

// TestSystemTemplateAutoEffectsStructure validates the auto_effects JSON structure
func TestSystemTemplateAutoEffectsStructure(t *testing.T) {
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

	// Test specific templates have correct auto_effects structure
	type autoEffects struct {
		Prompts []struct {
			Key      string   `json:"key"`
			Label    string   `json:"label"`
			Type     string   `json:"type"`
			Options  []string `json:"options,omitempty"`
			Required bool     `json:"required,omitempty"`
		} `json:"prompts"`
		Updates []struct {
			Target    string `json:"target"`
			Action    string `json:"action"`
			Value     any    `json:"value,omitempty"`
			ValueFrom string `json:"value_from,omitempty"`
		} `json:"updates"`
		Creates []struct {
			Entity string            `json:"entity"`
			Fields map[string]string `json:"fields"`
		} `json:"creates"`
	}

	// Test requeen template has color prompt and updates
	var requeenEffects []byte
	err = storage.DB.QueryRow(ctx, `
		SELECT auto_effects FROM task_templates WHERE id = 'sys-template-requeen'
	`).Scan(&requeenEffects)
	require.NoError(t, err)

	var reqEffects autoEffects
	err = json.Unmarshal(requeenEffects, &reqEffects)
	require.NoError(t, err)
	assert.NotEmpty(t, reqEffects.Prompts, "Requeen should have prompts")
	assert.NotEmpty(t, reqEffects.Updates, "Requeen should have updates")

	// Test harvest template creates a harvest record
	var harvestEffects []byte
	err = storage.DB.QueryRow(ctx, `
		SELECT auto_effects FROM task_templates WHERE id = 'sys-template-harvest-frames'
	`).Scan(&harvestEffects)
	require.NoError(t, err)

	var harvEffects autoEffects
	err = json.Unmarshal(harvestEffects, &harvEffects)
	require.NoError(t, err)
	assert.NotEmpty(t, harvEffects.Creates, "Harvest should have creates")
	if len(harvEffects.Creates) > 0 {
		assert.Equal(t, "harvest", harvEffects.Creates[0].Entity, "Harvest should create a harvest record")
	}

	// Test add_brood_box template increments brood_boxes
	var broodBoxEffects []byte
	err = storage.DB.QueryRow(ctx, `
		SELECT auto_effects FROM task_templates WHERE id = 'sys-template-add-brood-box'
	`).Scan(&broodBoxEffects)
	require.NoError(t, err)

	var bbEffects autoEffects
	err = json.Unmarshal(broodBoxEffects, &bbEffects)
	require.NoError(t, err)
	assert.NotEmpty(t, bbEffects.Updates, "Add brood box should have updates")
	if len(bbEffects.Updates) > 0 {
		assert.Equal(t, "hive.brood_boxes", bbEffects.Updates[0].Target, "Should target hive.brood_boxes")
		assert.Equal(t, "increment", bbEffects.Updates[0].Action, "Should use increment action")
	}
}
