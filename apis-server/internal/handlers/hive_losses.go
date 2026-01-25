// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// CreateHiveLossRequest represents the request body for creating a hive loss record.
type CreateHiveLossRequest struct {
	DiscoveredAt  string   `json:"discovered_at"`
	Cause         string   `json:"cause"`
	CauseOther    *string  `json:"cause_other,omitempty"`
	Symptoms      []string `json:"symptoms"`
	SymptomsNotes *string  `json:"symptoms_notes,omitempty"`
	Reflection    *string  `json:"reflection,omitempty"`
	DataChoice    string   `json:"data_choice"`
}

// HiveLossResponse represents a hive loss record in API responses.
type HiveLossResponse struct {
	ID              string   `json:"id"`
	HiveID          string   `json:"hive_id"`
	HiveName        string   `json:"hive_name,omitempty"`
	DiscoveredAt    string   `json:"discovered_at"`
	Cause           string   `json:"cause"`
	CauseDisplay    string   `json:"cause_display"`
	CauseOther      *string  `json:"cause_other,omitempty"`
	Symptoms        []string `json:"symptoms"`
	SymptomsDisplay []string `json:"symptoms_display,omitempty"`
	SymptomsNotes   *string  `json:"symptoms_notes,omitempty"`
	Reflection      *string  `json:"reflection,omitempty"`
	DataChoice      string   `json:"data_choice"`
	CreatedAt       string   `json:"created_at"`
}

// HiveLossDataResponse represents a single hive loss API response.
type HiveLossDataResponse struct {
	Data    HiveLossResponse `json:"data"`
	Message string           `json:"message,omitempty"`
}

// HiveLossListResponse represents the list hive losses API response.
type HiveLossListResponse struct {
	Data []HiveLossResponse `json:"data"`
	Meta MetaResponse       `json:"meta"`
}

// HiveLossStatsResponse represents the loss statistics API response.
type HiveLossStatsResponse struct {
	Data storage.HiveLossStats `json:"data"`
}

// LossSummary represents a brief summary of a hive loss for the hive list response.
type LossSummary struct {
	Cause        string `json:"cause"`
	CauseDisplay string `json:"cause_display"`
	DiscoveredAt string `json:"discovered_at"`
}

// hiveLossToResponse converts a storage.HiveLoss to a HiveLossResponse.
func hiveLossToResponse(loss *storage.HiveLoss) HiveLossResponse {
	resp := HiveLossResponse{
		ID:           loss.ID,
		HiveID:       loss.HiveID,
		HiveName:     loss.HiveName,
		DiscoveredAt: loss.DiscoveredAt.Format("2006-01-02"),
		Cause:        loss.Cause,
		CauseDisplay: storage.CauseDisplayNames[loss.Cause],
		CauseOther:   loss.CauseOther,
		Symptoms:     loss.Symptoms,
		SymptomsNotes: loss.SymptomsNotes,
		Reflection:   loss.Reflection,
		DataChoice:   loss.DataChoice,
		CreatedAt:    loss.CreatedAt.Format(time.RFC3339),
	}

	// Add display names for symptoms
	if len(loss.Symptoms) > 0 {
		resp.SymptomsDisplay = make([]string, len(loss.Symptoms))
		for i, s := range loss.Symptoms {
			if displayName, ok := storage.SymptomDisplayNames[s]; ok {
				resp.SymptomsDisplay[i] = displayName
			} else {
				resp.SymptomsDisplay[i] = s
			}
		}
	}

	return resp
}

