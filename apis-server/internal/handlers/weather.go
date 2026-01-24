// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// WeatherResponse represents the weather API response.
type WeatherResponse struct {
	TemperatureC float64 `json:"temperature_c"`
	FeelsLikeC   float64 `json:"feels_like_c"`
	Humidity     int     `json:"humidity"`
	Condition    string  `json:"condition"`
	WeatherCode  int     `json:"weather_code"`
	Icon         string  `json:"icon"`
	WindSpeedKmh float64 `json:"wind_speed_kmh"`
	RecordedAt   string  `json:"recorded_at"`
	IsCached     bool    `json:"is_cached"`
}

// WeatherDataResponse wraps the weather response.
type WeatherDataResponse struct {
	Data WeatherResponse `json:"data"`
}

// Weather cache duration (30 minutes)
const weatherCacheDuration = 30 * time.Minute

// Global weather client instance
var weatherClient = services.NewWeatherClient()

// GetSiteWeather handles GET /api/sites/{id}/weather - returns current weather for a site.
func GetSiteWeather(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")
	tenantID := middleware.GetTenantID(r.Context())

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Get site to retrieve GPS coordinates
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site for weather")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	// Check if site has GPS coordinates
	if site.Latitude == nil || site.Longitude == nil {
		respondError(w, "Site does not have GPS coordinates", http.StatusBadRequest)
		return
	}

	// Try to get cached weather first
	cached, err := storage.GetWeatherSnapshotWithinAge(r.Context(), conn, siteID, weatherCacheDuration)
	if err == nil && cached != nil {
		// Return cached data
		respondJSON(w, WeatherDataResponse{
			Data: WeatherResponse{
				TemperatureC: cached.TemperatureC,
				FeelsLikeC:   valueOrZero(cached.FeelsLikeC),
				Humidity:     valueOrZeroInt(cached.Humidity),
				Condition:    weatherCodeToCondition(valueOrZeroInt(cached.WeatherCode)),
				WeatherCode:  valueOrZeroInt(cached.WeatherCode),
				Icon:         services.WeatherCodeToIcon(valueOrZeroInt(cached.WeatherCode)),
				WindSpeedKmh: valueOrZero(cached.WindSpeedKmh),
				RecordedAt:   cached.RecordedAt.Format(time.RFC3339),
				IsCached:     true,
			},
		}, http.StatusOK)
		return
	}

	// Fetch fresh weather data from Open-Meteo
	weather, err := weatherClient.FetchCurrentWeather(r.Context(), *site.Latitude, *site.Longitude)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to fetch weather")

		// If we have stale cache, return it with warning
		if stale, staleErr := storage.GetLatestWeatherSnapshot(r.Context(), conn, siteID); staleErr == nil && stale != nil {
			respondJSON(w, WeatherDataResponse{
				Data: WeatherResponse{
					TemperatureC: stale.TemperatureC,
					FeelsLikeC:   valueOrZero(stale.FeelsLikeC),
					Humidity:     valueOrZeroInt(stale.Humidity),
					Condition:    weatherCodeToCondition(valueOrZeroInt(stale.WeatherCode)),
					WeatherCode:  valueOrZeroInt(stale.WeatherCode),
					Icon:         services.WeatherCodeToIcon(valueOrZeroInt(stale.WeatherCode)),
					WindSpeedKmh: valueOrZero(stale.WindSpeedKmh),
					RecordedAt:   stale.RecordedAt.Format(time.RFC3339),
					IsCached:     true,
				},
			}, http.StatusOK)
			return
		}

		respondError(w, "Weather data unavailable", http.StatusServiceUnavailable)
		return
	}

	// Cache the weather data
	humidity := weather.Humidity
	weatherCode := weather.WeatherCode
	windSpeed := weather.WindSpeedKmh
	feelsLike := weather.FeelsLikeC

	_, cacheErr := storage.CreateWeatherSnapshot(r.Context(), conn, tenantID, siteID, &storage.CreateWeatherSnapshotInput{
		TemperatureC: weather.TemperatureC,
		FeelsLikeC:   &feelsLike,
		Humidity:     &humidity,
		WeatherCode:  &weatherCode,
		WindSpeedKmh: &windSpeed,
		RecordedAt:   weather.RecordedAt,
	})
	if cacheErr != nil {
		// Log but don't fail - we still have the data
		log.Warn().Err(cacheErr).Str("site_id", siteID).Msg("handler: failed to cache weather snapshot")
	}

	respondJSON(w, WeatherDataResponse{
		Data: WeatherResponse{
			TemperatureC: weather.TemperatureC,
			FeelsLikeC:   weather.FeelsLikeC,
			Humidity:     weather.Humidity,
			Condition:    weather.Condition,
			WeatherCode:  weather.WeatherCode,
			Icon:         services.WeatherCodeToIcon(weather.WeatherCode),
			WindSpeedKmh: weather.WindSpeedKmh,
			RecordedAt:   weather.RecordedAt.Format(time.RFC3339),
			IsCached:     false,
		},
	}, http.StatusOK)
}

// weatherCodeToCondition converts WMO weather codes to human-readable conditions.
func weatherCodeToCondition(code int) string {
	switch {
	case code == 0:
		return "Clear sky"
	case code == 1:
		return "Mainly clear"
	case code == 2:
		return "Partly cloudy"
	case code == 3:
		return "Overcast"
	case code >= 45 && code <= 48:
		return "Fog"
	case code >= 51 && code <= 55:
		return "Drizzle"
	case code >= 56 && code <= 57:
		return "Freezing drizzle"
	case code >= 61 && code <= 65:
		return "Rain"
	case code >= 66 && code <= 67:
		return "Freezing rain"
	case code >= 71 && code <= 77:
		return "Snow"
	case code >= 80 && code <= 82:
		return "Rain showers"
	case code >= 85 && code <= 86:
		return "Snow showers"
	case code == 95:
		return "Thunderstorm"
	case code >= 96 && code <= 99:
		return "Thunderstorm with hail"
	default:
		return "Unknown"
	}
}

// Helper functions for pointer types
func valueOrZero(ptr *float64) float64 {
	if ptr == nil {
		return 0
	}
	return *ptr
}

func valueOrZeroInt(ptr *int) int {
	if ptr == nil {
		return 0
	}
	return *ptr
}
