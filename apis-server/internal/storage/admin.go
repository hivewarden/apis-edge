// Package storage provides data access layer for the APIS server.
package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TenantSummary represents a tenant with usage statistics for admin views.
// This struct is used by super-admin endpoints to display tenant management data.
type TenantSummary struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Plan        string    `json:"plan"`
	Status      string    `json:"status"`
	UserCount   int       `json:"user_count"`
	HiveCount   int       `json:"hive_count"`
	StorageUsed int64     `json:"storage_used"` // bytes
	CreatedAt   time.Time `json:"created_at"`
}

// AdminListAllTenants returns all tenants with usage statistics.
// This function bypasses RLS (Row-Level Security) by not setting app.tenant_id,
// allowing super-admins to see all tenants in the system.
//
// The function returns tenants ordered by creation date (newest first).
// Usage statistics are calculated from related tables using COUNT and SUM aggregations.
func AdminListAllTenants(ctx context.Context, pool *pgxpool.Pool) ([]*TenantSummary, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Query all tenants with aggregated usage stats
	// Note: We intentionally DO NOT set app.tenant_id to bypass RLS
	query := `
		SELECT
			t.id,
			t.name,
			COALESCE(t.plan, 'free') as plan,
			COALESCE(t.status, 'active') as status,
			COALESCE(u.user_count, 0) as user_count,
			COALESCE(h.hive_count, 0) as hive_count,
			COALESCE(c.storage_used, 0) as storage_used,
			t.created_at
		FROM tenants t
		LEFT JOIN (
			SELECT tenant_id, COUNT(*) as user_count
			FROM users
			WHERE is_active = true
			GROUP BY tenant_id
		) u ON t.id = u.tenant_id
		LEFT JOIN (
			SELECT tenant_id, COUNT(*) as hive_count
			FROM hives
			WHERE status = 'active'
			GROUP BY tenant_id
		) h ON t.id = h.tenant_id
		LEFT JOIN (
			SELECT tenant_id, COALESCE(SUM(file_size_bytes), 0) as storage_used
			FROM clips
			WHERE deleted_at IS NULL
			GROUP BY tenant_id
		) c ON t.id = c.tenant_id
		WHERE t.status != 'deleted' OR t.status IS NULL
		ORDER BY t.created_at DESC
	`

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list tenants: %w", err)
	}
	defer rows.Close()

	var tenants []*TenantSummary
	for rows.Next() {
		var t TenantSummary
		if err := rows.Scan(
			&t.ID,
			&t.Name,
			&t.Plan,
			&t.Status,
			&t.UserCount,
			&t.HiveCount,
			&t.StorageUsed,
			&t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("storage: failed to scan tenant: %w", err)
		}
		tenants = append(tenants, &t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: row iteration error: %w", err)
	}

	return tenants, nil
}

// AdminGetTenantByID returns a single tenant with usage statistics by ID.
// Bypasses RLS for super-admin access.
func AdminGetTenantByID(ctx context.Context, pool *pgxpool.Pool, id string) (*TenantSummary, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	query := `
		SELECT
			t.id,
			t.name,
			COALESCE(t.plan, 'free') as plan,
			COALESCE(t.status, 'active') as status,
			COALESCE(u.user_count, 0) as user_count,
			COALESCE(h.hive_count, 0) as hive_count,
			COALESCE(c.storage_used, 0) as storage_used,
			t.created_at
		FROM tenants t
		LEFT JOIN (
			SELECT tenant_id, COUNT(*) as user_count
			FROM users
			WHERE is_active = true AND tenant_id = $1
			GROUP BY tenant_id
		) u ON t.id = u.tenant_id
		LEFT JOIN (
			SELECT tenant_id, COUNT(*) as hive_count
			FROM hives
			WHERE status = 'active' AND tenant_id = $1
			GROUP BY tenant_id
		) h ON t.id = h.tenant_id
		LEFT JOIN (
			SELECT tenant_id, COALESCE(SUM(file_size_bytes), 0) as storage_used
			FROM clips
			WHERE deleted_at IS NULL AND tenant_id = $1
			GROUP BY tenant_id
		) c ON t.id = c.tenant_id
		WHERE t.id = $1
	`

	var t TenantSummary
	err = conn.QueryRow(ctx, query, id).Scan(
		&t.ID,
		&t.Name,
		&t.Plan,
		&t.Status,
		&t.UserCount,
		&t.HiveCount,
		&t.StorageUsed,
		&t.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get tenant: %w", err)
	}

	return &t, nil
}

