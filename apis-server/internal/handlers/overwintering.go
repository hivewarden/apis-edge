// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/microcosm-cc/bluemonday"
	"github.com/rs/zerolog/log"
)

// sanitizer is a strict HTML policy that strips all HTML tags for XSS prevention
var sanitizer = bluemonday.StrictPolicy()

// OverwinteringPromptResponse represents the spring prompt API response.
type OverwinteringPromptResponse struct {
	Data services.SpringPromptData `json:"data"`
}

// OverwinteringRecordResponse represents an overwintering record in API responses.
type OverwinteringRecordResponse struct {
	ID                   string  `json:"id"`
	HiveID               string  `json:"hive_id"`
	HiveName             string  `json:"hive_name,omitempty"`
	WinterSeason         int     `json:"winter_season"`
	Survived             bool    `json:"survived"`
	Condition            *string `json:"condition,omitempty"`
	ConditionDisplay     string  `json:"condition_display,omitempty"`
	StoresRemaining      *string `json:"stores_remaining,omitempty"`
	StoresDisplay        string  `json:"stores_display,omitempty"`
	FirstInspectionNotes *string `json:"first_inspection_notes,omitempty"`
	RecordedAt           string  `json:"recorded_at"`
	CreatedAt            string  `json:"created_at"`
}

// OverwinteringDataResponse represents a single overwintering record API response.
type OverwinteringDataResponse struct {
	Data     OverwinteringRecordResponse `json:"data"`
	Message  string                      `json:"message,omitempty"`
	Redirect string                      `json:"redirect,omitempty"`
}

// OverwinteringHiveResponse represents a hive with its existing overwintering record.
type OverwinteringHiveResponse struct {
	HiveID         string                       `json:"hive_id"`
	HiveName       string                       `json:"hive_name"`
	ExistingRecord *OverwinteringRecordResponse `json:"existing_record,omitempty"`
}

// OverwinteringHivesResponse represents the hives list API response for overwintering.
type OverwinteringHivesResponse struct {
	Data []OverwinteringHiveResponse `json:"data"`
	Meta MetaResponse                `json:"meta"`
}

// WinterReportResponse represents the winter report API response.
type WinterReportResponse struct {
	Data storage.WinterReport `json:"data"`
}

// SurvivalTrendsResponse represents the survival trends API response.
type SurvivalTrendsResponse struct {
	Data []storage.WinterSurvivalTrend `json:"data"`
	Meta MetaResponse                   `json:"meta"`
}

// AvailableSeasonsResponse represents the available seasons API response.
type AvailableSeasonsResponse struct {
	Data []int        `json:"data"`
	Meta MetaResponse `json:"meta"`
}

// CreateOverwinteringRequest represents the request body for creating an overwintering record.
type CreateOverwinteringRequest struct {
	HiveID               string  `json:"hive_id"`
	WinterSeason         int     `json:"winter_season"`
	Survived             bool    `json:"survived"`
	Condition            *string `json:"condition,omitempty"`
	StoresRemaining      *string `json:"stores_remaining,omitempty"`
	FirstInspectionNotes *string `json:"first_inspection_notes,omitempty"`
}

// overwinteringRecordToResponse converts a storage.OverwinteringRecord to an API response.
func overwinteringRecordToResponse(r *storage.OverwinteringRecord) OverwinteringRecordResponse {
	resp := OverwinteringRecordResponse{
		ID:                   r.ID,
		HiveID:               r.HiveID,
		HiveName:             r.HiveName,
		WinterSeason:         r.WinterSeason,
		Survived:             r.Survived,
		Condition:            r.Condition,
		StoresRemaining:      r.StoresRemaining,
		FirstInspectionNotes: r.FirstInspectionNotes,
		RecordedAt:           r.RecordedAt.Format("2006-01-02"),
		CreatedAt:            r.CreatedAt.Format(time.RFC3339),
	}

	// Add display names
	if r.Condition != nil {
		resp.ConditionDisplay = storage.ConditionDisplayNames[*r.Condition]
	}
	if r.StoresRemaining != nil {
		resp.StoresDisplay = storage.StoresDisplayNames[*r.StoresRemaining]
	}

	return resp
}

