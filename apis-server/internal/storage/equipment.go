package storage

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EquipmentLog represents an equipment log record in the database.
type EquipmentLog struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	HiveID        string    `json:"hive_id"`
	EquipmentType string    `json:"equipment_type"`
	Action        string    `json:"action"`
	LoggedAt      time.Time `json:"logged_at"`
	Notes         *string   `json:"notes,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CurrentlyInstalledEquipment represents equipment currently installed on a hive.
type CurrentlyInstalledEquipment struct {
	ID            string    `json:"id"`
	EquipmentType string    `json:"equipment_type"`
	InstalledAt   time.Time `json:"installed_at"`
	DaysInstalled int       `json:"days_installed"`
	Notes         *string   `json:"notes,omitempty"`
}

// EquipmentHistoryItem represents a piece of equipment that was installed and removed.
type EquipmentHistoryItem struct {
	EquipmentType string    `json:"equipment_type"`
	InstalledAt   time.Time `json:"installed_at"`
	RemovedAt     time.Time `json:"removed_at"`
	DurationDays  int       `json:"duration_days"`
	Notes         *string   `json:"notes,omitempty"`
}

// CreateEquipmentLogInput contains the fields needed to create a new equipment log.
type CreateEquipmentLogInput struct {
	EquipmentType string    `json:"equipment_type"`
	Action        string    `json:"action"`
	LoggedAt      time.Time `json:"logged_at"`
	Notes         *string   `json:"notes,omitempty"`
}

// UpdateEquipmentLogInput contains the fields that can be updated on an equipment log.
type UpdateEquipmentLogInput struct {
	EquipmentType *string    `json:"equipment_type,omitempty"`
	Action        *string    `json:"action,omitempty"`
	LoggedAt      *time.Time `json:"logged_at,omitempty"`
	Notes         *string    `json:"notes,omitempty"`
}

// CreateEquipmentLog creates a new equipment log record in the database.
func CreateEquipmentLog(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string, input *CreateEquipmentLogInput) (*EquipmentLog, error) {
	var log EquipmentLog
	err := conn.QueryRow(ctx,
		`INSERT INTO equipment_logs (tenant_id, hive_id, equipment_type, action, logged_at, notes)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, tenant_id, hive_id, equipment_type, action, logged_at, notes, created_at, updated_at`,
		tenantID, hiveID, input.EquipmentType, input.Action, input.LoggedAt, input.Notes,
	).Scan(&log.ID, &log.TenantID, &log.HiveID, &log.EquipmentType, &log.Action,
		&log.LoggedAt, &log.Notes, &log.CreatedAt, &log.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create equipment log: %w", err)
	}

	return &log, nil
}

// ListEquipmentByHive returns all equipment logs for a specific hive.
func ListEquipmentByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]EquipmentLog, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, equipment_type, action, logged_at, notes, created_at, updated_at
		 FROM equipment_logs
		 WHERE hive_id = $1
		 ORDER BY logged_at DESC, created_at DESC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list equipment logs: %w", err)
	}
	defer rows.Close()

	var logs []EquipmentLog
	for rows.Next() {
		var l EquipmentLog
		err := rows.Scan(&l.ID, &l.TenantID, &l.HiveID, &l.EquipmentType, &l.Action,
			&l.LoggedAt, &l.Notes, &l.CreatedAt, &l.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan equipment log: %w", err)
		}
		logs = append(logs, l)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating equipment logs: %w", err)
	}

	return logs, nil
}

// GetEquipmentLogByID retrieves an equipment log by its ID.
func GetEquipmentLogByID(ctx context.Context, conn *pgxpool.Conn, id string) (*EquipmentLog, error) {
	var log EquipmentLog
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, equipment_type, action, logged_at, notes, created_at, updated_at
		 FROM equipment_logs
		 WHERE id = $1`,
		id,
	).Scan(&log.ID, &log.TenantID, &log.HiveID, &log.EquipmentType, &log.Action,
		&log.LoggedAt, &log.Notes, &log.CreatedAt, &log.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get equipment log: %w", err)
	}
	return &log, nil
}

// UpdateEquipmentLog updates an existing equipment log.
func UpdateEquipmentLog(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateEquipmentLogInput) (*EquipmentLog, error) {
	// Get current log
	current, err := GetEquipmentLogByID(ctx, conn, id)
	if err != nil {
		return nil, err
	}

	// Apply updates
	equipmentType := current.EquipmentType
	if input.EquipmentType != nil {
		equipmentType = *input.EquipmentType
	}

	action := current.Action
	if input.Action != nil {
		action = *input.Action
	}

	loggedAt := current.LoggedAt
	if input.LoggedAt != nil {
		loggedAt = *input.LoggedAt
	}

	notes := current.Notes
	if input.Notes != nil {
		notes = input.Notes
	}

	// Update log
	var log EquipmentLog
	err = conn.QueryRow(ctx,
		`UPDATE equipment_logs
		 SET equipment_type = $2, action = $3, logged_at = $4, notes = $5, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, tenant_id, hive_id, equipment_type, action, logged_at, notes, created_at, updated_at`,
		id, equipmentType, action, loggedAt, notes,
	).Scan(&log.ID, &log.TenantID, &log.HiveID, &log.EquipmentType, &log.Action,
		&log.LoggedAt, &log.Notes, &log.CreatedAt, &log.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update equipment log: %w", err)
	}

	return &log, nil
}

