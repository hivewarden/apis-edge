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
// Tenants map 1:1 with Zitadel Organizations.
type Tenant struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Plan      string    `json:"plan"`
	Settings  any       `json:"settings"`
	CreatedAt time.Time `json:"created_at"`
}

// GetTenantByID retrieves a tenant by ID.
// Returns ErrNotFound if the tenant does not exist.
func GetTenantByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Tenant, error) {
	var t Tenant
	err := conn.QueryRow(ctx,
		`SELECT id, name, plan, settings, created_at FROM tenants WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Plan, &t.Settings, &t.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query tenant: %w", err)
	}
	return &t, nil
}

// CreateTenant creates a new tenant.
// Returns the created tenant with populated fields.
func CreateTenant(ctx context.Context, conn *pgxpool.Conn, t *Tenant) (*Tenant, error) {
	var created Tenant
	err := conn.QueryRow(ctx,
		`INSERT INTO tenants (id, name, plan, settings)
		 VALUES ($1, $2, COALESCE($3, 'free'), COALESCE($4, '{}'))
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
