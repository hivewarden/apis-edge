// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// TaskResponse represents a task in API responses.
type TaskResponse struct {
	ID                  string           `json:"id"`
	HiveID              string           `json:"hive_id"`
	Title               string           `json:"title"`
	TemplateID          *string          `json:"template_id,omitempty"`
	CustomTitle         *string          `json:"custom_title,omitempty"`
	Description         *string          `json:"description,omitempty"`
	Priority            string           `json:"priority"`
	DueDate             *string          `json:"due_date,omitempty"`
	Status              string           `json:"status"`
	Source              string           `json:"source"`
	CreatedBy           string           `json:"created_by"`
	CreatedAt           time.Time        `json:"created_at"`
	CompletedBy         *string          `json:"completed_by,omitempty"`
	CompletedAt         *time.Time       `json:"completed_at,omitempty"`
	CompletionData      json.RawMessage  `json:"completion_data,omitempty"`
	AutoAppliedChanges  json.RawMessage  `json:"auto_applied_changes,omitempty"`
	HiveName            *string          `json:"hive_name,omitempty"`
	TemplateName        *string          `json:"template_name,omitempty"`
	TemplateDescription *string          `json:"template_description,omitempty"`
	TemplateAutoEffects json.RawMessage  `json:"template_auto_effects,omitempty"`
}

