package storage

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/auth"
)

// Unit represents an APIS hardware unit in the database.
type Unit struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	SiteID          *string    `json:"site_id,omitempty"`
	Serial          string     `json:"serial"`
	Name            *string    `json:"name,omitempty"`
	APIKeyHash      string     `json:"-"` // Never expose hash in JSON
	APIKeyPrefix    string     `json:"-"` // First 16 chars for indexed lookup
	FirmwareVersion *string    `json:"firmware_version,omitempty"`
	IPAddress       *string    `json:"ip_address,omitempty"`
	LastSeen        *time.Time `json:"last_seen,omitempty"`
	Status          string     `json:"status"`
	// Telemetry fields (updated via heartbeat)
	UptimeSeconds *int64   `json:"uptime_seconds,omitempty"`
	CPUTemp       *float64 `json:"cpu_temp,omitempty"`
	FreeHeap      *int64   `json:"free_heap,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CreateUnitInput contains the fields needed to create a new unit.
type CreateUnitInput struct {
	Serial string  `json:"serial"`
	Name   *string `json:"name,omitempty"`
	SiteID *string `json:"site_id,omitempty"`
}

// UpdateUnitInput contains the fields that can be updated on a unit.
type UpdateUnitInput struct {
	Name   *string `json:"name,omitempty"`
	SiteID *string `json:"site_id,omitempty"`
}

// HeartbeatInput contains the optional fields sent during a heartbeat.
type HeartbeatInput struct {
	FirmwareVersion *string  `json:"firmware_version,omitempty"`
	UptimeSeconds   *int64   `json:"uptime_seconds,omitempty"`
	CPUTemp         *float64 `json:"cpu_temp,omitempty"`
	FreeHeap        *int64   `json:"free_heap,omitempty"`
}

// ErrDuplicateSerial is returned when trying to create a unit with a serial
// that already exists for the tenant.
var ErrDuplicateSerial = errors.New("unit serial already exists for this tenant")

// CreateUnit creates a new unit in the database and returns the raw API key.
// The raw API key is returned ONLY at creation time - it cannot be retrieved later.
// Returns the created unit, the raw API key, and any error.
func CreateUnit(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateUnitInput) (*Unit, string, error) {
	// Generate a new API key
	rawKey, err := auth.GenerateAPIKey()
	if err != nil {
		return nil, "", fmt.Errorf("storage: failed to generate API key: %w", err)
	}

	// Hash the API key for storage
	keyHash, err := auth.HashAPIKey(rawKey)
	if err != nil {
		return nil, "", fmt.Errorf("storage: failed to hash API key: %w", err)
	}

	// Extract prefix for indexed lookup
	keyPrefix := auth.ExtractAPIKeyPrefix(rawKey)

	var unit Unit
	err = conn.QueryRow(ctx,
		`INSERT INTO units (tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, status)
		 VALUES ($1, $2, $3, $4, $5, $6, 'offline')
		 RETURNING id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		           ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at`,
		tenantID, input.SiteID, input.Serial, input.Name, keyHash, keyPrefix,
	).Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
		&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
		&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt)

	if err != nil {
		// Check for unique constraint violation
		if isDuplicateKeyError(err) {
			return nil, "", ErrDuplicateSerial
		}
		return nil, "", fmt.Errorf("storage: failed to create unit: %w", err)
	}

	return &unit, rawKey, nil
}

// ListUnits returns all units for the current tenant.
// Results are ordered by name/serial ascending.
func ListUnits(ctx context.Context, conn *pgxpool.Conn) ([]Unit, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		        ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at
		 FROM units
		 ORDER BY COALESCE(name, serial) ASC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list units: %w", err)
	}
	defer rows.Close()

	var units []Unit
	for rows.Next() {
		var unit Unit
		err := rows.Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
			&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
			&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan unit: %w", err)
		}
		units = append(units, unit)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating units: %w", err)
	}

	return units, nil
}

// UnitWithSiteName extends Unit with the site name for list responses.
type UnitWithSiteName struct {
	Unit
	SiteName *string `json:"site_name,omitempty"`
}

// ListUnitsWithSiteNames returns all units for the current tenant with site names.
// Uses a single JOIN query to avoid N+1 queries when fetching site names.
// Results are ordered by name/serial ascending.
func ListUnitsWithSiteNames(ctx context.Context, conn *pgxpool.Conn) ([]UnitWithSiteName, error) {
	rows, err := conn.Query(ctx,
		`SELECT u.id, u.tenant_id, u.site_id, u.serial, u.name, u.api_key_hash, u.api_key_prefix, u.firmware_version,
		        u.ip_address, u.last_seen, u.status, u.uptime_seconds, u.cpu_temp, u.free_heap, u.created_at, u.updated_at,
		        s.name as site_name
		 FROM units u
		 LEFT JOIN sites s ON u.site_id = s.id
		 ORDER BY COALESCE(u.name, u.serial) ASC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list units with site names: %w", err)
	}
	defer rows.Close()

	var units []UnitWithSiteName
	for rows.Next() {
		var unit UnitWithSiteName
		err := rows.Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
			&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
			&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt,
			&unit.SiteName)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan unit with site name: %w", err)
		}
		units = append(units, unit)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating units: %w", err)
	}

	return units, nil
}

