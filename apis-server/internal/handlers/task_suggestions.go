// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// TaskSuggestionResponse represents a task suggestion in API responses.
type TaskSuggestionResponse struct {
	ID                  string     `json:"id"`
	HiveID              string     `json:"hive_id"`
	InspectionID        *string    `json:"inspection_id,omitempty"`
	SuggestedTemplateID *string    `json:"suggested_template_id,omitempty"`
	SuggestedTitle      string     `json:"suggested_title"`
	Reason              string     `json:"reason"`
	Priority            string     `json:"priority"`
	Status              string     `json:"status"`
	CreatedAt           time.Time  `json:"created_at"`
}

// TaskSuggestionsListResponse represents the list suggestions API response.
type TaskSuggestionsListResponse struct {
	Data []TaskSuggestionResponse `json:"data"`
}

// suggestionToResponse converts a storage.TaskSuggestion to a TaskSuggestionResponse.
func suggestionToResponse(s *storage.TaskSuggestion) TaskSuggestionResponse {
	return TaskSuggestionResponse{
		ID:                  s.ID,
		HiveID:              s.HiveID,
		InspectionID:        s.InspectionID,
		SuggestedTemplateID: s.SuggestedTemplateID,
		SuggestedTitle:      s.SuggestedTitle,
		Reason:              s.Reason,
		Priority:            s.Priority,
		Status:              s.Status,
		CreatedAt:           s.CreatedAt,
	}
}

// ListHiveSuggestions handles GET /api/hives/{id}/suggestions - returns pending suggestions for a hive.
// Sorted by priority (urgent > high > medium > low) then created_at DESC.
func ListHiveSuggestions(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Verify hive exists
	_, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to validate hive", http.StatusInternalServerError)
		return
	}

	// Get pending suggestions (status filter defaults to 'pending')
	suggestions, err := storage.ListTaskSuggestions(r.Context(), conn, hiveID, "pending")
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list task suggestions")
		respondError(w, "Failed to list suggestions", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]TaskSuggestionResponse, 0, len(suggestions))
	for _, s := range suggestions {
		responses = append(responses, suggestionToResponse(&s))
	}

	respondJSON(w, TaskSuggestionsListResponse{Data: responses}, http.StatusOK)
}

// AcceptSuggestion handles POST /api/hives/{id}/suggestions/{suggestion_id}/accept - accepts a suggestion and creates a task.
// Creates a new task from the suggestion and marks the suggestion as 'accepted'.
// Returns the created task.
func AcceptSuggestion(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	claims := middleware.GetClaims(r.Context())
	userID := claims.UserID

	hiveID := chi.URLParam(r, "id")
	suggestionID := chi.URLParam(r, "suggestion_id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}
	if suggestionID == "" {
		respondError(w, "Suggestion ID is required", http.StatusBadRequest)
		return
	}

	// Get the suggestion
	suggestion, err := storage.GetTaskSuggestionByID(r.Context(), conn, suggestionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Suggestion not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("suggestion_id", suggestionID).Msg("handler: failed to get suggestion")
		respondError(w, "Failed to get suggestion", http.StatusInternalServerError)
		return
	}

	// Verify suggestion belongs to the specified hive
	if suggestion.HiveID != hiveID {
		respondError(w, "Suggestion does not belong to this hive", http.StatusBadRequest)
		return
	}

	// Verify suggestion is still pending
	if suggestion.Status != "pending" {
		respondError(w, "Suggestion is no longer pending (already "+suggestion.Status+")", http.StatusBadRequest)
		return
	}

	// Create task from suggestion
	// Use custom_title if no template, or template_id if template exists
	var customTitle *string
	if suggestion.SuggestedTemplateID == nil {
		customTitle = &suggestion.SuggestedTitle
	}

	// Include the reason in the description
	description := suggestion.Reason

	taskInput := &storage.CreateTaskInput{
		HiveID:      suggestion.HiveID,
		TemplateID:  suggestion.SuggestedTemplateID,
		CustomTitle: customTitle,
		Description: &description,
		Priority:    suggestion.Priority,
		Source:      "beebrain",
	}

	task, err := storage.CreateTask(r.Context(), conn, tenantID, userID, taskInput)
	if err != nil {
		log.Error().Err(err).Str("suggestion_id", suggestionID).Msg("handler: failed to create task from suggestion")
		respondError(w, "Failed to create task", http.StatusInternalServerError)
		return
	}

	// Mark suggestion as accepted
	// TODO (S3B-M6): These two operations (CreateTask + UpdateTaskSuggestionStatus) are not
	// wrapped in a transaction. If the status update fails, the suggestion stays "pending"
	// and could be accepted again, creating a duplicate task. To fix properly, both storage
	// functions need Tx variants that accept pgx.Tx instead of *pgxpool.Conn.
	if err := storage.UpdateTaskSuggestionStatus(r.Context(), conn, suggestionID, "accepted"); err != nil {
		// Log but don't fail - task was created successfully
		log.Error().Err(err).Str("suggestion_id", suggestionID).Msg("handler: failed to mark suggestion as accepted")
	}

	log.Info().
		Str("suggestion_id", suggestionID).
		Str("task_id", task.ID).
		Str("hive_id", hiveID).
		Str("tenant_id", tenantID).
		Msg("Task suggestion accepted, task created")

	// Audit log: record task creation from suggestion
	AuditCreate(r.Context(), "hive_tasks", task.ID, map[string]any{
		"task":          task,
		"from_suggestion": suggestionID,
	})

	respondJSON(w, TaskDataResponse{Data: taskToResponse(task)}, http.StatusCreated)
}

// DismissSuggestion handles DELETE /api/hives/{id}/suggestions/{suggestion_id} - dismisses a suggestion.
// Marks the suggestion as 'dismissed' (soft delete for audit trail).
// Returns 204 No Content on success.
func DismissSuggestion(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	hiveID := chi.URLParam(r, "id")
	suggestionID := chi.URLParam(r, "suggestion_id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}
	if suggestionID == "" {
		respondError(w, "Suggestion ID is required", http.StatusBadRequest)
		return
	}

	// Get the suggestion to verify ownership
	suggestion, err := storage.GetTaskSuggestionByID(r.Context(), conn, suggestionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Suggestion not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("suggestion_id", suggestionID).Msg("handler: failed to get suggestion")
		respondError(w, "Failed to get suggestion", http.StatusInternalServerError)
		return
	}

	// Verify suggestion belongs to the specified hive
	if suggestion.HiveID != hiveID {
		respondError(w, "Suggestion does not belong to this hive", http.StatusBadRequest)
		return
	}

	// Verify suggestion is still pending
	if suggestion.Status != "pending" {
		respondError(w, "Suggestion is no longer pending (already "+suggestion.Status+")", http.StatusBadRequest)
		return
	}

	// Mark as dismissed (soft delete)
	if err := storage.UpdateTaskSuggestionStatus(r.Context(), conn, suggestionID, "dismissed"); err != nil {
		log.Error().Err(err).Str("suggestion_id", suggestionID).Msg("handler: failed to dismiss suggestion")
		respondError(w, "Failed to dismiss suggestion", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("suggestion_id", suggestionID).
		Str("hive_id", hiveID).
		Msg("Task suggestion dismissed")

	w.WriteHeader(http.StatusNoContent)
}

// respondJSON helper is already defined in other handler files, but we need to ensure it's available
// The respond functions are shared across handlers via common.go
