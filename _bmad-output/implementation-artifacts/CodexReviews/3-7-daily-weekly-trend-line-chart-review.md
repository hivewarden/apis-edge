# Code Review: Story 3.7 Daily/Weekly Trend Line Chart

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-7-daily-weekly-trend-line-chart.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The trend endpoint returns continuous series and the dashboard renders an area chart with appropriate empty/loading states, but some labeling/aggregation details don’t match the ACs (month/year/all labels), site validation is missing, and tooltip rendering uses raw HTML strings (`apis-server/internal/storage/detections.go:523-525` `rangeType == "year" || rangeType == "all" ... Format("Jan 2")` + `apis-server/internal/handlers/detections.go:450-453` `site, err := storage.GetSiteByID ... if err == nil` + `apis-dashboard/src/components/TrendChartCard.tsx:212-214` ``${datum.label}: ${datum.count} detection...``).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Line/area chart with time on X, detections on Y, filled area | Implemented | `apis-dashboard/src/components/TrendChartCard.tsx:166-170` `xField: 'label', yField: 'count', areaStyle: { fill: ... }` + `apis-dashboard/src/components/TrendChartCard.tsx:246` `<Area {...config} />` | Exact rendering is runtime-dependent; config matches the AC. |
| AC2: Week range shows Mon–Sun daily totals | Implemented | `apis-server/internal/storage/detections.go:413-416` `case "week", "month": result.Aggregation = "daily"` + `apis-server/internal/storage/detections.go:456` `label := dLocal.Format("Mon")` | Server generates all dates in the range, including zeros (`apis-server/internal/storage/detections.go:450-466` `for d := from; d.Before(to); ...`). |
| AC3: Month range shows dates on X-axis (1/5/10/...) | Partial | `apis-server/internal/storage/detections.go:457-459` `if rangeType == "month" { label = dLocal.Format("Jan 2") }` | Labels include month names for every day; not the “subset of date numbers” described in the story. |
| AC4: Season/Year aggregates weekly; labels week numbers or month names | Partial | `apis-server/internal/storage/detections.go:487-489` `result.Aggregation = "weekly"` + `apis-server/internal/storage/detections.go:523-525` `if rangeType == "year" || rangeType == "all" { label = weekStart.Format("Jan 2") }` | Season uses ISO week labels (W##), but Year/All use week-start dates rather than week numbers/month names. |
| AC5: Tooltip shows “<label>: N detections” | Implemented | `apis-dashboard/src/components/TrendChartCard.tsx:209-214` `customContent ... ${datum.label}: ${datum.count} detection...` | Uses HTML string tooltips (see Findings). |
| AC6: No detections shows “No activity recorded…” | Implemented | `apis-dashboard/src/components/TrendChartCard.tsx:151` `No activity recorded for this period` | Empty state is based on `totalDetections` returned by API. |

---

## Findings

**F1: Trend endpoint does not 404 on invalid `site_id` (returns empty 200 instead)**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-server/internal/handlers/detections.go:450-453` `site, err := storage.GetSiteByID(...); if err == nil && site.Timezone != "" { ... }` (no not-found handling)  
- Why it matters: A bad site link or typo looks like “no activity” instead of a clear error, making dashboard issues harder to diagnose.  
- Recommended fix: Validate site existence up front (same pattern as `GetDetectionStats`), and return 404 when the site is missing or not visible under RLS.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given an invalid `site_id`, when calling `/api/detections/trend`, then the server returns HTTP 404 “Site not found”.
  - AC2: Given a valid site, when calling the endpoint, then response remains unchanged.
  - Tests/Verification: add a handler test for 404; run `go test ./internal/handlers -run GetTrendData`.  
- “Out of scope?”: no

**F2: Year/All labeling doesn’t match the story’s “week numbers or month names” guidance**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-server/internal/storage/detections.go:523-525` `if rangeType == "year" || rangeType == "all" { label = weekStart.Format("Jan 2") }`  
- Why it matters: Weekly points labeled as dates (every 7 days) can be cluttered and harder to interpret than “W32” or “Aug/Sep/Oct”. It also diverges from the story’s spec.  
- Recommended fix: Use week numbers for season/year (W##) and month labels for year/all (e.g., “Aug”, “Sep”) or introduce a monthly aggregation for `all`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `range=year`, when returning trend points, then labels are month names or week numbers (consistent and readable).
  - AC2: Given `range=all`, when returning trend points, then aggregation is monthly (or labels are otherwise non-cluttered) and documented in `meta.aggregation`.
  - Tests/Verification: add a storage unit test that asserts label formats per range; run `go test ./internal/storage -run Trend`.  
- “Out of scope?”: no

**F3: Tooltip uses raw HTML string interpolation (XSS surface + harder testing)**  
- Severity: Medium  
- Category: Security / Maintainability  
- Evidence: `apis-dashboard/src/components/TrendChartCard.tsx:212-214` ``<span ...>${datum.label}: ${datum.count} detection...</span>``  
- Why it matters: If `label` ever becomes attacker-controlled (even indirectly), HTML tooltips can become an XSS vector. It also makes it harder to test tooltip behavior safely.  
- Recommended fix: Prefer non-HTML tooltip APIs or escape/sanitize interpolated strings; keep labels constrained to a safe character set.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given labels containing `<`/`&`, when tooltips render, then content is displayed as text (not interpreted as HTML).
  - AC2: Given normal labels, when hovering, then tooltip output still matches the AC.
  - Tests/Verification: add a unit test that asserts tooltip escaping logic; run `npx vitest run tests/components/TrendChartCard.test.tsx`.  
- “Out of scope?”: no

**F4: Accessibility test is flaky because `getByRole('img')` matches both the icon and the chart container**  
- Severity: Low  
- Category: Testing  
- Evidence: `apis-dashboard/tests/components/TrendChartCard.test.tsx:279` `screen.getByRole('img')` + `apis-dashboard/src/components/TrendChartCard.tsx:235` `<AreaChartOutlined ... />` + `apis-dashboard/src/components/TrendChartCard.tsx:241-245` `role="img" aria-label="Trend chart showing ..."`  
- Why it matters: A failing/flaky test reduces CI signal and makes it harder to trust accessibility regressions.  
- Recommended fix: Query the chart container by accessible name (`getByRole('img', { name: /Trend chart showing/ })`) or use `getAllByRole` and select the element with the expected `aria-label`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the existing TrendChartCard tests, when running `npx vitest run tests/components/TrendChartCard.test.tsx`, then all tests pass.
  - AC2: Given the chart container, when querying by role+name, then the test selects the container (not the icon).
  - Tests/Verification: run the test file above.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (core chart + empty state met; month/year/all labeling diverges from spec)  
- **Correctness / edge cases:** 1.5 / 2 (continuous series generation is good; missing site validation reduces debuggability)  
- **Security / privacy / secrets:** 1.0 / 2 (HTML tooltips are an avoidable XSS surface)  
- **Testing / verification:** 1.0 / 2 (hooks are tested; one component accessibility test currently fails due to query ambiguity)  
- **Maintainability / clarity / docs:** 1.5 / 2 (clean separation; labeling/aggregation rules should be documented and centralized)

## What I Could Not Verify (story-specific)

- Real browser chart rendering (axis label density, tooltip styling) since charts are mocked in unit tests and require runtime UI verification.  
- Performance for long ranges with large datasets (needs DB + load testing; server currently aggregates weekly for season/year/all).  
