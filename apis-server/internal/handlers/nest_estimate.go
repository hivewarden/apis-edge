package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// NestEstimateData contains the nest radius estimation data.
type NestEstimateData struct {
	EstimatedRadiusM         *float64 `json:"estimated_radius_m"`
	ObservationCount         int      `json:"observation_count"`
	Confidence               *string  `json:"confidence"`
	AvgVisitIntervalMinutes  *float64 `json:"avg_visit_interval_minutes,omitempty"`
	MinObservationsRequired  int      `json:"min_observations_required,omitempty"`
	Message                  string   `json:"message,omitempty"`
	CalculationMethod        string   `json:"calculation_method,omitempty"`
}

// NestEstimateResponse represents the nest estimate API response.
type NestEstimateResponse struct {
	Data NestEstimateData `json:"data"`
}

// Hornet flight speed: approximately 22 km/h = 367 m/min
const flightSpeedMPerMin = 367.0
const minObservations = 20
const minValidIntervals = 5 // Minimum valid intervals needed for reliable calculation

// GetNestEstimate handles GET /api/sites/{id}/nest-estimate
// Calculates estimated nest radius based on detection patterns.
func GetNestEstimate(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Verify site exists (RLS ensures tenant isolation)
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err != nil {
		log.Debug().Err(err).Str("site_id", siteID).Msg("handler: site not found for nest estimate")
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}

	// Check site has coordinates
	if site.Latitude == nil || site.Longitude == nil {
		respondJSON(w, NestEstimateResponse{
			Data: NestEstimateData{
				ObservationCount:        0,
				MinObservationsRequired: minObservations,
				Message:                 "Site coordinates not set",
			},
		}, http.StatusOK)
		return
	}

	// Get detection count and average visit interval
	stats, err := storage.GetNestEstimateStats(r.Context(), conn, siteID)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get nest estimate stats")
		respondError(w, "Failed to calculate nest estimate", http.StatusInternalServerError)
		return
	}

	// Check if we have enough observations
	if stats.ObservationCount < minObservations {
		respondJSON(w, NestEstimateResponse{
			Data: NestEstimateData{
				ObservationCount:        stats.ObservationCount,
				MinObservationsRequired: minObservations,
				Message:                 "Need more observations to estimate nest location",
			},
		}, http.StatusOK)
		return
	}

	// Check if we have enough valid intervals for a reliable calculation
	// Valid intervals are those > 0 min and < 120 min (filtering out rapid-fire or very long gaps)
	if stats.ValidIntervalsCount < minValidIntervals || stats.AvgVisitIntervalMinutes <= 0 {
		respondJSON(w, NestEstimateResponse{
			Data: NestEstimateData{
				ObservationCount:        stats.ObservationCount,
				MinObservationsRequired: minObservations,
				Message:                 "Insufficient valid interval data for estimation. Detection times may be too close together or too far apart.",
			},
		}, http.StatusOK)
		return
	}

	// Calculate estimated radius
	// Radius = (avg_visit_interval_minutes * flight_speed_m_per_min) / 2
	// Division by 2 accounts for round trip (to nest and back)
	radiusM := (stats.AvgVisitIntervalMinutes * flightSpeedMPerMin) / 2

	// Cap the radius at reasonable values (50m to 2000m)
	if radiusM < 50 {
		radiusM = 50
	}
	if radiusM > 2000 {
		radiusM = 2000
	}

	// Determine confidence level based on both observation count and valid intervals
	var confidence string
	if stats.ObservationCount > 50 && stats.ValidIntervalsCount > 30 {
		confidence = "high"
	} else if stats.ObservationCount >= 20 && stats.ValidIntervalsCount >= 10 {
		confidence = "medium"
	} else {
		confidence = "low"
	}

	respondJSON(w, NestEstimateResponse{
		Data: NestEstimateData{
			EstimatedRadiusM:        &radiusM,
			ObservationCount:        stats.ObservationCount,
			Confidence:              &confidence,
			AvgVisitIntervalMinutes: &stats.AvgVisitIntervalMinutes,
			CalculationMethod:       "visit_interval",
		},
	}, http.StatusOK)
}
