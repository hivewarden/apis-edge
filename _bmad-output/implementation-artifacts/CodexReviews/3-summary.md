# Epic 3 Code Review Summary

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Epic:** 3

## Executive Summary

- **Overall verdict:** **CONCERNS**
- **Overall score:** 6.6 / 10
- **Per-epic scores + verdicts:**
  - **Epic 3:** 6.6 / 10 — **CONCERNS**
- **Top 5 cross-cutting risks (ranked):**
  1. **Tenant isolation (RLS) depends on request-scoped DB session state that isn’t proven safe** → potential cross-tenant leakage or “no data” failures (`apis-server/internal/storage/migrations/0007_detections.sql:32` `current_setting('app.tenant_id', true)` + `apis-server/internal/middleware/unitauth.go:63` `SET LOCAL app.tenant_id = $1`).  
  2. **Timezone-unsafe date-only handling can query/display the wrong day** → off-by-one “Day” results in many timezones (`apis-dashboard/src/context/TimeRangeContext.tsx:46` `const parsed = new Date(dateStr);` + `apis-dashboard/src/context/TimeRangeContext.tsx:55` `date.toISOString().split('T')[0]`).  
  3. **Correlation/trend endpoints don’t 404 on invalid `site_id`** → silent empty 200 masks errors and RLS issues (`apis-server/internal/handlers/detections.go:370` `site, err := storage.GetSiteByID(r.Context(), conn, siteID)` + `apis-server/internal/handlers/detections.go:371` `if err == nil && site.Timezone != "" {` + `apis-server/internal/handlers/detections.go:450` `site, err := storage.GetSiteByID(r.Context(), conn, siteID)`).  
  4. **Chart tooltips build raw HTML strings with interpolated data** → avoidable XSS surface + harder tests (`apis-dashboard/src/components/TemperatureCorrelationCard.tsx:234` `${datum.label}:` + `apis-dashboard/src/components/TrendChartCard.tsx:213` `${datum.label}: ${datum.count}`).  
  5. **Epic 3 UI tests are currently brittle/broken** → missing Router context and ambiguous queries reduce CI signal (`apis-dashboard/tests/components/TodayActivityCard.test.tsx:26-28` `<TimeRangeProvider>{children}</TimeRangeProvider>` + `apis-dashboard/src/context/TimeRangeContext.tsx:87` `useSearchParams()` + `apis-dashboard/tests/components/TrendChartCard.test.tsx:279` `getByRole('img')`).  

- **Remediation priorities:**
  - **Do first:** Prove/fix RLS tenant scoping (transaction/set_config) and add DB-backed isolation tests (`apis-server/internal/storage/migrations/0007_detections.sql:30-32` `USING (tenant_id = current_setting('app.tenant_id', true))` + `apis-server/internal/middleware/tenant.go:62` `SET LOCAL app.tenant_id =`).  
  - **Do next:** Make time-range date handling timezone-safe and consistent across context + hooks (`apis-dashboard/src/context/TimeRangeContext.tsx:46` `const parsed = new Date(dateStr);` + `apis-dashboard/src/context/TimeRangeContext.tsx:55` `return date.toISOString().split('T')[0];` + `apis-dashboard/src/hooks/useTrendData.ts:48-51` `formatDateParam`).  
  - **Nice-to-have:** Improve debuggability and safety (404 site validation, 400 invalid dates) and sanitize chart tooltips (`apis-server/internal/handlers/detections.go:288-292` `parsed, err := time.Parse("2006-01-02", dateStr)` + `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:230` `customContent: (title: string, items:`).  

