package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// WeatherResponse represents the weather API response.
type WeatherResponse struct {
	Data services.WeatherData `json:"data"`
}

// GetSiteWeather handles GET /api/sites/{id}/weather - returns current weather for a site.
// Authenticated via JWT (dashboard authentication).
func GetSiteWeather(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Get the site to check GPS coordinates
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Site not found", http.StatusNotFound)
			return
		}
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	// Check if site has GPS coordinates
	if site.Latitude == nil || site.Longitude == nil {
		respondError(w, "Site has no GPS coordinates", http.StatusBadRequest)
		return
	}

	// Get weather from service (handles caching)
	weather, err := services.GetWeather(r.Context(), *site.Latitude, *site.Longitude)
	if err != nil {
		log.Error().Err(err).
			Str("site_id", siteID).
			Float64("latitude", *site.Latitude).
			Float64("longitude", *site.Longitude).
			Msg("handler: failed to get weather")
		respondError(w, "Weather unavailable", http.StatusServiceUnavailable)
		return
	}

	respondJSON(w, WeatherResponse{Data: *weather}, http.StatusOK)
}
