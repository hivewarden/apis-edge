# Bulk Review Summary - Epic 3

**Generated:** 2026-01-25
**Stories Reviewed:** 7

## Overview

| Story | Title | Status | Critical | High | Medium | Low |
|-------|-------|--------|----------|------|--------|-----|
| 3-1 | Detection Events Table & API | NEEDS_WORK | 0 | 0 | 3 | 4 |
| 3-2 | Today's Detection Count Card | NEEDS_WORK | 0 | 1 | 3 | 3 |
| 3-3 | Weather Integration | NEEDS_WORK | 0 | 1 | 3 | 3 |
| 3-4 | Time Range Selector | NEEDS_WORK | 0 | 1 | 4 | 2 |
| 3-5 | Activity Clock Visualization | NEEDS_WORK | 0 | 1 | 2 | 3 |
| 3-6 | Temperature Correlation Chart | NEEDS_WORK | 0 | 4 | 2 | 1 |
| 3-7 | Daily/Weekly Trend Line Chart | NEEDS_WORK | 0 | 0 | 4 | 3 |

## All Stories Need Work

**All 7 stories** require remediation before passing review.

### Common Issues Across Stories

| Issue Pattern | Occurrences | Stories Affected |
|---------------|-------------|------------------|
| Missing hook barrel export | 6 | 3-2, 3-3, 3-4, 3-5, 3-6, 3-7 |
| Missing unit tests (React components) | 5 | 3-2, 3-4, 3-5, 3-6, 3-7 |
| Missing unit tests (hooks) | 4 | 3-2, 3-3, 3-6, 3-7 |
| Missing backend tests | 3 | 3-1, 3-3, 3-6 |

### Priority Issues by Story

#### 3-1: Detection Events Table & API
- **I1 (MEDIUM):** Temperature capture not integrated despite task marked complete
- **I2 (MEDIUM):** No unit tests for detection handlers/storage
- **I4 (MEDIUM):** Weather integration not connected

#### 3-2: Today's Detection Count Card
- **I2 (HIGH):** No unit tests for hook or component
- **I1 (MEDIUM):** useDetectionStats not exported from barrel

#### 3-3: Weather Integration
- **I2 (HIGH):** No tests for weather feature (Go or React)
- **I1 (MEDIUM):** Missing useWeather export
- **I3 (MEDIUM):** Stale closure bug in useWeather hook

#### 3-4: Time Range Selector
- **I1 (HIGH):** Missing unit tests for TimeRangeContext and TimeRangeSelector
- **I2 (MEDIUM):** Season date logic bug (shows future data before Aug 1)

#### 3-5: Activity Clock Visualization
- **I1 (HIGH):** Missing unit tests for ActivityClockCard
- **I5 (MEDIUM):** Error state not handled

#### 3-6: Temperature Correlation Chart
- **I1-I4 (HIGH):** Missing barrel export, hook tests, component tests, backend tests
- **I5 (MEDIUM):** Tooltip format deviation

#### 3-7: Daily/Weekly Trend Line Chart
- **I1 (MEDIUM):** useTrendData not exported from barrel
- **I2-I4 (MEDIUM):** Missing tests across hook, component, backend

## Next Steps

1. **Run `/bulk-remediate 3`** to auto-fix issues across all stories
2. **Priority fixes:**
   - Add all missing hook exports to `hooks/index.ts`
   - Create test files for hooks: useDetectionStats, useWeather, useTemperatureCorrelation, useTrendData
   - Create test files for components: TodayActivityCard, TimeRangeSelector, ActivityClockCard, TemperatureCorrelationCard, TrendChartCard
3. **Backend priority:**
   - Fix temperature capture in detection creation (3-1)
   - Fix season date logic (3-4)
4. **Re-run bulk-review after remediation**

## Review Files

- `3-1-detection-events-table-api-review.md`
- `3-2-todays-detection-count-card-review.md`
- `3-3-weather-integration-review.md`
- `3-4-time-range-selector-review.md`
- `3-5-activity-clock-visualization-review.md`
- `3-6-temperature-correlation-chart-review.md`
- `3-7-daily-weekly-trend-line-chart-review.md`