// GetUnitByID retrieves a unit by its ID.
// Returns ErrNotFound if the unit does not exist or belongs to a different tenant.
func GetUnitByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Unit, error) {
	var unit Unit
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		        ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at
		 FROM units
		 WHERE id = $1`,
		id,
	).Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
		&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
		&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get unit: %w", err)
	}
	return &unit, nil
}

// GetUnitByAPIKey finds a unit by its raw API key.
// Uses indexed prefix lookup to filter candidates, then bcrypt verification.
// Returns the unit if found, ErrNotFound if no matching unit.
func GetUnitByAPIKey(ctx context.Context, conn *pgxpool.Conn, rawKey string) (*Unit, error) {
	// Quick format check before database query
	if !auth.IsValidAPIKeyFormat(rawKey) {
		return nil, ErrNotFound
	}

	// Extract prefix for indexed lookup (first 16 chars)
	keyPrefix := auth.ExtractAPIKeyPrefix(rawKey)

	// Query only units matching the prefix (indexed lookup)
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		        ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at
		 FROM units
		 WHERE api_key_prefix = $1`,
		keyPrefix)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to query units: %w", err)
	}
	defer rows.Close()

	// Should typically return 0-1 results due to prefix uniqueness
	for rows.Next() {
		var unit Unit
		err := rows.Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
			&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
			&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan unit: %w", err)
		}

		// Verify full key with bcrypt (constant-time comparison)
		if auth.VerifyAPIKey(rawKey, unit.APIKeyHash) {
			return &unit, nil
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating units: %w", err)
	}

	return nil, ErrNotFound
}

// UpdateUnit updates an existing unit with the provided fields.
// Only non-nil fields in the input are updated.
// Returns ErrNotFound if the unit does not exist or belongs to a different tenant.
// SECURITY FIX (DL-H04): Uses SELECT ... FOR UPDATE to prevent TOCTOU races.
func UpdateUnit(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateUnitInput) (*Unit, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock the row with FOR UPDATE to prevent concurrent modifications
	var current Unit
	err = tx.QueryRow(ctx,
		`SELECT id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		        ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at
		 FROM units
		 WHERE id = $1
		 FOR UPDATE`,
		id,
	).Scan(&current.ID, &current.TenantID, &current.SiteID, &current.Serial, &current.Name,
		&current.APIKeyHash, &current.APIKeyPrefix, &current.FirmwareVersion, &current.IPAddress, &current.LastSeen,
		&current.Status, &current.UptimeSeconds, &current.CPUTemp, &current.FreeHeap, &current.CreatedAt, &current.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get unit for update: %w", err)
	}

	// Apply updates (use current values for nil fields)
	name := current.Name
	if input.Name != nil {
		name = input.Name
	}

	siteID := current.SiteID
	if input.SiteID != nil {
		siteID = input.SiteID
	}

	var unit Unit
	err = tx.QueryRow(ctx,
		`UPDATE units
		 SET name = $2, site_id = $3
		 WHERE id = $1
		 RETURNING id, tenant_id, site_id, serial, name, api_key_hash, api_key_prefix, firmware_version,
		           ip_address, last_seen, status, uptime_seconds, cpu_temp, free_heap, created_at, updated_at`,
		id, name, siteID,
	).Scan(&unit.ID, &unit.TenantID, &unit.SiteID, &unit.Serial, &unit.Name,
		&unit.APIKeyHash, &unit.APIKeyPrefix, &unit.FirmwareVersion, &unit.IPAddress, &unit.LastSeen,
		&unit.Status, &unit.UptimeSeconds, &unit.CPUTemp, &unit.FreeHeap, &unit.CreatedAt, &unit.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update unit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit unit update: %w", err)
	}
	return &unit, nil
}

