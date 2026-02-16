package storage

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ValidReminderTypes defines the allowed reminder types.
var ValidReminderTypes = []string{"treatment_due", "treatment_followup", "custom"}

// IsValidReminderType checks if a reminder type is valid.
func IsValidReminderType(reminderType string) bool {
	return slices.Contains(ValidReminderTypes, reminderType)
}

// Reminder represents a reminder in the database.
type Reminder struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	HiveID       *string    `json:"hive_id,omitempty"`
	ReminderType string     `json:"reminder_type"`
	Title        string     `json:"title"`
	DueAt        time.Time  `json:"due_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	SnoozedUntil *time.Time `json:"snoozed_until,omitempty"`
	Metadata     any        `json:"metadata,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// CreateReminderInput contains the fields needed to create a new reminder.
type CreateReminderInput struct {
	HiveID       *string `json:"hive_id,omitempty"`
	ReminderType string  `json:"reminder_type"`
	Title        string  `json:"title"`
	DueAt        string  `json:"due_at"` // Date in YYYY-MM-DD format
	Metadata     any     `json:"metadata,omitempty"`
}

// UpdateReminderInput contains the fields that can be updated on a reminder.
type UpdateReminderInput struct {
	Title        *string `json:"title,omitempty"`
	DueAt        *string `json:"due_at,omitempty"` // Date in YYYY-MM-DD format
	SnoozedUntil *string `json:"snoozed_until,omitempty"`
	Metadata     any     `json:"metadata,omitempty"`
}

// CreateReminder creates a new reminder in the database.
func CreateReminder(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateReminderInput) (*Reminder, error) {
	if input.Title == "" {
		return nil, fmt.Errorf("storage: title is required")
	}
	if !IsValidReminderType(input.ReminderType) {
		return nil, fmt.Errorf("storage: invalid reminder type: %s", input.ReminderType)
	}

	dueAt, err := time.Parse("2006-01-02", input.DueAt)
	if err != nil {
		return nil, fmt.Errorf("storage: invalid due_at date format: %w", err)
	}

	var reminder Reminder
	err = conn.QueryRow(ctx,
		`INSERT INTO reminders (tenant_id, hive_id, reminder_type, title, due_at, metadata)
		 VALUES ($1, $2, $3, $4, $5, COALESCE($6, '{}'))
		 RETURNING id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at`,
		tenantID, input.HiveID, input.ReminderType, input.Title, dueAt, input.Metadata,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create reminder: %w", err)
	}

	return &reminder, nil
}

// ListRemindersForDateRange returns all reminders for a tenant within a date range.
func ListRemindersForDateRange(ctx context.Context, conn *pgxpool.Conn, tenantID string, startDate, endDate time.Time) ([]Reminder, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE tenant_id = $1
		   AND due_at >= $2
		   AND due_at <= $3
		 ORDER BY due_at ASC, created_at ASC`,
		tenantID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list reminders for date range: %w", err)
	}
	defer rows.Close()

	var reminders []Reminder
	for rows.Next() {
		var r Reminder
		err := rows.Scan(&r.ID, &r.TenantID, &r.HiveID, &r.ReminderType, &r.Title,
			&r.DueAt, &r.CompletedAt, &r.SnoozedUntil, &r.Metadata, &r.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan reminder: %w", err)
		}
		reminders = append(reminders, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating reminders: %w", err)
	}

	return reminders, nil
}

// ListPendingReminders returns all reminders that are due and not completed.
func ListPendingReminders(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]Reminder, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE tenant_id = $1
		   AND completed_at IS NULL
		   AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE)
		 ORDER BY due_at ASC, created_at ASC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list pending reminders: %w", err)
	}
	defer rows.Close()

	var reminders []Reminder
	for rows.Next() {
		var r Reminder
		err := rows.Scan(&r.ID, &r.TenantID, &r.HiveID, &r.ReminderType, &r.Title,
			&r.DueAt, &r.CompletedAt, &r.SnoozedUntil, &r.Metadata, &r.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan reminder: %w", err)
		}
		reminders = append(reminders, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating reminders: %w", err)
	}

	return reminders, nil
}

// GetReminderByID retrieves a reminder by its ID.
func GetReminderByID(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) (*Reminder, error) {
	var reminder Reminder
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE id = $1 AND tenant_id = $2`,
		id, tenantID,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get reminder: %w", err)
	}
	return &reminder, nil
}

