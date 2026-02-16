// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"
)

// harvestSumTolerance is the allowed difference between breakdown sum and total_kg (10g).
// This accounts for floating-point arithmetic imprecision in JSON-decoded values.
const harvestSumTolerance = 0.01

// HarvestHiveResponse represents a per-hive breakdown in API responses.
type HarvestHiveResponse struct {
	HiveID   string  `json:"hive_id"`
	HiveName string  `json:"hive_name,omitempty"`
	Frames   *int    `json:"frames,omitempty"`
	AmountKg float64 `json:"amount_kg"`
}

// HarvestResponse represents a harvest in API responses.
type HarvestResponse struct {
	ID             string                `json:"id"`
	SiteID         string                `json:"site_id"`
	HarvestedAt    string                `json:"harvested_at"`
	TotalKg        float64               `json:"total_kg"`
	Notes          *string               `json:"notes,omitempty"`
	CreatedAt      string                `json:"created_at"`
	UpdatedAt      string                `json:"updated_at"`
	Hives          []HarvestHiveResponse `json:"hives,omitempty"`
	IsFirstHarvest bool                  `json:"is_first_harvest,omitempty"`
	FirstHiveIDs   []string              `json:"first_hive_ids,omitempty"`
}

// HarvestsListResponse represents the list harvests API response.
type HarvestsListResponse struct {
	Data []HarvestResponse `json:"data"`
	Meta MetaResponse      `json:"meta"`
}

// HarvestDataResponse represents a single harvest API response.
type HarvestDataResponse struct {
	Data HarvestResponse `json:"data"`
}

// HarvestAnalyticsResponse represents the analytics API response.
type HarvestAnalyticsResponse struct {
	Data storage.HarvestAnalytics `json:"data"`
}

// CreateHarvestRequest represents the request body for creating a harvest.
type CreateHarvestRequest struct {
	SiteID        string                     `json:"site_id"`
	HarvestedAt   string                     `json:"harvested_at"`
	TotalKg       float64                    `json:"total_kg"`
	Notes         *string                    `json:"notes,omitempty"`
	HiveBreakdown []HarvestHiveInputRequest  `json:"hive_breakdown"`
}

// HarvestHiveInputRequest represents per-hive input in the create request.
type HarvestHiveInputRequest struct {
	HiveID   string   `json:"hive_id"`
	Frames   *int     `json:"frames,omitempty"`
	AmountKg float64  `json:"amount_kg"`
}

// UpdateHarvestRequest represents the request body for updating a harvest.
type UpdateHarvestRequest struct {
	HarvestedAt   *string                    `json:"harvested_at,omitempty"`
	TotalKg       *float64                   `json:"total_kg,omitempty"`
	Notes         *string                    `json:"notes,omitempty"`
	HiveBreakdown []HarvestHiveInputRequest  `json:"hive_breakdown,omitempty"`
}

// harvestToResponse converts a storage.Harvest to a HarvestResponse.
func harvestToResponse(h *storage.Harvest) HarvestResponse {
	totalKg, _ := h.TotalKg.Float64()
	resp := HarvestResponse{
		ID:          h.ID,
		SiteID:      h.SiteID,
		HarvestedAt: h.HarvestedAt.Format("2006-01-02"),
		TotalKg:     totalKg,
		Notes:       h.Notes,
		CreatedAt:   h.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   h.UpdatedAt.Format(time.RFC3339),
	}

	// Convert hive breakdown
	if len(h.Hives) > 0 {
		resp.Hives = make([]HarvestHiveResponse, 0, len(h.Hives))
		for _, hh := range h.Hives {
			amountKg, _ := hh.AmountKg.Float64()
			resp.Hives = append(resp.Hives, HarvestHiveResponse{
				HiveID:   hh.HiveID,
				HiveName: hh.HiveName,
				Frames:   hh.Frames,
				AmountKg: amountKg,
			})
		}
	}

	return resp
}

