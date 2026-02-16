package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLogEntry represents an entry in the audit log.
type AuditLogEntry struct {
	ID         string          `json:"id"`
	TenantID   string          `json:"tenant_id"`
	UserID     *string         `json:"user_id,omitempty"`
	UserName   *string         `json:"user_name,omitempty"`  // Joined from users table
	UserEmail  *string         `json:"user_email,omitempty"` // Joined from users table
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   string          `json:"entity_id"`
	OldValues  json.RawMessage `json:"old_values,omitempty"`
	NewValues  json.RawMessage `json:"new_values,omitempty"`
	IPAddress  *string         `json:"ip_address,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

// AuditLogFilters contains filters for querying the audit log.
type AuditLogFilters struct {
	EntityType *string    `json:"entity_type,omitempty"`
	UserID     *string    `json:"user_id,omitempty"`
	Action     *string    `json:"action,omitempty"`
	StartDate  *time.Time `json:"start_date,omitempty"`
	EndDate    *time.Time `json:"end_date,omitempty"`
	Limit      int        `json:"limit"`
	Offset     int        `json:"offset"`
}

// ListAuditLog retrieves audit log entries with optional filters.
// Returns entries, total count, and any error.
func ListAuditLog(ctx context.Context, pool *pgxpool.Pool, filters *AuditLogFilters) ([]AuditLogEntry, int, error) {
	// Build query with dynamic WHERE clauses
	baseQuery := `
		SELECT
			al.id,
			al.tenant_id,
			al.user_id,
			u.display_name as user_name,
			u.email as user_email,
			al.action,
			al.entity_type,
			al.entity_id,
			al.old_values,
			al.new_values,
			al.ip_address::TEXT,
			al.created_at
		FROM audit_log al
		LEFT JOIN users u ON al.user_id = u.id
		WHERE 1=1
	`

	countQuery := `SELECT COUNT(*) FROM audit_log al WHERE 1=1`

	var conditions []string
	var args []any
	argNum := 1

	if filters.EntityType != nil && *filters.EntityType != "" {
		conditions = append(conditions, fmt.Sprintf("al.entity_type = $%d", argNum))
		args = append(args, *filters.EntityType)
		argNum++
	}

	if filters.UserID != nil && *filters.UserID != "" {
		conditions = append(conditions, fmt.Sprintf("al.user_id = $%d", argNum))
		args = append(args, *filters.UserID)
		argNum++
	}

	if filters.Action != nil && *filters.Action != "" {
		conditions = append(conditions, fmt.Sprintf("al.action = $%d", argNum))
		args = append(args, *filters.Action)
		argNum++
	}

	if filters.StartDate != nil {
		conditions = append(conditions, fmt.Sprintf("al.created_at >= $%d", argNum))
		args = append(args, *filters.StartDate)
		argNum++
	}

	if filters.EndDate != nil {
		conditions = append(conditions, fmt.Sprintf("al.created_at <= $%d", argNum))
		args = append(args, *filters.EndDate)
		argNum++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " AND " + strings.Join(conditions, " AND ")
	}

	// Get total count
	var total int
	err := pool.QueryRow(ctx, countQuery+whereClause, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: count audit log: %w", err)
	}

	// Build final query with pagination
	finalQuery := baseQuery + whereClause + fmt.Sprintf(" ORDER BY al.created_at DESC LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, filters.Limit, filters.Offset)

	rows, err := pool.Query(ctx, finalQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: list audit log: %w", err)
	}
	defer rows.Close()

	var entries []AuditLogEntry
	for rows.Next() {
		var e AuditLogEntry
		if err := rows.Scan(
			&e.ID,
			&e.TenantID,
			&e.UserID,
			&e.UserName,
			&e.UserEmail,
			&e.Action,
			&e.EntityType,
			&e.EntityID,
			&e.OldValues,
			&e.NewValues,
			&e.IPAddress,
			&e.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("storage: scan audit log entry: %w", err)
		}
		entries = append(entries, e)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: iterate audit log: %w", err)
	}

	return entries, total, nil
}

// GetEntityAuditHistory retrieves all audit log entries for a specific entity.
// Results are sorted by created_at DESC (most recent first).
func GetEntityAuditHistory(ctx context.Context, pool *pgxpool.Pool, entityType, entityID string) ([]AuditLogEntry, error) {
	query := `
		SELECT
			al.id,
			al.tenant_id,
			al.user_id,
			u.display_name as user_name,
			u.email as user_email,
			al.action,
			al.entity_type,
			al.entity_id,
			al.old_values,
			al.new_values,
			al.ip_address::TEXT,
			al.created_at
		FROM audit_log al
		LEFT JOIN users u ON al.user_id = u.id
		WHERE al.entity_type = $1 AND al.entity_id = $2
		ORDER BY al.created_at DESC
	`

	rows, err := pool.Query(ctx, query, entityType, entityID)
	if err != nil {
		return nil, fmt.Errorf("storage: get entity audit history: %w", err)
	}
	defer rows.Close()

	var entries []AuditLogEntry
	for rows.Next() {
		var e AuditLogEntry
		if err := rows.Scan(
			&e.ID,
			&e.TenantID,
			&e.UserID,
			&e.UserName,
			&e.UserEmail,
			&e.Action,
			&e.EntityType,
			&e.EntityID,
			&e.OldValues,
			&e.NewValues,
			&e.IPAddress,
			&e.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("storage: scan entity audit entry: %w", err)
		}
		entries = append(entries, e)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: iterate entity audit: %w", err)
	}

	return entries, nil
}

// GetAuditEntryByID retrieves a single audit log entry by ID.
func GetAuditEntryByID(ctx context.Context, pool *pgxpool.Pool, id string) (*AuditLogEntry, error) {
	query := `
		SELECT
			al.id,
			al.tenant_id,
			al.user_id,
			u.display_name as user_name,
			u.email as user_email,
			al.action,
			al.entity_type,
			al.entity_id,
			al.old_values,
			al.new_values,
			al.ip_address::TEXT,
			al.created_at
		FROM audit_log al
		LEFT JOIN users u ON al.user_id = u.id
		WHERE al.id = $1
	`

	var e AuditLogEntry
	err := pool.QueryRow(ctx, query, id).Scan(
		&e.ID,
		&e.TenantID,
		&e.UserID,
		&e.UserName,
		&e.UserEmail,
		&e.Action,
		&e.EntityType,
		&e.EntityID,
		&e.OldValues,
		&e.NewValues,
		&e.IPAddress,
		&e.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("storage: get audit entry: %w", err)
	}

	return &e, nil
}