// TasksListResponse represents the list tasks API response.
type TasksListResponse struct {
	Data []TaskResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// TaskDataResponse represents a single task API response.
type TaskDataResponse struct {
	Data TaskResponse `json:"data"`
}

// BulkCreateTasksResponse represents the bulk create tasks API response.
type BulkCreateTasksResponse struct {
	Data struct {
		Created int            `json:"created"`
		Tasks   []TaskResponse `json:"tasks"`
	} `json:"data"`
}

// CreateTaskRequest represents the request body for creating a single task.
type CreateTaskRequest struct {
	HiveID      string  `json:"hive_id"`
	TemplateID  *string `json:"template_id,omitempty"`
	CustomTitle *string `json:"custom_title,omitempty"`
	Description *string `json:"description,omitempty"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"due_date,omitempty"`
}

// BulkCreateTasksRequest represents the request body for bulk creating tasks.
// Supports two formats:
// 1. Individual tasks array: {"tasks": [...]}
// 2. Shared task data with hive_ids: {"hive_ids": [...], "template_id": "...", "priority": "..."}
type BulkCreateTasksRequest struct {
	// Format 1: Individual tasks
	Tasks []CreateTaskRequest `json:"tasks,omitempty"`

	// Format 2: Shared task data
	HiveIDs     []string `json:"hive_ids,omitempty"`
	TemplateID  *string  `json:"template_id,omitempty"`
	CustomTitle *string  `json:"custom_title,omitempty"`
	Description *string  `json:"description,omitempty"`
	Priority    string   `json:"priority,omitempty"`
	DueDate     *string  `json:"due_date,omitempty"`
}

// UpdateTaskRequest represents the request body for updating a task.
type UpdateTaskRequest struct {
	Priority    *string `json:"priority,omitempty"`
	DueDate     *string `json:"due_date,omitempty"`
	Description *string `json:"description,omitempty"`
	CustomTitle *string `json:"custom_title,omitempty"`
}

// CompleteTaskRequest represents the request body for completing a task.
type CompleteTaskRequest struct {
	CompletionData json.RawMessage `json:"completion_data,omitempty"`
}

// computeTitle returns the display title for a task.
// Priority: custom_title > template_name > "Untitled".
func computeTitle(customTitle *string, templateName *string) string {
	if customTitle != nil && *customTitle != "" {
		return *customTitle
	}
	if templateName != nil && *templateName != "" {
		return *templateName
	}
	return "Untitled"
}

// taskToResponse converts a storage.Task to a TaskResponse.
func taskToResponse(task *storage.Task) TaskResponse {
	resp := TaskResponse{
		ID:                 task.ID,
		HiveID:             task.HiveID,
		Title:              computeTitle(task.CustomTitle, nil),
		TemplateID:         task.TemplateID,
		CustomTitle:        task.CustomTitle,
		Description:        task.Description,
		Priority:           task.Priority,
		Status:             task.Status,
		Source:             task.Source,
		CreatedBy:          task.CreatedBy,
		CreatedAt:          task.CreatedAt,
		CompletedBy:        task.CompletedBy,
		CompletedAt:        task.CompletedAt,
		CompletionData:     task.CompletionData,
		AutoAppliedChanges: task.AutoAppliedChanges,
	}
	if task.DueDate != nil {
		dateStr := task.DueDate.Format("2006-01-02")
		resp.DueDate = &dateStr
	}
	return resp
}

// taskWithHiveToResponse converts a storage.TaskWithHive to a TaskResponse.
func taskWithHiveToResponse(task *storage.TaskWithHive) TaskResponse {
	resp := taskToResponse(&task.Task)
	resp.Title = computeTitle(task.CustomTitle, task.TemplateName)
	if task.HiveName != "" {
		resp.HiveName = &task.HiveName
	}
	resp.TemplateName = task.TemplateName
	return resp
}

// taskWithTemplateToResponse converts a storage.TaskWithTemplate to a TaskResponse.
func taskWithTemplateToResponse(task *storage.TaskWithTemplate) TaskResponse {
	resp := taskToResponse(&task.Task)
	resp.Title = computeTitle(task.CustomTitle, task.TemplateName)
	resp.TemplateName = task.TemplateName
	resp.TemplateDescription = task.TemplateDescription
	resp.TemplateAutoEffects = task.TemplateAutoEffects
	return resp
}

// ListTasks handles GET /api/tasks - returns tasks with filtering and pagination.
func ListTasks(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	filter := storage.TaskFilter{}

	if hiveID := r.URL.Query().Get("hive_id"); hiveID != "" {
		filter.HiveID = &hiveID
	}
	if siteID := r.URL.Query().Get("site_id"); siteID != "" {
		filter.SiteID = &siteID
	}
	if status := r.URL.Query().Get("status"); status != "" {
		if status != "pending" && status != "completed" {
			respondError(w, "Invalid status. Must be 'pending' or 'completed'", http.StatusBadRequest)
			return
		}
		filter.Status = &status
	}
	if priority := r.URL.Query().Get("priority"); priority != "" {
		if !storage.IsValidPriority(priority) {
			respondError(w, "Invalid priority. Must be 'low', 'medium', 'high', or 'urgent'", http.StatusBadRequest)
			return
		}
		filter.Priority = &priority
	}
	if r.URL.Query().Get("overdue") == "true" {
		filter.Overdue = true
	}

	// Parse pagination
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		page, err := strconv.Atoi(pageStr)
		if err != nil || page < 1 {
			respondError(w, "Invalid page parameter", http.StatusBadRequest)
			return
		}
		filter.Page = page
	}
	if perPageStr := r.URL.Query().Get("per_page"); perPageStr != "" {
		perPage, err := strconv.Atoi(perPageStr)
		if err != nil || perPage < 1 || perPage > 100 {
			respondError(w, "Invalid per_page parameter (1-100)", http.StatusBadRequest)
			return
		}
		filter.PerPage = perPage
	}

	result, err := storage.ListTasks(r.Context(), conn, filter)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list tasks")
		respondError(w, "Failed to list tasks", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	taskResponses := make([]TaskResponse, 0, len(result.Tasks))
	for _, task := range result.Tasks {
		taskResponses = append(taskResponses, taskWithHiveToResponse(&task))
	}

	respondJSON(w, TasksListResponse{
		Data: taskResponses,
		Meta: MetaResponse{
			Total:   result.Total,
			Page:    result.Page,
			PerPage: result.PerPage,
		},
	}, http.StatusOK)
}

// CreateTask handles POST /api/tasks - creates a single task or bulk creates multiple tasks.
func CreateTask(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	claims := middleware.GetClaims(r.Context())
	userID := claims.UserID

	// Try to detect if this is a bulk request or single request
	var rawBody json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&rawBody); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Try to unmarshal as bulk request first
	var bulkReq BulkCreateTasksRequest
	if err := json.Unmarshal(rawBody, &bulkReq); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Check if this is a bulk request (has tasks array or hive_ids array)
	if len(bulkReq.Tasks) > 0 || len(bulkReq.HiveIDs) > 0 {
		createBulkTasks(w, r, tenantID, userID, &bulkReq)
		return
	}

	// Otherwise, treat as single task creation
	var req CreateTaskRequest
	if err := json.Unmarshal(rawBody, &req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	createSingleTask(w, r, tenantID, userID, &req)
}

// createSingleTask creates a single task.
func createSingleTask(w http.ResponseWriter, r *http.Request, tenantID, userID string, req *CreateTaskRequest) {
	poolConn := storage.RequireConn(r.Context())

	// Validate required fields
	if req.HiveID == "" {
		respondError(w, "hive_id is required", http.StatusBadRequest)
		return
	}

	// Must have either template_id or custom_title
	if req.TemplateID == nil && req.CustomTitle == nil {
		respondError(w, "Either template_id or custom_title is required", http.StatusBadRequest)
		return
	}

	// Validate priority
	if req.Priority != "" && !storage.IsValidPriority(req.Priority) {
		respondError(w, "Invalid priority. Must be 'low', 'medium', 'high', or 'urgent'", http.StatusBadRequest)
		return
	}

	// Validate hive exists
	_, err := storage.GetHiveByID(r.Context(), poolConn, req.HiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", req.HiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to validate hive", http.StatusInternalServerError)
		return
	}

	// Validate template exists if provided
	if req.TemplateID != nil && *req.TemplateID != "" {
		exists, err := storage.TemplateExists(r.Context(), poolConn, *req.TemplateID)
		if err != nil {
			log.Error().Err(err).Str("template_id", *req.TemplateID).Msg("handler: failed to check template")
			respondError(w, "Failed to validate template", http.StatusInternalServerError)
			return
		}
		if !exists {
			respondError(w, "Template not found", http.StatusNotFound)
			return
		}
	}

	// Parse due date if provided
	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			respondError(w, "Invalid due_date format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		dueDate = &t
	}

	input := &storage.CreateTaskInput{
		HiveID:      req.HiveID,
		TemplateID:  req.TemplateID,
		CustomTitle: req.CustomTitle,
		Description: req.Description,
		Priority:    req.Priority,
		DueDate:     dueDate,
		Source:      "manual",
	}

	task, err := storage.CreateTask(r.Context(), poolConn, tenantID, userID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create task")
		respondError(w, "Failed to create task", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("task_id", task.ID).
		Str("hive_id", task.HiveID).
		Str("tenant_id", tenantID).
		Msg("Task created")

	// Audit log: record task creation
	AuditCreate(r.Context(), "hive_tasks", task.ID, task)

	respondJSON(w, TaskDataResponse{Data: taskToResponse(task)}, http.StatusCreated)
}

// createBulkTasks creates multiple tasks in a transaction.
func createBulkTasks(w http.ResponseWriter, r *http.Request, tenantID, userID string, req *BulkCreateTasksRequest) {
	poolConn := storage.RequireConn(r.Context())

	var inputs []storage.CreateTaskInput

	// Format 1: Individual tasks array
	if len(req.Tasks) > 0 {
		if len(req.Tasks) > 500 {
			respondError(w, "Bulk create exceeds limit of 500 tasks", http.StatusBadRequest)
			return
		}

		for i, task := range req.Tasks {
			// Validate each task
			if task.HiveID == "" {
				respondError(w, "hive_id is required for task at index "+strconv.Itoa(i), http.StatusBadRequest)
				return
			}
			if task.TemplateID == nil && task.CustomTitle == nil {
				respondError(w, "Either template_id or custom_title is required for task at index "+strconv.Itoa(i), http.StatusBadRequest)
				return
			}
			if task.Priority != "" && !storage.IsValidPriority(task.Priority) {
				respondError(w, "Invalid priority for task at index "+strconv.Itoa(i), http.StatusBadRequest)
				return
			}

			var dueDate *time.Time
			if task.DueDate != nil && *task.DueDate != "" {
				t, err := time.Parse("2006-01-02", *task.DueDate)
				if err != nil {
					respondError(w, "Invalid due_date format for task at index "+strconv.Itoa(i)+". Use YYYY-MM-DD", http.StatusBadRequest)
					return
				}
				dueDate = &t
			}

			inputs = append(inputs, storage.CreateTaskInput{
				HiveID:      task.HiveID,
				TemplateID:  task.TemplateID,
				CustomTitle: task.CustomTitle,
				Description: task.Description,
				Priority:    task.Priority,
				DueDate:     dueDate,
				Source:      "manual",
			})
		}
	} else if len(req.HiveIDs) > 0 {
		// Format 2: Shared task data with hive_ids
		if len(req.HiveIDs) > 500 {
			respondError(w, "Bulk create exceeds limit of 500 tasks", http.StatusBadRequest)
			return
		}

		// Must have either template_id or custom_title
		if req.TemplateID == nil && req.CustomTitle == nil {
			respondError(w, "Either template_id or custom_title is required", http.StatusBadRequest)
			return
		}

		if req.Priority != "" && !storage.IsValidPriority(req.Priority) {
			respondError(w, "Invalid priority", http.StatusBadRequest)
			return
		}

		var dueDate *time.Time
		if req.DueDate != nil && *req.DueDate != "" {
			t, err := time.Parse("2006-01-02", *req.DueDate)
			if err != nil {
				respondError(w, "Invalid due_date format. Use YYYY-MM-DD", http.StatusBadRequest)
				return
			}
			dueDate = &t
		}

		for _, hiveID := range req.HiveIDs {
			inputs = append(inputs, storage.CreateTaskInput{
				HiveID:      hiveID,
				TemplateID:  req.TemplateID,
				CustomTitle: req.CustomTitle,
				Description: req.Description,
				Priority:    req.Priority,
				DueDate:     dueDate,
				Source:      "manual",
			})
		}
	}

	if len(inputs) == 0 {
		respondError(w, "No tasks to create. Provide 'tasks' array or 'hive_ids' array", http.StatusBadRequest)
		return
	}

	// Collect all unique hive IDs to validate
	hiveIDSet := make(map[string]struct{})
	for _, input := range inputs {
		hiveIDSet[input.HiveID] = struct{}{}
	}
	hiveIDs := make([]string, 0, len(hiveIDSet))
	for id := range hiveIDSet {
		hiveIDs = append(hiveIDs, id)
	}

	// Validate all hive IDs exist
	missingHiveIDs, err := storage.HivesExist(r.Context(), poolConn, hiveIDs)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to validate hive IDs")
		respondError(w, "Failed to validate hive IDs", http.StatusInternalServerError)
		return
	}
	if len(missingHiveIDs) > 0 {
		respondError(w, "Invalid hive_ids: "+strings.Join(missingHiveIDs, ", "), http.StatusBadRequest)
		return
	}

	count, tasks, err := storage.CreateTasksBulk(r.Context(), poolConn, tenantID, userID, inputs)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Int("count", len(inputs)).Msg("handler: failed to bulk create tasks")
		respondError(w, "Failed to create tasks", http.StatusInternalServerError)
		return
	}

	log.Info().
		Int("count", count).
		Str("tenant_id", tenantID).
		Msg("Tasks created in bulk")

	// Convert to response format
	taskResponses := make([]TaskResponse, 0, len(tasks))
	for _, task := range tasks {
		taskResponses = append(taskResponses, taskToResponse(&task))
	}

	resp := BulkCreateTasksResponse{}
	resp.Data.Created = count
	resp.Data.Tasks = taskResponses

	respondJSON(w, resp, http.StatusCreated)
}

