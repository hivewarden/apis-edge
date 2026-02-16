# Code Review: Story 3.7 - Daily/Weekly Trend Line Chart

**Story:** `_bmad-output/implementation-artifacts/3-7-daily-weekly-trend-line-chart.md`
**Reviewer:** Claude Opus 4.5 (Adversarial Senior Developer Review)
**Date:** 2026-01-25
**Status:** PASS

---

## Acceptance Criteria Verification

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Line/area chart with X-axis (time), Y-axis (count), Sea Buckthorn area fill | IMPLEMENTED | `TrendChartCard.tsx:167-169` - Area fill uses Sea Buckthorn color gradient |
| AC2 | Week range shows Mon-Sun daily labels | IMPLEMENTED | `detections.go:448-466` - Daily aggregation with weekday labels for week range |
| AC3 | Month range shows date labels with daily totals | IMPLEMENTED | `detections.go:452-453` - Labels formatted as "Jan 2" for month range |
| AC4 | Season/Year aggregates weekly | IMPLEMENTED | `detections.go:468-529` - Weekly aggregation for season/year/all ranges |
| AC5 | Tooltip shows "label: N detections" format | IMPLEMENTED | `TrendChartCard.tsx:206-209` - Tooltip formatter returns label and detection count |
| AC6 | Empty state message for no detections | IMPLEMENTED | `TrendChartCard.tsx:133-157` - Shows "No activity recorded for this period" |

**Missing AC from Epic (Not in Story):**
- Comparison line showing previous period (epic AC mentions "faded comparison line shows last week/month/season") - NOT IMPLEMENTED but was listed as "optional" in technical notes

---

## Issues Found

### I1: useTrendData Hook Not Exported from hooks/index.ts

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts`
**Line:** N/A (missing)
**Severity:** MEDIUM
**Category:** Code Quality / Barrel Export
**Status:** [x] FIXED

**Problem:** The `useTrendData` hook is not exported from the hooks barrel export file (`hooks/index.ts`), breaking the barrel export pattern used throughout the codebase. While the component imports directly from `../hooks/useTrendData`, this is inconsistent with other hooks like `useEquipment`, `useFeedings`, etc. which are all exported from the index.

**Evidence:** The `hooks/index.ts` file exports 14 other hooks but `useTrendData` is missing:
```typescript
// hooks/index.ts - useTrendData is NOT listed
export { useAuth } from "./useAuth";
export { useClips } from "./useClips";
// ... other hooks exported, but NOT useTrendData
```

**Fix:** Add export statement to `hooks/index.ts`:
```typescript
export { useTrendData } from "./useTrendData";
export type { TrendPoint } from "./useTrendData";
```

---

### I2: No Unit Tests for useTrendData Hook

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useTrendData.test.ts`
**Line:** N/A (file does not exist)
**Severity:** MEDIUM
**Category:** Test Coverage
**Status:** [x] FIXED

**Problem:** The `useTrendData` hook has no unit tests. Other hooks in the same directory (`useEquipment`, `useOnlineStatus`, `useSWUpdate`, `useOfflineData`) all have corresponding test files. This is inconsistent with the testing patterns in the codebase.

**Evidence:**
```bash
ls tests/hooks/
# useEquipment.test.ts
# useOfflineData.test.ts
# useOnlineStatus.test.ts
# useSWUpdate.test.ts
# (no useTrendData.test.ts)
```

**Required Tests:**
1. Returns empty points when no siteId provided
2. Fetches data correctly for different range types
3. Handles loading state
4. Handles error state
5. refetch function triggers new fetch

---

