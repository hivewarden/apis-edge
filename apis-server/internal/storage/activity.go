package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivityEntry represents a processed audit log entry with entity details for the activity feed.
type ActivityEntry struct {
	ID         string          `json:"id"`
	Action     string          `json:"action"`      // create, update, delete
	EntityType string          `json:"entity_type"` // hives, inspections, treatments, etc.
	EntityID   string          `json:"entity_id"`
	EntityName *string         `json:"entity_name,omitempty"` // Name from joined entity or new_values
	UserID     *string         `json:"user_id,omitempty"`
	UserName   *string         `json:"user_name,omitempty"`
	HiveID     *string         `json:"hive_id,omitempty"`      // For hive-related entities
	HiveName   *string         `json:"hive_name,omitempty"`
	SiteID     *string         `json:"site_id,omitempty"`      // For site filtering
	UnitName   *string         `json:"unit_name,omitempty"`    // For clip activities
	NewValues  json.RawMessage `json:"new_values,omitempty"`   // For message generation
	CreatedAt  time.Time       `json:"created_at"`
}

// ActivityFilters contains filters for querying activity entries.
type ActivityFilters struct {
	TenantID    string   `json:"tenant_id"`              // Required: tenant_id for RLS defense-in-depth
	EntityTypes []string `json:"entity_types,omitempty"` // Filter by entity types
	HiveID      *string  `json:"hive_id,omitempty"`      // Filter by hive
	SiteID      *string  `json:"site_id,omitempty"`      // Filter by site
	Cursor      *string  `json:"cursor,omitempty"`       // Cursor for pagination (created_at, id tuple)
	CursorTime  *string  `json:"cursor_time,omitempty"`  // Cursor created_at timestamp for pagination
	Limit       int      `json:"limit"`                  // Max items (default 20, max 100)
}