// RegenerateAPIKey generates a new API key for a unit, invalidating the old one.
// Returns the new raw API key (shown once) and any error.
func RegenerateAPIKey(ctx context.Context, conn *pgxpool.Conn, id string) (string, error) {
	// First verify the unit exists
	_, err := GetUnitByID(ctx, conn, id)
	if err != nil {
		return "", err
	}

	// Generate new API key
	rawKey, err := auth.GenerateAPIKey()
	if err != nil {
		return "", fmt.Errorf("storage: failed to generate API key: %w", err)
	}

	// Hash the new key
	keyHash, err := auth.HashAPIKey(rawKey)
	if err != nil {
		return "", fmt.Errorf("storage: failed to hash API key: %w", err)
	}

	// Extract prefix for indexed lookup
	keyPrefix := auth.ExtractAPIKeyPrefix(rawKey)

	// Update the unit with new hash and prefix
	result, err := conn.Exec(ctx,
		`UPDATE units SET api_key_hash = $2, api_key_prefix = $3 WHERE id = $1`,
		id, keyHash, keyPrefix)
	if err != nil {
		return "", fmt.Errorf("storage: failed to update API key: %w", err)
	}

	if result.RowsAffected() == 0 {
		return "", ErrNotFound
	}

	return rawKey, nil
}

// DeleteUnit deletes a unit by its ID.
// Returns ErrNotFound if the unit does not exist or belongs to a different tenant.
func DeleteUnit(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM units WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete unit: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CountUnits returns the total number of units for the current tenant.
func CountUnits(ctx context.Context, conn *pgxpool.Conn) (int, error) {
	var count int
	err := conn.QueryRow(ctx, `SELECT COUNT(*) FROM units`).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to count units: %w", err)
	}
	return count, nil
}

// UpdateUnitHeartbeat updates a unit's last_seen, ip_address, status, and optional telemetry fields.
// Used when receiving a heartbeat from a unit.
func UpdateUnitHeartbeat(ctx context.Context, conn *pgxpool.Conn, id string, ipAddress string, input *HeartbeatInput) error {
	// Build query dynamically based on provided fields
	query := `UPDATE units SET last_seen = NOW(), ip_address = $2, status = 'online'`
	args := []any{id, ipAddress}
	argIdx := 3

	if input != nil {
		// Add firmware_version if provided
		if input.FirmwareVersion != nil {
			query += fmt.Sprintf(`, firmware_version = $%d`, argIdx)
			args = append(args, *input.FirmwareVersion)
			argIdx++
		}

		// Add uptime_seconds if provided
		if input.UptimeSeconds != nil {
			query += fmt.Sprintf(`, uptime_seconds = $%d`, argIdx)
			args = append(args, *input.UptimeSeconds)
			argIdx++
		}

		// Add cpu_temp if provided
		if input.CPUTemp != nil {
			query += fmt.Sprintf(`, cpu_temp = $%d`, argIdx)
			args = append(args, *input.CPUTemp)
			argIdx++
		}

		// Add free_heap if provided
		if input.FreeHeap != nil {
			query += fmt.Sprintf(`, free_heap = $%d`, argIdx)
			args = append(args, *input.FreeHeap)
			argIdx++
		}
	}

	query += ` WHERE id = $1`

	result, err := conn.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("storage: failed to update unit heartbeat: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// isDuplicateKeyError checks if an error is a PostgreSQL unique constraint violation.
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := err.Error()
	// PostgreSQL unique_violation error code is 23505
	return strings.Contains(errMsg, "23505") || strings.Contains(errMsg, "unique constraint")
}
