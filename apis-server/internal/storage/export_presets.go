package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExportPreset represents an export preset in the database.
type ExportPreset struct {
	ID        string          `json:"id"`
	TenantID  string          `json:"-"` // Not exposed in API responses
	Name      string          `json:"name"`
	Config    json.RawMessage `json:"config"`
	CreatedAt time.Time       `json:"created_at"`
}

// CreateExportPresetInput contains the fields needed to create a new export preset.
type CreateExportPresetInput struct {
	Name   string
	Config json.RawMessage // Stores include fields and default format
}

// ErrDuplicateName is returned when a preset with the same name already exists.
var ErrDuplicateName = errors.New("preset name already exists")

// CreateExportPreset creates a new export preset in the database.
func CreateExportPreset(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateExportPresetInput) (*ExportPreset, error) {
	var preset ExportPreset
	err := conn.QueryRow(ctx,
		`INSERT INTO export_presets (tenant_id, name, config)
		 VALUES ($1, $2, $3)
		 RETURNING id, tenant_id, name, config, created_at`,
		tenantID, input.Name, input.Config,
	).Scan(&preset.ID, &preset.TenantID, &preset.Name, &preset.Config, &preset.CreatedAt)

	if err != nil {
		// Check for unique constraint violation
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("storage: failed to create export preset: %w", err)
	}

	return &preset, nil
}

// ListExportPresets returns all export presets for a tenant.
func ListExportPresets(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]ExportPreset, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, name, config, created_at
		 FROM export_presets
		 WHERE tenant_id = $1
		 ORDER BY name ASC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list export presets: %w", err)
	}
	defer rows.Close()

	var presets []ExportPreset
	for rows.Next() {
		var preset ExportPreset
		err := rows.Scan(&preset.ID, &preset.TenantID, &preset.Name, &preset.Config, &preset.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan export preset: %w", err)
		}
		presets = append(presets, preset)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating export presets: %w", err)
	}

	// Return empty slice instead of nil
	if presets == nil {
		presets = []ExportPreset{}
	}

	return presets, nil
}

// GetExportPresetByID retrieves an export preset by its ID.
// SECURITY: Requires tenant_id to prevent IDOR vulnerability (DB-002-F1).
// Only returns presets that belong to the specified tenant.
func GetExportPresetByID(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) (*ExportPreset, error) {
	var preset ExportPreset
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, name, config, created_at
		 FROM export_presets
		 WHERE id = $1 AND tenant_id = $2`,
		id, tenantID,
	).Scan(&preset.ID, &preset.TenantID, &preset.Name, &preset.Config, &preset.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get export preset: %w", err)
	}
	return &preset, nil
}

// DeleteExportPreset deletes an export preset by its ID.
// Only deletes if the preset belongs to the specified tenant (prevents IDOR).
func DeleteExportPreset(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM export_presets WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to delete export preset: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}