// CreateHiveLoss handles POST /api/hives/{id}/loss - creates a post-mortem record for a hive.
func CreateHiveLoss(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Verify hive exists and is not already lost
	hive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	if hive.Status == "lost" {
		respondError(w, "Hive is already marked as lost", http.StatusConflict)
		return
	}

	var req CreateHiveLossRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.DiscoveredAt == "" {
		respondError(w, "discovered_at is required", http.StatusBadRequest)
		return
	}
	if req.Cause == "" {
		respondError(w, "cause is required", http.StatusBadRequest)
		return
	}
	if req.DataChoice == "" {
		req.DataChoice = "archive" // Default to archive
	}

	// Validate cause is valid enum
	if !storage.IsValidCause(req.Cause) {
		respondError(w, "Invalid cause value", http.StatusBadRequest)
		return
	}

	// Validate symptoms array length (max 20 symptoms)
	const maxSymptoms = 20
	if len(req.Symptoms) > maxSymptoms {
		respondError(w, fmt.Sprintf("Too many symptoms: maximum allowed is %d", maxSymptoms), http.StatusBadRequest)
		return
	}

	// Validate symptoms are valid codes
	if len(req.Symptoms) > 0 && !storage.AreValidSymptoms(req.Symptoms) {
		respondError(w, "Invalid symptom code in symptoms array", http.StatusBadRequest)
		return
	}

	// Validate data_choice
	if req.DataChoice != "archive" && req.DataChoice != "delete" {
		respondError(w, "data_choice must be 'archive' or 'delete'", http.StatusBadRequest)
		return
	}

	// Validate cause_other is required when cause is 'other'
	if req.Cause == storage.CauseOther && (req.CauseOther == nil || *req.CauseOther == "") {
		respondError(w, "cause_other is required when cause is 'other'", http.StatusBadRequest)
		return
	}

	// Parse date to mark hive as lost
	discoveredAt, err := time.Parse("2006-01-02", req.DiscoveredAt)
	if err != nil {
		respondError(w, "Invalid discovered_at date format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Validate discovered_at is not in the future
	today := time.Now().Truncate(24 * time.Hour)
	if discoveredAt.After(today) {
		respondError(w, "discovered_at cannot be in the future", http.StatusBadRequest)
		return
	}

	// Create the hive loss record
	input := &storage.CreateHiveLossInput{
		HiveID:        hiveID,
		DiscoveredAt:  req.DiscoveredAt,
		Cause:         req.Cause,
		CauseOther:    req.CauseOther,
		Symptoms:      req.Symptoms,
		SymptomsNotes: req.SymptomsNotes,
		Reflection:    req.Reflection,
		DataChoice:    req.DataChoice,
	}

	loss, err := storage.CreateHiveLoss(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to create hive loss record")
		respondError(w, "Failed to create hive loss record", http.StatusInternalServerError)
		return
	}

	// Mark the hive as lost
	err = storage.MarkHiveAsLost(r.Context(), conn, hiveID, discoveredAt)
	if err != nil && !errors.Is(err, storage.ErrHiveAlreadyLost) {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to mark hive as lost")
		// Don't fail the request - loss record was created
	}

	log.Info().
		Str("hive_loss_id", loss.ID).
		Str("hive_id", hiveID).
		Str("hive_name", hive.Name).
		Str("cause", req.Cause).
		Str("tenant_id", tenantID).
		Msg("Hive loss recorded")

	respondJSON(w, HiveLossDataResponse{
		Data:    hiveLossToResponse(loss),
		Message: "Your records have been saved. This experience will help you care for future hives.",
	}, http.StatusCreated)
}

// GetHiveLoss handles GET /api/hives/{id}/loss - gets the post-mortem for a hive.
func GetHiveLoss(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	loss, err := storage.GetHiveLossByHiveID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "No loss record found for this hive", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive loss")
		respondError(w, "Failed to get hive loss record", http.StatusInternalServerError)
		return
	}

	respondJSON(w, HiveLossDataResponse{Data: hiveLossToResponse(loss)}, http.StatusOK)
}

// ListHiveLosses handles GET /api/hive-losses - lists all loss records for the tenant.
func ListHiveLosses(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	losses, err := storage.ListHiveLosses(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list hive losses")
		respondError(w, "Failed to list hive losses", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	lossResponses := make([]HiveLossResponse, 0, len(losses))
	for _, loss := range losses {
		lossResponses = append(lossResponses, hiveLossToResponse(&loss))
	}

	respondJSON(w, HiveLossListResponse{
		Data: lossResponses,
		Meta: MetaResponse{Total: len(lossResponses)},
	}, http.StatusOK)
}

// GetHiveLossStats handles GET /api/hive-losses/stats - gets loss statistics for BeeBrain.
func GetHiveLossStats(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	stats, err := storage.GetHiveLossStats(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to get hive loss stats")
		respondError(w, "Failed to get hive loss statistics", http.StatusInternalServerError)
		return
	}

	respondJSON(w, HiveLossStatsResponse{Data: *stats}, http.StatusOK)
}
