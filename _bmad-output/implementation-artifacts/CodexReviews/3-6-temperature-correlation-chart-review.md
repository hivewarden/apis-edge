# Code Review: Story 3.6 Temperature Correlation Chart

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-6-temperature-correlation-chart.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The endpoint + hook + scatter chart exist with an optional regression line, but missing site validation can hide errors, tooltip rendering uses raw HTML strings, and temperature completeness depends on a “warm” weather cache which can make the chart empty in realistic flows (`apis-server/internal/handlers/detections.go:370-373` `site, err := storage.GetSiteByID ... if err == nil` + `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:234-235` ``return `<div ...>${datum.label}: ...</div>` `` + `apis-server/internal/storage/detections.go:273` `AND temperature_c IS NOT NULL`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Scatter plot X=temperature, Y=detections, dot per day | Implemented | `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:185-186` `xField: 'temperature', yField: 'detections'` + `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:52-58` `temperature ... detections ... label` | Backend returns daily points for non-day ranges (`apis-server/internal/handlers/detections.go:375-377` `isHourly := rangeType == "day"`). |
| AC2: Optional trend line shows correlation | Implemented | `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:238-246` `regressionLine: chartData.length >= 3 ? { type: 'linear' ... }` | Requires runtime to confirm `@ant-design/charts` renders the regression line as expected. |
| AC3: Tooltip shows “Oct 15: 22°C, 14 detections” | Implemented | `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:229-235` `customContent ... ${datum.label}: ${datum.temperature}°C, ${datum.detections} ...` | Tooltip content uses HTML string interpolation (see Findings). |
| AC4: Click point optionally drills down | Partial | No click handler is configured on the Scatter chart (`apis-dashboard/src/components/TemperatureCorrelationCard.tsx:178-248` `const config = { ... }` without `onReady`/event wiring) | The AC says “optionally”; if drilldown is deferred, document it and/or remove from AC. |
| AC5: Day range shows hourly temp vs detections | Implemented | `apis-server/internal/handlers/detections.go:375-377` `isHourly := rangeType == "day"` + `apis-server/internal/storage/detections.go:267-275` `EXTRACT(HOUR ... ) ... GROUP BY hour` + `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:43-48` `if (range === 'day') return 'Hourly Temperature vs Activity'` | Hourly points only include hours with `temperature_c` present. |
| AC6: No correlation data shows “No temperature data recorded…” | Implemented | `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:163` `No temperature data recorded for this period` | This is expected if detections have `temperature_c` NULL (see Findings). |

---

## Findings

**F1: Correlation endpoint does not 404 on invalid `site_id` (returns empty 200 instead)**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-server/internal/handlers/detections.go:370-373` `site, err := storage.GetSiteByID(...); if err == nil && site.Timezone != "" { ... }` (no not-found handling)  
- Why it matters: The dashboard can silently show “no data” for a typo/mis-linked site id, masking real problems and making debugging harder.  
- Recommended fix: Validate the site exists up front (as `ListDetections`/`GetDetectionStats` do) and return 404 for missing sites.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `site_id` does not exist (or is not visible under RLS), when calling `/api/detections/temperature-correlation`, then the server returns HTTP 404 “Site not found”.
  - AC2: Given `site_id` exists, when calling the endpoint, then behavior remains unchanged.
  - Tests/Verification: add a handler test for 404 behavior; run `go test ./internal/handlers -run TemperatureCorrelation`.  
- “Out of scope?”: no

**F2: Tooltip uses raw HTML string interpolation (XSS surface + harder to test)**  
- Severity: Medium  
- Category: Security / Maintainability / Testing  
- Evidence: `apis-dashboard/src/components/TemperatureCorrelationCard.tsx:234-235` ``return `<div ...>${datum.label}: ...</div>` ``  
- Why it matters: If any tooltip label ever becomes attacker-controlled (even indirectly), HTML string tooltips become an XSS vector. It also makes unit testing tooltip content harder.  
- Recommended fix: Prefer a non-HTML tooltip formatter API (if supported) or sanitize/escape interpolated strings before building HTML; keep labels server-controlled and validated.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given tooltip labels contain special characters (`<`, `&`), when rendering tooltips, then they are displayed as text (not interpreted as HTML).
  - AC2: Given existing data, when hovering points, then tooltip output still matches the AC format.
  - Tests/Verification: add a component-level unit test that asserts the tooltip formatter escapes input; run `npx vitest run tests/components/TemperatureCorrelationCard.test.tsx`.  
- “Out of scope?”: no

**F3: Temperature correlation may often be empty because `temperature_c` is only set from a warm in-memory weather cache**  
- Severity: Medium  
- Category: Correctness / Product value  
- Evidence: `apis-server/internal/handlers/detections.go:148` `temperatureC = services.GetCachedTemperature(...)` (no fetch on miss) + `apis-server/internal/storage/detections.go:273` `AND temperature_c IS NOT NULL`  
- Why it matters: Units can post detections without any prior dashboard weather fetch, leaving `temperature_c` NULL; the correlation endpoint then excludes those detections entirely and the chart will frequently show “No temperature data recorded”.  
- Recommended fix: Either fetch weather during detection ingestion when cache is missing (with strict rate limiting), or persist periodic weather snapshots per site and join at query time.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given detections are posted for a site with GPS, when the server stores them, then `temperature_c` is populated for most detections (subject to upstream availability).
  - AC2: Given upstream weather is down, when detections are posted, then ingestion still succeeds and `temperature_c` remains nullable.
  - Tests/Verification: add an integration test that posts a detection and asserts `temperature_c` behavior with a stubbed weather provider; run `go test ./...` with DB.  
- “Out of scope?”: no

**F4: Component tests for the “Temperature Correlation” title currently don’t match the default range behavior**  
- Severity: Medium  
- Category: Testing  
- Evidence: `apis-dashboard/tests/components/TemperatureCorrelationCard.test.tsx:208-213` `renderWithProviders(<TemperatureCorrelationCard ... />)` + `expect(... 'Temperature Correlation')` while default range is day (`apis-dashboard/src/context/TimeRangeContext.tsx:27-28` `DEFAULT_TIME_RANGE: 'day'`)  
- Why it matters: Tests that fail (or assert incorrect defaults) reduce trust in CI and hide regressions.  
- Recommended fix: In tests that expect non-day titles, set the router initial entry to include `?range=month` (or mock `useTimeRange`).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given tests for non-day behavior, when rendered, then the provider is initialized with `range=month` (or equivalent) and assertions match the UI.
  - AC2: Given the full test file, when running `npx vitest run tests/components/TemperatureCorrelationCard.test.tsx`, then all tests pass.
  - Tests/Verification: run the test file above.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (core chart + regression line + empty state exist; drilldown is not implemented)  
- **Correctness / edge cases:** 1.5 / 2 (hourly/daily modes implemented; missing site validation can mask errors)  
- **Security / privacy / secrets:** 1.0 / 2 (HTML tooltip rendering adds avoidable XSS surface)  
- **Testing / verification:** 1.0 / 2 (hook tests exist; component tests have failing/incorrect assumptions)  
- **Maintainability / clarity / docs:** 1.5 / 2 (clear separation handler/storage/hook/component; temperature data provenance needs documenting)

## What I Could Not Verify (story-specific)

- Real correlation/trend-line visual behavior in the browser (chart rendering is mocked in unit tests; requires running the dashboard).  
- DB-backed correctness and performance of aggregation queries under real data volumes (no DB integration tests for correlation/trend).  

