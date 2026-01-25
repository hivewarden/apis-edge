package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"

	authmw "github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// recapService is the singleton season recap service.
var recapService *services.SeasonRecapService

// initRecapService initializes the recap service with the database pool.
func initRecapService() {
	if recapService == nil && storage.DB != nil {
		recapService = services.NewSeasonRecapService(storage.DB)
	}
}

// GetRecap handles GET /api/recap - Get current or specified season recap.
// Query params:
//   - season (optional): Year (e.g., 2026). Default: current season
//   - hemisphere (optional): "northern" or "southern". Default: "northern"
//   - format (optional): "json" or "text". Default: "json"
func GetRecap(w http.ResponseWriter, r *http.Request) {
	initRecapService()

	tenantID := authmw.GetTenantID(r.Context())
	if tenantID == "" {
		respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query parameters
	hemisphere := r.URL.Query().Get("hemisphere")
	if hemisphere != "northern" && hemisphere != "southern" {
		hemisphere = "northern"
	}

	seasonStr := r.URL.Query().Get("season")
	var year int
	if seasonStr != "" {
		var err error
		year, err = strconv.Atoi(seasonStr)
		if err != nil || year < 2000 || year > 2100 {
			respondError(w, "Invalid season year", http.StatusBadRequest)
			return
		}
	} else {
		year = services.GetCurrentSeason(hemisphere)
	}

	format := r.URL.Query().Get("format")
	if format != "text" {
		format = "json"
	}

	// Get or generate recap
	recap, err := recapService.GetOrGenerateRecap(r.Context(), tenantID, year, hemisphere, false)
	if err != nil {
		log.Error().Err(err).Int("year", year).Msg("handlers: failed to get recap")
		respondError(w, "Failed to generate recap", http.StatusInternalServerError)
		return
	}

	if format == "text" {
		// Return plain text format
		text := recapService.GetRecapAsText(recap)
		respondJSON(w, map[string]any{
			"data": map[string]any{
				"text": text,
			},
		}, http.StatusOK)
		return
	}

	// Return full JSON recap
	respondJSON(w, map[string]any{
		"data": map[string]any{
			"id":               recap.ID,
			"season_year":      recap.SeasonYear,
			"hemisphere":       recap.Hemisphere,
			"season_dates":     recap.RecapData.SeasonDates,
			"total_harvest_kg": recap.RecapData.TotalHarvestKg,
			"hornets_deterred": recap.RecapData.HornetsDeterred,
			"inspections_count": recap.RecapData.InspectionsCount,
			"treatments_count":  recap.RecapData.TreatmentsCount,
			"feedings_count":    recap.RecapData.FeedingsCount,
			"milestones":        recap.RecapData.Milestones,
			"per_hive_stats":    recap.RecapData.PerHiveStats,
			"comparison_data":   recap.RecapData.ComparisonData,
			"generated_at":      recap.GeneratedAt.Format(time.RFC3339),
		},
	}, http.StatusOK)
}

// GetAvailableSeasons handles GET /api/recap/seasons - List available seasons.
func GetAvailableSeasons(w http.ResponseWriter, r *http.Request) {
	tenantID := authmw.GetTenantID(r.Context())
	if tenantID == "" {
		respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := storage.DB.Acquire(r.Context())
	if err != nil {
		log.Error().Err(err).Msg("handlers: failed to acquire connection")
		respondError(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer conn.Release()

	years, err := storage.GetAvailableSeasons(r.Context(), conn, tenantID)
	if err != nil {
		log.Error().Err(err).Msg("handlers: failed to get available seasons")
		respondError(w, "Failed to get available seasons", http.StatusInternalServerError)
		return
	}

	if years == nil {
		years = []int{}
	}

	respondJSON(w, map[string]any{
		"data": years,
		"meta": map[string]any{
			"total": len(years),
		},
	}, http.StatusOK)
}

// RegenerateRecapRequest is the request body for regenerating a recap.
type RegenerateRecapRequest struct {
	Season     int    `json:"season"`
	Hemisphere string `json:"hemisphere,omitempty"`
}

// RegenerateRecap handles POST /api/recap/regenerate - Force regenerate cached recap.
func RegenerateRecap(w http.ResponseWriter, r *http.Request) {
	initRecapService()

	tenantID := authmw.GetTenantID(r.Context())
	if tenantID == "" {
		respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req RegenerateRecapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Season < 2000 || req.Season > 2100 {
		respondError(w, "Invalid season year", http.StatusBadRequest)
		return
	}

	hemisphere := req.Hemisphere
	if hemisphere != "northern" && hemisphere != "southern" {
		hemisphere = "northern"
	}

	// Force regenerate
	recap, err := recapService.GetOrGenerateRecap(r.Context(), tenantID, req.Season, hemisphere, true)
	if err != nil {
		log.Error().Err(err).Int("year", req.Season).Msg("handlers: failed to regenerate recap")
		respondError(w, "Failed to regenerate recap", http.StatusInternalServerError)
		return
	}

	respondJSON(w, map[string]any{
		"data": map[string]any{
			"id":               recap.ID,
			"season_year":      recap.SeasonYear,
			"hemisphere":       recap.Hemisphere,
			"season_dates":     recap.RecapData.SeasonDates,
			"total_harvest_kg": recap.RecapData.TotalHarvestKg,
			"hornets_deterred": recap.RecapData.HornetsDeterred,
			"inspections_count": recap.RecapData.InspectionsCount,
			"treatments_count":  recap.RecapData.TreatmentsCount,
			"feedings_count":    recap.RecapData.FeedingsCount,
			"milestones":        recap.RecapData.Milestones,
			"per_hive_stats":    recap.RecapData.PerHiveStats,
			"comparison_data":   recap.RecapData.ComparisonData,
			"generated_at":      recap.GeneratedAt.Format(time.RFC3339),
		},
		"message": "Season recap regenerated successfully",
	}, http.StatusOK)
}

// GetRecapText handles GET /api/recap/text - Get recap as formatted text.
func GetRecapText(w http.ResponseWriter, r *http.Request) {
	initRecapService()

	tenantID := authmw.GetTenantID(r.Context())
	if tenantID == "" {
		respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse query parameters
	hemisphere := r.URL.Query().Get("hemisphere")
	if hemisphere != "northern" && hemisphere != "southern" {
		hemisphere = "northern"
	}

	seasonStr := r.URL.Query().Get("season")
	var year int
	if seasonStr != "" {
		var err error
		year, err = strconv.Atoi(seasonStr)
		if err != nil || year < 2000 || year > 2100 {
			respondError(w, "Invalid season year", http.StatusBadRequest)
			return
		}
	} else {
		year = services.GetCurrentSeason(hemisphere)
	}

	// Get or generate recap
	recap, err := recapService.GetOrGenerateRecap(r.Context(), tenantID, year, hemisphere, false)
	if err != nil {
		log.Error().Err(err).Int("year", year).Msg("handlers: failed to get recap for text")
		respondError(w, "Failed to generate recap", http.StatusInternalServerError)
		return
	}

	text := recapService.GetRecapAsText(recap)

	respondJSON(w, map[string]any{
		"data": map[string]any{
			"text": text,
		},
	}, http.StatusOK)
}

// IsRecapTime handles GET /api/recap/is-time - Check if it's recap prompt time.
func IsRecapTime(w http.ResponseWriter, r *http.Request) {
	hemisphere := r.URL.Query().Get("hemisphere")
	if hemisphere != "northern" && hemisphere != "southern" {
		hemisphere = "northern"
	}

	isTime := services.IsRecapTime(hemisphere)
	currentSeason := services.GetCurrentSeason(hemisphere)

	respondJSON(w, map[string]any{
		"data": map[string]any{
			"is_recap_time":   isTime,
			"current_season":  currentSeason,
			"hemisphere":      hemisphere,
		},
	}, http.StatusOK)
}
