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

// TenantLimits represents resource quotas for a tenant.
type TenantLimits struct {
	TenantID        string    `json:"tenant_id"`
	MaxHives        int       `json:"max_hives"`
	MaxStorageBytes int64     `json:"max_storage_bytes"`
	MaxUnits        int       `json:"max_units"`
	MaxUsers        int       `json:"max_users"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// DefaultLimits defines the default resource limits for a new tenant.
var DefaultLimits = TenantLimits{
	MaxHives:        100,
	MaxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
	MaxUnits:        10,
	MaxUsers:        20,
}

// ErrLimitExceeded is returned when a tenant has reached their resource limit.
var ErrLimitExceeded = errors.New("resource limit exceeded")

// GetTenantLimits retrieves the limits for a tenant.
// If no limits record exists, returns DefaultLimits with the tenant ID set.
func GetTenantLimits(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*TenantLimits, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	var limits TenantLimits
	err = conn.QueryRow(ctx,
		`SELECT tenant_id, max_hives, max_storage_bytes, max_units, max_users, updated_at
		 FROM tenant_limits
		 WHERE tenant_id = $1`,
		tenantID,
	).Scan(&limits.TenantID, &limits.MaxHives, &limits.MaxStorageBytes, &limits.MaxUnits, &limits.MaxUsers, &limits.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		// Return default limits
		defaults := DefaultLimits
		defaults.TenantID = tenantID
		defaults.UpdatedAt = time.Now()
		return &defaults, nil
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get tenant limits: %w", err)
	}

	return &limits, nil
}

// SetTenantLimits creates or updates the limits for a tenant.
// Uses UPSERT to handle both new and existing records.
func SetTenantLimits(ctx context.Context, pool *pgxpool.Pool, tenantID string, limits *TenantLimits) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx,
		`INSERT INTO tenant_limits (tenant_id, max_hives, max_storage_bytes, max_units, max_users)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (tenant_id)
		 DO UPDATE SET
		   max_hives = EXCLUDED.max_hives,
		   max_storage_bytes = EXCLUDED.max_storage_bytes,
		   max_units = EXCLUDED.max_units,
		   max_users = EXCLUDED.max_users,
		   updated_at = NOW()`,
		tenantID, limits.MaxHives, limits.MaxStorageBytes, limits.MaxUnits, limits.MaxUsers,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to set tenant limits: %w", err)
	}

	return nil
}

// CheckHiveLimit verifies that the tenant can create another hive.
// Returns ErrLimitExceeded if the limit is reached, nil otherwise.
// SECURITY FIX (DL-H06): Use correct active status check. The Hive model uses
// 'active'/'lost'/'archived' statuses (not 'deleted'). Count only active hives
// against the limit, excluding lost and archived ones.
func CheckHiveLimit(ctx context.Context, conn *pgxpool.Conn, tenantID string) error {
	var currentCount int
	var maxHives int

	// Get current count and max limit in a single query
	// Count hives that are 'active' (exclude 'lost' and 'archived')
	err := conn.QueryRow(ctx,
		`SELECT
		   (SELECT COUNT(*) FROM hives WHERE tenant_id = $1 AND status = 'active') as current_count,
		   COALESCE((SELECT max_hives FROM tenant_limits WHERE tenant_id = $1), $2) as max_hives`,
		tenantID, DefaultLimits.MaxHives,
	).Scan(&currentCount, &maxHives)
	if err != nil {
		return fmt.Errorf("storage: failed to check hive limit: %w", err)
	}

	if currentCount >= maxHives {
		return fmt.Errorf("%w: hive limit of %d reached", ErrLimitExceeded, maxHives)
	}

	return nil
}

// CheckUnitLimit verifies that the tenant can create another unit.
// Returns ErrLimitExceeded if the limit is reached, nil otherwise.
func CheckUnitLimit(ctx context.Context, conn *pgxpool.Conn, tenantID string) error {
	var currentCount int
	var maxUnits int

	err := conn.QueryRow(ctx,
		`SELECT
		   (SELECT COUNT(*) FROM units WHERE tenant_id = $1) as current_count,
		   COALESCE((SELECT max_units FROM tenant_limits WHERE tenant_id = $1), $2) as max_units`,
		tenantID, DefaultLimits.MaxUnits,
	).Scan(&currentCount, &maxUnits)
	if err != nil {
		return fmt.Errorf("storage: failed to check unit limit: %w", err)
	}

	if currentCount >= maxUnits {
		return fmt.Errorf("%w: unit limit of %d reached", ErrLimitExceeded, maxUnits)
	}

	return nil
}

// CheckUserLimit verifies that the tenant can create another user.
// Returns ErrLimitExceeded if the limit is reached, nil otherwise.
func CheckUserLimit(ctx context.Context, conn *pgxpool.Conn, tenantID string) error {
	var currentCount int
	var maxUsers int

	err := conn.QueryRow(ctx,
		`SELECT
		   (SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND is_active = true) as current_count,
		   COALESCE((SELECT max_users FROM tenant_limits WHERE tenant_id = $1), $2) as max_users`,
		tenantID, DefaultLimits.MaxUsers,
	).Scan(&currentCount, &maxUsers)
	if err != nil {
		return fmt.Errorf("storage: failed to check user limit: %w", err)
	}

	if currentCount >= maxUsers {
		return fmt.Errorf("%w: user limit of %d reached", ErrLimitExceeded, maxUsers)
	}

	return nil
}

// CheckStorageLimit verifies that the tenant can store additional bytes.
// additionalBytes is the size of the new file to be stored.
// Returns ErrLimitExceeded if the limit would be exceeded, nil otherwise.
func CheckStorageLimit(ctx context.Context, pool *pgxpool.Pool, tenantID string, additionalBytes int64) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	var currentUsage int64
	var maxStorage int64

	err = conn.QueryRow(ctx,
		`SELECT
		   COALESCE((SELECT SUM(file_size_bytes) FROM clips WHERE tenant_id = $1 AND deleted_at IS NULL), 0) as current_usage,
		   COALESCE((SELECT max_storage_bytes FROM tenant_limits WHERE tenant_id = $1), $2) as max_storage`,
		tenantID, DefaultLimits.MaxStorageBytes,
	).Scan(&currentUsage, &maxStorage)
	if err != nil {
		return fmt.Errorf("storage: failed to check storage limit: %w", err)
	}

	if currentUsage+additionalBytes > maxStorage {
		return fmt.Errorf("%w: storage limit of %d bytes reached", ErrLimitExceeded, maxStorage)
	}

	return nil
}

// GetTenantUsage returns current resource usage for a tenant.
// Useful for displaying alongside limits.
type TenantUsage struct {
	HiveCount    int   `json:"hive_count"`
	UnitCount    int   `json:"unit_count"`
	UserCount    int   `json:"user_count"`
	StorageBytes int64 `json:"storage_bytes"`
}

// GetTenantUsage retrieves the current resource usage for a tenant.
func GetTenantUsage(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*TenantUsage, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	var usage TenantUsage

	err = conn.QueryRow(ctx,
		`SELECT
		   COALESCE((SELECT COUNT(*) FROM hives WHERE tenant_id = $1 AND status != 'deleted'), 0) as hive_count,
		   COALESCE((SELECT COUNT(*) FROM units WHERE tenant_id = $1), 0) as unit_count,
		   COALESCE((SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND is_active = true), 0) as user_count,
		   COALESCE((SELECT SUM(file_size_bytes) FROM clips WHERE tenant_id = $1 AND deleted_at IS NULL), 0) as storage_bytes`,
		tenantID,
	).Scan(&usage.HiveCount, &usage.UnitCount, &usage.UserCount, &usage.StorageBytes)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get tenant usage: %w", err)
	}

	return &usage, nil
}
