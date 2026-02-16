package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Insight represents an insight record in the database.
type Insight struct {
	ID              string                 `json:"id"`
	TenantID        string                 `json:"tenant_id,omitempty"`
	HiveID          *string                `json:"hive_id,omitempty"`
	HiveName        *string                `json:"hive_name,omitempty"` // Populated via join
	RuleID          string                 `json:"rule_id"`
	Severity        string                 `json:"severity"`
	Message         string                 `json:"message"`
	SuggestedAction string                 `json:"suggested_action"`
	DataPoints      map[string]interface{} `json:"data_points"`
	CreatedAt       time.Time              `json:"created_at"`
	DismissedAt     *time.Time             `json:"dismissed_at,omitempty"`
	SnoozedUntil    *time.Time             `json:"snoozed_until,omitempty"`
}

// CreateInsightInput contains the fields needed to create a new insight.
type CreateInsightInput struct {
	HiveID          *string                `json:"hive_id,omitempty"`
	RuleID          string                 `json:"rule_id"`
	Severity        string                 `json:"severity"`
	Message         string                 `json:"message"`
	SuggestedAction string                 `json:"suggested_action"`
	DataPoints      map[string]interface{} `json:"data_points"`
}

// CreateInsight creates a new insight in the database.
func CreateInsight(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateInsightInput) (*Insight, error) {
	dataPointsJSON, err := json.Marshal(input.DataPoints)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to marshal data_points: %w", err)
	}

	var insight Insight
	var dataPointsBytes []byte

	err = conn.QueryRow(ctx,
		`INSERT INTO insights (tenant_id, hive_id, rule_id, severity, message, suggested_action, data_points)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, tenant_id, hive_id, rule_id, severity, message, suggested_action, data_points, created_at, dismissed_at, snoozed_until`,
		tenantID, input.HiveID, input.RuleID, input.Severity, input.Message, input.SuggestedAction, dataPointsJSON,
	).Scan(&insight.ID, &insight.TenantID, &insight.HiveID, &insight.RuleID, &insight.Severity,
		&insight.Message, &insight.SuggestedAction, &dataPointsBytes, &insight.CreatedAt,
		&insight.DismissedAt, &insight.SnoozedUntil)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create insight: %w", err)
	}

	// Parse data_points JSON
	if err := json.Unmarshal(dataPointsBytes, &insight.DataPoints); err != nil {
		insight.DataPoints = make(map[string]interface{})
	}

	return &insight, nil
}

// GetInsightByID retrieves an insight by its ID.
func GetInsightByID(ctx context.Context, conn *pgxpool.Conn, id string) (*Insight, error) {
	var insight Insight
	var dataPointsBytes []byte

	err := conn.QueryRow(ctx,
		`SELECT i.id, i.tenant_id, i.hive_id, h.name, i.rule_id, i.severity, i.message, i.suggested_action,
		        i.data_points, i.created_at, i.dismissed_at, i.snoozed_until
		 FROM insights i
		 LEFT JOIN hives h ON h.id = i.hive_id
		 WHERE i.id = $1`,
		id,
	).Scan(&insight.ID, &insight.TenantID, &insight.HiveID, &insight.HiveName, &insight.RuleID,
		&insight.Severity, &insight.Message, &insight.SuggestedAction, &dataPointsBytes,
		&insight.CreatedAt, &insight.DismissedAt, &insight.SnoozedUntil)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get insight: %w", err)
	}

	// Parse data_points JSON
	if err := json.Unmarshal(dataPointsBytes, &insight.DataPoints); err != nil {
		insight.DataPoints = make(map[string]interface{})
	}

	return &insight, nil
}

// ListInsightsByHive returns all insights for a specific hive.
func ListInsightsByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]Insight, error) {
	rows, err := conn.Query(ctx,
		`SELECT i.id, i.tenant_id, i.hive_id, h.name, i.rule_id, i.severity, i.message, i.suggested_action,
		        i.data_points, i.created_at, i.dismissed_at, i.snoozed_until
		 FROM insights i
		 LEFT JOIN hives h ON h.id = i.hive_id
		 WHERE i.hive_id = $1
		 ORDER BY i.created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list insights by hive: %w", err)
	}
	defer rows.Close()

	return scanInsights(rows)
}

// ListInsightsByTenant returns all insights for a tenant.
func ListInsightsByTenant(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]Insight, error) {
	rows, err := conn.Query(ctx,
		`SELECT i.id, i.tenant_id, i.hive_id, h.name, i.rule_id, i.severity, i.message, i.suggested_action,
		        i.data_points, i.created_at, i.dismissed_at, i.snoozed_until
		 FROM insights i
		 LEFT JOIN hives h ON h.id = i.hive_id
		 WHERE i.tenant_id = $1
		 ORDER BY i.created_at DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list insights by tenant: %w", err)
	}
	defer rows.Close()

	return scanInsights(rows)
}

