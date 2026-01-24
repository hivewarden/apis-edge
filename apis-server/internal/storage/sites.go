package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Site represents a site (apiary) in the database.
// Sites are physical locations where hives and units are located.
type Site struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	Name      string     `json:"name"`
	Latitude  *float64   `json:"latitude,omitempty"`
	Longitude *float64   `json:"longitude,omitempty"`
	Timezone  string     `json:"timezone"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// CreateSiteInput contains the fields needed to create a new site.
type CreateSiteInput struct {
	Name      string   `json:"name"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Timezone  string   `json:"timezone"`
}

// UpdateSiteInput contains the fields that can be updated on a site.
type UpdateSiteInput struct {
	Name      *string  `json:"name,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Timezone  *string  `json:"timezone,omitempty"`
}

// ErrSiteHasUnits is returned when trying to delete a site that has units assigned.
var ErrSiteHasUnits = errors.New("site has assigned units")

// CreateSite creates a new site in the database.
// Returns the created site with all fields populated.
// The tenant_id is taken from the connection context (set by RLS).
func CreateSite(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateSiteInput) (*Site, error) {
	timezone := input.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	var site Site
	err := conn.QueryRow(ctx,
		`INSERT INTO sites (tenant_id, name, gps_lat, gps_lng, timezone)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, tenant_id, name, gps_lat, gps_lng, timezone, created_at, updated_at`,
		tenantID, input.Name, input.Latitude, input.Longitude, timezone,
	).Scan(&site.ID, &site.TenantID, &site.Name, &site.Latitude, &site.Longitude,
		&site.Timezone, &site.CreatedAt, &site.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create site: %w", err)
	}
	return &site, nil
}

// ListSites returns all sites for the current tenant.
// Results are ordered by name ascending.
func ListSites(ctx context.Context, conn *pgxpool.Conn) ([]Site, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, name, gps_lat, gps_lng, timezone, created_at, updated_at
		 FROM sites
		 ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list sites: %w", err)
	}
	defer rows.Close()

	var sites []Site
	for rows.Next() {
		var site Site
		err := rows.Scan(&site.ID, &site.TenantID, &site.Name, &site.Latitude, &site.Longitude,
			&site.Timezone, &site.CreatedAt, &site.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan site: %w", err)
		}
		sites = append(sites, site)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating sites: %w", err)
	}

	return sites, nil
}

// GetSiteByID retrieves a site by its ID.
// Returns ErrNotFound if the site does not exist or belongs to a different tenant.
func GetSiteByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Site, error) {
	var site Site
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, name, gps_lat, gps_lng, timezone, created_at, updated_at
		 FROM sites
		 WHERE id = $1`,
		id,
	).Scan(&site.ID, &site.TenantID, &site.Name, &site.Latitude, &site.Longitude,
		&site.Timezone, &site.CreatedAt, &site.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get site: %w", err)
	}
	return &site, nil
}

// UpdateSite updates an existing site with the provided fields.
// Only non-nil fields in the input are updated.
// Returns ErrNotFound if the site does not exist or belongs to a different tenant.
func UpdateSite(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateSiteInput) (*Site, error) {
	// First, verify the site exists and get current values
	current, err := GetSiteByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates (use current values for nil fields)
	name := current.Name
	if input.Name != nil {
		name = *input.Name
	}

	latitude := current.Latitude
	if input.Latitude != nil {
		latitude = input.Latitude
	}

	longitude := current.Longitude
	if input.Longitude != nil {
		longitude = input.Longitude
	}

	timezone := current.Timezone
	if input.Timezone != nil {
		timezone = *input.Timezone
	}

	var site Site
	err = conn.QueryRow(ctx,
		`UPDATE sites
		 SET name = $2, gps_lat = $3, gps_lng = $4, timezone = $5
		 WHERE id = $1
		 RETURNING id, tenant_id, name, gps_lat, gps_lng, timezone, created_at, updated_at`,
		id, name, latitude, longitude, timezone,
	).Scan(&site.ID, &site.TenantID, &site.Name, &site.Latitude, &site.Longitude,
		&site.Timezone, &site.CreatedAt, &site.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update site: %w", err)
	}
	return &site, nil
}

// DeleteSite deletes a site by its ID.
// Returns ErrNotFound if the site does not exist or belongs to a different tenant.
// Returns ErrSiteHasUnits if the site has units assigned (they must be reassigned first).
func DeleteSite(ctx context.Context, conn *pgxpool.Conn, id string) error {
	// Check if site has assigned units (units table will be created in story 2.2)
	// For now, we'll check if the units table exists and if so, check for assignments
	var hasUnits bool
	err := conn.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'units'
		)`).Scan(&hasUnits)
	if err != nil {
		return fmt.Errorf("storage: failed to check units table: %w", err)
	}

	if hasUnits {
		var unitCount int
		err := conn.QueryRow(ctx,
			`SELECT COUNT(*) FROM units WHERE site_id = $1`,
			id,
		).Scan(&unitCount)
		if err != nil {
			return fmt.Errorf("storage: failed to check units for site: %w", err)
		}
		if unitCount > 0 {
			return ErrSiteHasUnits
		}
	}

	// Delete the site
	result, err := conn.Exec(ctx, `DELETE FROM sites WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete site: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CountSites returns the total number of sites for the current tenant.
func CountSites(ctx context.Context, conn *pgxpool.Conn) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM sites`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count sites: %w", err)
	}
	return count, nil
}
