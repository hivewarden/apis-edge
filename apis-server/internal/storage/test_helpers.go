// Package storage provides database access and persistence for the APIS server.
package storage

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestConn wraps a database connection for use in tests.
// It provides access to the underlying *pgxpool.Conn while allowing
// tests to pass a typed wrapper for clarity.
type TestConn struct {
	Conn *pgxpool.Conn
}

// SetupTestDB initializes a database connection for integration tests.
// It returns a TestConn wrapper, a tenant ID, and a cleanup function.
//
// The cleanup function releases the connection and should be deferred.
//
// Usage:
//
//	conn, tenantID, cleanup := storage.SetupTestDB(t)
//	defer cleanup()
//
// Requires DATABASE_URL environment variable. Tests will be skipped if not set.
func SetupTestDB(t *testing.T) (*TestConn, string, func()) {
	t.Helper()

	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}
	t.Setenv("SECRETS_SOURCE", "env")

	ctx := context.Background()

	// Initialize DB if not already done
	if DB == nil {
		if err := InitDB(ctx); err != nil {
			t.Fatalf("SetupTestDB: failed to initialize database: %v", err)
		}
		// Run migrations to ensure schema exists
		if err := RunMigrations(ctx); err != nil {
			t.Fatalf("SetupTestDB: failed to run migrations: %v", err)
		}
	}

	// Acquire a connection from the pool
	conn, err := DB.Acquire(ctx)
	if err != nil {
		t.Fatalf("SetupTestDB: failed to acquire connection: %v", err)
	}

	// Create a test tenant ID
	tenantID := "test-tenant-" + GenerateID()[:8]

	// Ensure the test tenant exists
	_, err = conn.Exec(ctx, `
		INSERT INTO tenants (id, name, status, created_at, updated_at)
		VALUES ($1, $2, 'active', NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`, tenantID, "Test Tenant")
	if err != nil {
		conn.Release()
		t.Fatalf("SetupTestDB: failed to create test tenant: %v", err)
	}

	// Set the tenant context for RLS.
	// SECURITY FIX (DL-M12): Use set_config with is_local=false (session-level)
	// instead of SET LOCAL, which only works within a transaction block.
	// Outside a transaction, SET LOCAL has no effect.
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	if err != nil {
		conn.Release()
		t.Fatalf("SetupTestDB: failed to set tenant context: %v", err)
	}

	testConn := &TestConn{Conn: conn}

	cleanup := func() {
		// Clean up test data (optional - can be extended)
		conn.Release()
	}

	return testConn, tenantID, cleanup
}
