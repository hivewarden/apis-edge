// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// CustomLabelResponse represents a custom label in API responses.
type CustomLabelResponse struct {
	ID        string `json:"id"`
	Category  string `json:"category"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

// LabelUsageResponse represents the usage count for a label.
type LabelUsageResponse struct {
	Count      int            `json:"count"`
	Breakdown  map[string]int `json:"breakdown"`
}

// LabelsListResponse represents the grouped labels API response.
type LabelsListResponse struct {
	Data map[string][]CustomLabelResponse `json:"data"`
}

// LabelsByCategoryResponse represents labels for a specific category.
type LabelsByCategoryResponse struct {
	Data []CustomLabelResponse `json:"data"`
}

// LabelDataResponse represents a single label API response.
type LabelDataResponse struct {
	Data CustomLabelResponse `json:"data"`
}

// LabelUsageDataResponse represents the usage count API response.
type LabelUsageDataResponse struct {
	Data LabelUsageResponse `json:"data"`
}

// CreateLabelRequest represents the request body for creating a label.
type CreateLabelRequest struct {
	Category string `json:"category"`
	Name     string `json:"name"`
}

// UpdateLabelRequest represents the request body for updating a label.
type UpdateLabelRequest struct {
	Name string `json:"name"`
}

// customLabelToResponse converts a storage.CustomLabel to a CustomLabelResponse.
func customLabelToResponse(l *storage.CustomLabel) CustomLabelResponse {
	return CustomLabelResponse{
		ID:        l.ID,
		Category:  l.Category,
		Name:      l.Name,
		CreatedAt: l.CreatedAt.Format(time.RFC3339),
	}
}

// ListLabels handles GET /api/labels - returns all custom labels (optionally filtered by category).
func ListLabels(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Check for category filter
	category := r.URL.Query().Get("category")

	if category != "" {
		// Validate category
		if !storage.IsValidCategory(category) {
			respondError(w, "Invalid category. Must be one of: feed, treatment, equipment, issue", http.StatusBadRequest)
			return
		}

		// Return labels for specific category
		labels, err := storage.ListLabelsByCategory(r.Context(), conn, tenantID, category)
		if err != nil {
			log.Error().Err(err).Str("tenant_id", tenantID).Str("category", category).Msg("handler: failed to list labels by category")
			respondError(w, "Failed to list labels", http.StatusInternalServerError)
			return
		}

		responses := make([]CustomLabelResponse, 0, len(labels))
		for _, l := range labels {
			responses = append(responses, customLabelToResponse(&l))
		}

		respondJSON(w, LabelsByCategoryResponse{Data: responses}, http.StatusOK)
		return
	}

	// Return all labels grouped by category
	labelsMap, err := storage.ListAllLabels(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to list all labels")
		respondError(w, "Failed to list labels", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	result := make(map[string][]CustomLabelResponse)
	for cat, labels := range labelsMap {
		result[cat] = make([]CustomLabelResponse, 0, len(labels))
		for _, l := range labels {
			result[cat] = append(result[cat], customLabelToResponse(&l))
		}
	}

	respondJSON(w, LabelsListResponse{Data: result}, http.StatusOK)
}

// CreateLabel handles POST /api/labels - creates a new custom label.
func CreateLabel(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Category == "" {
		respondError(w, "category is required", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		respondError(w, "name is required", http.StatusBadRequest)
		return
	}

	// Validate category
	if !storage.IsValidCategory(req.Category) {
		respondError(w, "Invalid category. Must be one of: feed, treatment, equipment, issue", http.StatusBadRequest)
		return
	}

	// Validate name length (2-50 chars)
	if len(req.Name) < 2 || len(req.Name) > 50 {
		respondError(w, "name must be 2-50 characters", http.StatusBadRequest)
		return
	}

	input := &storage.CreateLabelInput{
		Category: req.Category,
		Name:     req.Name,
	}

	label, err := storage.CreateLabel(r.Context(), conn, tenantID, input)
	if err != nil {
		// Check for unique constraint violation
		if isDuplicateError(err) {
			respondError(w, "A label with this name already exists in this category", http.StatusConflict)
			return
		}
		log.Error().Err(err).Str("tenant_id", tenantID).Str("category", req.Category).Str("name", req.Name).Msg("handler: failed to create label")
		respondError(w, "Failed to create label", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("label_id", label.ID).
		Str("category", req.Category).
		Str("name", req.Name).
		Msg("Custom label created")

	respondJSON(w, LabelDataResponse{Data: customLabelToResponse(label)}, http.StatusCreated)
}

// GetLabel handles GET /api/labels/{id} - returns a specific label.
func GetLabel(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	labelID := chi.URLParam(r, "id")

	if labelID == "" {
		respondError(w, "Label ID is required", http.StatusBadRequest)
		return
	}

	label, err := storage.GetLabelByID(r.Context(), conn, tenantID, labelID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Label not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("label_id", labelID).Msg("handler: failed to get label")
		respondError(w, "Failed to get label", http.StatusInternalServerError)
		return
	}

	respondJSON(w, LabelDataResponse{Data: customLabelToResponse(label)}, http.StatusOK)
}

// UpdateLabel handles PUT /api/labels/{id} - updates a label's name.
// Also cascades the rename to all historical records using this label (AC #3).
func UpdateLabel(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	labelID := chi.URLParam(r, "id")

	if labelID == "" {
		respondError(w, "Label ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate name
	if req.Name == "" {
		respondError(w, "name is required", http.StatusBadRequest)
		return
	}

	// Validate name length (2-50 chars)
	if len(req.Name) < 2 || len(req.Name) > 50 {
		respondError(w, "name must be 2-50 characters", http.StatusBadRequest)
		return
	}

	input := &storage.UpdateLabelInput{
		Name: req.Name,
	}

	label, err := storage.UpdateLabel(r.Context(), conn, tenantID, labelID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Label not found", http.StatusNotFound)
		return
	}
	if err != nil {
		// Check for unique constraint violation
		if isDuplicateError(err) {
			respondError(w, "A label with this name already exists in this category", http.StatusConflict)
			return
		}
		log.Error().Err(err).Str("label_id", labelID).Msg("handler: failed to update label")
		respondError(w, "Failed to update label", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("label_id", label.ID).
		Str("name", req.Name).
		Msg("Custom label updated (with cascade to historical records)")

	respondJSON(w, LabelDataResponse{Data: customLabelToResponse(label)}, http.StatusOK)
}

// DeleteLabel handles DELETE /api/labels/{id} - soft deletes a label.
func DeleteLabel(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	labelID := chi.URLParam(r, "id")

	if labelID == "" {
		respondError(w, "Label ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteLabel(r.Context(), conn, tenantID, labelID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Label not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("label_id", labelID).Msg("handler: failed to delete label")
		respondError(w, "Failed to delete label", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("label_id", labelID).
		Msg("Custom label deleted")

	w.WriteHeader(http.StatusNoContent)
}

// GetLabelUsage handles GET /api/labels/{id}/usage - returns usage count for a label.
func GetLabelUsage(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	labelID := chi.URLParam(r, "id")

	if labelID == "" {
		respondError(w, "Label ID is required", http.StatusBadRequest)
		return
	}

	// Get the label to find its name
	label, err := storage.GetLabelByID(r.Context(), conn, tenantID, labelID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Label not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("label_id", labelID).Msg("handler: failed to get label")
		respondError(w, "Failed to get label", http.StatusInternalServerError)
		return
	}

	// Get usage count by label name
	usage, err := storage.GetLabelUsageCount(r.Context(), conn, tenantID, label.Name)
	if err != nil {
		log.Error().Err(err).Str("label_id", labelID).Str("label_name", label.Name).Msg("handler: failed to get label usage")
		respondError(w, "Failed to get label usage", http.StatusInternalServerError)
		return
	}

	respondJSON(w, LabelUsageDataResponse{
		Data: LabelUsageResponse{
			Count: usage.Total,
			Breakdown: map[string]int{
				"treatments": usage.Treatments,
				"feedings":   usage.Feedings,
				"equipment":  usage.Equipment,
			},
		},
	}, http.StatusOK)
}

// isDuplicateError checks if the error is a unique constraint violation.
// FIX (S3B-LOW-05): Use pgx typed error instead of fragile string matching.
func isDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505" // unique_violation
	}
	return false
}