// AdminCreateTenantInput represents the input for creating a new tenant.
type AdminCreateTenantInput struct {
	Name string `json:"name"`
	Plan string `json:"plan"` // 'free', 'hobby', 'pro'
}

// AdminCreateTenant creates a new tenant.
// This is used by super-admins to provision new tenants in SaaS mode.
// The tenant ID is auto-generated (UUID).
func AdminCreateTenant(ctx context.Context, pool *pgxpool.Pool, input *AdminCreateTenantInput) (*TenantSummary, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Default plan to 'free' if not specified
	plan := input.Plan
	if plan == "" {
		plan = "free"
	}

	// Insert tenant with auto-generated UUID
	query := `
		INSERT INTO tenants (id, name, plan, status, settings)
		VALUES (gen_random_uuid(), $1, $2, 'active', '{}'::jsonb)
		RETURNING id, name, plan, status, created_at
	`

	var t TenantSummary
	err = conn.QueryRow(ctx, query, input.Name, plan).Scan(
		&t.ID,
		&t.Name,
		&t.Plan,
		&t.Status,
		&t.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to create tenant: %w", err)
	}

	// New tenant has zero usage
	t.UserCount = 0
	t.HiveCount = 0
	t.StorageUsed = 0

	return &t, nil
}

// AdminUpdateTenantInput represents the input for updating a tenant.
type AdminUpdateTenantInput struct {
	Name   *string `json:"name,omitempty"`
	Plan   *string `json:"plan,omitempty"`
	Status *string `json:"status,omitempty"` // 'active', 'suspended', 'deleted'
}

// AdminUpdateTenant updates a tenant's details.
// Only non-nil fields are updated.
func AdminUpdateTenant(ctx context.Context, pool *pgxpool.Pool, id string, input *AdminUpdateTenantInput) (*TenantSummary, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Build dynamic update query
	updates := make([]string, 0)
	args := make([]any, 0)
	argNum := 1

	if input.Name != nil {
		updates = append(updates, fmt.Sprintf("name = $%d", argNum))
		args = append(args, *input.Name)
		argNum++
	}
	if input.Plan != nil {
		updates = append(updates, fmt.Sprintf("plan = $%d", argNum))
		args = append(args, *input.Plan)
		argNum++
	}
	if input.Status != nil {
		updates = append(updates, fmt.Sprintf("status = $%d", argNum))
		args = append(args, *input.Status)
		argNum++
	}

	if len(updates) == 0 {
		// Nothing to update, just return current tenant
		return AdminGetTenantByID(ctx, pool, id)
	}

	// Add ID as the last argument
	args = append(args, id)

	query := fmt.Sprintf(`
		UPDATE tenants
		SET %s
		WHERE id = $%d
		RETURNING id, name, COALESCE(plan, 'free'), COALESCE(status, 'active'), created_at
	`, joinStrings(updates, ", "), argNum)

	var t TenantSummary
	err = conn.QueryRow(ctx, query, args...).Scan(
		&t.ID,
		&t.Name,
		&t.Plan,
		&t.Status,
		&t.CreatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update tenant: %w", err)
	}

	// Fetch full stats for the updated tenant
	return AdminGetTenantByID(ctx, pool, id)
}

// AdminSetTenantStatus updates only the status of a tenant.
// This is a convenience function for soft-delete operations.
func AdminSetTenantStatus(ctx context.Context, pool *pgxpool.Pool, id, status string) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	result, err := conn.Exec(ctx,
		`UPDATE tenants SET status = $1 WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to update tenant status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// joinStrings joins strings with a separator.
// This is a helper function to avoid importing strings package just for Join.
func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
