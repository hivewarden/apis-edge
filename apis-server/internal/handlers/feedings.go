// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"
)

// FeedingResponse represents a feeding in API responses.
type FeedingResponse struct {
	ID            string  `json:"id"`
	HiveID        string  `json:"hive_id"`
	FedAt         string  `json:"fed_at"`
	FeedType      string  `json:"feed_type"`
	Amount        float64 `json:"amount"`
	Unit          string  `json:"unit"`
	Concentration *string `json:"concentration,omitempty"`
	Notes         *string `json:"notes,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

// FeedingsListResponse represents the list feedings API response.
type FeedingsListResponse struct {
	Data []FeedingResponse `json:"data"`
	Meta MetaResponse      `json:"meta"`
}

// FeedingDataResponse represents a single feeding API response.
type FeedingDataResponse struct {
	Data FeedingResponse `json:"data"`
}

// FeedingsDataResponse represents multiple feedings API response.
type FeedingsDataResponse struct {
	Data []FeedingResponse `json:"data"`
}

// SeasonTotalsResponse represents the season totals API response.
type SeasonTotalsResponse struct {
	Data []storage.SeasonTotal `json:"data"`
}

// CreateFeedingRequest represents the request body for creating feeding(s).
type CreateFeedingRequest struct {
	HiveIDs       []string `json:"hive_ids"`
	FedAt         string   `json:"fed_at"`
	FeedType      string   `json:"feed_type"`
	Amount        float64  `json:"amount"`
	Unit          string   `json:"unit"`
	Concentration *string  `json:"concentration,omitempty"`
	Notes         *string  `json:"notes,omitempty"`
}

// UpdateFeedingRequest represents the request body for updating a feeding.
type UpdateFeedingRequest struct {
	FedAt         *string  `json:"fed_at,omitempty"`
	FeedType      *string  `json:"feed_type,omitempty"`
	Amount        *float64 `json:"amount,omitempty"`
	Unit          *string  `json:"unit,omitempty"`
	Concentration *string  `json:"concentration,omitempty"`
	Notes         *string  `json:"notes,omitempty"`
}

// feedingToResponse converts a storage.Feeding to a FeedingResponse.
func feedingToResponse(f *storage.Feeding) FeedingResponse {
	amount, _ := f.Amount.Float64()
	return FeedingResponse{
		ID:            f.ID,
		HiveID:        f.HiveID,
		FedAt:         f.FedAt.Format("2006-01-02"),
		FeedType:      f.FeedType,
		Amount:        amount,
		Unit:          f.Unit,
		Concentration: f.Concentration,
		Notes:         f.Notes,
		CreatedAt:     f.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     f.UpdatedAt.Format(time.RFC3339),
	}
}

// CreateFeeding handles POST /api/feedings - creates feeding(s) for one or more hives.
func CreateFeeding(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateFeedingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if len(req.HiveIDs) == 0 {
		respondError(w, "At least one hive_id is required", http.StatusBadRequest)
		return
	}

	if req.FedAt == "" {
		respondError(w, "fed_at is required", http.StatusBadRequest)
		return
	}

	if req.FeedType == "" {
		respondError(w, "feed_type is required", http.StatusBadRequest)
		return
	}

	if req.Unit == "" {
		respondError(w, "unit is required", http.StatusBadRequest)
		return
	}

	// Validate amount is positive
	if req.Amount <= 0 {
		respondError(w, "amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// Parse date
	fedAt, err := time.Parse("2006-01-02", req.FedAt)
	if err != nil {
		respondError(w, "Invalid fed_at format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Validate feed type
	validTypes := []string{"sugar_syrup", "fondant", "pollen_patty", "pollen_substitute", "honey", "other"}
	typeValid := false
	for _, t := range validTypes {
		if req.FeedType == t {
			typeValid = true
			break
		}
	}
	if !typeValid {
		respondError(w, "Invalid feed_type. Must be one of: sugar_syrup, fondant, pollen_patty, pollen_substitute, honey, other", http.StatusBadRequest)
		return
	}

	// Validate unit
	validUnits := []string{"kg", "liters"}
	unitValid := false
	for _, u := range validUnits {
		if req.Unit == u {
			unitValid = true
			break
		}
	}
	if !unitValid {
		respondError(w, "Invalid unit. Must be one of: kg, liters", http.StatusBadRequest)
		return
	}

	// Handle concentration field
	// Clear concentration for non-syrup types (server-side enforcement)
	if req.FeedType != "sugar_syrup" {
		req.Concentration = nil
	} else if req.Concentration != nil && *req.Concentration != "" {
		// Validate concentration length for custom values
		if len(*req.Concentration) > 20 {
			respondError(w, "Concentration too long (max 20 characters)", http.StatusBadRequest)
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

	input := &storage.CreateFeedingInput{
		FedAt:         fedAt,
		FeedType:      req.FeedType,
		Amount:        decimal.NewFromFloat(req.Amount),
		Unit:          req.Unit,
		Concentration: req.Concentration,
		Notes:         req.Notes,
	}

	feedings, err := storage.CreateFeedingsForMultipleHives(r.Context(), conn, tenantID, req.HiveIDs, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create feedings")
		respondError(w, "Failed to create feedings", http.StatusInternalServerError)
		return
	}

	log.Info().
		Int("count", len(feedings)).
		Str("tenant_id", tenantID).
		Str("feed_type", req.FeedType).
		Msg("Feedings created")

	// Convert to response
	responses := make([]FeedingResponse, 0, len(feedings))
	for _, f := range feedings {
		responses = append(responses, feedingToResponse(&f))
	}

	respondJSON(w, FeedingsDataResponse{Data: responses}, http.StatusCreated)
}

// ListFeedingsByHive handles GET /api/hives/{hive_id}/feedings - returns all feedings for a hive.
func ListFeedingsByHive(w http.ResponseWriter, r *http.Request) {
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

	feedings, err := storage.ListFeedingsByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list feedings")
		respondError(w, "Failed to list feedings", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]FeedingResponse, 0, len(feedings))
	for _, f := range feedings {
		responses = append(responses, feedingToResponse(&f))
	}

	respondJSON(w, FeedingsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// GetFeedingSeasonTotals handles GET /api/hives/{hive_id}/feedings/season-totals - returns season totals.
func GetFeedingSeasonTotals(w http.ResponseWriter, r *http.Request) {
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

	totals, err := storage.GetFeedingSeasonTotals(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get season totals")
		respondError(w, "Failed to get season totals", http.StatusInternalServerError)
		return
	}

	// Ensure we return empty array instead of null
	if totals == nil {
		totals = []storage.SeasonTotal{}
	}

	respondJSON(w, SeasonTotalsResponse{Data: totals}, http.StatusOK)
}

// GetFeeding handles GET /api/feedings/{id} - returns a specific feeding.
func GetFeeding(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	feedingID := chi.URLParam(r, "id")

	if feedingID == "" {
		respondError(w, "Feeding ID is required", http.StatusBadRequest)
		return
	}

	feeding, err := storage.GetFeedingByID(r.Context(), conn, feedingID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Feeding not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("feeding_id", feedingID).Msg("handler: failed to get feeding")
		respondError(w, "Failed to get feeding", http.StatusInternalServerError)
		return
	}

	respondJSON(w, FeedingDataResponse{Data: feedingToResponse(feeding)}, http.StatusOK)
}

// UpdateFeeding handles PUT /api/feedings/{id} - updates an existing feeding.
func UpdateFeeding(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	feedingID := chi.URLParam(r, "id")

	if feedingID == "" {
		respondError(w, "Feeding ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateFeedingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse date if provided
	var fedAt *time.Time
	if req.FedAt != nil && *req.FedAt != "" {
		t, err := time.Parse("2006-01-02", *req.FedAt)
		if err != nil {
			respondError(w, "Invalid fed_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		fedAt = &t
	}

	// Validate feed type if provided
	if req.FeedType != nil && *req.FeedType != "" {
		validTypes := []string{"sugar_syrup", "fondant", "pollen_patty", "pollen_substitute", "honey", "other"}
		typeValid := false
		for _, t := range validTypes {
			if *req.FeedType == t {
				typeValid = true
				break
			}
		}
		if !typeValid {
			respondError(w, "Invalid feed_type", http.StatusBadRequest)
			return
		}
	}

	// Validate unit if provided
	if req.Unit != nil && *req.Unit != "" {
		validUnits := []string{"kg", "liters"}
		unitValid := false
		for _, u := range validUnits {
			if *req.Unit == u {
				unitValid = true
				break
			}
		}
		if !unitValid {
			respondError(w, "Invalid unit", http.StatusBadRequest)
			return
		}
	}

	// Clear concentration for non-syrup types (server-side enforcement)
	// Same logic as CreateFeeding handler
	if req.FeedType != nil && *req.FeedType != "sugar_syrup" {
		emptyConc := ""
		req.Concentration = &emptyConc
	}

	// Validate amount is positive if provided
	if req.Amount != nil && *req.Amount <= 0 {
		respondError(w, "amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// Convert amount to decimal if provided
	var amount *decimal.Decimal
	if req.Amount != nil {
		d := decimal.NewFromFloat(*req.Amount)
		amount = &d
	}

	input := &storage.UpdateFeedingInput{
		FedAt:         fedAt,
		FeedType:      req.FeedType,
		Amount:        amount,
		Unit:          req.Unit,
		Concentration: req.Concentration,
		Notes:         req.Notes,
	}

	feeding, err := storage.UpdateFeeding(r.Context(), conn, feedingID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Feeding not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("feeding_id", feedingID).Msg("handler: failed to update feeding")
		respondError(w, "Failed to update feeding", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("feeding_id", feeding.ID).
		Msg("Feeding updated")

	respondJSON(w, FeedingDataResponse{Data: feedingToResponse(feeding)}, http.StatusOK)
}

// DeleteFeeding handles DELETE /api/feedings/{id} - deletes a feeding.
func DeleteFeeding(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	feedingID := chi.URLParam(r, "id")

	if feedingID == "" {
		respondError(w, "Feeding ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteFeeding(r.Context(), conn, feedingID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Feeding not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("feeding_id", feedingID).Msg("handler: failed to delete feeding")
		respondError(w, "Failed to delete feeding", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("feeding_id", feedingID).
		Msg("Feeding deleted")

	w.WriteHeader(http.StatusNoContent)
}
