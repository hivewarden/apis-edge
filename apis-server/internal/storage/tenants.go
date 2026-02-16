package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a requested entity does not exist.
var ErrNotFound = errors.New("not found")

// Tenant represents a tenant in the system.
// Tenants map 1:1 with Keycloak Organizations.
type Tenant struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Plan      string    `json:"plan"`
	Status    string    `json:"status"` // 'active', 'suspended', 'deleted'
	Settings  any       `json:"settings"`
	CreatedAt time.Time `json:"created_at"`
}

// GetTenantByID retrieves a tenant by ID.
// Returns ErrNotFound if the tenant does not exist.
func GetTenantByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Tenant, error) {
	var t Tenant
	err := conn.QueryRow(ctx,
		`SELECT id, name, plan, COALESCE(status, 'active'), settings, created_at FROM tenants WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Plan, &t.Status, &t.Settings, &t.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query tenant: %w", err)
	}
	return &t, nil
}

// GetTenantByIDPool retrieves a tenant by ID using a pool (acquires and releases connection).
// Returns ErrNotFound if the tenant does not exist.
func GetTenantByIDPool(ctx context.Context, pool *pgxpool.Pool, id string) (*Tenant, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to acquire connection: %w", err)
	}
	defer conn.Release()

	return GetTenantByID(ctx, conn, id)
}

// GetTenantStatus retrieves only the status of a tenant by ID.
// Returns ErrNotFound if the tenant does not exist.
// Returns 'active' if the status column doesn't exist (backward compatibility).
func GetTenantStatus(ctx context.Context, conn *pgxpool.Conn, id string) (string, error) {
	var status string
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(status, 'active') FROM tenants WHERE id = $1`,
		id,
	).Scan(&status)

	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("storage: query tenant status: %w", err)
	}
	return status, nil
}

// CreateTenant creates a new tenant.
// Returns the created tenant with populated fields.
func CreateTenant(ctx context.Context, conn *pgxpool.Conn, t *Tenant) (*Tenant, error) {
	var created Tenant
	// Note: settings is jsonb, so we use '{}'::jsonb for the default
	err := conn.QueryRow(ctx,
		`INSERT INTO tenants (id, name, plan, settings)
		 VALUES ($1, $2, COALESCE($3, 'free'), COALESCE($4::jsonb, '{}'::jsonb))
		 RETURNING id, name, plan, settings, created_at`,
		t.ID, t.Name, t.Plan, t.Settings,
	).Scan(&created.ID, &created.Name, &created.Plan, &created.Settings, &created.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}
	return &created, nil
}

// GetOrCreateTenant retrieves a tenant by ID, creating it if it doesn't exist.
// This is used during user provisioning to ensure the tenant exists.
func GetOrCreateTenant(ctx context.Context, conn *pgxpool.Conn, id, name string) (*Tenant, error) {
	// Try to get existing tenant first
	tenant, err := GetTenantByID(ctx, conn, id)
	if err == nil {
		return tenant, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	// Tenant doesn't exist, create it
	// Use org_id as the name if no name provided
	if name == "" {
		name = "Tenant " + id[:8]
	}

	return CreateTenant(ctx, conn, &Tenant{
		ID:   id,
		Name: name,
		Plan: "free",
	})
}

// DefaultTreatmentIntervals defines the default treatment interval days.
var DefaultTreatmentIntervals = map[string]int{
	"oxalic_acid":  90,  // 3 months
	"formic_acid":  60,  // 2 months
	"apiguard":     84,  // 12 weeks (2 applications)
	"apivar":       42,  // 6 weeks (full strip treatment)
	"maqs":         7,   // 1 week (re-apply check)
	"api_bioxal":   90,  // 3 months
}

// GetTreatmentIntervals retrieves the treatment intervals for a tenant.
// Returns default intervals merged with any tenant-specific overrides.
func GetTreatmentIntervals(ctx context.Context, conn *pgxpool.Conn, tenantID string) (map[string]int, error) {
	var settingsJSON any
	err := conn.QueryRow(ctx,
		`SELECT COALESCE(settings->'treatment_intervals', '{}') FROM tenants WHERE id = $1`,
		tenantID,
	).Scan(&settingsJSON)

	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultTreatmentIntervals, nil
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get treatment intervals: %w", err)
	}

	// Start with defaults
	result := make(map[string]int)
	for k, v := range DefaultTreatmentIntervals {
		result[k] = v
	}

	// Override with tenant-specific values if any
	if settingsMap, ok := settingsJSON.(map[string]any); ok {
		for k, v := range settingsMap {
			if floatVal, ok := v.(float64); ok {
				result[k] = int(floatVal)
			}
		}
	}

	return result, nil
}

// UpdateTreatmentIntervals updates the treatment intervals for a tenant.
func UpdateTreatmentIntervals(ctx context.Context, conn *pgxpool.Conn, tenantID string, intervals map[string]int) error {
	// Convert intervals to JSON-compatible format
	intervalsJSON := make(map[string]any)
	for k, v := range intervals {
		intervalsJSON[k] = v
	}

	_, err := conn.Exec(ctx,
		`UPDATE tenants
		 SET settings = jsonb_set(COALESCE(settings, '{}'), '{treatment_intervals}', $2::jsonb)
		 WHERE id = $1`,
		tenantID, intervalsJSON)
	if err != nil {
		return fmt.Errorf("storage: failed to update treatment intervals: %w", err)
	}

	return nil
}