// DeleteEquipmentLog deletes an equipment log by its ID.
func DeleteEquipmentLog(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM equipment_logs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete equipment log: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// IsEquipmentCurrentlyInstalled checks if a specific equipment type is currently installed on a hive.
func IsEquipmentCurrentlyInstalled(ctx context.Context, conn *pgxpool.Conn, hiveID, equipmentType string) (bool, error) {
	var action string
	err := conn.QueryRow(ctx,
		`SELECT action FROM equipment_logs
		 WHERE hive_id = $1 AND equipment_type = $2
		 ORDER BY logged_at DESC, created_at DESC
		 LIMIT 1`,
		hiveID, equipmentType,
	).Scan(&action)

	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // No logs for this equipment type = not installed
	}
	if err != nil {
		return false, fmt.Errorf("storage: failed to check equipment status: %w", err)
	}

	return action == "installed", nil
}

// GetCurrentlyInstalledByHive returns equipment with 'installed' action that has no matching 'removed' action.
// Uses the latest action for each equipment_type to determine if it's still installed.
func GetCurrentlyInstalledByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]CurrentlyInstalledEquipment, error) {
	rows, err := conn.Query(ctx,
		`WITH latest_actions AS (
			SELECT DISTINCT ON (equipment_type)
				id, hive_id, equipment_type, action, logged_at, notes, created_at
			FROM equipment_logs
			WHERE hive_id = $1
			ORDER BY equipment_type, logged_at DESC, created_at DESC
		)
		SELECT id, equipment_type, logged_at, notes
		FROM latest_actions
		WHERE action = 'installed'`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get currently installed equipment: %w", err)
	}
	defer rows.Close()

	var items []CurrentlyInstalledEquipment
	now := time.Now()
	for rows.Next() {
		var item CurrentlyInstalledEquipment
		err := rows.Scan(&item.ID, &item.EquipmentType, &item.InstalledAt, &item.Notes)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan currently installed equipment: %w", err)
		}
		// Calculate days installed
		item.DaysInstalled = int(now.Sub(item.InstalledAt).Hours() / 24)
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating currently installed equipment: %w", err)
	}

	return items, nil
}

// GetEquipmentHistoryByHive returns equipment that has both 'installed' and 'removed' actions with duration.
// Returns pairs of install/remove events for each equipment type.
func GetEquipmentHistoryByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) ([]EquipmentHistoryItem, error) {
	// Get all equipment logs for the hive, ordered by type and date
	rows, err := conn.Query(ctx,
		`SELECT equipment_type, action, logged_at, notes
		 FROM equipment_logs
		 WHERE hive_id = $1
		 ORDER BY equipment_type, logged_at ASC, created_at ASC`,
		hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get equipment history: %w", err)
	}
	defer rows.Close()

	// Build a map of equipment type to list of actions
	type actionEntry struct {
		action   string
		loggedAt time.Time
		notes    *string
	}
	typeActions := make(map[string][]actionEntry)

	for rows.Next() {
		var equipmentType, action string
		var loggedAt time.Time
		var notes *string
		err := rows.Scan(&equipmentType, &action, &loggedAt, &notes)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan equipment history: %w", err)
		}
		typeActions[equipmentType] = append(typeActions[equipmentType], actionEntry{
			action:   action,
			loggedAt: loggedAt,
			notes:    notes,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating equipment history: %w", err)
	}

	// Match install/remove pairs
	var history []EquipmentHistoryItem
	for equipmentType, actions := range typeActions {
		var pendingInstall *actionEntry
		for i := range actions {
			a := &actions[i]
			if a.action == "installed" {
				pendingInstall = a
			} else if a.action == "removed" && pendingInstall != nil {
				// Found a complete pair
				item := EquipmentHistoryItem{
					EquipmentType: equipmentType,
					InstalledAt:   pendingInstall.loggedAt,
					RemovedAt:     a.loggedAt,
					DurationDays:  int(a.loggedAt.Sub(pendingInstall.loggedAt).Hours() / 24),
					Notes:         a.notes, // Use removal notes
				}
				history = append(history, item)
				pendingInstall = nil
			}
		}
	}

	// Sort history by removed_at date descending (most recent first)
	// FIX (DL-L01): Replaced O(n^2) bubble sort with O(n log n) sort.Slice.
	sort.Slice(history, func(i, j int) bool {
		return history[i].RemovedAt.After(history[j].RemovedAt)
	})

	return history, nil
}