// ListActivity retrieves activity entries with optional filters.
// Returns entries and a flag indicating if there are more results.
// TODO (DL-M07): This query uses 11 LEFT JOINs to resolve entity names.
// As the activity log grows, consider pre-computing entity names at insert time
// (denormalization in audit_log), or implement a materialized view.
func ListActivity(ctx context.Context, pool *pgxpool.Pool, filters *ActivityFilters) ([]ActivityEntry, bool, error) {
	// Ensure limit is within bounds
	if filters.Limit <= 0 {
		filters.Limit = 20
	}
	if filters.Limit > 100 {
		filters.Limit = 100
	}

	// Build the query with necessary JOINs
	// We fetch one extra row to determine if there are more results
	query := `
		SELECT
			al.id,
			al.action,
			al.entity_type,
			al.entity_id,
			-- Entity name with fallback to new_values
			CASE
				WHEN al.entity_type = 'hives' THEN COALESCE(h.name, al.new_values->>'name')
				WHEN al.entity_type = 'inspections' THEN NULL
				WHEN al.entity_type = 'treatments' THEN al.new_values->>'treatment_type'
				WHEN al.entity_type = 'feedings' THEN al.new_values->>'feed_type'
				WHEN al.entity_type = 'harvests' THEN NULL
				WHEN al.entity_type = 'users' THEN COALESCE(u_entity.name, al.new_values->>'name')
				WHEN al.entity_type = 'clips' THEN NULL
				WHEN al.entity_type = 'sites' THEN COALESCE(s_entity.name, al.new_values->>'name')
				ELSE NULL
			END as entity_name,
			al.user_id,
			u.name as user_name,
			-- Hive info (either direct or from related entity)
			CASE
				WHEN al.entity_type = 'hives' THEN al.entity_id
				WHEN al.entity_type = 'inspections' THEN COALESCE(insp.hive_id, al.new_values->>'hive_id')
				WHEN al.entity_type = 'treatments' THEN COALESCE(tr.hive_id, al.new_values->>'hive_id')
				WHEN al.entity_type = 'feedings' THEN COALESCE(fd.hive_id, al.new_values->>'hive_id')
				WHEN al.entity_type = 'harvests' THEN NULL
				ELSE NULL
			END as hive_id,
			-- Hive name
			CASE
				WHEN al.entity_type = 'hives' THEN COALESCE(h.name, al.new_values->>'name')
				WHEN al.entity_type = 'inspections' THEN COALESCE(h_insp.name, (SELECT hv.name FROM hives hv WHERE hv.id::text = al.new_values->>'hive_id'))
				WHEN al.entity_type = 'treatments' THEN COALESCE(h_tr.name, (SELECT hv.name FROM hives hv WHERE hv.id::text = al.new_values->>'hive_id'))
				WHEN al.entity_type = 'feedings' THEN COALESCE(h_fd.name, (SELECT hv.name FROM hives hv WHERE hv.id::text = al.new_values->>'hive_id'))
				ELSE NULL
			END as hive_name,
			-- Site ID (for filtering)
			CASE
				WHEN al.entity_type = 'sites' THEN al.entity_id
				WHEN al.entity_type = 'hives' THEN COALESCE(h.site_id::text, al.new_values->>'site_id')
				WHEN al.entity_type = 'clips' THEN clip.site_id::text
				ELSE NULL
			END as site_id,
			-- Unit name for clips
			CASE
				WHEN al.entity_type = 'clips' THEN COALESCE(unit.name, al.new_values->>'unit_name')
				ELSE NULL
			END as unit_name,
			al.new_values,
			al.created_at
		FROM audit_log al
		LEFT JOIN users u ON al.user_id = u.id
		-- For hives entity
		LEFT JOIN hives h ON al.entity_type = 'hives' AND al.entity_id = h.id::text
		-- For inspections entity
		LEFT JOIN inspections insp ON al.entity_type = 'inspections' AND al.entity_id = insp.id::text
		LEFT JOIN hives h_insp ON insp.hive_id = h_insp.id
		-- For treatments entity
		LEFT JOIN treatments tr ON al.entity_type = 'treatments' AND al.entity_id = tr.id::text
		LEFT JOIN hives h_tr ON tr.hive_id = h_tr.id
		-- For feedings entity
		LEFT JOIN feedings fd ON al.entity_type = 'feedings' AND al.entity_id = fd.id::text
		LEFT JOIN hives h_fd ON fd.hive_id = h_fd.id
		-- For users entity
		LEFT JOIN users u_entity ON al.entity_type = 'users' AND al.entity_id = u_entity.id::text
		-- For clips entity
		LEFT JOIN clips clip ON al.entity_type = 'clips' AND al.entity_id = clip.id::text
		LEFT JOIN units unit ON clip.unit_id = unit.id
		-- For sites entity
		LEFT JOIN sites s_entity ON al.entity_type = 'sites' AND al.entity_id = s_entity.id::text
		WHERE al.tenant_id = $1
	`

	var conditions []string
	args := []any{filters.TenantID}
	argNum := 2

	// Filter by entity types
	if len(filters.EntityTypes) > 0 {
		placeholders := make([]string, len(filters.EntityTypes))
		for i, et := range filters.EntityTypes {
			placeholders[i] = fmt.Sprintf("$%d", argNum)
			args = append(args, et)
			argNum++
		}
		conditions = append(conditions, fmt.Sprintf("al.entity_type IN (%s)", strings.Join(placeholders, ", ")))
	}

	// Filter by hive ID
	if filters.HiveID != nil && *filters.HiveID != "" {
		// Match direct hive entity or related entity's hive_id
		conditions = append(conditions, fmt.Sprintf(`(
			(al.entity_type = 'hives' AND al.entity_id = $%d)
			OR (al.entity_type = 'inspections' AND (insp.hive_id::text = $%d OR al.new_values->>'hive_id' = $%d))
			OR (al.entity_type = 'treatments' AND (tr.hive_id::text = $%d OR al.new_values->>'hive_id' = $%d))
			OR (al.entity_type = 'feedings' AND (fd.hive_id::text = $%d OR al.new_values->>'hive_id' = $%d))
		)`, argNum, argNum, argNum, argNum, argNum, argNum, argNum))
		args = append(args, *filters.HiveID)
		argNum++
	}

	// Filter by site ID
	if filters.SiteID != nil && *filters.SiteID != "" {
		conditions = append(conditions, fmt.Sprintf(`(
			(al.entity_type = 'sites' AND al.entity_id = $%d)
			OR (al.entity_type = 'hives' AND (h.site_id::text = $%d OR al.new_values->>'site_id' = $%d))
			OR (al.entity_type = 'clips' AND clip.site_id::text = $%d)
			OR (al.entity_type IN ('inspections', 'treatments', 'feedings') AND (
				COALESCE(h_insp.site_id, h_tr.site_id, h_fd.site_id)::text = $%d
			))
		)`, argNum, argNum, argNum, argNum, argNum))
		args = append(args, *filters.SiteID)
		argNum++
	}

	// Cursor-based pagination using (created_at, id) tuple for reliable ordering
	// This ensures correct pagination even when multiple entries have the same created_at
	if filters.Cursor != nil && *filters.Cursor != "" && filters.CursorTime != nil && *filters.CursorTime != "" {
		conditions = append(conditions, fmt.Sprintf("(al.created_at, al.id) < ($%d, $%d)", argNum, argNum+1))
		args = append(args, *filters.CursorTime, *filters.Cursor)
		argNum += 2
	}

	// Build WHERE clause
	if len(conditions) > 0 {
		query += " AND " + strings.Join(conditions, " AND ")
	}

	// Order by created_at DESC, id DESC for consistent pagination
	query += " ORDER BY al.created_at DESC, al.id DESC"

	// Fetch one extra to determine has_more
	query += fmt.Sprintf(" LIMIT $%d", argNum)
	args = append(args, filters.Limit+1)

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("storage: list activity: %w", err)
	}
	defer rows.Close()

	var entries []ActivityEntry
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(
			&e.ID,
			&e.Action,
			&e.EntityType,
			&e.EntityID,
			&e.EntityName,
			&e.UserID,
			&e.UserName,
			&e.HiveID,
			&e.HiveName,
			&e.SiteID,
			&e.UnitName,
			&e.NewValues,
			&e.CreatedAt,
		); err != nil {
			return nil, false, fmt.Errorf("storage: scan activity entry: %w", err)
		}
		entries = append(entries, e)
	}

	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("storage: iterate activity: %w", err)
	}

	// Determine if there are more results
	hasMore := len(entries) > filters.Limit
	if hasMore {
		// Remove the extra row
		entries = entries[:filters.Limit]
	}

	return entries, hasMore, nil
}
