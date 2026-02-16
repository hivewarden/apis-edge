// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Weather service constants.
const (
	weatherCacheTTL        = 30 * time.Minute
	weatherHTTPTimeout     = 10 * time.Second
	weatherCacheMaxEntries = 1000 // Prevent unbounded memory growth
)

// WeatherData represents current weather conditions.
type WeatherData struct {
	Temperature         float64   `json:"temperature"`
	ApparentTemperature float64   `json:"apparent_temperature"`
	Humidity            int       `json:"humidity"`
	WeatherCode         int       `json:"weather_code"`
	Condition           string    `json:"condition"`
	ConditionIcon       string    `json:"condition_icon"`
	FetchedAt           time.Time `json:"fetched_at"`
}

// openMeteoResponse represents the Open-Meteo API response structure.
type openMeteoResponse struct {
	Current struct {
		Temperature    float64 `json:"temperature_2m"`
		Humidity       int     `json:"relative_humidity_2m"`
		ApparentTemp   float64 `json:"apparent_temperature"`
		WeatherCode    int     `json:"weather_code"`
	} `json:"current"`
}

// WeatherCache stores weather data in memory with TTL and bounded size.
// Exported for testing purposes.
type WeatherCache struct {
	data map[string]WeatherData
	mu   sync.RWMutex
	ttl  time.Duration
}

// NewWeatherCache creates a new weather cache with default settings.
func NewWeatherCache() *WeatherCache {
	return &WeatherCache{
		data: make(map[string]WeatherData),
		ttl:  weatherCacheTTL,
	}
}

// NewWeatherCacheWithTTL creates a weather cache with custom TTL (for testing).
func NewWeatherCacheWithTTL(ttl time.Duration) *WeatherCache {
	return &WeatherCache{
		data: make(map[string]WeatherData),
		ttl:  ttl,
	}
}

// Default cache instance for backward compatibility
var cache = NewWeatherCache()

// Shared HTTP client for connection pooling and efficiency
var httpClient = &http.Client{
	Timeout: weatherHTTPTimeout,
	Transport: &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 5,
		IdleConnTimeout:     90 * time.Second,
	},
}

// ResetCache resets the default cache (for testing purposes).
func ResetCache() {
	cache = NewWeatherCache()
}

// pruneCache removes stale entries when cache exceeds max size.
// Must be called with write lock held.
func (c *WeatherCache) pruneStaleEntries() {
	if len(c.data) <= weatherCacheMaxEntries {
		return
	}

	// Remove entries older than TTL
	now := time.Now()
	for key, entry := range c.data {
		if now.Sub(entry.FetchedAt) > c.ttl {
			delete(c.data, key)
		}
	}

	// If still over limit, remove oldest entries
	if len(c.data) > weatherCacheMaxEntries {
		// Find and remove oldest entries until under limit
		for len(c.data) > weatherCacheMaxEntries {
			var oldestKey string
			var oldestTime time.Time
			first := true
			for key, entry := range c.data {
				if first || entry.FetchedAt.Before(oldestTime) {
					oldestKey = key
					oldestTime = entry.FetchedAt
					first = false
				}
			}
			delete(c.data, oldestKey)
		}
	}

	log.Debug().
		Int("cache_size", len(c.data)).
		Msg("weather: cache pruned")
}

