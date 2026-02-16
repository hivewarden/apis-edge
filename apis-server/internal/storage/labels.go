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

// ValidCategories defines the allowed label categories.
var ValidCategories = []string{"feed", "treatment", "equipment", "issue"}

// IsValidCategory checks if a category is valid.
func IsValidCategory(category string) bool {
	return slices.Contains(ValidCategories, category)
}

// CustomLabel represents a custom label in the database.
type CustomLabel struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	Category  string     `json:"category"`
	Name      string     `json:"name"`
	CreatedAt time.Time  `json:"created_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

// CreateLabelInput contains the fields needed to create a new label.
type CreateLabelInput struct {
	Category string `json:"category"`
	Name     string `json:"name"`
}

// UpdateLabelInput contains the fields that can be updated on a label.
type UpdateLabelInput struct {
	Name string `json:"name"`
}

// LabelUsageCount contains the usage count breakdown for a label.
type LabelUsageCount struct {
	Total      int `json:"count"`
	Treatments int `json:"treatments"`
	Feedings   int `json:"feedings"`
	Equipment  int `json:"equipment"`
}

// CreateLabel creates a new custom label in the database.
func CreateLabel(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateLabelInput) (*CustomLabel, error) {
	var label CustomLabel
	err := conn.QueryRow(ctx,
		`INSERT INTO custom_labels (tenant_id, category, name)
		 VALUES ($1, $2, $3)
		 RETURNING id, tenant_id, category, name, created_at, deleted_at`,
		tenantID, input.Category, input.Name,
	).Scan(&label.ID, &label.TenantID, &label.Category, &label.Name, &label.CreatedAt, &label.DeletedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create label: %w", err)
	}

	return &label, nil
}

// ListLabelsByCategory returns all active labels for a specific category.
func ListLabelsByCategory(ctx context.Context, conn *pgxpool.Conn, tenantID, category string) ([]CustomLabel, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, category, name, created_at, deleted_at
		 FROM custom_labels
		 WHERE tenant_id = $1 AND category = $2 AND deleted_at IS NULL
		 ORDER BY name ASC`,
		tenantID, category)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list labels by category: %w", err)
	}
	defer rows.Close()

	var labels []CustomLabel
	for rows.Next() {
		var l CustomLabel
		err := rows.Scan(&l.ID, &l.TenantID, &l.Category, &l.Name, &l.CreatedAt, &l.DeletedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan label: %w", err)
		}
		labels = append(labels, l)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating labels: %w", err)
	}

	return labels, nil
}

// ListAllLabels returns all active labels for a tenant, grouped by category.
func ListAllLabels(ctx context.Context, conn *pgxpool.Conn, tenantID string) (map[string][]CustomLabel, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, category, name, created_at, deleted_at
		 FROM custom_labels
		 WHERE tenant_id = $1 AND deleted_at IS NULL
		 ORDER BY category ASC, name ASC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list all labels: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]CustomLabel)
	// Initialize all categories with empty slices
	for _, cat := range ValidCategories {
		result[cat] = []CustomLabel{}
	}

	for rows.Next() {
		var l CustomLabel
		err := rows.Scan(&l.ID, &l.TenantID, &l.Category, &l.Name, &l.CreatedAt, &l.DeletedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan label: %w", err)
		}
		result[l.Category] = append(result[l.Category], l)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating labels: %w", err)
	}

	return result, nil
}

