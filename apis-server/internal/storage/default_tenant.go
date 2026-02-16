package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/config"
	"github.com/rs/zerolog/log"
)

// EnsureDefaultTenantExists creates the default tenant for local auth mode if it doesn't exist.
// This function is idempotent - it will not error if the tenant already exists.
// The default tenant uses the fixed UUID from config.DefaultTenantID.
//
// This function should only be called in local auth mode during server startup,
// after database migrations have completed.
func EnsureDefaultTenantExists(ctx context.Context, pool *pgxpool.Pool) error {
	defaultID := config.DefaultTenantUUID()

	// Acquire a connection from the pool
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Check if the default tenant already exists
	existing, err := GetTenantByID(ctx, conn, defaultID)
	if err == nil {
		// Tenant already exists
		log.Debug().
			Str("tenant_id", existing.ID).
			Str("tenant_name", existing.Name).
			Msg("Default tenant already exists")
		return nil
	}

	// If error is not ErrNotFound, it's a real error
	if !errors.Is(err, ErrNotFound) {
		return fmt.Errorf("storage: failed to check default tenant: %w", err)
	}

	// Tenant doesn't exist, create it
	defaultTenant := &Tenant{
		ID:   defaultID,
		Name: "Default Tenant",
		Plan: "free",
	}

	created, err := CreateTenant(ctx, conn, defaultTenant)
	if err != nil {
		return fmt.Errorf("storage: failed to create default tenant: %w", err)
	}

	log.Info().
		Str("tenant_id", created.ID).
		Str("tenant_name", created.Name).
		Str("plan", created.Plan).
		Msg("Default tenant created for local auth mode")

	return nil
}

// CountUsersInTenant counts the total number of users in a specific tenant.
// It sets the RLS tenant context before querying to ensure the policy allows the query.
// It's used for the auth config endpoint to determine if setup is required.
//
// Behavior notes:
// - Returns 0 for a non-existent tenant (no error)
// - Returns 0 for a tenant with no users
// - The query does not verify tenant existence; it simply counts matching rows
func CountUsersInTenant(ctx context.Context, pool *pgxpool.Pool, tenantID string) (int64, error) {
	// Acquire a connection from the pool
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Set the tenant context for RLS
	// The users table has RLS based on app.tenant_id, so we must set it
	// Use false for is_local since we're not in a transaction
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to set tenant context: %w", err)
	}

	var count int64
	err = conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE tenant_id = $1`,
		tenantID,
	).Scan(&count)

	if err != nil {
		return 0, fmt.Errorf("storage: failed to count users: %w", err)
	}

	return count, nil
}
