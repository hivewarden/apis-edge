package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CreateTaskTemplateInput contains the fields needed to create a custom task template.
type CreateTaskTemplateInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

// ErrCannotDeleteSystemTemplate is returned when attempting to delete a system template.
var ErrCannotDeleteSystemTemplate = errors.New("cannot delete system template")

// ListTaskTemplates returns all task templates visible to the current tenant.
// This includes system templates (tenant_id IS NULL) and tenant-owned templates.
// Results are sorted with system templates first, then by created_at DESC.
func ListTaskTemplates(ctx context.Context, conn *pgxpool.Conn) ([]TaskTemplate, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, type, name, description, auto_effects, is_system, created_at, created_by
		 FROM task_templates
		 ORDER BY is_system DESC, created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list task templates: %w", err)
	}
	defer rows.Close()

	templates := make([]TaskTemplate, 0)
	for rows.Next() {
		var t TaskTemplate
		err := rows.Scan(
			&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Description,
			&t.AutoEffects, &t.IsSystem, &t.CreatedAt, &t.CreatedBy,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan task template: %w", err)
		}
		templates = append(templates, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating task templates: %w", err)
	}

	return templates, nil
}

// GetTaskTemplateByID retrieves a task template by its ID.
// Returns ErrNotFound if the template does not exist or is not visible to the tenant.
func GetTaskTemplateByID(ctx context.Context, conn *pgxpool.Conn, id string) (*TaskTemplate, error) {
	var t TaskTemplate
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, type, name, description, auto_effects, is_system, created_at, created_by
		 FROM task_templates
		 WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Description,
		&t.AutoEffects, &t.IsSystem, &t.CreatedAt, &t.CreatedBy)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get task template: %w", err)
	}

	return &t, nil
}

// CreateTaskTemplate creates a new custom task template for the current tenant.
// The template is automatically set to type='custom', is_system=false, and auto_effects=NULL.
func CreateTaskTemplate(ctx context.Context, conn *pgxpool.Conn, tenantID, userID string, input *CreateTaskTemplateInput) (*TaskTemplate, error) {
	var t TaskTemplate
	err := conn.QueryRow(ctx,
		`INSERT INTO task_templates (tenant_id, type, name, description, auto_effects, is_system, created_by)
		 VALUES ($1, 'custom', $2, $3, NULL, false, $4)
		 RETURNING id, tenant_id, type, name, description, auto_effects, is_system, created_at, created_by`,
		tenantID, input.Name, input.Description, userID,
	).Scan(&t.ID, &t.TenantID, &t.Type, &t.Name, &t.Description,
		&t.AutoEffects, &t.IsSystem, &t.CreatedAt, &t.CreatedBy)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create task template: %w", err)
	}

	return &t, nil
}

// DeleteTaskTemplate deletes a task template by its ID.
// Returns ErrCannotDeleteSystemTemplate if the template is a system template.
// Returns ErrNotFound if the template does not exist or belongs to a different tenant.
func DeleteTaskTemplate(ctx context.Context, conn *pgxpool.Conn, id string) error {
	// First, check if the template exists and whether it's a system template
	template, err := GetTaskTemplateByID(ctx, conn, id)
	if err != nil {
		return err // ErrNotFound or other error
	}

	if template.IsSystem {
		return ErrCannotDeleteSystemTemplate
	}

	// Delete the template
	result, err := conn.Exec(ctx, `DELETE FROM task_templates WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete task template: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}
