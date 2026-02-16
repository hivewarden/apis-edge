# Story 3.3: Weather Integration

Status: done

## Story

As a **beekeeper**,
I want to see current weather conditions for my apiary,
So that I can correlate hornet activity with weather patterns.

## Acceptance Criteria

1. **Given** I am on the Dashboard with a site selected
   **When** the page loads
   **Then** I see a weather card showing:
   - Current temperature (°C)
   - Weather condition icon (sunny, cloudy, rain, etc.)
   - "Feels like" temperature
   - Humidity percentage

2. **Given** the site has GPS coordinates
   **When** the server fetches weather
   **Then** it uses Open-Meteo API with the site's lat/long
   **And** caches the result for 30 minutes to reduce API calls

3. **Given** weather data is unavailable (API error)
   **When** I view the dashboard
   **Then** the weather card shows "Weather unavailable" with retry button
   **And** cached data is shown if available (with "Last updated: X ago")

4. **Given** the site has no GPS coordinates
   **When** I view the dashboard
   **Then** the weather card shows "Add GPS coordinates to see weather"

5. **Given** the selected site changes
   **When** I pick a different site
   **Then** the weather card updates to show that site's weather

## Tasks / Subtasks

- [x] Task 1: Create Weather Service (Server-side) (AC: #2)
  - [x] 1.1: Create `apis-server/internal/services/weather.go`
  - [x] 1.2: Implement Open-Meteo API client
  - [x] 1.3: Add in-memory cache with 30-minute TTL
  - [x] 1.4: Parse weather response and map WMO codes to conditions

- [x] Task 2: Create Weather API Endpoint (AC: #2, #3, #4)
  - [x] 2.1: Create `apis-server/internal/handlers/weather.go`
  - [x] 2.2: Implement `GET /api/sites/{id}/weather` handler
  - [x] 2.3: Return cached data if available on error
  - [x] 2.4: Add route to main.go

- [x] Task 3: Create WeatherCard Component (AC: #1, #3, #4)
  - [x] 3.1: Create `apis-dashboard/src/components/WeatherCard.tsx`
  - [x] 3.2: Display temperature, feels like, humidity, condition icon
  - [x] 3.3: Handle loading, error, and no-GPS states
  - [x] 3.4: Add retry button for errors

- [x] Task 4: Create useWeather Hook (AC: #5)
  - [x] 4.1: Create `apis-dashboard/src/hooks/useWeather.ts`
  - [x] 4.2: Implement API call with site_id parameter
  - [x] 4.3: Handle site changes (refetch on site change)

- [x] Task 5: Integrate into Dashboard (AC: #1, #5)
  - [x] 5.1: Add WeatherCard next to TodayActivityCard
  - [x] 5.2: Pass selectedSiteId and site GPS coordinates

## Dev Notes

### Open-Meteo API

Free weather API, no API key required:
```
GET https://api.open-meteo.com/v1/forecast?latitude=50.85&longitude=4.35&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=auto
```

Response:
```json
{
  "current": {
    "temperature_2m": 18.5,
    "relative_humidity_2m": 65,
    "apparent_temperature": 17.2,
    "weather_code": 3
  }
}
```

### WMO Weather Codes

| Code | Condition | Icon |
|------|-----------|------|
| 0 | Clear sky | sun |
| 1-3 | Mainly clear, partly cloudy, overcast | cloud |
| 45-48 | Fog | fog |
| 51-55 | Drizzle | drizzle |
| 61-65 | Rain | rain |
| 71-77 | Snow | snow |
| 80-82 | Rain showers | rain |
| 95-99 | Thunderstorm | thunderstorm |

### Weather Service Pattern

```go
// weather.go
package services

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "sync"
    "time"
)

type WeatherData struct {
    Temperature    float64   `json:"temperature"`
    ApparentTemp   float64   `json:"apparent_temperature"`
    Humidity       int       `json:"humidity"`
    WeatherCode    int       `json:"weather_code"`
    Condition      string    `json:"condition"`
    ConditionIcon  string    `json:"condition_icon"`
    FetchedAt      time.Time `json:"fetched_at"`
}

type weatherCache struct {
    data      map[string]WeatherData // key: "lat,lng"
    mu        sync.RWMutex
    ttl       time.Duration
}

var cache = &weatherCache{
    data: make(map[string]WeatherData),
    ttl:  30 * time.Minute,
}

func GetWeather(ctx context.Context, lat, lng float64) (*WeatherData, error) {
    key := fmt.Sprintf("%.4f,%.4f", lat, lng)

    // Check cache
    cache.mu.RLock()
    if data, ok := cache.data[key]; ok {
        if time.Since(data.FetchedAt) < cache.ttl {
            cache.mu.RUnlock()
            return &data, nil
        }
    }
    cache.mu.RUnlock()

    // Fetch from API
    data, err := fetchFromOpenMeteo(ctx, lat, lng)
    if err != nil {
        // Return cached data if available (even if stale)
        cache.mu.RLock()
        if cached, ok := cache.data[key]; ok {
            cache.mu.RUnlock()
            return &cached, nil
        }
        cache.mu.RUnlock()
        return nil, err
    }

    // Update cache
    cache.mu.Lock()
    cache.data[key] = *data
    cache.mu.Unlock()

    return data, nil
}
```

### Weather Handler

```go
// weather.go (handlers)
func GetSiteWeather(w http.ResponseWriter, r *http.Request) {
    conn := storage.RequireConn(r.Context())
    siteID := chi.URLParam(r, "id")

    site, err := storage.GetSiteByID(r.Context(), conn, siteID)
    if err != nil {
        if errors.Is(err, storage.ErrNotFound) {
            respondError(w, "Site not found", http.StatusNotFound)
            return
        }
        respondError(w, "Failed to get site", http.StatusInternalServerError)
        return
    }

    if site.Latitude == nil || site.Longitude == nil {
        respondError(w, "Site has no GPS coordinates", http.StatusBadRequest)
        return
    }

    weather, err := services.GetWeather(r.Context(), *site.Latitude, *site.Longitude)
    if err != nil {
        respondError(w, "Weather unavailable", http.StatusServiceUnavailable)
        return
    }

    respondJSON(w, map[string]interface{}{"data": weather}, http.StatusOK)
}
```

### WeatherCard Component

```typescript
interface WeatherCardProps {
  siteId: string | null;
  hasGPS: boolean;
}

function WeatherCard({ siteId, hasGPS }: WeatherCardProps) {
  const { weather, loading, error, refetch } = useWeather(siteId);

  if (!siteId) {
    return <Card>Select a site</Card>;
  }

  if (!hasGPS) {
    return (
      <Card>
        <Text type="secondary">
          Add GPS coordinates to this site to see weather
        </Text>
      </Card>
    );
  }

  // ... render weather data
}
```

### Weather Icons (Ant Design)

Map weather codes to Ant Design icons:
- Clear: `SunOutlined`
- Cloudy: `CloudOutlined`
- Rain: `CloudOutlined` (with rain styling)
- Use custom SVG for more specific icons if needed

### References

- [Open-Meteo API Documentation](https://open-meteo.com/en/docs)
- [WMO Weather Codes](https://open-meteo.com/en/docs#weathervariables)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

None

### Completion Notes List

- Implemented Open-Meteo API integration with 30-minute caching
- Added cache pruning to prevent unbounded memory growth (max 1000 entries)
- Added structured logging per CLAUDE.md patterns
- Frontend hook includes 5-minute auto-refresh for long-running sessions
- WeatherCard handles all edge states: no-site, no-GPS, loading, error, stale data

### File List

- `apis-server/internal/services/weather.go` - Weather service with Open-Meteo API client and caching
- `apis-server/internal/handlers/weather.go` - GET /api/sites/{id}/weather handler
- `apis-server/cmd/server/main.go` - Added weather route (line 140)
- `apis-dashboard/src/hooks/useWeather.ts` - Weather data hook with auto-refresh
- `apis-dashboard/src/components/WeatherCard.tsx` - Weather display component
- `apis-dashboard/src/components/index.ts` - Export WeatherCard
- `apis-dashboard/src/pages/Dashboard.tsx` - Integrated WeatherCard

## Change Log

- 2026-01-24: Story 3.3 created with comprehensive developer context
- 2026-01-24: Implementation completed - all tasks done
- 2026-01-24: Code review remediation - added cache pruning, logging, auto-refresh
- 2026-01-25: Remediation: Fixed 7 issues from code review (tests, hook fixes, cache testability, HTTP pooling)
