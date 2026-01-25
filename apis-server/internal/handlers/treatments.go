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

// TreatmentResponse represents a treatment in API responses.
type TreatmentResponse struct {
	ID              string  `json:"id"`
	HiveID          string  `json:"hive_id"`
	TreatedAt       string  `json:"treated_at"`
	TreatmentType   string  `json:"treatment_type"`
	Method          *string `json:"method,omitempty"`
	Dose            *string `json:"dose,omitempty"`
	MiteCountBefore *int    `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int    `json:"mite_count_after,omitempty"`
	Efficacy        *int    `json:"efficacy,omitempty"`
	EfficacyDisplay *string `json:"efficacy_display,omitempty"`
	Weather         *string `json:"weather,omitempty"`
	Notes           *string `json:"notes,omitempty"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

// TreatmentsListResponse represents the list treatments API response.
type TreatmentsListResponse struct {
	Data []TreatmentResponse `json:"data"`
	Meta MetaResponse        `json:"meta"`
}

// TreatmentDataResponse represents a single treatment API response.
type TreatmentDataResponse struct {
	Data TreatmentResponse `json:"data"`
}

// TreatmentsDataResponse represents multiple treatments API response.
type TreatmentsDataResponse struct {
	Data []TreatmentResponse `json:"data"`
}

// CreateTreatmentRequest represents the request body for creating treatment(s).
type CreateTreatmentRequest struct {
	HiveIDs         []string `json:"hive_ids"`
	TreatedAt       string   `json:"treated_at"`
	TreatmentType   string   `json:"treatment_type"`
	Method          *string  `json:"method,omitempty"`
	Dose            *string  `json:"dose,omitempty"`
	MiteCountBefore *int     `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int     `json:"mite_count_after,omitempty"`
	Weather         *string  `json:"weather,omitempty"`
	Notes           *string  `json:"notes,omitempty"`
}

// UpdateTreatmentRequest represents the request body for updating a treatment.
type UpdateTreatmentRequest struct {
	TreatedAt       *string `json:"treated_at,omitempty"`
	TreatmentType   *string `json:"treatment_type,omitempty"`
	Method          *string `json:"method,omitempty"`
	Dose            *string `json:"dose,omitempty"`
	MiteCountBefore *int    `json:"mite_count_before,omitempty"`
	MiteCountAfter  *int    `json:"mite_count_after,omitempty"`
	Weather         *string `json:"weather,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

// treatmentToResponse converts a storage.Treatment to a TreatmentResponse.
func treatmentToResponse(t *storage.Treatment) TreatmentResponse {
	resp := TreatmentResponse{
		ID:              t.ID,
		HiveID:          t.HiveID,
		TreatedAt:       t.TreatedAt.Format("2006-01-02"),
		TreatmentType:   t.TreatmentType,
		Method:          t.Method,
		Dose:            t.Dose,
		MiteCountBefore: t.MiteCountBefore,
		MiteCountAfter:  t.MiteCountAfter,
		Weather:         t.Weather,
		Notes:           t.Notes,
		CreatedAt:       t.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       t.UpdatedAt.Format(time.RFC3339),
	}

	// Calculate efficacy if both mite counts exist
	if t.MiteCountBefore != nil && t.MiteCountAfter != nil && *t.MiteCountBefore > 0 {
		efficacy := int(float64(*t.MiteCountBefore-*t.MiteCountAfter) / float64(*t.MiteCountBefore) * 100)
		resp.Efficacy = &efficacy
		var display string
		if efficacy >= 0 {
			display = formatPercentage(efficacy) + " reduction"
		} else {
			display = formatPercentage(-efficacy) + " increase"
		}
		resp.EfficacyDisplay = &display
	}

	return resp
}

func formatPercentage(n int) string {
	return fmt.Sprintf("%d%%", n)
}

// CreateTreatment handles POST /api/treatments - creates treatment(s) for one or more hives.
func CreateTreatment(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateTreatmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if len(req.HiveIDs) == 0 {
		respondError(w, "At least one hive_id is required", http.StatusBadRequest)
		return
	}

	if req.TreatedAt == "" {
		respondError(w, "treated_at is required", http.StatusBadRequest)
		return
	}

	if req.TreatmentType == "" {
		respondError(w, "treatment_type is required", http.StatusBadRequest)
		return
	}

	// Parse date
	treatedAt, err := time.Parse("2006-01-02", req.TreatedAt)
	if err != nil {
		respondError(w, "Invalid treated_at format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Validate treatment type
	validTypes := []string{"oxalic_acid", "formic_acid", "apiguard", "apivar", "maqs", "api_bioxal", "other"}
	typeValid := false
	for _, t := range validTypes {
		if req.TreatmentType == t {
			typeValid = true
			break
		}
	}
	if !typeValid {
		respondError(w, "Invalid treatment_type. Must be one of: oxalic_acid, formic_acid, apiguard, apivar, maqs, api_bioxal, other", http.StatusBadRequest)
		return
	}

	// Validate method if provided
	if req.Method != nil && *req.Method != "" {
		validMethods := []string{"vaporization", "dribble", "strips", "spray", "other"}
		methodValid := false
		for _, m := range validMethods {
			if *req.Method == m {
				methodValid = true
				break
			}
		}
		if !methodValid {
			respondError(w, "Invalid method. Must be one of: vaporization, dribble, strips, spray, other", http.StatusBadRequest)
			return
		}
	}

	// Verify all hives exist
	for _, hiveID := range req.HiveIDs {
		_, err := storage.GetHiveByID(r.Context(), conn, hiveID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Hive not found: "+hiveID, http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
			respondError(w, "Failed to verify hive", http.StatusInternalServerError)
			return
		}
	}

	input := &storage.CreateTreatmentInput{
		TreatedAt:       treatedAt,
		TreatmentType:   req.TreatmentType,
		Method:          req.Method,
		Dose:            req.Dose,
		MiteCountBefore: req.MiteCountBefore,
		MiteCountAfter:  req.MiteCountAfter,
		Weather:         req.Weather,
		Notes:           req.Notes,
	}

	treatments, err := storage.CreateTreatmentsForMultipleHives(r.Context(), conn, tenantID, req.HiveIDs, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create treatments")
		respondError(w, "Failed to create treatments", http.StatusInternalServerError)
		return
	}

	log.Info().
		Int("count", len(treatments)).
		Str("tenant_id", tenantID).
		Str("treatment_type", req.TreatmentType).
		Msg("Treatments created")

	// Convert to response
	responses := make([]TreatmentResponse, 0, len(treatments))
	for _, t := range treatments {
		responses = append(responses, treatmentToResponse(&t))
	}

	respondJSON(w, TreatmentsDataResponse{Data: responses}, http.StatusCreated)
}

// ListTreatmentsByHive handles GET /api/hives/{hive_id}/treatments - returns all treatments for a hive.
func ListTreatmentsByHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "hive_id")

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
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	treatments, err := storage.ListTreatmentsByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list treatments")
		respondError(w, "Failed to list treatments", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]TreatmentResponse, 0, len(treatments))
	for _, t := range treatments {
		responses = append(responses, treatmentToResponse(&t))
	}

	respondJSON(w, TreatmentsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// GetTreatment handles GET /api/treatments/{id} - returns a specific treatment.
func GetTreatment(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	treatmentID := chi.URLParam(r, "id")

	if treatmentID == "" {
		respondError(w, "Treatment ID is required", http.StatusBadRequest)
		return
	}

	treatment, err := storage.GetTreatmentByID(r.Context(), conn, treatmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("treatment_id", treatmentID).Msg("handler: failed to get treatment")
		respondError(w, "Failed to get treatment", http.StatusInternalServerError)
		return
	}

	// Defense-in-depth: verify treatment belongs to authenticated tenant
	if treatment.TenantID != tenantID {
		log.Warn().
			Str("treatment_id", treatmentID).
			Str("treatment_tenant", treatment.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: tenant mismatch on get treatment")
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}

	respondJSON(w, TreatmentDataResponse{Data: treatmentToResponse(treatment)}, http.StatusOK)
}

// UpdateTreatment handles PUT /api/treatments/{id} - updates an existing treatment.
func UpdateTreatment(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	treatmentID := chi.URLParam(r, "id")

	if treatmentID == "" {
		respondError(w, "Treatment ID is required", http.StatusBadRequest)
		return
	}

	// Defense-in-depth: verify treatment belongs to authenticated tenant before update
	existing, err := storage.GetTreatmentByID(r.Context(), conn, treatmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("treatment_id", treatmentID).Msg("handler: failed to get treatment for update")
		respondError(w, "Failed to get treatment", http.StatusInternalServerError)
		return
	}
	if existing.TenantID != tenantID {
		log.Warn().
			Str("treatment_id", treatmentID).
			Str("treatment_tenant", existing.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: tenant mismatch on update treatment")
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}

	var req UpdateTreatmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse date if provided
	var treatedAt *time.Time
	if req.TreatedAt != nil && *req.TreatedAt != "" {
		t, err := time.Parse("2006-01-02", *req.TreatedAt)
		if err != nil {
			respondError(w, "Invalid treated_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		treatedAt = &t
	}

	// Validate treatment type if provided
	if req.TreatmentType != nil && *req.TreatmentType != "" {
		validTypes := []string{"oxalic_acid", "formic_acid", "apiguard", "apivar", "maqs", "api_bioxal", "other"}
		typeValid := false
		for _, t := range validTypes {
			if *req.TreatmentType == t {
				typeValid = true
				break
			}
		}
		if !typeValid {
			respondError(w, "Invalid treatment_type", http.StatusBadRequest)
			return
		}
	}

	// Validate method if provided
	if req.Method != nil && *req.Method != "" {
		validMethods := []string{"vaporization", "dribble", "strips", "spray", "other"}
		methodValid := false
		for _, m := range validMethods {
			if *req.Method == m {
				methodValid = true
				break
			}
		}
		if !methodValid {
			respondError(w, "Invalid method", http.StatusBadRequest)
			return
		}
	}

	input := &storage.UpdateTreatmentInput{
		TreatedAt:       treatedAt,
		TreatmentType:   req.TreatmentType,
		Method:          req.Method,
		Dose:            req.Dose,
		MiteCountBefore: req.MiteCountBefore,
		MiteCountAfter:  req.MiteCountAfter,
		Weather:         req.Weather,
		Notes:           req.Notes,
	}

	treatment, err := storage.UpdateTreatment(r.Context(), conn, treatmentID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("treatment_id", treatmentID).Msg("handler: failed to update treatment")
		respondError(w, "Failed to update treatment", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("treatment_id", treatment.ID).
		Msg("Treatment updated")

	respondJSON(w, TreatmentDataResponse{Data: treatmentToResponse(treatment)}, http.StatusOK)
}

// DeleteTreatment handles DELETE /api/treatments/{id} - deletes a treatment.
func DeleteTreatment(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	treatmentID := chi.URLParam(r, "id")

	if treatmentID == "" {
		respondError(w, "Treatment ID is required", http.StatusBadRequest)
		return
	}

	// Defense-in-depth: verify treatment belongs to authenticated tenant before delete
	existing, err := storage.GetTreatmentByID(r.Context(), conn, treatmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("treatment_id", treatmentID).Msg("handler: failed to get treatment for delete")
		respondError(w, "Failed to get treatment", http.StatusInternalServerError)
		return
	}
	if existing.TenantID != tenantID {
		log.Warn().
			Str("treatment_id", treatmentID).
			Str("treatment_tenant", existing.TenantID).
			Str("request_tenant", tenantID).
			Msg("handler: tenant mismatch on delete treatment")
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}

	err = storage.DeleteTreatment(r.Context(), conn, treatmentID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Treatment not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("treatment_id", treatmentID).Msg("handler: failed to delete treatment")
		respondError(w, "Failed to delete treatment", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("treatment_id", treatmentID).
		Msg("Treatment deleted")

	w.WriteHeader(http.StatusNoContent)
}
