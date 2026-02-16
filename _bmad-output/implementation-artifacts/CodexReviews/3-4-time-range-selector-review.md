# Code Review: Story 3.4 Time Range Selector

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-4-time-range-selector.md`

## Story Verdict

- **Score:** 6.0 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The selector + context + API range support exist, but date parsing/formatting is timezone-unsafe (can display the wrong day and query a different day), and initial site auto-selection can wipe `range/date` query params (`apis-dashboard/src/context/TimeRangeContext.tsx:46-56` `new Date(dateStr)` + `toISOString().split('T')[0]` + `apis-dashboard/src/pages/Dashboard.tsx:100` `setSearchParams({ site_id: firstSiteId })`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Segmented control shows Day/Week/Month/Season/Year/All Time | Implemented | `apis-dashboard/src/components/TimeRangeSelector.tsx:18-25` `{ label: 'Day' ... 'All Time' }` + `apis-dashboard/src/components/TimeRangeSelector.tsx:49-57` `<Segmented options={TIME_RANGE_OPTIONS} ...>` | UI rendering verified structurally; exact styling requires runtime. |
| AC2: Selecting Day shows DatePicker for a specific day | Implemented | `apis-dashboard/src/components/TimeRangeSelector.tsx:58-68` `{range === 'day' && ( <DatePicker ... /> )}` | DatePicker is present, but the date value can be off-by-one due to parsing (see Findings). |
| AC3: Week shows current week (Mon–Sun) and aggregates daily | Needs runtime verification | `apis-server/internal/handlers/detections.go:545-553` `case "week": ... weekday ... from ... to = from.AddDate(0, 0, 7)` + `apis-server/internal/storage/detections.go:434-466` `case "week", "month": result.Aggregation = "daily"` | Correctness depends on runtime timezone and DB data; range boundaries are computed using the server/reference date location (`apis-server/internal/handlers/detections.go:539` `loc := referenceDate.Location()`). |
| AC4: Season shows Aug 1–Nov 30 and aggregates weekly | Implemented | `apis-server/internal/handlers/detections.go:557-565` `case "season": from = ... Aug 1 ... to = ... Dec 1` + `apis-server/internal/storage/detections.go:450-456` `default: // Weekly aggregation for season/year/all` | Uses Dec 1 (exclusive) which matches Aug 1–Nov 30 inclusive. |
| AC5: Range changes update all charts + loading state + persist in URL query params | Partial | `apis-dashboard/src/context/TimeRangeContext.tsx:112-129` `newParams.set('range', newRange) ... setSearchParams(newParams)` + `apis-dashboard/src/pages/Dashboard.tsx:389-392` `<TimeRangeProvider> ... </TimeRangeProvider>` | URL persistence exists, but date parsing is timezone-unsafe and auto-selecting first site can overwrite other params (`apis-dashboard/src/pages/Dashboard.tsx:100` `setSearchParams({ site_id: firstSiteId })`). |

---

## Findings

**F1: Date handling is timezone-unsafe (can display “Jan 19” while querying `date=2026-01-20`)**  
- Severity: High  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/context/TimeRangeContext.tsx:46-47` `const parsed = new Date(dateStr)` + `apis-dashboard/src/context/TimeRangeContext.tsx:55-56` `date.toISOString().split('T')[0]` + `apis-dashboard/src/components/TimeRangeSelector.tsx:60` `value={date ? dayjs(date) : dayjs()}`  
- Why it matters: Date-only strings like `2026-01-20` are parsed as UTC by `new Date('YYYY-MM-DD')`; in many local timezones this becomes the previous local day, so the UI can show the wrong selected date while the API queries a different day.  
- Recommended fix: Treat `YYYY-MM-DD` as a *local date* (not UTC instant). Parse via year/month/day parts: `new Date(year, month-1, day)` (or `dayjs(dateStr, 'YYYY-MM-DD')`) and format using a local-date formatter (e.g., `dayjs(date).format('YYYY-MM-DD')`) instead of `toISOString()`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `?range=day&date=2026-01-20`, when the dashboard loads in a non-UTC timezone, then the DatePicker displays Jan 20 (not Jan 19) and the API queries `date=2026-01-20`.
  - AC2: Given I select Jan 20 in the DatePicker, when the URL updates, then it becomes `date=2026-01-20` and reload preserves the same date.
  - Tests/Verification: add a unit test that runs with `TZ=America/New_York` and asserts parsing/formatting; run `npx vitest run tests/context/TimeRangeContext.test.tsx`.  
- “Out of scope?”: no

**F2: Initial site auto-selection overwrites existing `range`/`date` params**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/pages/Dashboard.tsx:96-101` `if (!selectedSiteId ... ) { ... setSearchParams({ site_id: firstSiteId }); }`  
- Why it matters: Bookmarked URLs like `/dashboard?range=week&date=...` lose their time-range state when no `site_id` is provided, breaking “shareable” and “restorable” behavior.  
- Recommended fix: Preserve existing query params when setting the default `site_id` (same approach already used in `handleSiteChange`; `apis-dashboard/src/pages/Dashboard.tsx:192-199` `new URLSearchParams(searchParams)`).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a URL with `range` and/or `date` but no `site_id`, when the first site is auto-selected, then existing `range/date` params are preserved.
  - AC2: Given `site_id` is present, when sites load, then no query param rewrite occurs.
  - Tests/Verification: add a dashboard test that initializes `MemoryRouter` at `/?range=week` and asserts URL retains `range=week` after site load; run `npx vitest run tests/pages/Dashboard.test.tsx` (or create it if missing).  
- “Out of scope?”: no

**F3: “All Time” range is not truly all-time and includes a future `to` bound**  
- Severity: Medium  
- Category: Correctness / Performance  
- Evidence: `apis-server/internal/handlers/detections.go:569-572` `from = time.Date(2020, 1, 1, ...); to = time.Now().AddDate(1, 0, 0)`  
- Why it matters: Hard-coding `from=2020` may exclude older data and using `to=now+1y` is semantically odd (and can expand query windows unnecessarily). “All Time” should either be unbounded lower/upper or derived from data.  
- Recommended fix: Use `from = time.Time{}` (no lower bound) and `to = time.Now().AddDate(0,0,1)` (end-of-today) or omit upper bound entirely; ensure queries remain performant (indexes) and consider server-side max-range caps.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `range=all`, when the server computes the window, then it does not rely on a hard-coded year.
  - AC2: Given `range=all`, when the server queries, then it does not include future dates beyond “today” unless explicitly requested.
  - Tests/Verification: extend `apis-server/internal/handlers/detections_test.go` to assert `calculateDateRange("all", ...)` returns sensible bounds; run `go test ./internal/handlers -run CalculateDateRangeAll`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.0 / 2 (core UI + API support exist, but date persistence correctness is compromised by timezone parsing)  
- **Correctness / edge cases:** 1.0 / 2 (timezone bug + query-param overwrite can lead to user-visible incorrectness)  
- **Security / privacy / secrets:** 1.5 / 2 (no direct security issues; primary risks are correctness/UX)  
- **Testing / verification:** 1.0 / 2 (context/selector tests exist, but they don’t cover non-UTC behavior)  
- **Maintainability / clarity / docs:** 1.5 / 2 (context/provider pattern is clear; date handling should be centralized and made consistent)

## What I Could Not Verify (story-specific)

- End-to-end “all charts update simultaneously” behavior (requires running the dashboard and observing coordinated loading states across cards).  
- Correct behavior across a variety of site timezones (range boundaries use `referenceDate.Location()`; `apis-server/internal/handlers/detections.go:539` `loc := referenceDate.Location()`).  

