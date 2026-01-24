package storage

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInitDB tests database initialization.
// Requires a running database - skip if DATABASE_URL not set.
func TestInitDB(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	ctx := context.Background()
	err := InitDB(ctx)
	require.NoError(t, err)
	defer CloseDB()

	assert.NotNil(t, DB)

	// Verify we can ping the database
	err = DB.Ping(ctx)
	assert.NoError(t, err)
}

// TestRunMigrations tests migration execution.
// Requires a running database - skip if DATABASE_URL not set.
func TestRunMigrations(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set - skipping integration test")
	}

	ctx := context.Background()
	err := InitDB(ctx)
	require.NoError(t, err)
	defer CloseDB()

	// Run migrations
	err = RunMigrations(ctx)
	require.NoError(t, err)

	// Verify tables exist by querying them
	var tableCount int
	err = DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name IN ('tenants', 'users')`,
	).Scan(&tableCount)
	require.NoError(t, err)
	assert.Equal(t, 2, tableCount, "Expected tenants and users tables to exist")
}

// TestConnectionHelpers tests the context helper functions.
func TestConnectionHelpers(t *testing.T) {
	ctx := context.Background()

	// Test GetConn returns nil when no connection set
	conn := GetConn(ctx)
	assert.Nil(t, conn)

	// Test RequireConn panics when no connection set
	assert.Panics(t, func() {
		RequireConn(ctx)
	})
}
