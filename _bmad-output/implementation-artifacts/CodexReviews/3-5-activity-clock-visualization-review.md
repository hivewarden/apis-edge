# Code Review: Story 3.5 Activity Clock Visualization

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/3-5-activity-clock-visualization.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The radar chart wiring and responsive card states exist, but two ACs are only partially satisfied (empty-state “flat” chart + tooltip phrasing), and “Average” labeling may be misleading without normalization (`apis-dashboard/src/components/ActivityClockCard.tsx:154-176` `<Empty ... No activity recorded...>` + `apis-dashboard/src/components/ActivityClockCard.tsx:245-246` ``name: `${datum.hour} - ${nextHour}:59` ``).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: 24-hour polar/radar “clock” chart with 0–23 spokes | Implemented | `apis-dashboard/src/components/ActivityClockCard.tsx:61-67` `hourlyBreakdown.map((count, hour) => ({ ... }))` + `apis-dashboard/src/components/ActivityClockCard.tsx:183-186` `xField: 'hour', yField: 'count'` | Exact “clock-like” appearance depends on the chart library runtime rendering. |
| AC2: Visible bulge at active hours (data-driven) | Needs runtime verification | `apis-dashboard/src/components/ActivityClockCard.tsx:181-186` `data: chartData ... yField: 'count'` | Requires real data to confirm expected shape. |
| AC3: No detections shows message + flat/zero-radius chart | Partial | `apis-dashboard/src/components/ActivityClockCard.tsx:153-176` `<Empty ... No activity recorded for this period>` | Message is present; the chart is not rendered in this state (no “flat” chart). |
| AC4: Tooltip format “14:00 - 15:00: 8 detections (23% of total)” | Partial | `apis-dashboard/src/components/ActivityClockCard.tsx:245-247` `name: ... ${nextHour}:59 ... value: "... (${percentage}%)"` | Close, but it shows `:59` and omits “of total” wording. |
| AC5: Season+ shows aggregated hourly patterns and title indicates average | Partial | `apis-dashboard/src/components/ActivityClockCard.tsx:53-56` `isLongRange ... 'Average Hourly Activity'` + `apis-dashboard/src/components/ActivityClockCard.tsx:87-92` `useDetectionStats(siteId, range, date)` | Title says “Average,” but the stats API supplies total counts (not normalized per day). |

---

## Findings

**F1: Tooltip wording/time-range doesn’t match the AC (uses `:59` and omits “of total”)**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/components/ActivityClockCard.tsx:245-247` `name: \`${datum.hour} - ${nextHour}:59\`` + `value: \`${datum.count} ... (${percentage}%)\``  
- Why it matters: This is a user-facing detail in an analytics visualization; mismatch makes the feature feel “off” and risks confusion about bucket boundaries.  
- Recommended fix: Match the AC’s bucket labeling (e.g., `14:00 - 15:00`) and include “of total” in the tooltip value or name.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given hour 14 data, when hovering the spoke, then tooltip shows `14:00 - 15:00: N detections (X% of total)`.
  - AC2: Given hour 23 data, when hovering, then tooltip wraps correctly to `23:00 - 00:00`.
  - Tests/Verification: add a unit test that inspects the chart config’s tooltip formatter output; run `npx vitest run tests/components/ActivityClockCard.test.tsx`.  
- “Out of scope?”: no

**F2: Empty state doesn’t render a “flat” chart (only shows an Empty panel)**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/components/ActivityClockCard.tsx:153-176` `<Empty ... No activity recorded for this period>` (no `<Radar ...>` in this branch)  
- Why it matters: The AC explicitly calls for the chart to still display with zero radius (flat), reinforcing the “clock” metaphor even when quiet.  
- Recommended fix: Render the Radar chart with 24 zeros behind the message (or render the chart and overlay a centered empty-message).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `totalDetections === 0`, when the card renders, then a Radar chart is still rendered with all counts = 0.
  - AC2: Given the same state, when viewing the card, then the “No activity recorded…” message is still visible and accessible.
  - Tests/Verification: add a test that asserts the Radar component is rendered in the zero-state branch; run `npx vitest run tests/components/ActivityClockCard.test.tsx`.  
- “Out of scope?”: no

**F3: “Average Hourly Activity” title may be misleading if data is total counts**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/components/ActivityClockCard.tsx:53-56` `return isLongRange ? 'Average Hourly Activity' : 'Hourly Activity'` + `apis-dashboard/src/components/ActivityClockCard.tsx:91-92` `totalDetections = stats?.total_detections ... hourlyBreakdown = stats?.hourly_breakdown`  
- Why it matters: For long ranges (season/year/all), a user may interpret “average” as “per day,” but the stats endpoint provides aggregate totals, so the chart can overstate activity relative to shorter periods.  
- Recommended fix: Either (a) compute and return true averages from the API for long ranges, or (b) change the title to “Aggregate Hourly Activity” and keep totals.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given range is season/year/all, when the chart title says “Average,” then the plotted values are normalized (e.g., detections per day) and documented.
  - AC2: Given values remain totals, when range is season/year/all, then the title uses “Aggregate” (not “Average”).
  - Tests/Verification: add a handler/storage test for the chosen behavior and a component test for title text.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.0 / 2 (AC3 + AC4 are partial; AC5 wording/data mismatch)  
- **Correctness / edge cases:** 1.5 / 2 (core chart wiring is correct; main issues are presentation semantics)  
- **Security / privacy / secrets:** 1.5 / 2 (no direct security concerns)  
- **Testing / verification:** 1.5 / 2 (component has a solid test suite; tooltip/zero-chart specifics aren’t asserted)  
- **Maintainability / clarity / docs:** 1.0 / 2 (component is readable, but “average vs total” semantics should be clarified)

## What I Could Not Verify (story-specific)

- Real chart rendering in the browser (radar geometry, hover tooltips) because `@ant-design/charts` rendering is mocked in tests and requires runtime visual verification (`apis-dashboard/tests/components/ActivityClockCard.test.tsx:21-27` `Radar: vi.fn(...)`).  