// GetOverwinteringPrompt handles GET /api/overwintering/prompt - checks if spring prompt should show.
func GetOverwinteringPrompt(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Get hemisphere from query params (default: northern)
	hemisphere := r.URL.Query().Get("hemisphere")
	if hemisphere == "" {
		hemisphere = "northern"
	}
	if hemisphere != "northern" && hemisphere != "southern" {
		respondError(w, "hemisphere must be 'northern' or 'southern'", http.StatusBadRequest)
		return
	}

	// Check if it's spring prompt time
	isSpringTime := services.IsSpringPromptTime(hemisphere)
	winterSeason := services.GetCurrentWinterSeason(hemisphere)

	if !isSpringTime {
		respondJSON(w, OverwinteringPromptResponse{
			Data: services.SpringPromptData{
				ShouldShow:   false,
				WinterSeason: winterSeason,
				SeasonLabel:  services.GetWinterSeasonLabel(winterSeason),
				Message:      "",
			},
		}, http.StatusOK)
		return
	}

	// Check if user has already recorded for this season
	hasRecords, err := storage.HasOverwinteringRecordForSeason(r.Context(), conn, tenantID, winterSeason)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to check overwintering records")
		respondError(w, "Failed to check overwintering records", http.StatusInternalServerError)
		return
	}

	respondJSON(w, OverwinteringPromptResponse{
		Data: services.SpringPromptData{
			ShouldShow:   !hasRecords,
			WinterSeason: winterSeason,
			SeasonLabel:  services.GetWinterSeasonLabel(winterSeason),
			Message:      "Time for spring inspection! Did all your hives survive winter?",
		},
	}, http.StatusOK)
}

