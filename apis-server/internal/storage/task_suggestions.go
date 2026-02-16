package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// TaskSuggestion represents a BeeBrain-generated task suggestion for a hive.
type TaskSuggestion struct {
	ID                  string     `json:"id"`
	TenantID            string     `json:"tenant_id"`
	HiveID              string     `json:"hive_id"`
	InspectionID        *string    `json:"inspection_id,omitempty"`
	SuggestedTemplateID *string    `json:"suggested_template_id,omitempty"`
	SuggestedTitle      string     `json:"suggested_title"`
	Reason              string     `json:"reason"`
	Priority            string     `json:"priority"`
	Status              string     `json:"status"`
	CreatedAt           time.Time  `json:"created_at"`
}

// CreateTaskSuggestionInput contains the fields needed to create a task suggestion.
type CreateTaskSuggestionInput struct {
	HiveID              string  `json:"hive_id"`
	InspectionID        *string `json:"inspection_id,omitempty"`
	SuggestedTemplateID *string `json:"suggested_template_id,omitempty"`
	SuggestedTitle      string  `json:"suggested_title"`
	Reason              string  `json:"reason"`
	Priority            string  `json:"priority"`
}

// ValidSuggestionStatuses contains the valid task suggestion status values.
var ValidSuggestionStatuses = []string{"pending", "accepted", "dismissed"}

// CreateTaskSuggestion creates a new task suggestion in the database.
func CreateTaskSuggestion(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateTaskSuggestionInput) (*TaskSuggestion, error) {
	// Set default priority if not provided
	priority := input.Priority
	if priority == "" {
		priority = "medium"
	}

	var suggestion TaskSuggestion
	err := conn.QueryRow(ctx,
		`INSERT INTO task_suggestions (tenant_id, hive_id, inspection_id, suggested_template_id, suggested_title, reason, priority)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, tenant_id, hive_id, inspection_id, suggested_template_id, suggested_title, reason, priority, status, created_at`,
		tenantID, input.HiveID, input.InspectionID, input.SuggestedTemplateID, input.SuggestedTitle, input.Reason, priority,
	).Scan(&suggestion.ID, &suggestion.TenantID, &suggestion.HiveID, &suggestion.InspectionID,
		&suggestion.SuggestedTemplateID, &suggestion.SuggestedTitle, &suggestion.Reason,
		&suggestion.Priority, &suggestion.Status, &suggestion.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create task suggestion: %w", err)
	}

	log.Info().
		Str("suggestion_id", suggestion.ID).
		Str("hive_id", suggestion.HiveID).
		Str("tenant_id", tenantID).
		Str("priority", priority).
		Msg("Task suggestion created")

	return &suggestion, nil
}

// ListTaskSuggestions returns task suggestions for a hive filtered by status.
// If status is empty, returns only pending suggestions.
// Sorted by priority (urgent > high > medium > low) then created_at DESC.
func ListTaskSuggestions(ctx context.Context, conn *pgxpool.Conn, hiveID string, status string) ([]TaskSuggestion, error) {
	// Default to pending status
	if status == "" {
		status = "pending"
	}

	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, hive_id, inspection_id, suggested_template_id, suggested_title, reason, priority, status, created_at
		 FROM task_suggestions
		 WHERE hive_id = $1 AND status = $2
		 ORDER BY
			CASE priority
				WHEN 'urgent' THEN 1
				WHEN 'high' THEN 2
				WHEN 'medium' THEN 3
				ELSE 4
			END,
			created_at DESC`,
		hiveID, status,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list task suggestions: %w", err)
	}
	defer rows.Close()

	suggestions := make([]TaskSuggestion, 0)
	for rows.Next() {
		var s TaskSuggestion
		err := rows.Scan(&s.ID, &s.TenantID, &s.HiveID, &s.InspectionID, &s.SuggestedTemplateID,
			&s.SuggestedTitle, &s.Reason, &s.Priority, &s.Status, &s.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan task suggestion: %w", err)
		}
		suggestions = append(suggestions, s)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating task suggestions: %w", err)
	}

	return suggestions, nil
}

// GetTaskSuggestionByID retrieves a task suggestion by its ID.
func GetTaskSuggestionByID(ctx context.Context, conn *pgxpool.Conn, suggestionID string) (*TaskSuggestion, error) {
	var s TaskSuggestion
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, hive_id, inspection_id, suggested_template_id, suggested_title, reason, priority, status, created_at
		 FROM task_suggestions
		 WHERE id = $1`,
		suggestionID,
	).Scan(&s.ID, &s.TenantID, &s.HiveID, &s.InspectionID, &s.SuggestedTemplateID,
		&s.SuggestedTitle, &s.Reason, &s.Priority, &s.Status, &s.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get task suggestion: %w", err)
	}

	return &s, nil
}

// UpdateTaskSuggestionStatus updates the status of a task suggestion.
// Valid statuses: "pending", "accepted", "dismissed"
func UpdateTaskSuggestionStatus(ctx context.Context, conn *pgxpool.Conn, suggestionID, status string) error {
	result, err := conn.Exec(ctx,
		`UPDATE task_suggestions SET status = $2 WHERE id = $1`,
		suggestionID, status,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to update task suggestion status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	log.Info().
		Str("suggestion_id", suggestionID).
		Str("new_status", status).
		Msg("Task suggestion status updated")

	return nil
}

// DeletePendingSuggestionsForHive removes all pending suggestions for a hive.
// This is called before generating new suggestions to replace old ones.
// Only affects suggestions with status='pending' (accepted/dismissed are preserved).
func DeletePendingSuggestionsForHive(ctx context.Context, conn *pgxpool.Conn, hiveID string) (int64, error) {
	result, err := conn.Exec(ctx,
		`DELETE FROM task_suggestions WHERE hive_id = $1 AND status = 'pending'`,
		hiveID,
	)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to delete pending suggestions: %w", err)
	}

	rowsDeleted := result.RowsAffected()

	log.Info().
		Str("hive_id", hiveID).
		Int64("deleted_count", rowsDeleted).
		Msg("Pending task suggestions deleted for hive")

	return rowsDeleted, nil
}

// GetSystemTemplateByType retrieves a system task template by its type.
// Used to map BeeBrain rule IDs to task templates.
func GetSystemTemplateByType(ctx context.Context, conn *pgxpool.Conn, templateType string) (*TaskTemplate, error) {
	var t TaskTemplate
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, type, name, description, auto_effects, is_system, created_at, created_by
		 FROM task_templates
		 WHERE type = $1 AND is_system = true
		 LIMIT 1`,
		templateType,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Description, &t.AutoEffects, &t.IsSystem, &t.CreatedAt, &t.CreatedBy)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get system template by type: %w", err)
	}

	return &t, nil
}