// GetLabelByID retrieves a label by its ID, scoped to the tenant for security.
func GetLabelByID(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) (*CustomLabel, error) {
	var label CustomLabel
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, category, name, created_at, deleted_at
		 FROM custom_labels
		 WHERE id = $1 AND tenant_id = $2`,
		id, tenantID,
	).Scan(&label.ID, &label.TenantID, &label.Category, &label.Name, &label.CreatedAt, &label.DeletedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get label: %w", err)
	}
	return &label, nil
}

// UpdateLabel updates the name of an existing label and cascades the rename
// to all historical records using that label (per AC #3).
// SECURITY FIX (DL-H02): Wrapped in a transaction so the label rename and
// cascade to historical records are atomic.
func UpdateLabel(ctx context.Context, conn *pgxpool.Conn, tenantID, id string, input *UpdateLabelInput) (*CustomLabel, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// First, get the current label to know the old name and category
	var oldName, category string
	err = tx.QueryRow(ctx,
		`SELECT name, category FROM custom_labels WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID,
	).Scan(&oldName, &category)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get label for update: %w", err)
	}

	// Update the label itself
	var label CustomLabel
	err = tx.QueryRow(ctx,
		`UPDATE custom_labels
		 SET name = $3
		 WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		 RETURNING id, tenant_id, category, name, created_at, deleted_at`,
		id, tenantID, input.Name,
	).Scan(&label.ID, &label.TenantID, &label.Category, &label.Name, &label.CreatedAt, &label.DeletedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update label: %w", err)
	}

	// Cascade rename to historical records within the same transaction
	if oldName != input.Name {
		if err := cascadeLabelRenameTx(ctx, tx, tenantID, category, oldName, input.Name); err != nil {
			return nil, fmt.Errorf("storage: failed to cascade label rename: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("storage: failed to commit label update: %w", err)
	}

	return &label, nil
}

// cascadeLabelRename updates all records using the old label name to the new name.
// Retained for backward compatibility with callers not using transactions.
func cascadeLabelRename(ctx context.Context, conn *pgxpool.Conn, tenantID, category, oldName, newName string) error {
	switch category {
	case "treatment":
		_, err := conn.Exec(ctx,
			`UPDATE treatments SET treatment_type = $3 WHERE tenant_id = $1 AND treatment_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update treatments: %w", err)
		}
	case "feed":
		_, err := conn.Exec(ctx,
			`UPDATE feedings SET feed_type = $3 WHERE tenant_id = $1 AND feed_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update feedings: %w", err)
		}
	case "equipment":
		_, err := conn.Exec(ctx,
			`UPDATE equipment_logs SET equipment_type = $3 WHERE tenant_id = $1 AND equipment_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update equipment_logs: %w", err)
		}
	case "issue":
		// Issue types may be used in inspections or other tables in the future
		// Currently no table stores issue types, so no cascade needed
	}
	return nil
}

// cascadeLabelRenameTx is the transaction-aware version of cascadeLabelRename.
func cascadeLabelRenameTx(ctx context.Context, tx pgx.Tx, tenantID, category, oldName, newName string) error {
	switch category {
	case "treatment":
		_, err := tx.Exec(ctx,
			`UPDATE treatments SET treatment_type = $3 WHERE tenant_id = $1 AND treatment_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update treatments: %w", err)
		}
	case "feed":
		_, err := tx.Exec(ctx,
			`UPDATE feedings SET feed_type = $3 WHERE tenant_id = $1 AND feed_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update feedings: %w", err)
		}
	case "equipment":
		_, err := tx.Exec(ctx,
			`UPDATE equipment_logs SET equipment_type = $3 WHERE tenant_id = $1 AND equipment_type = $2`,
			tenantID, oldName, newName)
		if err != nil {
			return fmt.Errorf("failed to update equipment_logs: %w", err)
		}
	case "issue":
		// Issue types may be used in inspections or other tables in the future
		// Currently no table stores issue types, so no cascade needed
	}
	return nil
}

// DeleteLabel soft deletes a label by setting deleted_at, scoped to tenant for security.
func DeleteLabel(ctx context.Context, conn *pgxpool.Conn, tenantID, id string) error {
	result, err := conn.Exec(ctx,
		`UPDATE custom_labels SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to delete label: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// GetLabelUsageCount counts how many records use a specific label name.
// It checks treatments, feedings, and equipment_logs tables.
func GetLabelUsageCount(ctx context.Context, conn *pgxpool.Conn, tenantID, labelName string) (*LabelUsageCount, error) {
	usage := &LabelUsageCount{}

	// Count treatments using this label
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM treatments WHERE tenant_id = $1 AND treatment_type = $2`,
		tenantID, labelName).Scan(&usage.Treatments)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count treatment usage: %w", err)
	}

	// Count feedings using this label
	err = conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM feedings WHERE tenant_id = $1 AND feed_type = $2`,
		tenantID, labelName).Scan(&usage.Feedings)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count feeding usage: %w", err)
	}

	// Count equipment logs using this label
	err = conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM equipment_logs WHERE tenant_id = $1 AND equipment_type = $2`,
		tenantID, labelName).Scan(&usage.Equipment)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count equipment usage: %w", err)
	}

	usage.Total = usage.Treatments + usage.Feedings + usage.Equipment

	return usage, nil
}
