# Code Review: Story 3.2 Today’s Detection Count Card

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-2-todays-detection-count-card.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The card UI meets the intent (count/zero state/laser stats + skeleton), but date handling can drift across timezones and the story’s tests are currently broken (missing router context), reducing confidence (`apis-dashboard/src/hooks/useDetectionStats.ts:40-43` `date.toISOString().split('T')[0]` + `apis-dashboard/tests/components/TodayActivityCard.test.tsx:26-28` `<TimeRangeProvider>` without a router).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: “Today’s Activity” card shows large count + friendly text + warm styling | Implemented | `apis-dashboard/src/components/TodayActivityCard.tsx:192-205` `fontSize: 56 ... hornet... deterred` + `apis-dashboard/src/components/TodayActivityCard.tsx:176-181` `linear-gradient... transition` | Copy is “hornets deterred” (without “today” in the line) but header includes “Today’s Activity” for day range (`apis-dashboard/src/components/TodayActivityCard.tsx:187-188` `{rangeLabel} Activity`). |
| AC2: Zero detections shows positive “All quiet…” with green checkmark | Partial | `apis-dashboard/src/components/TodayActivityCard.tsx:154-161` `CheckCircleFilled ... All quiet ... No hornets detected today — ... protected` | Checkmark + positive message are present; wording doesn’t include “today ☀️” (`apis-dashboard/src/components/TodayActivityCard.tsx:156-157` `All quiet`). |
| AC3: Detections show last detection + laser activation rate | Implemented | `apis-dashboard/src/components/TodayActivityCard.tsx:218-224` `Last detection: ... formatRelativeTime` + `apis-dashboard/src/components/TodayActivityCard.tsx:230-232` `{laser_activations} of {total_detections} ... ({laserRate}%)` | “Last detection” is relative time; requires runtime data to validate exact phrasing. |
| AC4: Changing selected site updates the card | Implemented | `apis-dashboard/src/components/TodayActivityCard.tsx:85` `useDetectionStats(siteId, range, date)` + `apis-dashboard/src/hooks/useDetectionStats.ts:97-99` `useCallback(... [siteId, range, dateStr])` | Hook refetches when `siteId` changes. |
| AC5: Loading shows skeleton and no error flash | Implemented | `apis-dashboard/src/components/TodayActivityCard.tsx:105-116` `<Skeleton ...>` + `apis-dashboard/src/components/TodayActivityCard.tsx:122-133` `<Skeleton ...>` | Error is intentionally suppressed on initial load; “stale data” indication is not shown when `error && stats`. |

---

## Findings

**F1: `TodayActivityCard` tests fail because `TimeRangeProvider` requires a Router context**  
- Severity: Medium  
- Category: Testing / Reliability  
- Evidence: `apis-dashboard/tests/components/TodayActivityCard.test.tsx:26-28` `return <TimeRangeProvider>{children}</TimeRangeProvider>` + `apis-dashboard/src/context/TimeRangeContext.tsx:86-87` `useSearchParams()`  
- Why it matters: The story claims coverage, but `npx vitest run tests/components/TodayActivityCard.test.tsx` currently fails at runtime (“useLocation() may be used only in the context of a <Router> component”), so regressions in this card can slip through.  
- Recommended fix: Wrap the test `Wrapper` with `MemoryRouter` (or use the same `renderWithProviders` helper pattern used in other component tests).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the existing tests, when running `npx vitest run tests/components/TodayActivityCard.test.tsx`, then all tests pass.
  - AC2: Given a default route without `range`/`date`, when rendering the card, then the provider initializes without throwing.
  - Tests/Verification: run `npx vitest run tests/components/TodayActivityCard.test.tsx`.  
- “Out of scope?”: no

**F2: Day-specific querying uses UTC date formatting that can drift in some timezones**  
- Severity: Medium  
- Category: Correctness  
- Evidence: `apis-dashboard/src/hooks/useDetectionStats.ts:40-43` `date.toISOString().split('T')[0]`  
- Why it matters: If the stored `Date` isn’t local-midnight-safe, converting to ISO and slicing can shift the calendar day for users outside UTC, producing “wrong day” stats for Day range.  
- Recommended fix: Use a timezone-stable formatter for date-only values (e.g., build `YYYY-MM-DD` from local year/month/day, or use `dayjs(date).format('YYYY-MM-DD')` consistently across the app).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a selected date in a non-UTC timezone, when Day range queries are made, then the `date=YYYY-MM-DD` sent to the API matches the user-selected calendar date.
  - AC2: Given URL state with `date=YYYY-MM-DD`, when the page loads, then the displayed date and queried date are the same.
  - Tests/Verification: add a unit test that runs under a non-UTC TZ (e.g., set `TZ=America/New_York`) and asserts the formatted date param.  
- “Out of scope?”: no

**F3: Stale-data UX is inconsistent: errors are hidden when stats exist**  
- Severity: Low  
- Category: UX / Reliability  
- Evidence: `apis-dashboard/src/components/TodayActivityCard.tsx:122-134` `if (error && !stats) { ... <Skeleton ...> }` (no mention of `error` when `stats` exists)  
- Why it matters: If the API starts failing, users will keep seeing old counts without any indication the data may be stale. WeatherCard already implements a “Showing cached data” affordance; this card doesn’t.  
- Recommended fix: When `error && stats`, show a subtle “Showing stale data” indicator (no toast) and/or a small refresh action.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given stats are displayed and the last fetch errors, when the card renders, then it shows a subtle “Showing stale data” hint.
  - AC2: Given the error clears on the next successful poll, when the card re-renders, then the hint disappears.
  - Tests/Verification: extend the component test to assert stale indicator appears when `error` is set but `stats` is non-null.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (all AC behaviors are present; copy/emoji differences keep AC2 from being fully exact)  
- **Correctness / edge cases:** 1.5 / 2 (polling + derived stats are straightforward; date-only formatting is fragile across TZs)  
- **Security / privacy / secrets:** 1.5 / 2 (no direct security concerns in this component beyond general API error handling)  
- **Testing / verification:** 0.5 / 2 (the intended unit tests fail due to missing router wrapper; `apis-dashboard/tests/components/TodayActivityCard.test.tsx:26-28` `<TimeRangeProvider>` without router)  
- **Maintainability / clarity / docs:** 1.5 / 2 (component is readable and uses shared theme; improving stale-data UX would align with WeatherCard)

## What I Could Not Verify (story-specific)

- Real-world polling behavior and perceived “no error flash” UX in the browser (requires running the dashboard and simulating API failures; hook polls every 30s: `apis-dashboard/src/hooks/useDetectionStats.ts:12` `POLL_INTERVAL_MS = 30000`).  
- End-to-end correctness of “Last detection: X ago” across locales/timezones (requires runtime with real data timestamps; `apis-dashboard/src/components/TodayActivityCard.tsx:60-70` `formatRelativeTime`).  