| Epic | Story | Title | Score (0–10) | Verdict | Critical | High | Med | Low |
|-----:|------:|-------|-------------:|--------|---------:|-----:|----:|----:|
| 3 | 3-1 | Detection Events Table & API | 6.5 | CONCERNS | 0 | 1 | 2 | 0 |
| 3 | 3-2 | Today’s Detection Count Card | 6.5 | CONCERNS | 0 | 0 | 2 | 1 |
| 3 | 3-3 | Weather Integration | 8.0 | PASS | 0 | 0 | 2 | 1 |
| 3 | 3-4 | Time Range Selector | 6.0 | CONCERNS | 0 | 1 | 2 | 0 |
| 3 | 3-5 | Activity Clock Visualization | 6.5 | CONCERNS | 0 | 0 | 3 | 0 |
| 3 | 3-6 | Temperature Correlation Chart | 6.5 | CONCERNS | 0 | 0 | 4 | 0 |
| 3 | 3-7 | Daily/Weekly Trend Line Chart | 6.5 | CONCERNS | 0 | 0 | 3 | 1 |

**What I Could Not Verify (and why)**  
- DB-backed RLS behavior for detections/correlation/trend (requires running DB with `DATABASE_URL`; integration tests are skipped when not set: `apis-server/tests/integration/tenant_isolation_test.go:36-38` `t.Skip("DATABASE_URL not set - skipping integration test")`).  
- End-to-end unit ingestion (real `X-API-Key`, unit→site assignment, persisted detections) without running the full server + DB (`apis-server/cmd/server/main.go:339` `r.Use(authmw.UnitAuth(storage.DB))` + `apis-server/cmd/server/main.go:347` `r.Post("/api/units/detections", handlers.CreateDetection)`).  
- Real browser chart rendering (axis density, tooltips, a11y) because tests mock `@ant-design/charts` (`apis-dashboard/tests/components/TrendChartCard.test.tsx:24` `vi.mock('@ant-design/charts', () => ({`).  
- Real Open‑Meteo uptime/latency behavior (requires outbound network calls at runtime; `apis-server/internal/services/weather.go:193-195` `https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=`).  

---

## Epic-Level “AI Fix Backlog”

### E01 — High — Make RLS tenant scoping provably safe (and tested) for pooled DB connections
- **Applies to stories:** 3-1 (and impacts all `/api/*` tenant-scoped reads)
- **Evidence:** `apis-server/internal/storage/migrations/0007_detections.sql:32` `tenant_id = current_setting('app.tenant_id', true)` + `apis-server/internal/middleware/tenant.go:62` `SET LOCAL app.tenant_id =` + `apis-server/internal/middleware/unitauth.go:63` `SET LOCAL app.tenant_id = $1`
- **Files likely touched:** `apis-server/internal/middleware/tenant.go`, `apis-server/internal/middleware/unitauth.go`, `apis-server/internal/storage/*`, `apis-server/tests/integration/*`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** tenant A and tenant B each have detections **When** tenant A calls `GET /api/detections?site_id=...` **Then** only tenant A rows are returned.
  - **Given** a connection is reused from the pool **When** a request for tenant B follows tenant A **Then** tenant B never sees tenant A data (and vice-versa).
- **Verification steps:** `DATABASE_URL=... go test ./apis-server/tests/integration -run TenantIsolation`; add a detections-specific RLS integration test.

### E02 — High — Make date-only handling timezone-safe across dashboard context + hooks
- **Applies to stories:** 3-2, 3-4, 3-5, 3-6, 3-7
- **Evidence:** `apis-dashboard/src/context/TimeRangeContext.tsx:46` `const parsed = new Date(dateStr);` + `apis-dashboard/src/context/TimeRangeContext.tsx:55` `return date.toISOString().split('T')[0];` + `apis-dashboard/src/hooks/useTrendData.ts:50` `return date.toISOString().split('T')[0];`
- **Files likely touched:** `apis-dashboard/src/context/TimeRangeContext.tsx`, `apis-dashboard/src/hooks/useDetectionStats.ts`, `apis-dashboard/src/hooks/useTemperatureCorrelation.ts`, `apis-dashboard/src/hooks/useTrendData.ts`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `?range=day&date=2026-01-20` **When** the dashboard loads in a non-UTC timezone **Then** the DatePicker shows Jan 20 and API calls use `date=2026-01-20`.
  - **Given** a user selects a day **When** the URL updates **Then** `date=YYYY-MM-DD` always matches the calendar day (no UTC drift).