// GetTask handles GET /api/tasks/{id} - returns a single task with template details.
func GetTask(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	taskID := chi.URLParam(r, "id")

	if taskID == "" {
		respondError(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	task, err := storage.GetTaskByID(r.Context(), conn, taskID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Task not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to get task")
		respondError(w, "Failed to get task", http.StatusInternalServerError)
		return
	}

	respondJSON(w, TaskDataResponse{Data: taskWithTemplateToResponse(task)}, http.StatusOK)
}

// UpdateTask handles PATCH /api/tasks/{id} - updates a task.
func UpdateTask(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	taskID := chi.URLParam(r, "id")

	if taskID == "" {
		respondError(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate priority if provided
	if req.Priority != nil && !storage.IsValidPriority(*req.Priority) {
		respondError(w, "Invalid priority. Must be 'low', 'medium', 'high', or 'urgent'", http.StatusBadRequest)
		return
	}

	// Parse due date if provided
	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		t, err := time.Parse("2006-01-02", *req.DueDate)
		if err != nil {
			respondError(w, "Invalid due_date format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		dueDate = &t
	}

	input := &storage.UpdateTaskInput{
		Priority:    req.Priority,
		DueDate:     dueDate,
		Description: req.Description,
		CustomTitle: req.CustomTitle,
	}

	task, err := storage.UpdateTask(r.Context(), conn, taskID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Task not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to update task")
		respondError(w, "Failed to update task", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("task_id", task.ID).
		Msg("Task updated")

	// Audit log: record task update
	AuditUpdate(r.Context(), "hive_tasks", task.ID, nil, task)

	respondJSON(w, TaskDataResponse{Data: taskToResponse(task)}, http.StatusOK)
}

// DeleteTask handles DELETE /api/tasks/{id} - deletes a task.
func DeleteTask(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	taskID := chi.URLParam(r, "id")

	if taskID == "" {
		respondError(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteTask(r.Context(), conn, taskID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Task not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to delete task")
		respondError(w, "Failed to delete task", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("task_id", taskID).
		Msg("Task deleted")

	// Audit log: record task deletion
	AuditDelete(r.Context(), "hive_tasks", taskID, nil)

	w.WriteHeader(http.StatusNoContent)
}

// CompleteTask handles POST /api/tasks/{id}/complete - marks a task as completed.
// If the task has a template with auto_effects, those effects are processed and
// the results stored in auto_applied_changes.
func CompleteTask(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	claims := middleware.GetClaims(r.Context())
	userID := claims.UserID
	taskID := chi.URLParam(r, "id")

	if taskID == "" {
		respondError(w, "Task ID is required", http.StatusBadRequest)
		return
	}

	var req CompleteTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Empty body is OK
		if !errors.Is(err, io.EOF) {
			respondError(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	// Complete the task first (marks status as completed, stores completion_data)
	task, err := storage.CompleteTask(r.Context(), conn, taskID, userID, req.CompletionData)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Task not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, storage.ErrTaskAlreadyCompleted) {
		respondError(w, "Task is already completed", http.StatusBadRequest)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to complete task")
		respondError(w, "Failed to complete task", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("task_id", task.ID).
		Str("completed_by", userID).
		Msg("Task completed")

	// Fetch full task with template to check for auto_effects
	fullTask, err := storage.GetTaskByID(r.Context(), conn, taskID)
	if err != nil {
		log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to fetch task with template")
		// Don't fail the request - task was completed successfully
	}

	// Process auto-effects if template has them
	var appliedChanges *services.AppliedChanges
	if fullTask != nil && fullTask.TemplateAutoEffects != nil && len(fullTask.TemplateAutoEffects) > 0 {
		// Parse completion data
		completionData := services.ParseCompletionData(req.CompletionData)

		// Process auto-effects (updates hive fields, creates records)
		appliedChanges = services.ProcessAutoEffects(r.Context(), conn, tenantID, fullTask, completionData)

		// Store applied changes on the task
		if appliedChanges != nil {
			changesJSON := appliedChanges.ToJSON()
			if changesJSON != nil {
				if err := storage.UpdateTaskAutoAppliedChanges(r.Context(), conn, taskID, changesJSON); err != nil {
					log.Error().Err(err).Str("task_id", taskID).Msg("handler: failed to store auto_applied_changes")
					// Don't fail - task completed successfully, just log the error
				} else {
					// Update the task in our response with the applied changes
					task.AutoAppliedChanges = changesJSON
				}
			}
		}
	}

	// Create activity log entry for task completion (Story 14.13)
	// This logs the task completion to the hive's activity history
	// Error handling: log but don't fail the request if activity log fails
	if fullTask != nil {
		if err := services.CreateTaskCompletionLog(r.Context(), conn, tenantID, fullTask, userID, appliedChanges); err != nil {
			log.Error().
				Err(err).
				Str("task_id", taskID).
				Msg("Failed to create activity log entry (task still completed)")
		}
	}

	// Audit log: record task completion
	AuditUpdate(r.Context(), "hive_tasks", task.ID, nil, task)

	respondJSON(w, TaskDataResponse{Data: taskToResponse(task)}, http.StatusOK)
}

// ListTasksByHive handles GET /api/hives/{id}/tasks - returns tasks for a specific hive.
func ListTasksByHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Parse status filter (default: pending)
	var status *string
	if statusParam := r.URL.Query().Get("status"); statusParam != "" {
		if statusParam != "pending" && statusParam != "completed" {
			respondError(w, "Invalid status. Must be 'pending' or 'completed'", http.StatusBadRequest)
			return
		}
		status = &statusParam
	}

	tasks, err := storage.ListTasksByHive(r.Context(), conn, hiveID, status)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list tasks by hive")
		respondError(w, "Failed to list tasks", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	taskResponses := make([]TaskResponse, 0, len(tasks))
	for _, task := range tasks {
		taskResponses = append(taskResponses, taskWithHiveToResponse(&task))
	}

	respondJSON(w, TasksListResponse{
		Data: taskResponses,
		Meta: MetaResponse{Total: len(taskResponses)},
	}, http.StatusOK)
}

// GetTaskStats handles GET /api/tasks/stats - returns aggregated task statistics.
// Epic 14, Story 14.14: Overdue Alerts + Navigation Badge
func GetTaskStats(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	stats, err := storage.GetTaskStats(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get task stats")
		respondError(w, "Failed to get task stats", http.StatusInternalServerError)
		return
	}

	respondJSON(w, map[string]any{
		"data": stats,
	}, http.StatusOK)
}

// ListOverdueTasks handles GET /api/tasks/overdue - returns all overdue tasks.
func ListOverdueTasks(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	tasks, err := storage.ListOverdueTasks(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list overdue tasks")
		respondError(w, "Failed to list overdue tasks", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	taskResponses := make([]TaskResponse, 0, len(tasks))
	for _, task := range tasks {
		taskResponses = append(taskResponses, taskWithHiveToResponse(&task))
	}

	respondJSON(w, TasksListResponse{
		Data: taskResponses,
		Meta: MetaResponse{Total: len(taskResponses)},
	}, http.StatusOK)
}
