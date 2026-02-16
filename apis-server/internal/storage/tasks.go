package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Task represents a task assigned to a hive.
type Task struct {
	ID                 string          `json:"id"`
	TenantID           string          `json:"tenant_id"`
	HiveID             string          `json:"hive_id"`
	TemplateID         *string         `json:"template_id,omitempty"`
	CustomTitle        *string         `json:"custom_title,omitempty"`
	Description        *string         `json:"description,omitempty"`
	Priority           string          `json:"priority"`
	DueDate            *time.Time      `json:"due_date,omitempty"`
	Status             string          `json:"status"`
	Source             string          `json:"source"`
	CreatedBy          string          `json:"created_by"`
	CreatedAt          time.Time       `json:"created_at"`
	CompletedBy        *string         `json:"completed_by,omitempty"`
	CompletedAt        *time.Time      `json:"completed_at,omitempty"`
	CompletionData     json.RawMessage `json:"completion_data,omitempty"`
	AutoAppliedChanges json.RawMessage `json:"auto_applied_changes,omitempty"`
}

// TaskTemplate represents a task template (system or custom).
type TaskTemplate struct {
	ID          string          `json:"id"`
	TenantID    *string         `json:"tenant_id,omitempty"`
	Type        string          `json:"type"`
	Name        string          `json:"name"`
	Description *string         `json:"description,omitempty"`
	AutoEffects json.RawMessage `json:"auto_effects,omitempty"`
	IsSystem    bool            `json:"is_system"`
	CreatedAt   time.Time       `json:"created_at"`
	CreatedBy   *string         `json:"created_by,omitempty"`
}

// TaskWithTemplate combines a Task with its template details (if any).
type TaskWithTemplate struct {
	Task
	TemplateName        *string         `json:"template_name,omitempty"`
	TemplateDescription *string         `json:"template_description,omitempty"`
	TemplateAutoEffects json.RawMessage `json:"template_auto_effects,omitempty"`
}

// TaskWithHive combines a Task with its hive name for display.
type TaskWithHive struct {
	Task
	HiveName     string  `json:"hive_name"`
	TemplateName *string `json:"template_name,omitempty"`
}

// CreateTaskInput contains the fields needed to create a new task.
type CreateTaskInput struct {
	HiveID      string     `json:"hive_id"`
	TemplateID  *string    `json:"template_id,omitempty"`
	CustomTitle *string    `json:"custom_title,omitempty"`
	Description *string    `json:"description,omitempty"`
	Priority    string     `json:"priority"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Source      string     `json:"source"` // "manual" or "beebrain"
}

// UpdateTaskInput contains the fields that can be updated on a task.
// Only these fields are updatable: priority, due_date, description, custom_title.
// hive_id, template_id, status cannot be changed (use CompleteTask for status).
type UpdateTaskInput struct {
	Priority    *string    `json:"priority,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Description *string    `json:"description,omitempty"`
	CustomTitle *string    `json:"custom_title,omitempty"`
}

// CompleteTaskInput contains the fields for completing a task.
type CompleteTaskInput struct {
	CompletionData json.RawMessage `json:"completion_data,omitempty"`
}

// TaskFilter contains filter parameters for listing tasks.
type TaskFilter struct {
	HiveID   *string `json:"hive_id,omitempty"`
	SiteID   *string `json:"site_id,omitempty"`
	Status   *string `json:"status,omitempty"`   // "pending" or "completed"
	Priority *string `json:"priority,omitempty"` // "low", "medium", "high", "urgent"
	Overdue  bool    `json:"overdue,omitempty"`
	Page     int     `json:"page,omitempty"`
	PerPage  int     `json:"per_page,omitempty"`
}

// TaskListResult contains the paginated list of tasks and metadata.
type TaskListResult struct {
	Tasks   []TaskWithHive `json:"tasks"`
	Total   int            `json:"total"`
	Page    int            `json:"page"`
	PerPage int            `json:"per_page"`
}

// TaskCountResult contains counts of open and overdue tasks for a hive.
// This is a public type used by the handlers package for API responses.
// Fields: OpenCount (pending tasks), OverdueCount (pending + past due_date).
type TaskCountResult struct {
	OpenCount    int `json:"open_count"`
	OverdueCount int `json:"overdue_count"`
}