- **Verification steps:** `TZ=America/New_York npx vitest run tests/context/TimeRangeContext.test.tsx`; manual: inspect network requests for `date=`.

### E03 — Medium — Preserve `range/date` params when auto-selecting the first site
- **Applies to stories:** 3-4
- **Evidence:** `apis-dashboard/src/pages/Dashboard.tsx:96-101` `setSearchParams({ site_id: firstSiteId })`
- **Files likely touched:** `apis-dashboard/src/pages/Dashboard.tsx`, `apis-dashboard/tests/pages/*` (new)
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a URL like `/?range=week` with no `site_id` **When** sites load and the app auto-selects a site **Then** the URL still includes `range=week`.
  - **Given** `site_id` is present **When** sites load **Then** no query-param rewrite occurs.
- **Verification steps:** add a `Dashboard` routing test (MemoryRouter initial entry); run `npx vitest run tests/pages/Dashboard.test.tsx`.

### E04 — Medium — Reject invalid `date/from/to` query params instead of silently falling back
- **Applies to stories:** 3-1, 3-4, 3-6, 3-7
- **Evidence:** `apis-server/internal/handlers/detections.go:288-291` `parsed, err := time.Parse("2006-01-02", dateStr)` + `apis-server/internal/handlers/detections.go:496-499` `if parsed, err := time.Parse("2006-01-02", fromStr); err == nil`
- **Files likely touched:** `apis-server/internal/handlers/detections.go`, `apis-server/internal/handlers/detections_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `date` is present but invalid **When** calling `/api/detections/stats` **Then** return HTTP 400 with “expected YYYY-MM-DD”.
  - **Given** `from/to` are present but invalid **When** calling `/api/detections` **Then** return HTTP 400 (no silent default).
- **Verification steps:** `go test ./apis-server/internal/handlers -run '(GetDetectionStats|ParseDateRange)'`.

### E05 — Medium — Fix `/api/detections/{id}` error mapping to distinguish not-found vs server failures
- **Applies to stories:** 3-1
- **Evidence:** `apis-server/internal/handlers/detections.go:75-79` `respondError(w, "Detection not found", http.StatusNotFound)` (for all `err != nil`)
- **Files likely touched:** `apis-server/internal/handlers/detections.go`, `apis-server/internal/handlers/detections_test.go`, `apis-server/internal/storage/detections.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a missing detection id **When** calling `GET /api/detections/{id}` **Then** return 404.
  - **Given** a DB/storage error **When** calling the same endpoint **Then** return 500 (and log at error level).
- **Verification steps:** `go test ./apis-server/internal/handlers -run GetDetectionByID`.

