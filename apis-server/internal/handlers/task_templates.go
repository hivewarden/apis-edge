// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// TaskTemplateResponse represents a task template in API responses.
type TaskTemplateResponse struct {
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

// TaskTemplatesListResponse represents the list task templates API response.
type TaskTemplatesListResponse struct {
	Data []TaskTemplateResponse `json:"data"`
}

// TaskTemplateDataResponse represents a single task template API response.
type TaskTemplateDataResponse struct {
	Data TaskTemplateResponse `json:"data"`
}

// CreateTaskTemplateRequest represents the request body for creating a task template.
type CreateTaskTemplateRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

// taskTemplateToResponse converts a storage.TaskTemplate to a TaskTemplateResponse.
func taskTemplateToResponse(t *storage.TaskTemplate) TaskTemplateResponse {
	return TaskTemplateResponse{
		ID:          t.ID,
		TenantID:    t.TenantID,
		Type:        t.Type,
		Name:        t.Name,
		Description: t.Description,
		AutoEffects: t.AutoEffects,
		IsSystem:    t.IsSystem,
		CreatedAt:   t.CreatedAt,
		CreatedBy:   t.CreatedBy,
	}
}

// ListTaskTemplates handles GET /api/task-templates - returns all visible templates.
// This includes system templates (tenant_id IS NULL) and tenant-owned templates.
func ListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	templates, err := storage.ListTaskTemplates(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list task templates")
		respondError(w, "Failed to list task templates", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	templateResponses := make([]TaskTemplateResponse, 0, len(templates))
	for _, t := range templates {
		templateResponses = append(templateResponses, taskTemplateToResponse(&t))
	}

	respondJSON(w, TaskTemplatesListResponse{Data: templateResponses}, http.StatusOK)
}

// CreateTaskTemplate handles POST /api/task-templates - creates a custom template.
func CreateTaskTemplate(w http.ResponseWriter, r *http.Request) {
	tenantID := middleware.GetTenantID(r.Context())
	claims := middleware.GetClaims(r.Context())
	userID := claims.UserID
	conn := storage.RequireConn(r.Context())

	var req CreateTaskTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate name: required, 1-100 characters
	name := strings.TrimSpace(req.Name)
	if name == "" {
		respondError(w, "Name is required", http.StatusBadRequest)
		return
	}
	if len(name) > 100 {
		respondError(w, "Name must be between 1 and 100 characters", http.StatusBadRequest)
		return
	}

	// Validate description: optional, max 500 characters
	if req.Description != nil && len(*req.Description) > 500 {
		respondError(w, "Description must not exceed 500 characters", http.StatusBadRequest)
		return
	}

	input := &storage.CreateTaskTemplateInput{
		Name:        name,
		Description: req.Description,
	}

	template, err := storage.CreateTaskTemplate(r.Context(), conn, tenantID, userID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create task template")
		respondError(w, "Failed to create task template", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("template_id", template.ID).
		Str("tenant_id", tenantID).
		Str("name", template.Name).
		Msg("Task template created")

	// Audit log: record template creation
	AuditCreate(r.Context(), "task_templates", template.ID, template)

	respondJSON(w, TaskTemplateDataResponse{Data: taskTemplateToResponse(template)}, http.StatusCreated)
}

// DeleteTaskTemplate handles DELETE /api/task-templates/{id} - deletes a custom template.
// Returns 403 Forbidden for system templates, 404 Not Found for missing or other tenant's templates.
func DeleteTaskTemplate(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	templateID := chi.URLParam(r, "id")

	if templateID == "" {
		respondError(w, "Template ID is required", http.StatusBadRequest)
		return
	}

	// Validate UUID format before DB query
	if _, err := uuid.Parse(templateID); err != nil {
		respondError(w, "Invalid template ID format: must be a valid UUID", http.StatusBadRequest)
		return
	}

	err := storage.DeleteTaskTemplate(r.Context(), conn, templateID)
	if errors.Is(err, storage.ErrCannotDeleteSystemTemplate) {
		respondError(w, "Cannot delete system template", http.StatusForbidden)
		return
	}
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Template not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("template_id", templateID).Msg("handler: failed to delete task template")
		respondError(w, "Failed to delete task template", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("template_id", templateID).
		Msg("Task template deleted")

	// Audit log: record template deletion
	AuditDelete(r.Context(), "task_templates", templateID, nil)

	w.WriteHeader(http.StatusNoContent)
}
