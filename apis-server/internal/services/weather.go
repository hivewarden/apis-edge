// Package services provides business logic and external service integrations.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// OpenMeteoResponse represents the API response from Open-Meteo.
type OpenMeteoResponse struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timezone  string  `json:"timezone"`
	Current   struct {
		Time                string  `json:"time"`
		Temperature2m       float64 `json:"temperature_2m"`
		RelativeHumidity2m  int     `json:"relative_humidity_2m"`
		ApparentTemperature float64 `json:"apparent_temperature"`
		WeatherCode         int     `json:"weather_code"`
		WindSpeed10m        float64 `json:"wind_speed_10m"`
	} `json:"current"`
}

// WeatherData represents processed weather information.
type WeatherData struct {
	TemperatureC float64
	FeelsLikeC   float64
	Humidity     int
	WeatherCode  int
	WindSpeedKmh float64
	Condition    string
	RecordedAt   time.Time
}

// WeatherClient handles fetching weather data from Open-Meteo API.
type WeatherClient struct {
	httpClient *http.Client
	baseURL    string
}

// NewWeatherClient creates a new weather client with sensible defaults.
func NewWeatherClient() *WeatherClient {
	return &WeatherClient{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: "https://api.open-meteo.com/v1/forecast",
	}
}

// FetchCurrentWeather fetches current weather conditions for the given coordinates.
// Uses Open-Meteo free API (no API key required).
func (c *WeatherClient) FetchCurrentWeather(ctx context.Context, lat, lng float64) (*WeatherData, error) {
	url := fmt.Sprintf(
		"%s?latitude=%f&longitude=%f&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto",
		c.baseURL, lat, lng,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("weather: failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("weather: API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("weather: API returned status %d", resp.StatusCode)
	}

	var apiResp OpenMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("weather: failed to decode response: %w", err)
	}

	return &WeatherData{
		TemperatureC: apiResp.Current.Temperature2m,
		FeelsLikeC:   apiResp.Current.ApparentTemperature,
		Humidity:     apiResp.Current.RelativeHumidity2m,
		WeatherCode:  apiResp.Current.WeatherCode,
		WindSpeedKmh: apiResp.Current.WindSpeed10m,
		Condition:    weatherCodeToCondition(apiResp.Current.WeatherCode),
		RecordedAt:   time.Now(),
	}, nil
}

// weatherCodeToCondition converts WMO weather codes to human-readable conditions.
// See: https://open-meteo.com/en/docs for WMO code definitions.
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

// weatherCodeToIcon converts WMO weather codes to icon names.
// Can be used with a weather icon font or mapped to Ant Design icons.
func WeatherCodeToIcon(code int) string {
	switch {
	case code == 0:
		return "sun"
	case code == 1:
		return "sun"
	case code == 2:
		return "cloud-sun"
	case code == 3:
		return "cloud"
	case code >= 45 && code <= 48:
		return "fog"
	case code >= 51 && code <= 67:
		return "cloud-rain"
	case code >= 71 && code <= 77:
		return "snowflake"
	case code >= 80 && code <= 82:
		return "cloud-showers-heavy"
	case code >= 85 && code <= 86:
		return "snowflake"
	case code >= 95:
		return "bolt"
	default:
		return "question"
	}
}