### E06 — Medium — Return 404 for invalid/unreachable `site_id` in correlation and trend endpoints
- **Applies to stories:** 3-6, 3-7
- **Evidence:** `apis-server/internal/handlers/detections.go:370` `site, err := storage.GetSiteByID(r.Context(), conn, siteID)` + `apis-server/internal/handlers/detections.go:371` `if err == nil && site.Timezone != "" {` + `apis-server/internal/handlers/detections.go:450` `site, err := storage.GetSiteByID(r.Context(), conn, siteID)`
- **Files likely touched:** `apis-server/internal/handlers/detections.go`, `apis-server/internal/handlers/detections_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `site_id` does not exist (or is not visible under RLS) **When** calling `/api/detections/temperature-correlation` **Then** return 404 “Site not found”.
  - **Given** the same invalid site **When** calling `/api/detections/trend` **Then** return 404 “Site not found”.
- **Verification steps:** `go test ./apis-server/internal/handlers -run '(TemperatureCorrelation|GetTrendData)'`.

### E07 — Medium — Ensure temperature correlation has enough data (don’t rely on a “warm” weather cache)
- **Applies to stories:** 3-6 (and temperature capture in 3-1)
- **Evidence:** `apis-server/internal/handlers/detections.go:148` `temperatureC = services.GetCachedTemperature(` + `apis-server/internal/storage/detections.go:273` `AND temperature_c IS NOT NULL`
- **Files likely touched:** `apis-server/internal/handlers/detections.go`, `apis-server/internal/services/weather.go`, `apis-server/internal/storage/detections.go`, `apis-server/internal/storage/migrations/*` (optional)
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** a site with GPS **When** detections are posted and the cache is empty **Then** `temperature_c` is populated for most detections (bounded/rate-limited).
  - **Given** Open‑Meteo is down **When** detections are posted **Then** ingestion still succeeds and `temperature_c` may remain NULL.
- **Verification steps:** add an integration test with a stubbed weather client; `DATABASE_URL=... go test ./apis-server/...`.

### E08 — Medium — Eliminate raw-HTML tooltip interpolation in charts (escape or render safely)
- **Applies to stories:** 3-6, 3-7
- **Evidence:** `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:234` ``return `<div style="padding: 8px 12px; font-size: 12px;">${datum.label}:` `` + `apis-dashboard/src/components/TrendChartCard.tsx:213` `${datum.label}: ${datum.count} detection`  
- **Files likely touched:** `apis-dashboard/src/components/TemperatureCorrelationCard.tsx`, `apis-dashboard/src/components/TrendChartCard.tsx`, related tests
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** tooltip labels contain `<`/`&` **When** tooltips render **Then** content is displayed as text (not interpreted as HTML).
  - **Given** normal labels **When** hovering points **Then** tooltip formatting still matches the story ACs.
- **Verification steps:** `npx vitest run tests/components/TemperatureCorrelationCard.test.tsx`; `npx vitest run tests/components/TrendChartCard.test.tsx`.

### E09 — Medium — Make `range=all` truly “all time” (no hard-coded 2020 start or future `to`)
- **Applies to stories:** 3-4 (affects all charts for all-time range)
- **Evidence:** `apis-server/internal/handlers/detections.go:570-571` `from = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)` + `to = time.Now().AddDate(1, 0, 0)`
- **Files likely touched:** `apis-server/internal/handlers/detections.go`, `apis-server/internal/handlers/detections_test.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `range=all` **When** the server computes a window **Then** it does not rely on a hard-coded year.
  - **Given** `range=all` **When** querying **Then** it does not include future dates beyond “today” unless explicitly requested.
- **Verification steps:** `go test ./apis-server/internal/handlers -run CalculateDateRange`.

### E10 — Medium — Align trend labels/aggregation with story guidance for month/year/all
- **Applies to stories:** 3-7
- **Evidence:** `apis-server/internal/storage/detections.go:457-459` `if rangeType == "month" { label = dLocal.Format("Jan 2") }` + `apis-server/internal/storage/detections.go:523-526` `if rangeType == "year" || rangeType == "all" { label = weekStart.Format("Jan 2") }`
- **Files likely touched:** `apis-server/internal/storage/detections.go`, `apis-server/internal/storage/detections_test.go`, `apis-dashboard/src/components/TrendChartCard.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `range=year` **When** trend points are generated **Then** labels use week numbers or month names (documented and consistent).
  - **Given** `range=all` **When** trend points are generated **Then** aggregation/labels avoid over-dense weekly date labels (e.g., monthly aggregation).
- **Verification steps:** `go test ./apis-server/internal/storage -run Trend`; manual: verify chart x-axis readability.

### E11 — Medium — Make ActivityClockCard meet the story’s empty-state + tooltip semantics (and clarify “Average”)
- **Applies to stories:** 3-5
- **Evidence:** `apis-dashboard/src/components/ActivityClockCard.tsx:153-155` `if (totalDetections === 0) {` + `apis-dashboard/src/components/ActivityClockCard.tsx:169-173` `No activity recorded for this period` + `apis-dashboard/src/components/ActivityClockCard.tsx:55` `return isLongRange ? 'Average Hourly Activity' : 'Hourly Activity';`
- **Files likely touched:** `apis-dashboard/src/components/ActivityClockCard.tsx`, `apis-dashboard/tests/components/ActivityClockCard.test.tsx`, optionally `apis-server/internal/storage/detections.go`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `totalDetections === 0` **When** the card renders **Then** a Radar chart is still rendered with all zeros and the empty message is shown.
  - **Given** a hovered hour bucket **When** tooltip renders **Then** it matches `14:00 - 15:00: N detections (X% of total)` (including wrap at 23→00).
  - **Given** range is season/year/all **When** the title says “Average” **Then** values are normalized per day, or the title is changed to “Aggregate”.
- **Verification steps:** `npx vitest run tests/components/ActivityClockCard.test.tsx`.

### E12 — Medium — Fix TodayActivityCard tests (Router wrapper) and add stale-data indicator behavior
- **Applies to stories:** 3-2
- **Evidence:** `apis-dashboard/tests/components/TodayActivityCard.test.tsx:26-28` `<TimeRangeProvider>{children}</TimeRangeProvider>` + `apis-dashboard/src/context/TimeRangeContext.tsx:87` `useSearchParams()`
- **Files likely touched:** `apis-dashboard/tests/components/TodayActivityCard.test.tsx`, `apis-dashboard/src/components/TodayActivityCard.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** the existing test file **When** running it **Then** it passes (wrap provider in a Router).
  - **Given** `error && stats` **When** rendering **Then** show a subtle “stale data” hint (and hide it on next successful poll).
- **Verification steps:** `npx vitest run tests/components/TodayActivityCard.test.tsx`.

### E13 — Medium — Fix TemperatureCorrelationCard tests to align with default range behavior
- **Applies to stories:** 3-6
- **Evidence:** `apis-dashboard/tests/components/TemperatureCorrelationCard.test.tsx:245-246` `expect(screen.getByText('Temperature Correlation'))` + `apis-dashboard/src/context/TimeRangeContext.tsx:27` `DEFAULT_TIME_RANGE: TimeRange = 'day'`
- **Files likely touched:** `apis-dashboard/tests/components/TemperatureCorrelationCard.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** tests that expect non-day behavior **When** rendering with providers **Then** initialize the router URL with `?range=month` (or mock `useTimeRange`) so assertions match reality.
  - **Given** the full test file **When** run **Then** all tests pass.
- **Verification steps:** `npx vitest run tests/components/TemperatureCorrelationCard.test.tsx`.

### E14 — Medium — Avoid weather fetches for sites without GPS coordinates
- **Applies to stories:** 3-3
- **Evidence:** `apis-dashboard/src/components/WeatherCard.tsx:75` `useWeather(siteId)` + `apis-dashboard/src/components/WeatherCard.tsx:92` `if (!hasGPS) {`
- **Files likely touched:** `apis-dashboard/src/components/WeatherCard.tsx`, `apis-dashboard/src/hooks/useWeather.ts`, `apis-dashboard/tests/hooks/useWeather.test.ts`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** `hasGPS=false` **When** rendering WeatherCard **Then** no request is made to `/sites/{id}/weather`.
  - **Given** `hasGPS` flips to true **When** rendering **Then** weather fetch proceeds normally.
- **Verification steps:** `npx vitest run tests/hooks/useWeather.test.ts`.

### E15 — Low — Fix TrendChartCard a11y test query to target the chart container by accessible name
- **Applies to stories:** 3-7
- **Evidence:** `apis-dashboard/tests/components/TrendChartCard.test.tsx:279` `getByRole('img')` + `apis-dashboard/src/components/TrendChartCard.tsx:243-245` `role="img" aria-label=`
- **Files likely touched:** `apis-dashboard/tests/components/TrendChartCard.test.tsx`
- **Fix Acceptance Criteria (Given/When/Then):**
  - **Given** the accessibility test **When** selecting the chart container **Then** it queries `getByRole('img', { name: /Trend chart showing/ })` (or equivalent) and passes.
- **Verification steps:** `npx vitest run tests/components/TrendChartCard.test.tsx`.