// GetOverwinteringHives handles GET /api/overwintering/hives - gets hives for overwintering entry.
func GetOverwinteringHives(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Get winter_season from query params (required)
	winterSeasonStr := r.URL.Query().Get("winter_season")
	if winterSeasonStr == "" {
		respondError(w, "winter_season query parameter is required", http.StatusBadRequest)
		return
	}

	winterSeason, err := strconv.Atoi(winterSeasonStr)
	if err != nil || winterSeason < 2000 || winterSeason > 2100 {
		respondError(w, "Invalid winter_season value", http.StatusBadRequest)
		return
	}

	hives, err := storage.GetHivesForOverwintering(r.Context(), conn, tenantID, winterSeason)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Int("winter_season", winterSeason).Msg("handler: failed to get hives for overwintering")
		respondError(w, "Failed to get hives", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	hiveResponses := make([]OverwinteringHiveResponse, 0, len(hives))
	for _, h := range hives {
		resp := OverwinteringHiveResponse{
			HiveID:   h.HiveID,
			HiveName: h.HiveName,
		}
		if h.ExistingRecord != nil {
			recResp := overwinteringRecordToResponse(h.ExistingRecord)
			resp.ExistingRecord = &recResp
		}
		hiveResponses = append(hiveResponses, resp)
	}

	respondJSON(w, OverwinteringHivesResponse{
		Data: hiveResponses,
		Meta: MetaResponse{Total: len(hiveResponses)},
	}, http.StatusOK)
}

// CreateOverwinteringRecord handles POST /api/overwintering - submits an overwintering record.
func CreateOverwinteringRecord(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateOverwinteringRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.HiveID == "" {
		respondError(w, "hive_id is required", http.StatusBadRequest)
		return
	}
	if req.WinterSeason < 2000 || req.WinterSeason > 2100 {
		respondError(w, "Invalid winter_season value", http.StatusBadRequest)
		return
	}

	// Verify hive exists
	hive, err := storage.GetHiveByID(r.Context(), conn, req.HiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", req.HiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to verify hive", http.StatusInternalServerError)
		return
	}

	// Validate condition/stores only allowed if survived
	if !req.Survived {
		if req.Condition != nil || req.StoresRemaining != nil || req.FirstInspectionNotes != nil {
			respondError(w, "condition, stores_remaining, and first_inspection_notes can only be set for surviving hives", http.StatusBadRequest)
			return
		}
	}

	// Validate condition value if provided
	if req.Condition != nil && !storage.IsValidCondition(*req.Condition) {
		respondError(w, "Invalid condition value. Must be: strong, medium, or weak", http.StatusBadRequest)
		return
	}

	// Validate stores_remaining value if provided
	if req.StoresRemaining != nil && !storage.IsValidStoresRemaining(*req.StoresRemaining) {
		respondError(w, "Invalid stores_remaining value. Must be: none, low, adequate, or plenty", http.StatusBadRequest)
		return
	}

	// Sanitize first_inspection_notes for XSS prevention
	var sanitizedNotes *string
	if req.FirstInspectionNotes != nil {
		sanitized := sanitizer.Sanitize(*req.FirstInspectionNotes)
		sanitizedNotes = &sanitized
	}

	// Create the overwintering record
	input := &storage.CreateOverwinteringInput{
		HiveID:               req.HiveID,
		WinterSeason:         req.WinterSeason,
		Survived:             req.Survived,
		Condition:            req.Condition,
		StoresRemaining:      req.StoresRemaining,
		FirstInspectionNotes: sanitizedNotes,
	}

	record, err := storage.CreateOverwinteringRecord(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("hive_id", req.HiveID).Int("winter_season", req.WinterSeason).Msg("handler: failed to create overwintering record")
		respondError(w, "Failed to create overwintering record", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("overwintering_id", record.ID).
		Str("hive_id", req.HiveID).
		Str("hive_name", hive.Name).
		Int("winter_season", req.WinterSeason).
		Bool("survived", req.Survived).
		Str("tenant_id", tenantID).
		Msg("Overwintering record created")

	// Return appropriate message based on survival
	resp := OverwinteringDataResponse{
		Data: overwinteringRecordToResponse(record),
	}

	if req.Survived {
		resp.Message = "Overwintering record saved"
	} else {
		resp.Message = "Record saved. Please complete the post-mortem for this hive."
		resp.Redirect = "/hives/" + req.HiveID + "/loss"
	}

	respondJSON(w, resp, http.StatusCreated)
}

// GetWinterReport handles GET /api/overwintering/report - gets the winter report.
func GetWinterReport(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Get hemisphere to determine current season (optional, for default season)
	hemisphere := r.URL.Query().Get("hemisphere")
	if hemisphere == "" {
		hemisphere = "northern"
	}

	// Get winter_season from query params (default: current)
	winterSeasonStr := r.URL.Query().Get("winter_season")
	var winterSeason int
	if winterSeasonStr == "" {
		winterSeason = services.GetCurrentWinterSeason(hemisphere)
	} else {
		var err error
		winterSeason, err = strconv.Atoi(winterSeasonStr)
		if err != nil || winterSeason < 2000 || winterSeason > 2100 {
			respondError(w, "Invalid winter_season value", http.StatusBadRequest)
			return
		}
	}

	report, err := storage.GetWinterReport(r.Context(), conn, tenantID, winterSeason)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Int("winter_season", winterSeason).Msg("handler: failed to get winter report")
		respondError(w, "Failed to get winter report", http.StatusInternalServerError)
		return
	}

	respondJSON(w, WinterReportResponse{Data: *report}, http.StatusOK)
}

// GetSurvivalTrends handles GET /api/overwintering/trends - gets survival trends.
func GetSurvivalTrends(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Get years from query params (default: 5)
	yearsStr := r.URL.Query().Get("years")
	years := 5
	if yearsStr != "" {
		var err error
		years, err = strconv.Atoi(yearsStr)
		if err != nil || years < 1 || years > 20 {
			respondError(w, "Invalid years value (must be 1-20)", http.StatusBadRequest)
			return
		}
	}

	trends, err := storage.GetSurvivalTrends(r.Context(), conn, tenantID, years)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Int("years", years).Msg("handler: failed to get survival trends")
		respondError(w, "Failed to get survival trends", http.StatusInternalServerError)
		return
	}

	respondJSON(w, SurvivalTrendsResponse{
		Data: trends,
		Meta: MetaResponse{Total: len(trends)},
	}, http.StatusOK)
}

// GetOverwinteringSeasons handles GET /api/overwintering/seasons - lists available winter seasons.
func GetOverwinteringSeasons(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	seasons, err := storage.GetAvailableWinterSeasons(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to get available seasons")
		respondError(w, "Failed to get available seasons", http.StatusInternalServerError)
		return
	}

	respondJSON(w, AvailableSeasonsResponse{
		Data: seasons,
		Meta: MetaResponse{Total: len(seasons)},
	}, http.StatusOK)
}
