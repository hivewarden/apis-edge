package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivityLogEntry represents an activity log entry in the database.
type ActivityLogEntry struct {
	ID        string          `json:"id"`
	TenantID  string          `json:"tenant_id"`
	HiveID    string          `json:"hive_id"`
	Type      string          `json:"type"`
	Content   string          `json:"content"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedBy string          `json:"created_by"`
	CreatedAt time.Time       `json:"created_at"`
}

// ActivityLogMetadata represents the metadata for a task completion activity.
type ActivityLogMetadata struct {
	TaskID         string         `json:"task_id,omitempty"`
	TaskName       string         `json:"task_name,omitempty"`
	CompletionData map[string]any `json:"completion_data,omitempty"`
	Notes          string         `json:"notes,omitempty"`
	AutoApplied    bool           `json:"auto_applied"`
	Changes        []string       `json:"changes,omitempty"`
}

// CreateActivityLogInput contains the fields needed to create a new activity log entry.
type CreateActivityLogInput struct {
	HiveID    string
	Type      string
	Content   string
	Metadata  json.RawMessage
	CreatedBy string
}

// ActivityLogListResult contains paginated activity log results.
type ActivityLogListResult struct {
	Entries []ActivityLogEntry
	Total   int
	Page    int
	PerPage int
}

// CreateActivityLogEntry creates a new activity log entry in the database.
func CreateActivityLogEntry(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateActivityLogInput) (*ActivityLogEntry, error) {
	var entry ActivityLogEntry

	err := conn.QueryRow(ctx,
		`INSERT INTO hive_activity_log (tenant_id, hive_id, type, content, metadata, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, tenant_id, hive_id, type, content, metadata, created_by, created_at`,
		tenantID, input.HiveID, input.Type, input.Content, input.Metadata, input.CreatedBy,
	).Scan(
		&entry.ID, &entry.TenantID, &entry.HiveID, &entry.Type,
		&entry.Content, &entry.Metadata, &entry.CreatedBy, &entry.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create activity log entry: %w", err)
	}

	return &entry, nil
}

// ListActivityByHive returns paginated activity log entries for a specific hive.
// Supports filtering by type and pagination.
func ListActivityByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string, typeFilter string, page, perPage int) (*ActivityLogListResult, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}

	offset := (page - 1) * perPage

	// Build query based on whether type filter is provided
	var countQuery, selectQuery string
	var countArgs, selectArgs []any

	if typeFilter != "" {
		countQuery = `SELECT COUNT(*) FROM hive_activity_log WHERE hive_id = $1 AND type = $2`
		countArgs = []any{hiveID, typeFilter}

		selectQuery = `
			SELECT id, tenant_id, hive_id, type, content, metadata, created_by, created_at
			FROM hive_activity_log
			WHERE hive_id = $1 AND type = $2
			ORDER BY created_at DESC
			LIMIT $3 OFFSET $4`
		selectArgs = []any{hiveID, typeFilter, perPage, offset}
	} else {
		countQuery = `SELECT COUNT(*) FROM hive_activity_log WHERE hive_id = $1`
		countArgs = []any{hiveID}

		selectQuery = `
			SELECT id, tenant_id, hive_id, type, content, metadata, created_by, created_at
			FROM hive_activity_log
			WHERE hive_id = $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3`
		selectArgs = []any{hiveID, perPage, offset}
	}

	// Get total count
	var total int
	err := conn.QueryRow(ctx, countQuery, countArgs...).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count activity log entries: %w", err)
	}

	// Get entries
	rows, err := conn.Query(ctx, selectQuery, selectArgs...)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list activity log entries: %w", err)
	}
	defer rows.Close()

	var entries []ActivityLogEntry
	for rows.Next() {
		var entry ActivityLogEntry
		err := rows.Scan(
			&entry.ID, &entry.TenantID, &entry.HiveID, &entry.Type,
			&entry.Content, &entry.Metadata, &entry.CreatedBy, &entry.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan activity log entry: %w", err)
		}
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating activity log entries: %w", err)
	}

	return &ActivityLogListResult{
		Entries: entries,
		Total:   total,
		Page:    page,
		PerPage: perPage,
	}, nil
}

// CountActivityByHive returns the total number of activity log entries for a hive.
func CountActivityByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string, typeFilter string) (int, error) {
	var count int
	var err error

	if typeFilter != "" {
		err = conn.QueryRow(ctx,
			`SELECT COUNT(*) FROM hive_activity_log WHERE hive_id = $1 AND type = $2`,
			hiveID, typeFilter,
		).Scan(&count)
	} else {
		err = conn.QueryRow(ctx,
			`SELECT COUNT(*) FROM hive_activity_log WHERE hive_id = $1`,
			hiveID,
		).Scan(&count)
	}

	if err != nil {
		return 0, fmt.Errorf("storage: failed to count activity log entries: %w", err)
	}

	return count, nil
}