// ListActiveInsights returns all active (not dismissed, not snoozed) insights for a tenant.
func ListActiveInsights(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]Insight, error) {
	now := time.Now()
	rows, err := conn.Query(ctx,
		`SELECT i.id, i.tenant_id, i.hive_id, h.name, i.rule_id, i.severity, i.message, i.suggested_action,
		        i.data_points, i.created_at, i.dismissed_at, i.snoozed_until
		 FROM insights i
		 LEFT JOIN hives h ON h.id = i.hive_id
		 WHERE i.tenant_id = $1
		   AND i.dismissed_at IS NULL
		   AND (i.snoozed_until IS NULL OR i.snoozed_until < $2)
		 ORDER BY
		   CASE i.severity
		     WHEN 'action-needed' THEN 1
		     WHEN 'warning' THEN 2
		     WHEN 'info' THEN 3
		     ELSE 4
		   END,
		   i.created_at DESC`,
		tenantID, now)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list active insights: %w", err)
	}
	defer rows.Close()

	return scanInsights(rows)
}

// DismissInsight marks an insight as dismissed.
func DismissInsight(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx,
		`UPDATE insights SET dismissed_at = NOW() WHERE id = $1 AND dismissed_at IS NULL`,
		id)
	if err != nil {
		return fmt.Errorf("storage: failed to dismiss insight: %w", err)
	}

	if result.RowsAffected() == 0 {
		// Check if insight exists
		var exists bool
		err = conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM insights WHERE id = $1)`, id).Scan(&exists)
		if err != nil {
			return fmt.Errorf("storage: failed to check insight existence: %w", err)
		}
		if !exists {
			return ErrNotFound
		}
		// Insight exists but was already dismissed
	}

	return nil
}

// SnoozeInsight snoozes an insight until a specified time.
func SnoozeInsight(ctx context.Context, conn *pgxpool.Conn, id string, until time.Time) error {
	result, err := conn.Exec(ctx,
		`UPDATE insights SET snoozed_until = $2 WHERE id = $1`,
		id, until)
	if err != nil {
		return fmt.Errorf("storage: failed to snooze insight: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// DismissAllActiveInsights marks all active (non-dismissed, non-snoozed) insights
// for a tenant as dismissed. Called before a fresh analysis to prevent duplicates.
func DismissAllActiveInsights(ctx context.Context, conn *pgxpool.Conn, tenantID string) (int64, error) {
	result, err := conn.Exec(ctx,
		`UPDATE insights SET dismissed_at = NOW()
		 WHERE tenant_id = $1
		   AND dismissed_at IS NULL`,
		tenantID)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to dismiss active insights: %w", err)
	}
	return result.RowsAffected(), nil
}

// DeleteOldInsights removes insights older than the specified number of days.
// This is used for cleanup of old dismissed insights.
func DeleteOldInsights(ctx context.Context, conn *pgxpool.Conn, tenantID string, daysOld int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -daysOld)

	result, err := conn.Exec(ctx,
		`DELETE FROM insights
		 WHERE tenant_id = $1
		   AND created_at < $2
		   AND dismissed_at IS NOT NULL`,
		tenantID, cutoff)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to delete old insights: %w", err)
	}

	return result.RowsAffected(), nil
}

// CountActiveInsights returns the count of active insights by severity for a tenant.
func CountActiveInsights(ctx context.Context, conn *pgxpool.Conn, tenantID string) (actionNeeded, warnings, info int, err error) {
	now := time.Now()
	rows, err := conn.Query(ctx,
		`SELECT severity, COUNT(*)
		 FROM insights
		 WHERE tenant_id = $1
		   AND dismissed_at IS NULL
		   AND (snoozed_until IS NULL OR snoozed_until < $2)
		 GROUP BY severity`,
		tenantID, now)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("storage: failed to count active insights: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var severity string
		var count int
		if err := rows.Scan(&severity, &count); err != nil {
			return 0, 0, 0, fmt.Errorf("storage: failed to scan insight count: %w", err)
		}
		switch severity {
		case "action-needed":
			actionNeeded = count
		case "warning":
			warnings = count
		case "info":
			info = count
		}
	}

	if err := rows.Err(); err != nil {
		return 0, 0, 0, fmt.Errorf("storage: error iterating insight counts: %w", err)
	}

	return actionNeeded, warnings, info, nil
}

// MaintenanceInsight contains insight data aggregated by hive for maintenance view.
type MaintenanceInsight struct {
	ID              string                 `json:"id"`
	HiveID          string                 `json:"hive_id"`
	HiveName        string                 `json:"hive_name"`
	SiteID          string                 `json:"site_id"`
	SiteName        string                 `json:"site_name"`
	RuleID          string                 `json:"rule_id"`
	Severity        string                 `json:"severity"`
	Message         string                 `json:"message"`
	SuggestedAction string                 `json:"suggested_action"`
	DataPoints      map[string]interface{} `json:"data_points"`
	CreatedAt       time.Time              `json:"created_at"`
}

// ListMaintenanceInsights returns active insights grouped by hive with hive and site names.
// Results are sorted by priority score (severity weight + age in days) descending.
//
// Business Rule: Only hives with status='active' are included in maintenance lists.
// This excludes hives that have been marked as 'lost', 'merged', 'dead', or 'sold' since
// those hives no longer require maintenance attention. If a hive status changes back to
// 'active', it will automatically reappear in the maintenance list if it has active insights.
func ListMaintenanceInsights(ctx context.Context, conn *pgxpool.Conn, tenantID, siteID string) ([]MaintenanceInsight, error) {
	now := time.Now()

	// Note: h.status = 'active' filter ensures only active hives appear in maintenance.
	// Inactive hives (lost, merged, dead, sold) are excluded intentionally.
	query := `SELECT i.id, i.hive_id, h.name as hive_name, h.site_id, s.name as site_name,
	                 i.rule_id, i.severity, i.message, i.suggested_action, i.data_points, i.created_at
	          FROM insights i
	          JOIN hives h ON h.id = i.hive_id
	          JOIN sites s ON s.id = h.site_id
	          WHERE i.tenant_id = $1
	            AND i.hive_id IS NOT NULL
	            AND i.dismissed_at IS NULL
	            AND (i.snoozed_until IS NULL OR i.snoozed_until < $2)
	            AND h.status = 'active'`

	var args []interface{}
	args = append(args, tenantID, now)

	if siteID != "" {
		query += ` AND h.site_id = $3`
		args = append(args, siteID)
	}

	// Sort by severity weight + age in days descending
	query += ` ORDER BY
	            CASE i.severity
	              WHEN 'action-needed' THEN 100
	              WHEN 'warning' THEN 50
	              WHEN 'info' THEN 10
	              ELSE 0
	            END + EXTRACT(EPOCH FROM $2 - i.created_at) / 86400 DESC,
	            i.created_at DESC`

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list maintenance insights: %w", err)
	}
	defer rows.Close()

	var insights []MaintenanceInsight
	for rows.Next() {
		var mi MaintenanceInsight
		var dataPointsBytes []byte

		err := rows.Scan(&mi.ID, &mi.HiveID, &mi.HiveName, &mi.SiteID, &mi.SiteName,
			&mi.RuleID, &mi.Severity, &mi.Message, &mi.SuggestedAction, &dataPointsBytes, &mi.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan maintenance insight: %w", err)
		}

		// Parse data_points JSON
		if err := json.Unmarshal(dataPointsBytes, &mi.DataPoints); err != nil {
			mi.DataPoints = make(map[string]interface{})
		}

		insights = append(insights, mi)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating maintenance insights: %w", err)
	}

	return insights, nil
}

// RecentlyCompletedInsight represents an insight that was recently dismissed.
type RecentlyCompletedInsight struct {
	HiveID      string    `json:"hive_id"`
	HiveName    string    `json:"hive_name"`
	Action      string    `json:"action"`
	CompletedAt time.Time `json:"completed_at"`
}

// ListRecentlyCompletedInsights returns insights dismissed in the last 7 days.
func ListRecentlyCompletedInsights(ctx context.Context, conn *pgxpool.Conn, tenantID, siteID string, limit int) ([]RecentlyCompletedInsight, error) {
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)

	query := `SELECT h.id, h.name, i.suggested_action, i.dismissed_at
	          FROM insights i
	          JOIN hives h ON h.id = i.hive_id
	          WHERE i.tenant_id = $1
	            AND i.hive_id IS NOT NULL
	            AND i.dismissed_at IS NOT NULL
	            AND i.dismissed_at > $2`

	var args []interface{}
	args = append(args, tenantID, sevenDaysAgo)

	if siteID != "" {
		query += ` AND h.site_id = $3`
		args = append(args, siteID)
	}

	query += ` ORDER BY i.dismissed_at DESC LIMIT $` + fmt.Sprintf("%d", len(args)+1)
	args = append(args, limit)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list recently completed insights: %w", err)
	}
	defer rows.Close()

	var completed []RecentlyCompletedInsight
	for rows.Next() {
		var rc RecentlyCompletedInsight
		err := rows.Scan(&rc.HiveID, &rc.HiveName, &rc.Action, &rc.CompletedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan recently completed insight: %w", err)
		}
		completed = append(completed, rc)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating recently completed insights: %w", err)
	}

	return completed, nil
}

// scanInsights is a helper to scan insight rows.
func scanInsights(rows pgx.Rows) ([]Insight, error) {
	var insights []Insight
	for rows.Next() {
		var insight Insight
		var dataPointsBytes []byte

		err := rows.Scan(&insight.ID, &insight.TenantID, &insight.HiveID, &insight.HiveName,
			&insight.RuleID, &insight.Severity, &insight.Message, &insight.SuggestedAction,
			&dataPointsBytes, &insight.CreatedAt, &insight.DismissedAt, &insight.SnoozedUntil)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan insight: %w", err)
		}

		// Parse data_points JSON
		if err := json.Unmarshal(dataPointsBytes, &insight.DataPoints); err != nil {
			insight.DataPoints = make(map[string]interface{})
		}

		// Don't expose tenant_id in list responses
		insight.TenantID = ""

		insights = append(insights, insight)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating insights: %w", err)
	}

	return insights, nil
}