// UpdateReminder updates an existing reminder.
// SECURITY FIX (DL-H04): Uses SELECT ... FOR UPDATE to prevent TOCTOU races.
func UpdateReminder(ctx context.Context, conn *pgxpool.Conn, tenantID, id string, input *UpdateReminderInput) (*Reminder, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock the row with FOR UPDATE
	var current Reminder
	err = tx.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE id = $1 AND tenant_id = $2
		 FOR UPDATE`,
		id, tenantID,
	).Scan(&current.ID, &current.TenantID, &current.HiveID, &current.ReminderType,
		&current.Title, &current.DueAt, &current.CompletedAt, &current.SnoozedUntil,
		&current.Metadata, &current.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get reminder for update: %w", err)
	}

	// Apply updates
	title := current.Title
	if input.Title != nil {
		title = *input.Title
	}

	dueAt := current.DueAt
	if input.DueAt != nil {
		parsedDate, err := time.Parse("2006-01-02", *input.DueAt)
		if err != nil {
			return nil, fmt.Errorf("storage: invalid due_at date format: %w", err)
		}
		dueAt = parsedDate
	}

	var snoozedUntil *time.Time
	if input.SnoozedUntil != nil {
		parsedDate, err := time.Parse("2006-01-02", *input.SnoozedUntil)
		if err != nil {
			return nil, fmt.Errorf("storage: invalid snoozed_until date format: %w", err)
		}
		snoozedUntil = &parsedDate
	} else {
		snoozedUntil = current.SnoozedUntil
	}

	metadata := current.Metadata
	if input.Metadata != nil {
		metadata = input.Metadata
	}

	// Update reminder
	var reminder Reminder
	err = tx.QueryRow(ctx,
		`UPDATE reminders
		 SET title = $3, due_at = $4, snoozed_until = $5, metadata = $6
		 WHERE id = $1 AND tenant_id = $2
		 RETURNING id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at`,
		id, tenantID, title, dueAt, snoozedUntil, metadata,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update reminder: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit reminder update: %w", err)
	}

	return &reminder, nil
}

// SnoozeReminder snoozes a reminder for a specified number of days.
func SnoozeReminder(ctx context.Context, conn *pgxpool.Conn, tenantID, id string, days int) (*Reminder, error) {
	snoozedUntil := time.Now().AddDate(0, 0, days)

	var reminder Reminder
	err := conn.QueryRow(ctx,
		`UPDATE reminders
		 SET snoozed_until = $3
		 WHERE id = $1 AND tenant_id = $2
		 RETURNING id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at`,
		id, tenantID, snoozedUntil,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to snooze reminder: %w", err)
	}

	return &reminder, nil
}

// CompleteReminder marks a reminder as completed.
func CompleteReminder(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) (*Reminder, error) {
	var reminder Reminder
	err := conn.QueryRow(ctx,
		`UPDATE reminders
		 SET completed_at = NOW()
		 WHERE id = $1 AND tenant_id = $2
		 RETURNING id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at`,
		id, tenantID,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to complete reminder: %w", err)
	}

	return &reminder, nil
}

// DeleteReminder hard deletes a reminder by its ID.
func DeleteReminder(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) error {
	result, err := conn.Exec(ctx,
		`DELETE FROM reminders WHERE id = $1 AND tenant_id = $2`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to delete reminder: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// ListRemindersByHive returns all reminders for a specific hive.
func ListRemindersByHive(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string) ([]Reminder, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE tenant_id = $1 AND hive_id = $2
		 ORDER BY due_at ASC, created_at ASC`,
		tenantID, hiveID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list reminders by hive: %w", err)
	}
	defer rows.Close()

	var reminders []Reminder
	for rows.Next() {
		var r Reminder
		err := rows.Scan(&r.ID, &r.TenantID, &r.HiveID, &r.ReminderType, &r.Title,
			&r.DueAt, &r.CompletedAt, &r.SnoozedUntil, &r.Metadata, &r.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan reminder: %w", err)
		}
		reminders = append(reminders, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating reminders: %w", err)
	}

	return reminders, nil
}

// FindTreatmentDueSnoozeReminder finds an existing snooze reminder for a hive + treatment type.
// Returns nil if not found (not an error).
func FindTreatmentDueSnoozeReminder(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID, treatmentType string) (*Reminder, error) {
	var reminder Reminder
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, metadata, created_at
		 FROM reminders
		 WHERE tenant_id = $1
		   AND hive_id = $2
		   AND reminder_type = 'treatment_due'
		   AND metadata->>'treatment_type' = $3
		   AND completed_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT 1`,
		tenantID, hiveID, treatmentType,
	).Scan(&reminder.ID, &reminder.TenantID, &reminder.HiveID, &reminder.ReminderType,
		&reminder.Title, &reminder.DueAt, &reminder.CompletedAt, &reminder.SnoozedUntil,
		&reminder.Metadata, &reminder.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // Not found, but not an error
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to find treatment due snooze reminder: %w", err)
	}
	return &reminder, nil
}