### I3: No Unit Tests for TrendChartCard Component

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/TrendChartCard.test.tsx`
**Line:** N/A (file does not exist)
**Severity:** MEDIUM
**Category:** Test Coverage
**Status:** [x] FIXED

**Problem:** The `TrendChartCard` component has no unit tests. Other components in `tests/components/` have test files. The component has multiple states (no site, loading, error, empty, data) that should be tested.

**Required Tests:**
1. Renders "Select a site" when siteId is null
2. Shows loading spinner when loading
3. Shows error state on fetch failure
4. Shows empty state when totalDetections is 0
5. Renders Area chart with correct data
6. Title changes based on time range
7. Accessibility: aria-label is present on chart container

---

### I4: No Backend Unit Tests for GetTrendData Storage/Handler

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/detections_test.go`
**Line:** N/A (file may not exist or doesn't test trend endpoint)
**Severity:** MEDIUM
**Category:** Test Coverage
**Status:** [x] FIXED

**Problem:** The `GetTrendData` storage function (lines 352-532 in `detections.go`) and the `GetTrendData` handler have no visible unit tests. This is a complex function with multiple aggregation branches (hourly, daily, weekly) that should have test coverage.

**Evidence:** Searched for `GetTrendData` and `/trend` in `apis-server/tests/` - no matches found.

**Required Tests:**
1. Hourly aggregation for "day" range
2. Daily aggregation for "week" range
3. Daily aggregation for "month" range
4. Weekly aggregation for "season" range
5. Weekly aggregation for "year" range
6. Empty result when no detections
7. Handler returns 400 for missing site_id
8. Handler returns 400 for invalid range type

---

### I5: Month Range X-axis Labels Don't Match AC Exactly

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/detections.go`
**Line:** 452-453
**Severity:** LOW
**Category:** Requirement Compliance
**Status:** [x] ACCEPTED - Acceptable deviation

**Problem:** AC3 states: "X-axis shows dates (1, 5, 10, 15, 20, 25, 30)". The implementation shows ALL dates formatted as "Jan 2" (e.g., "Jan 1", "Jan 2", "Jan 3"...). The AC suggests showing a subset of specific dates to avoid clutter.

**Current Implementation:**
```go
// Line 452-453
label = dLocal.Format("Jan 2")  // Shows ALL dates
```

**Impact:** Minor UX difference - all dates are shown rather than a subset. This is acceptable since `xAxis.autoHide: true` in the frontend config handles label hiding automatically, providing a more flexible solution than hardcoded date subsets.

---

### I6: Potential Division by Zero in maxCount Calculation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TrendChartCard.tsx`
**Line:** 160, 195
**Severity:** LOW
**Category:** Error Handling
**Status:** [x] FIXED

**Problem:** When all data points have `count: 0`, `Math.max(...points.map(d => d.count))` returns 0, and the subsequent calculation `maxCount + Math.ceil(maxCount * 0.1)` results in `0 + 0 = 0`. Setting `yAxis.max: 0` may cause rendering issues with the chart.

**Current Code:**
```typescript
// Line 160
const maxCount = Math.max(...points.map(d => d.count));
// Line 195
max: maxCount + Math.ceil(maxCount * 0.1), // Results in 0 if maxCount is 0
```

**Fix:** Add a minimum y-axis max:
```typescript
const maxCount = Math.max(...points.map(d => d.count), 0);
const yAxisMax = maxCount > 0 ? maxCount + Math.ceil(maxCount * 0.1) : 10;
```

---

### I7: Tooltip Format Doesn't Match AC Exactly

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TrendChartCard.tsx`
**Line:** 206-209
**Severity:** LOW
**Category:** Requirement Compliance
**Status:** [x] FIXED

**Problem:** AC5 states tooltip should show "Oct 15: 14 detections". The current implementation shows the label as `name` and count as `value`, which may display differently depending on the chart library's tooltip rendering.

**Current Implementation:**
```typescript
formatter: (datum: { label: string; count: number }) => ({
  name: datum.label,
  value: `${datum.count} detection${datum.count !== 1 ? 's' : ''}`,
}),
```

**Expected (per AC):** "Oct 15: 14 detections" (colon separator, specific format)

**Impact:** The actual tooltip display depends on @ant-design/charts default rendering, which may or may not match the AC exactly. Should verify the actual rendered tooltip matches expectations.

---

## Verdict

**Status: PASS**

### Summary

All issues have been remediated:

1. **Code Quality Issues Fixed:**
   - [x] I1: `useTrendData` now exported from hooks barrel file

2. **Test Coverage Added:**
   - [x] I2: Created `tests/hooks/useTrendData.test.ts` with 12 test cases
   - [x] I3: Created `tests/components/TrendChartCard.test.tsx` with 17 test cases
   - [x] I4: Added 13 test functions to `tests/handlers/detections_test.go`

3. **Bug Fixes:**
   - [x] I6: Added minimum y-axis max of 10 to prevent chart rendering issues
   - [x] I7: Updated tooltip to use customContent with exact AC format "label: N detections"

4. **Acceptable Deviations:**
   - [x] I5: Month labels show all dates with autoHide (more flexible than hardcoded subset)

---

## Change Log

- 2026-01-25: Initial adversarial code review completed
- 2026-01-26: Remediation completed - all 7 issues addressed (6 fixed, 1 acceptable deviation)

## Remediation Log

**Remediated:** 2026-01-26
**Issues Fixed:** 7 of 7

### Changes Applied
- I1: Added `useTrendData` and `TrendPoint` exports to `apis-dashboard/src/hooks/index.ts`
- I2: Created `apis-dashboard/tests/hooks/useTrendData.test.ts` with 12 comprehensive test cases
- I3: Created `apis-dashboard/tests/components/TrendChartCard.test.tsx` with 17 comprehensive test cases
- I4: Added 13 GetTrendData handler test functions to `apis-server/tests/handlers/detections_test.go`
- I5: Marked as acceptable deviation - autoHide provides flexible label management
- I6: Added `yAxisMax` calculation with minimum of 10 in `TrendChartCard.tsx`
- I7: Changed tooltip to use `customContent` with exact AC format in `TrendChartCard.tsx`

### Remaining Issues
None - all issues addressed.