// TaskStats contains aggregated task statistics for the navigation badge and alerts.
// Used by GET /api/tasks/stats endpoint (Epic 14, Story 14.14).
type TaskStats struct {
	TotalOpen   int `json:"total_open"`
	Overdue     int `json:"overdue"`
	DueToday    int `json:"due_today"`
	DueThisWeek int `json:"due_this_week"`
}

// ErrTaskAlreadyCompleted is returned when trying to complete an already completed task.
var ErrTaskAlreadyCompleted = errors.New("task is already completed")

// ValidPriorities contains the valid task priority values.
var ValidPriorities = []string{"low", "medium", "high", "urgent"}

// ValidTaskSources contains the valid task source values.
var ValidTaskSources = []string{"manual", "beebrain"}

// IsValidPriority checks if a priority value is valid.
func IsValidPriority(priority string) bool {
	for _, p := range ValidPriorities {
		if p == priority {
			return true
		}
	}
	return false
}

// ListTasks returns tasks filtered by the given criteria with pagination.
func ListTasks(ctx context.Context, conn *pgxpool.Conn, filter TaskFilter) (*TaskListResult, error) {
	// Build the WHERE clause dynamically
	var conditions []string
	var args []any
	argNum := 1

	// When filtering by site_id, add condition (hv join is always present in select query)
	if filter.SiteID != nil {
		conditions = append(conditions, fmt.Sprintf("hv.site_id = $%d", argNum))
		args = append(args, *filter.SiteID)
		argNum++
	}

	if filter.HiveID != nil {
		conditions = append(conditions, fmt.Sprintf("t.hive_id = $%d", argNum))
		args = append(args, *filter.HiveID)
		argNum++
	}

	if filter.Status != nil {
		conditions = append(conditions, fmt.Sprintf("t.status = $%d", argNum))
		args = append(args, *filter.Status)
		argNum++
	}

	if filter.Priority != nil {
		conditions = append(conditions, fmt.Sprintf("t.priority = $%d", argNum))
		args = append(args, *filter.Priority)
		argNum++
	}

	if filter.Overdue {
		conditions = append(conditions, "t.due_date < CURRENT_DATE AND t.status = 'pending'")
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Set pagination defaults
	page := filter.Page
	if page < 1 {
		page = 1
	}
	perPage := filter.PerPage
	if perPage < 1 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}
	offset := (page - 1) * perPage

	// Count total matching tasks
	// Need to join hives table if filtering by site_id
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM hive_tasks t
		LEFT JOIN hives hv ON t.hive_id = hv.id
		%s
	`, whereClause)
	var total int
	err := conn.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to count tasks: %w", err)
	}

	// Fetch tasks with hive name and template name
	// Sort by priority (urgent first) then due_date (soonest first, nulls last)
	// Note: hv JOIN may duplicate the hives join when site_id filter is used,
	// but PostgreSQL optimizes this. We always need hv for hive_name.
	selectQuery := fmt.Sprintf(`
		SELECT t.id, t.tenant_id, t.hive_id, t.template_id, t.custom_title, t.description,
			   t.priority, t.due_date, t.status, t.source, t.created_by, t.created_at,
			   t.completed_by, t.completed_at, t.completion_data, t.auto_applied_changes,
			   COALESCE(hv.name, '') as hive_name,
			   tt.name as template_name
		FROM hive_tasks t
		LEFT JOIN hives hv ON t.hive_id = hv.id
		LEFT JOIN task_templates tt ON t.template_id = tt.id
		%s
		ORDER BY
			CASE t.priority
				WHEN 'urgent' THEN 1
				WHEN 'high' THEN 2
				WHEN 'medium' THEN 3
				ELSE 4
			END,
			t.due_date NULLS LAST
		LIMIT $%d OFFSET $%d
	`, whereClause, argNum, argNum+1)

	args = append(args, perPage, offset)

	rows, err := conn.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]TaskWithHive, 0)
	for rows.Next() {
		var t TaskWithHive
		err := rows.Scan(
			&t.ID, &t.TenantID, &t.HiveID, &t.TemplateID, &t.CustomTitle, &t.Description,
			&t.Priority, &t.DueDate, &t.Status, &t.Source, &t.CreatedBy, &t.CreatedAt,
			&t.CompletedBy, &t.CompletedAt, &t.CompletionData, &t.AutoAppliedChanges,
			&t.HiveName, &t.TemplateName,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan task: %w", err)
		}
		tasks = append(tasks, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating tasks: %w", err)
	}

	return &TaskListResult{
		Tasks:   tasks,
		Total:   total,
		Page:    page,
		PerPage: perPage,
	}, nil
}

// CreateTask creates a new task in the database.
func CreateTask(ctx context.Context, conn *pgxpool.Conn, tenantID, userID string, input *CreateTaskInput) (*Task, error) {
	// Set default source if not provided
	source := input.Source
	if source == "" {
		source = "manual"
	}

	// Set default priority if not provided
	priority := input.Priority
	if priority == "" {
		priority = "medium"
	}

	var task Task
	err := conn.QueryRow(ctx,
		`INSERT INTO hive_tasks (tenant_id, hive_id, template_id, custom_title, description, priority, due_date, source, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, tenant_id, hive_id, template_id, custom_title, description, priority, due_date, status, source, created_by, created_at, completed_by, completed_at, completion_data, auto_applied_changes`,
		tenantID, input.HiveID, input.TemplateID, input.CustomTitle, input.Description, priority, input.DueDate, source, userID,
	).Scan(&task.ID, &task.TenantID, &task.HiveID, &task.TemplateID, &task.CustomTitle, &task.Description,
		&task.Priority, &task.DueDate, &task.Status, &task.Source, &task.CreatedBy, &task.CreatedAt,
		&task.CompletedBy, &task.CompletedAt, &task.CompletionData, &task.AutoAppliedChanges)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create task: %w", err)
	}

	log.Info().
		Str("task_id", task.ID).
		Str("hive_id", task.HiveID).
		Str("tenant_id", tenantID).
		Msg("Task created")

	return &task, nil
}

// CreateTasksBulk creates multiple tasks in a single transaction.
// Returns the number of tasks created and the list of created tasks.
func CreateTasksBulk(ctx context.Context, conn *pgxpool.Conn, tenantID, userID string, inputs []CreateTaskInput) (int, []Task, error) {
	if len(inputs) == 0 {
		return 0, nil, nil
	}

	if len(inputs) > 500 {
		return 0, nil, fmt.Errorf("storage: bulk create exceeds limit of 500 tasks (got %d)", len(inputs))
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, nil, fmt.Errorf("storage: failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	tasks := make([]Task, 0, len(inputs))
	for _, input := range inputs {
		// Set defaults
		source := input.Source
		if source == "" {
			source = "manual"
		}
		priority := input.Priority
		if priority == "" {
			priority = "medium"
		}

		var task Task
		err := tx.QueryRow(ctx,
			`INSERT INTO hive_tasks (tenant_id, hive_id, template_id, custom_title, description, priority, due_date, source, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id, tenant_id, hive_id, template_id, custom_title, description, priority, due_date, status, source, created_by, created_at, completed_by, completed_at, completion_data, auto_applied_changes`,
			tenantID, input.HiveID, input.TemplateID, input.CustomTitle, input.Description, priority, input.DueDate, source, userID,
		).Scan(&task.ID, &task.TenantID, &task.HiveID, &task.TemplateID, &task.CustomTitle, &task.Description,
			&task.Priority, &task.DueDate, &task.Status, &task.Source, &task.CreatedBy, &task.CreatedAt,
			&task.CompletedBy, &task.CompletedAt, &task.CompletionData, &task.AutoAppliedChanges)

		if err != nil {
			return 0, nil, fmt.Errorf("storage: failed to create task in bulk: %w", err)
		}
		tasks = append(tasks, task)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, nil, fmt.Errorf("storage: failed to commit bulk create: %w", err)
	}

	log.Info().
		Int("count", len(tasks)).
		Str("tenant_id", tenantID).
		Msg("Tasks created in bulk")

	return len(tasks), tasks, nil
}

// GetTaskByID retrieves a task by its ID with template details populated.
func GetTaskByID(ctx context.Context, conn *pgxpool.Conn, id string) (*TaskWithTemplate, error) {
	var t TaskWithTemplate
	err := conn.QueryRow(ctx,
		`SELECT t.id, t.tenant_id, t.hive_id, t.template_id, t.custom_title, t.description,
			    t.priority, t.due_date, t.status, t.source, t.created_by, t.created_at,
			    t.completed_by, t.completed_at, t.completion_data, t.auto_applied_changes,
			    tt.name as template_name, tt.description as template_description, tt.auto_effects as template_auto_effects
		 FROM hive_tasks t
		 LEFT JOIN task_templates tt ON t.template_id = tt.id
		 WHERE t.id = $1`,
		id,
	).Scan(&t.ID, &t.TenantID, &t.HiveID, &t.TemplateID, &t.CustomTitle, &t.Description,
		&t.Priority, &t.DueDate, &t.Status, &t.Source, &t.CreatedBy, &t.CreatedAt,
		&t.CompletedBy, &t.CompletedAt, &t.CompletionData, &t.AutoAppliedChanges,
		&t.TemplateName, &t.TemplateDescription, &t.TemplateAutoEffects)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get task: %w", err)
	}

	return &t, nil
}

// UpdateTask updates an existing task.
// Only priority, due_date, description, and custom_title can be updated.
func UpdateTask(ctx context.Context, conn *pgxpool.Conn, id string, input *UpdateTaskInput) (*Task, error) {
	// Build update query dynamically
	var setClauses []string
	var args []any
	argNum := 1

	if input.Priority != nil {
		setClauses = append(setClauses, fmt.Sprintf("priority = $%d", argNum))
		args = append(args, *input.Priority)
		argNum++
	}

	if input.DueDate != nil {
		setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", argNum))
		args = append(args, *input.DueDate)
		argNum++
	}

	if input.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argNum))
		args = append(args, *input.Description)
		argNum++
	}

	if input.CustomTitle != nil {
		setClauses = append(setClauses, fmt.Sprintf("custom_title = $%d", argNum))
		args = append(args, *input.CustomTitle)
		argNum++
	}

	if len(setClauses) == 0 {
		// Nothing to update, just return the current task
		task, err := GetTaskByID(ctx, conn, id)
		if err != nil {
			return nil, err
		}
		return &task.Task, nil
	}

	args = append(args, id)
	query := fmt.Sprintf(`
		UPDATE hive_tasks
		SET %s
		WHERE id = $%d
		RETURNING id, tenant_id, hive_id, template_id, custom_title, description, priority, due_date, status, source, created_by, created_at, completed_by, completed_at, completion_data, auto_applied_changes
	`, strings.Join(setClauses, ", "), argNum)

	var task Task
	err := conn.QueryRow(ctx, query, args...).Scan(
		&task.ID, &task.TenantID, &task.HiveID, &task.TemplateID, &task.CustomTitle, &task.Description,
		&task.Priority, &task.DueDate, &task.Status, &task.Source, &task.CreatedBy, &task.CreatedAt,
		&task.CompletedBy, &task.CompletedAt, &task.CompletionData, &task.AutoAppliedChanges,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to update task: %w", err)
	}

	return &task, nil
}

// DeleteTask permanently removes a task.
func DeleteTask(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM hive_tasks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete task: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// CompleteTask marks a task as completed.
func CompleteTask(ctx context.Context, conn *pgxpool.Conn, id, userID string, completionData json.RawMessage) (*Task, error) {
	// First check if task exists and is not already completed
	var currentStatus string
	err := conn.QueryRow(ctx, `SELECT status FROM hive_tasks WHERE id = $1`, id).Scan(&currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to check task status: %w", err)
	}

	if currentStatus == "completed" {
		return nil, ErrTaskAlreadyCompleted
	}

	// Complete the task
	var task Task
	err = conn.QueryRow(ctx,
		`UPDATE hive_tasks
		 SET status = 'completed', completed_by = $2, completed_at = NOW(), completion_data = $3
		 WHERE id = $1
		 RETURNING id, tenant_id, hive_id, template_id, custom_title, description, priority, due_date, status, source, created_by, created_at, completed_by, completed_at, completion_data, auto_applied_changes`,
		id, userID, completionData,
	).Scan(&task.ID, &task.TenantID, &task.HiveID, &task.TemplateID, &task.CustomTitle, &task.Description,
		&task.Priority, &task.DueDate, &task.Status, &task.Source, &task.CreatedBy, &task.CreatedAt,
		&task.CompletedBy, &task.CompletedAt, &task.CompletionData, &task.AutoAppliedChanges)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to complete task: %w", err)
	}

	log.Info().
		Str("task_id", task.ID).
		Str("completed_by", userID).
		Msg("Task completed")

	return &task, nil
}

// ListTasksByHive returns tasks for a specific hive, sorted by priority then due_date.
func ListTasksByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string, status *string) ([]TaskWithHive, error) {
	// First verify the hive exists
	var exists bool
	err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM hives WHERE id = $1)`, hiveID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to check hive: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	// Default to pending status
	statusFilter := "pending"
	if status != nil {
		statusFilter = *status
	}

	rows, err := conn.Query(ctx,
		`SELECT t.id, t.tenant_id, t.hive_id, t.template_id, t.custom_title, t.description,
			    t.priority, t.due_date, t.status, t.source, t.created_by, t.created_at,
			    t.completed_by, t.completed_at, t.completion_data, t.auto_applied_changes,
			    h.name as hive_name, tt.name as template_name
		 FROM hive_tasks t
		 JOIN hives h ON t.hive_id = h.id
		 LEFT JOIN task_templates tt ON t.template_id = tt.id
		 WHERE t.hive_id = $1 AND t.status = $2
		 ORDER BY
			CASE t.priority
				WHEN 'urgent' THEN 1
				WHEN 'high' THEN 2
				WHEN 'medium' THEN 3
				ELSE 4
			END,
			t.due_date NULLS LAST`,
		hiveID, statusFilter,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list tasks by hive: %w", err)
	}
	defer rows.Close()

	tasks := make([]TaskWithHive, 0)
	for rows.Next() {
		var t TaskWithHive
		err := rows.Scan(
			&t.ID, &t.TenantID, &t.HiveID, &t.TemplateID, &t.CustomTitle, &t.Description,
			&t.Priority, &t.DueDate, &t.Status, &t.Source, &t.CreatedBy, &t.CreatedAt,
			&t.CompletedBy, &t.CompletedAt, &t.CompletionData, &t.AutoAppliedChanges,
			&t.HiveName, &t.TemplateName,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan task: %w", err)
		}
		tasks = append(tasks, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating tasks: %w", err)
	}

	return tasks, nil
}

// ListOverdueTasks returns all overdue pending tasks for the tenant with hive info.
func ListOverdueTasks(ctx context.Context, conn *pgxpool.Conn) ([]TaskWithHive, error) {
	rows, err := conn.Query(ctx,
		`SELECT t.id, t.tenant_id, t.hive_id, t.template_id, t.custom_title, t.description,
			    t.priority, t.due_date, t.status, t.source, t.created_by, t.created_at,
			    t.completed_by, t.completed_at, t.completion_data, t.auto_applied_changes,
			    h.name as hive_name, tt.name as template_name
		 FROM hive_tasks t
		 JOIN hives h ON t.hive_id = h.id
		 LEFT JOIN task_templates tt ON t.template_id = tt.id
		 WHERE t.status = 'pending' AND t.due_date < CURRENT_DATE
		 ORDER BY t.due_date ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list overdue tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]TaskWithHive, 0)
	for rows.Next() {
		var t TaskWithHive
		err := rows.Scan(
			&t.ID, &t.TenantID, &t.HiveID, &t.TemplateID, &t.CustomTitle, &t.Description,
			&t.Priority, &t.DueDate, &t.Status, &t.Source, &t.CreatedBy, &t.CreatedAt,
			&t.CompletedBy, &t.CompletedAt, &t.CompletionData, &t.AutoAppliedChanges,
			&t.HiveName, &t.TemplateName,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan task: %w", err)
		}
		tasks = append(tasks, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating overdue tasks: %w", err)
	}

	return tasks, nil
}

// GetTaskCountByHive returns counts of open and overdue tasks for a hive.
// Requires tenant_id to ensure proper tenant isolation.
func GetTaskCountByHive(ctx context.Context, conn *pgxpool.Conn, tenantID, hiveID string) (*TaskCountResult, error) {
	var openCount, overdueCount int

	err := conn.QueryRow(ctx,
		`SELECT
			COUNT(*) FILTER (WHERE status = 'pending') as open_count,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) as overdue_count
		 FROM hive_tasks
		 WHERE hive_id = $1 AND tenant_id = $2`,
		hiveID, tenantID,
	).Scan(&openCount, &overdueCount)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to count tasks: %w", err)
	}

	return &TaskCountResult{
		OpenCount:    openCount,
		OverdueCount: overdueCount,
	}, nil
}

// GetTaskCountsForHives returns task counts for multiple hives in a single batch query.
// This is optimized to avoid N+1 queries when enriching hive list responses.
// Requires tenant_id to ensure proper tenant isolation.
func GetTaskCountsForHives(ctx context.Context, conn *pgxpool.Conn, tenantID string, hiveIDs []string) (map[string]*TaskCountResult, error) {
	if len(hiveIDs) == 0 {
		return make(map[string]*TaskCountResult), nil
	}

	rows, err := conn.Query(ctx,
		`SELECT
			hive_id,
			COUNT(*) FILTER (WHERE status = 'pending') as open_count,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) as overdue_count
		 FROM hive_tasks
		 WHERE hive_id = ANY($1) AND tenant_id = $2
		 GROUP BY hive_id`,
		hiveIDs, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to batch count tasks: %w", err)
	}
	defer rows.Close()

	results := make(map[string]*TaskCountResult)
	for rows.Next() {
		var hiveID string
		var openCount, overdueCount int
		if err := rows.Scan(&hiveID, &openCount, &overdueCount); err != nil {
			return nil, fmt.Errorf("storage: failed to scan task count: %w", err)
		}
		results[hiveID] = &TaskCountResult{
			OpenCount:    openCount,
			OverdueCount: overdueCount,
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating task counts: %w", err)
	}

	return results, nil
}

// UpdateTaskAutoAppliedChanges updates only the auto_applied_changes field on a task.
// This is used after processing auto-effects to store the result.
func UpdateTaskAutoAppliedChanges(ctx context.Context, conn *pgxpool.Conn, taskID string, changes json.RawMessage) error {
	result, err := conn.Exec(ctx,
		`UPDATE hive_tasks SET auto_applied_changes = $2 WHERE id = $1`,
		taskID, changes)
	if err != nil {
		return fmt.Errorf("storage: failed to update task auto_applied_changes: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	log.Info().
		Str("task_id", taskID).
		Msg("Task auto_applied_changes updated")

	return nil
}

// GetTaskStats returns aggregated task statistics for the tenant.
// Counts total open, overdue, due today, and due this week tasks.
// Used for navigation badge and overdue alerts (Epic 14, Story 14.14).
func GetTaskStats(ctx context.Context, conn *pgxpool.Conn, tenantID string) (*TaskStats, error) {
	var stats TaskStats

	// Note: due_this_week INCLUDES today (overlaps with due_today by design).
	// This is intentional - "this week" represents the full 7-day window starting from today.
	// Also note: tasks with NULL due_date are NOT counted as overdue because
	// `due_date < CURRENT_DATE` returns NULL for NULL dates (not true).
	err := conn.QueryRow(ctx,
		`SELECT
			COUNT(*) FILTER (WHERE status = 'pending') as total_open,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) as overdue,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date = CURRENT_DATE) as due_today,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as due_this_week
		 FROM hive_tasks
		 WHERE tenant_id = $1`,
		tenantID,
	).Scan(&stats.TotalOpen, &stats.Overdue, &stats.DueToday, &stats.DueThisWeek)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to get task stats: %w", err)
	}

	log.Debug().
		Str("tenant_id", tenantID).
		Int("overdue_count", stats.Overdue).
		Msg("Task stats retrieved")

	return &stats, nil
}

// TemplateExists checks if a task template exists by ID.
func TemplateExists(ctx context.Context, conn *pgxpool.Conn, id string) (bool, error) {
	var exists bool
	err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM task_templates WHERE id = $1)`, id).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("storage: failed to check template existence: %w", err)
	}
	return exists, nil
}

// HivesExist checks if all provided hive IDs exist.
// Returns a list of IDs that do NOT exist, or nil if all exist.
func HivesExist(ctx context.Context, conn *pgxpool.Conn, hiveIDs []string) ([]string, error) {
	if len(hiveIDs) == 0 {
		return nil, nil
	}

	// Build query with placeholders
	placeholders := make([]string, len(hiveIDs))
	args := make([]any, len(hiveIDs))
	for i, id := range hiveIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT ARRAY_AGG(id) FROM UNNEST(ARRAY[%s]::text[]) AS id WHERE id NOT IN (SELECT id FROM hives)`,
		strings.Join(placeholders, ","),
	)

	var missingIDs []string
	err := conn.QueryRow(ctx, query, args...).Scan(&missingIDs)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to check hive existence: %w", err)
	}

	return missingIDs, nil
}