// CreateHarvest handles POST /api/harvests - creates a harvest with per-hive breakdown.
func CreateHarvest(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateHarvestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.SiteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	if req.HarvestedAt == "" {
		respondError(w, "harvested_at is required", http.StatusBadRequest)
		return
	}

	if len(req.HiveBreakdown) == 0 {
		respondError(w, "At least one hive is required in hive_breakdown", http.StatusBadRequest)
		return
	}

	// Validate total_kg is positive
	if req.TotalKg <= 0 {
		respondError(w, "total_kg must be greater than 0", http.StatusBadRequest)
		return
	}

	// Parse date
	harvestedAt, err := time.Parse("2006-01-02", req.HarvestedAt)
	if err != nil {
		respondError(w, "Invalid harvested_at format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Verify site exists
	_, err = storage.GetSiteByID(r.Context(), conn, req.SiteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", req.SiteID).Msg("handler: failed to get site")
		respondError(w, "Failed to verify site", http.StatusInternalServerError)
		return
	}

	// Validate per-hive amounts sum to total
	var breakdownTotal float64
	hiveBreakdown := make([]storage.HarvestHiveInput, 0, len(req.HiveBreakdown))
	for _, hb := range req.HiveBreakdown {
		if hb.HiveID == "" {
			respondError(w, "hive_id is required in each hive_breakdown entry", http.StatusBadRequest)
			return
		}
		if hb.AmountKg < 0 {
			respondError(w, "amount_kg must be >= 0 in hive_breakdown", http.StatusBadRequest)
			return
		}

		// Verify hive exists
		_, err := storage.GetHiveByID(r.Context(), conn, hb.HiveID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Hive not found: "+hb.HiveID, http.StatusNotFound)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("hive_id", hb.HiveID).Msg("handler: failed to get hive")
			respondError(w, "Failed to verify hive", http.StatusInternalServerError)
			return
		}

		breakdownTotal += hb.AmountKg
		hiveBreakdown = append(hiveBreakdown, storage.HarvestHiveInput{
			HiveID:   hb.HiveID,
			Frames:   hb.Frames,
			AmountKg: decimal.NewFromFloat(hb.AmountKg),
		})
	}

	// Allow small floating point tolerance for sum comparison
	if math.Abs(breakdownTotal-req.TotalKg) > harvestSumTolerance {
		respondError(w, "Sum of hive amounts must equal total_kg", http.StatusBadRequest)
		return
	}

	// Check if this will be the first harvest (before creating)
	isFirst, err := storage.IsFirstHarvest(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to check first harvest")
		// Non-critical, continue without celebration
		isFirst = false
	}

	// Check which hives are getting their first harvest (before creating)
	var firstHiveIDs []string
	for _, hb := range req.HiveBreakdown {
		isFirstHive, err := storage.IsFirstHiveHarvest(r.Context(), conn, hb.HiveID)
		if err != nil {
			log.Error().Err(err).Str("hive_id", hb.HiveID).Msg("handler: failed to check first hive harvest")
			// Non-critical, continue
			continue
		}
		if isFirstHive {
			firstHiveIDs = append(firstHiveIDs, hb.HiveID)
		}
	}

	input := &storage.CreateHarvestInput{
		SiteID:        req.SiteID,
		HarvestedAt:   harvestedAt,
		TotalKg:       decimal.NewFromFloat(req.TotalKg),
		Notes:         req.Notes,
		HiveBreakdown: hiveBreakdown,
	}

	harvest, err := storage.CreateHarvest(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create harvest")
		respondError(w, "Failed to create harvest", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("harvest_id", harvest.ID).
		Str("tenant_id", tenantID).
		Float64("total_kg", req.TotalKg).
		Int("hive_count", len(hiveBreakdown)).
		Bool("is_first", isFirst).
		Msg("Harvest created")

	// Audit log: record harvest creation
	AuditCreate(r.Context(), "harvests", harvest.ID, harvest)

	resp := harvestToResponse(harvest)
	resp.IsFirstHarvest = isFirst
	if len(firstHiveIDs) > 0 {
		resp.FirstHiveIDs = firstHiveIDs
	}

	respondJSON(w, HarvestDataResponse{Data: resp}, http.StatusCreated)
}

// ListHarvestsByHive handles GET /api/hives/{hive_id}/harvests - returns all harvests for a hive.
func ListHarvestsByHive(w http.ResponseWriter, r *http.Request) {
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

	harvests, err := storage.ListHarvestsByHive(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list harvests")
		respondError(w, "Failed to list harvests", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]HarvestResponse, 0, len(harvests))
	for _, h := range harvests {
		responses = append(responses, harvestToResponse(&h))
	}

	respondJSON(w, HarvestsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// ListHarvestsBySite handles GET /api/sites/{site_id}/harvests - returns all harvests for a site.
func ListHarvestsBySite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "site_id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Verify site exists
	_, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	harvests, err := storage.ListHarvestsBySite(r.Context(), conn, siteID)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to list harvests")
		respondError(w, "Failed to list harvests", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]HarvestResponse, 0, len(harvests))
	for _, h := range harvests {
		responses = append(responses, harvestToResponse(&h))
	}

	respondJSON(w, HarvestsListResponse{
		Data: responses,
		Meta: MetaResponse{Total: len(responses)},
	}, http.StatusOK)
}

// GetHarvest handles GET /api/harvests/{id} - returns a specific harvest.
func GetHarvest(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	harvestID := chi.URLParam(r, "id")

	if harvestID == "" {
		respondError(w, "Harvest ID is required", http.StatusBadRequest)
		return
	}

	harvest, err := storage.GetHarvestByID(r.Context(), conn, harvestID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Harvest not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("harvest_id", harvestID).Msg("handler: failed to get harvest")
		respondError(w, "Failed to get harvest", http.StatusInternalServerError)
		return
	}

	respondJSON(w, HarvestDataResponse{Data: harvestToResponse(harvest)}, http.StatusOK)
}

// UpdateHarvest handles PUT /api/harvests/{id} - updates an existing harvest.
func UpdateHarvest(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	harvestID := chi.URLParam(r, "id")

	if harvestID == "" {
		respondError(w, "Harvest ID is required", http.StatusBadRequest)
		return
	}

	// Fetch existing harvest before update for audit logging
	existingHarvest, err := storage.GetHarvestByID(r.Context(), conn, harvestID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Harvest not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("harvest_id", harvestID).Msg("handler: failed to get harvest for update")
		respondError(w, "Failed to get harvest", http.StatusInternalServerError)
		return
	}

	var req UpdateHarvestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Parse date if provided
	var harvestedAt *time.Time
	if req.HarvestedAt != nil && *req.HarvestedAt != "" {
		t, err := time.Parse("2006-01-02", *req.HarvestedAt)
		if err != nil {
			respondError(w, "Invalid harvested_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		harvestedAt = &t
	}

	// Convert total_kg if provided
	var totalKg *decimal.Decimal
	if req.TotalKg != nil {
		if *req.TotalKg <= 0 {
			respondError(w, "total_kg must be greater than 0", http.StatusBadRequest)
			return
		}
		d := decimal.NewFromFloat(*req.TotalKg)
		totalKg = &d
	}

	// Convert hive breakdown if provided
	var hiveBreakdown []storage.HarvestHiveInput
	var breakdownTotal float64
	if len(req.HiveBreakdown) > 0 {
		hiveBreakdown = make([]storage.HarvestHiveInput, 0, len(req.HiveBreakdown))
		for _, hb := range req.HiveBreakdown {
			if hb.HiveID == "" {
				respondError(w, "hive_id is required in each hive_breakdown entry", http.StatusBadRequest)
				return
			}
			if hb.AmountKg < 0 {
				respondError(w, "amount_kg must be >= 0", http.StatusBadRequest)
				return
			}

			// Verify hive exists
			_, err := storage.GetHiveByID(r.Context(), conn, hb.HiveID)
			if errors.Is(err, storage.ErrNotFound) {
				respondError(w, "Hive not found: "+hb.HiveID, http.StatusNotFound)
				return
			}
			if err != nil {
				log.Error().Err(err).Str("hive_id", hb.HiveID).Msg("handler: failed to get hive")
				respondError(w, "Failed to verify hive", http.StatusInternalServerError)
				return
			}

			breakdownTotal += hb.AmountKg
			hiveBreakdown = append(hiveBreakdown, storage.HarvestHiveInput{
				HiveID:   hb.HiveID,
				Frames:   hb.Frames,
				AmountKg: decimal.NewFromFloat(hb.AmountKg),
			})
		}

		// Validate per-hive amounts sum to total
		if req.TotalKg != nil {
			// Validate against the new total_kg being updated
			if math.Abs(breakdownTotal-*req.TotalKg) > harvestSumTolerance {
				respondError(w, "Sum of hive amounts must equal total_kg", http.StatusBadRequest)
				return
			}
		} else {
			// Validate against existing harvest total when only updating breakdown
			// (existingHarvest already fetched above for audit logging)
			existingTotal, _ := existingHarvest.TotalKg.Float64()
			if math.Abs(breakdownTotal-existingTotal) > harvestSumTolerance {
				respondError(w, "Sum of hive amounts must equal existing total_kg", http.StatusBadRequest)
				return
			}
		}
	}

	input := &storage.UpdateHarvestInput{
		HarvestedAt:   harvestedAt,
		TotalKg:       totalKg,
		Notes:         req.Notes,
		HiveBreakdown: hiveBreakdown,
	}

	harvest, err := storage.UpdateHarvest(r.Context(), conn, harvestID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Harvest not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("harvest_id", harvestID).Msg("handler: failed to update harvest")
		respondError(w, "Failed to update harvest", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("harvest_id", harvest.ID).
		Msg("Harvest updated")

	// Audit log: record harvest update with old and new values
	AuditUpdate(r.Context(), "harvests", harvest.ID, existingHarvest, harvest)

	respondJSON(w, HarvestDataResponse{Data: harvestToResponse(harvest)}, http.StatusOK)
}

// DeleteHarvest handles DELETE /api/harvests/{id} - deletes a harvest.
func DeleteHarvest(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	harvestID := chi.URLParam(r, "id")

	if harvestID == "" {
		respondError(w, "Harvest ID is required", http.StatusBadRequest)
		return
	}

	// Fetch existing harvest before delete for audit logging
	existingHarvest, err := storage.GetHarvestByID(r.Context(), conn, harvestID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Harvest not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("harvest_id", harvestID).Msg("handler: failed to get harvest for delete")
		respondError(w, "Failed to get harvest", http.StatusInternalServerError)
		return
	}

	err = storage.DeleteHarvest(r.Context(), conn, harvestID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Harvest not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("harvest_id", harvestID).Msg("handler: failed to delete harvest")
		respondError(w, "Failed to delete harvest", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("harvest_id", harvestID).
		Msg("Harvest deleted")

	// Audit log: record harvest deletion with old values
	AuditDelete(r.Context(), "harvests", harvestID, existingHarvest)

	w.WriteHeader(http.StatusNoContent)
}

// GetHarvestAnalytics handles GET /api/harvests/analytics - returns harvest analytics.
func GetHarvestAnalytics(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	analytics, err := storage.GetHarvestAnalytics(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get harvest analytics")
		respondError(w, "Failed to get harvest analytics", http.StatusInternalServerError)
		return
	}

	respondJSON(w, HarvestAnalyticsResponse{Data: *analytics}, http.StatusOK)
}