// GetWeather retrieves weather data for the given coordinates.
// Returns cached data if available and fresh (< 30 min old).
// On API error, returns stale cached data if available.
func GetWeather(ctx context.Context, lat, lng float64) (*WeatherData, error) {
	key := fmt.Sprintf("%.4f,%.4f", lat, lng)

	// Check cache first
	cache.mu.RLock()
	if data, ok := cache.data[key]; ok {
		if time.Since(data.FetchedAt) < cache.ttl {
			cache.mu.RUnlock()
			log.Debug().
				Float64("latitude", lat).
				Float64("longitude", lng).
				Str("event", "weather_cache_hit").
				Msg("Weather data served from cache")
			return &data, nil
		}
	}
	cache.mu.RUnlock()

	// Fetch from API
	log.Debug().
		Float64("latitude", lat).
		Float64("longitude", lng).
		Str("event", "weather_api_fetch").
		Msg("Fetching weather from Open-Meteo API")

	data, err := fetchFromOpenMeteo(ctx, lat, lng)
	if err != nil {
		log.Warn().Err(err).
			Float64("latitude", lat).
			Float64("longitude", lng).
			Msg("weather: API fetch failed")

		// Return stale cached data if available (graceful degradation)
		cache.mu.RLock()
		if cached, ok := cache.data[key]; ok {
			cache.mu.RUnlock()
			log.Info().
				Float64("latitude", lat).
				Float64("longitude", lng).
				Time("cached_at", cached.FetchedAt).
				Msg("weather: returning stale cached data due to API error")
			return &cached, nil
		}
		cache.mu.RUnlock()
		return nil, err
	}

	// Update cache
	cache.mu.Lock()
	cache.data[key] = *data
	cache.pruneStaleEntries() // Prevent unbounded memory growth
	cache.mu.Unlock()

	log.Info().
		Float64("latitude", lat).
		Float64("longitude", lng).
		Float64("temperature", data.Temperature).
		Str("condition", data.Condition).
		Str("event", "weather_fetched").
		Msg("Weather data retrieved from API")

	return data, nil
}

// fetchFromOpenMeteo calls the Open-Meteo API to get current weather.
func fetchFromOpenMeteo(ctx context.Context, lat, lng float64) (*WeatherData, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=auto",
		lat, lng,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("weather: failed to create request: %w", err)
	}

	// Use shared HTTP client for connection pooling
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("weather: failed to fetch from API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("weather: API returned status %d", resp.StatusCode)
	}

	var apiResp openMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("weather: failed to decode response: %w", err)
	}

	condition, icon := mapWeatherCode(apiResp.Current.WeatherCode)

	return &WeatherData{
		Temperature:         apiResp.Current.Temperature,
		ApparentTemperature: apiResp.Current.ApparentTemp,
		Humidity:            apiResp.Current.Humidity,
		WeatherCode:         apiResp.Current.WeatherCode,
		Condition:           condition,
		ConditionIcon:       icon,
		FetchedAt:           time.Now(),
	}, nil
}

// mapWeatherCode converts WMO weather codes to human-readable conditions.
// See: https://open-meteo.com/en/docs#weathervariables
func mapWeatherCode(code int) (condition, icon string) {
	switch {
	case code == 0:
		return "Clear sky", "sun"
	case code >= 1 && code <= 3:
		return "Partly cloudy", "cloud-sun"
	case code >= 45 && code <= 48:
		return "Fog", "fog"
	case code >= 51 && code <= 55:
		return "Drizzle", "cloud-drizzle"
	case code >= 56 && code <= 57:
		return "Freezing drizzle", "cloud-drizzle"
	case code >= 61 && code <= 65:
		return "Rain", "cloud-rain"
	case code >= 66 && code <= 67:
		return "Freezing rain", "cloud-rain"
	case code >= 71 && code <= 77:
		return "Snow", "cloud-snow"
	case code >= 80 && code <= 82:
		return "Rain showers", "cloud-showers"
	case code >= 85 && code <= 86:
		return "Snow showers", "cloud-snow"
	case code >= 95 && code <= 99:
		return "Thunderstorm", "thunderstorm"
	default:
		return "Unknown", "cloud"
	}
}

// GetCachedTemperature returns the cached temperature for coordinates if available.
// Used by detection creation to capture temperature at detection time.
// Returns nil if no cached data exists.
func GetCachedTemperature(lat, lng float64) *float64 {
	key := fmt.Sprintf("%.4f,%.4f", lat, lng)

	cache.mu.RLock()
	defer cache.mu.RUnlock()

	if data, ok := cache.data[key]; ok {
		return &data.Temperature
	}
	return nil
}
