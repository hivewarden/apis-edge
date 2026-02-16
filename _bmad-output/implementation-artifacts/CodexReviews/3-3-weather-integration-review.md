# Code Review: Story 3.3 Weather Integration

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-3-weather-integration.md`

## Story Verdict

- **Score:** 8.0 / 10
- **Verdict:** **PASS**
- **Rationale:** The server fetches Open‑Meteo with a 30‑minute TTL cache and the dashboard renders a weather card with graceful error + cached-data behavior; remaining issues are mostly efficiency and polish (`apis-server/internal/services/weather.go:17` `weatherCacheTTL = 30 * time.Minute` + `apis-server/internal/services/weather.go:193-194` `api.open-meteo.com/...&timezone=auto` + `apis-dashboard/src/components/WeatherCard.tsx:172-220` `temperature ... apparent_temperature ... humidity`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Weather card shows temperature, icon, feels-like, humidity | Implemented | `apis-dashboard/src/components/WeatherCard.tsx:172-190` `{getWeatherEmoji(...)} ... {weather.temperature} ... {weather.condition}` + `apis-dashboard/src/components/WeatherCard.tsx:202-217` `Feels like ... Humidity` | Visual/icon fidelity is UI/runtime dependent; structure matches AC. |
| AC2: Server uses Open‑Meteo and caches for 30 minutes | Implemented | `apis-server/internal/services/weather.go:17` `weatherCacheTTL = 30 * time.Minute` + `apis-server/internal/services/weather.go:132-135` `if time.Since(data.FetchedAt) < cache.ttl` + `apis-server/internal/services/weather.go:193-194` `api.open-meteo.com/...latitude...longitude...` | Cache is in-memory per server process (see Findings). |
| AC3: API error shows “Weather unavailable” + retry; cached data shown if available with “Last updated” | Implemented | `apis-server/internal/services/weather.go:155-168` `returning stale cached data due to API error` + `apis-dashboard/src/components/WeatherCard.tsx:124-146` `Weather unavailable ... Retry` + `apis-dashboard/src/components/WeatherCard.tsx:165-169` `Updated {formatLastUpdated(weather.fetched_at)}` + `apis-dashboard/src/components/WeatherCard.tsx:222-236` `Showing cached data ... Refresh` | Server returns cached data on API failure when available; otherwise 503. |
| AC4: No GPS shows “Add GPS coordinates…” | Implemented | `apis-server/internal/handlers/weather.go:42-44` `Site has no GPS coordinates` + `apis-dashboard/src/components/WeatherCard.tsx:91-105` `Add GPS coordinates...` | Frontend uses `hasGPS` for UX; backend also enforces. |
| AC5: Site change updates weather | Implemented | `apis-dashboard/src/hooks/useWeather.ts:96-101` `Reset state when site changes` + `apis-dashboard/src/hooks/useWeather.ts:127` `}, [siteId, fetchWeather])` | Auto-refresh every 5 minutes (`apis-dashboard/src/hooks/useWeather.ts:16` `WEATHER_REFRESH_INTERVAL_MS`). |

---

## Findings

**F1: Weather hook still fires even when the site has no GPS (avoidable 400s + log noise)**  
- Severity: Medium  
- Category: Performance / UX  
- Evidence: `apis-dashboard/src/components/WeatherCard.tsx:74-75` `useWeather(siteId)` + `apis-dashboard/src/components/WeatherCard.tsx:91-104` `if (!hasGPS) { ... Add GPS ... }`  
- Why it matters: With `siteId` set but no GPS, the hook will call `/sites/{id}/weather`, the server will return 400, and this can spam logs and waste network.  
- Recommended fix: Gate the hook by passing `null` when GPS is missing (e.g., `useWeather(hasGPS ? siteId : null)`), or add a `hasGPS` parameter to `useWeather` to skip fetches.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a site without GPS, when the dashboard renders the weather card, then no request is made to `/sites/{id}/weather`.
  - AC2: Given the site later gets GPS, when `hasGPS` flips true, then the hook fetches weather normally.
  - Tests/Verification: update `apis-dashboard/tests/hooks/useWeather.test.ts` to assert no calls are made when GPS is missing; run `npx vitest run tests/hooks/useWeather.test.ts`.  
- “Out of scope?”: no

**F2: Weather cache is process-local (multi-instance deployments will refetch independently)**  
- Severity: Medium  
- Category: Reliability / Performance  
- Evidence: `apis-server/internal/services/weather.go:68` `var cache = NewWeatherCache()` + `apis-server/internal/services/weather.go:126-135` `cache.mu.RLock() ... time.Since(... ) < cache.ttl`  
- Why it matters: If the server scales to multiple instances, each instance maintains its own cache, increasing outbound API calls and producing slightly different “fetched_at” values across users.  
- Recommended fix: If multi-instance is planned soon, move caching to a shared store (Redis) or persist snapshots in DB keyed by site; otherwise, document that cache is per-process and acceptable for MVP.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given two server instances, when requesting weather for the same coordinates, then cache behavior is shared (single upstream fetch per TTL).
  - AC2: Given cached data exists, when Open‑Meteo errors, then stale cached data is still returned.
  - Tests/Verification: add a service-level test using a stubbed HTTP client and/or shared cache backend; run `go test ./internal/services`.  
- “Out of scope?”: yes (if MVP is single-instance; still worth tracking)

**F3: Weather-code mapping may be too coarse (e.g., code 3 treated as “Partly cloudy”)**  
- Severity: Low  
- Category: UX  
- Evidence: `apis-server/internal/services/weather.go:237-238` `case code >= 1 && code <= 3: return "Partly cloudy", "cloud-sun"`  
- Why it matters: Users may see icons/labels that don’t match reality (e.g., overcast shown as partly cloudy), reducing trust in the dashboard.  
- Recommended fix: Refine mapping by splitting 1/2/3 (mainly clear / partly cloudy / overcast) and adjust icons accordingly.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given WMO code 3, when mapping to UI, then condition is “Overcast” (or similar) with a cloud icon.
  - AC2: Given WMO code 1, when mapping, then condition remains “Mainly clear” (or similar) with a sun/cloud icon.
  - Tests/Verification: add a small unit test for `mapWeatherCode`; run `go test ./internal/services -run WeatherCode`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 2.0 / 2  
- **Correctness / edge cases:** 1.5 / 2 (GPS gating could be more efficient; server behavior is correct)  
- **Security / privacy / secrets:** 1.5 / 2 (fixed upstream domain; low-risk inputs; no secrets involved)  
- **Testing / verification:** 1.5 / 2 (`useWeather` has tests; server-side weather service has no direct tests)  
- **Maintainability / clarity / docs:** 1.5 / 2 (clean separation services/handler/component; process-local cache should be documented)

## What I Could Not Verify (story-specific)

- Real Open‑Meteo uptime/latency and how often the UI falls back to cached data (requires running the full stack and network calls; request uses `weatherHTTPTimeout = 10 * time.Second`: `apis-server/internal/services/weather.go:18-21`).  

