# Story 3.7: Daily/Weekly Trend Line Chart

Status: done

## Story

As a **beekeeper**,
I want to see detection trends over time,
So that I can understand if hornet pressure is increasing or decreasing.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the Trend chart
   **Then** I see a line/area chart with:
   - X-axis: Time (days or weeks depending on range)
   - Y-axis: Detection count
   - Filled area under the line in Sea Buckthorn color

2. **Given** time range is "Week"
   **When** the chart renders
   **Then** X-axis shows Mon, Tue, Wed, Thu, Fri, Sat, Sun
   **And** each point shows that day's total detections

3. **Given** time range is "Month"
   **When** the chart renders
   **Then** X-axis shows dates (1, 5, 10, 15, 20, 25, 30)
   **And** line connects daily totals

4. **Given** time range is "Season" or "Year"
   **When** the chart renders
   **Then** data is aggregated weekly to avoid clutter
   **And** X-axis shows week numbers or month names

5. **Given** I hover over a data point
   **When** the tooltip appears
   **Then** I see: "Oct 15: 14 detections"

6. **Given** no detections in the selected time range
   **When** I view the chart
   **Then** I see "No activity recorded for this period"

## Tasks / Subtasks

- [x] Task 1: Create Backend Trend Endpoint (AC: #1-4)
  - [x] 1.1: Add `GET /api/detections/trend` endpoint
  - [x] 1.2: For week range, return 7 data points (Mon-Sun)
  - [x] 1.3: For month range, return daily data points
  - [x] 1.4: For season/year/all, return weekly aggregates
  - [x] 1.5: For day range, return hourly data points

- [x] Task 2: Create useTrendData Hook (AC: #1-6)
  - [x] 2.1: Create `apis-dashboard/src/hooks/useTrendData.ts`
  - [x] 2.2: Use TimeRangeContext for range and date
  - [x] 2.3: Handle loading, error, and empty states

- [x] Task 3: Create TrendChartCard Component (AC: #1-5)
  - [x] 3.1: Create `apis-dashboard/src/components/TrendChartCard.tsx`
  - [x] 3.2: Use Area chart from @ant-design/charts
  - [x] 3.3: Configure X-axis based on time range
  - [x] 3.4: Apply Sea Buckthorn color (#f7a42d) for area fill
  - [x] 3.5: Handle empty state with message (AC: #6)
  - [x] 3.6: Add aria-label for accessibility

- [x] Task 4: Implement Tooltips (AC: #5)
  - [x] 4.1: Format tooltip as "label: N detections"

- [x] Task 5: Integrate into Dashboard (AC: #1-6)
  - [x] 5.1: Add TrendChartCard next to TemperatureCorrelationCard
  - [x] 5.2: Export from components/index.ts
  - [x] 5.3: Verify responsive behavior (build passes)

## Dev Notes

### Backend API Design

```go
// GET /api/detections/trend?site_id=xxx&range=month

// Response structure
{
  "data": [
    {"label": "Jan 1", "date": "2026-01-01", "count": 5},
    {"label": "Jan 2", "date": "2026-01-02", "count": 12},
    ...
  ],
  "meta": {
    "range": "month",
    "aggregation": "daily",  // "hourly", "daily", "weekly"
    "total_detections": 150
  }
}
```

### Aggregation Rules

| Range | Aggregation | X-axis Labels |
|-------|-------------|---------------|
| day | hourly | 00:00, 01:00, ... 23:00 |
| week | daily | Mon, Tue, Wed, Thu, Fri, Sat, Sun |
| month | daily | 1, 5, 10, 15, 20, 25, 30 (show subset) |
| season | weekly | W31, W32, ... or Aug, Sep, Oct, Nov |
| year | weekly | Jan, Feb, ... Dec |
| all | monthly | Jan '25, Feb '25, ... |

### SQL Query for Daily Trend

```sql
SELECT
  TO_CHAR(DATE(detected_at AT TIME ZONE $4), 'YYYY-MM-DD') AS date,
  TO_CHAR(DATE(detected_at AT TIME ZONE $4), 'Mon DD') AS label,
  COUNT(*) AS count
FROM detections
WHERE site_id = $1
  AND detected_at >= $2 AND detected_at < $3
GROUP BY DATE(detected_at AT TIME ZONE $4)
ORDER BY date;
```

### SQL Query for Weekly Trend

```sql
SELECT
  DATE_TRUNC('week', detected_at AT TIME ZONE $4) AS week_start,
  TO_CHAR(DATE_TRUNC('week', detected_at AT TIME ZONE $4), 'Mon DD') AS label,
  COUNT(*) AS count
FROM detections
WHERE site_id = $1
  AND detected_at >= $2 AND detected_at < $3
GROUP BY DATE_TRUNC('week', detected_at AT TIME ZONE $4)
ORDER BY week_start;
```

### Area Chart Configuration

```typescript
import { Area } from '@ant-design/charts';

const config = {
  data: chartData,
  xField: 'label',
  yField: 'count',
  smooth: true,
  areaStyle: {
    fill: `l(270) 0:${colors.seaBuckthorn}00 1:${colors.seaBuckthorn}`,
  },
  line: {
    color: colors.seaBuckthorn,
  },
  xAxis: {
    label: {
      autoRotate: false,
    },
  },
  yAxis: {
    min: 0,
  },
  tooltip: {
    formatter: (datum) => ({
      name: 'Detections',
      value: datum.count,
    }),
  },
};
```

### Theme Colors

```typescript
import { colors } from '../theme/apisTheme';
// colors.seaBuckthorn = '#f7a42d' (area fill)
// colors.salomie = '#ffe9a9' (card background)
// colors.brownBramble = '#5c3d2e' (text)
```

### Dashboard Layout

Add next to TemperatureCorrelationCard:

```tsx
<Row gutter={[16, 16]} style={{ marginTop: 16 }}>
  <Col xs={24} lg={12}>
    <TemperatureCorrelationCard siteId={selectedSiteId} />
  </Col>
  <Col xs={24} lg={12}>
    <TrendChartCard siteId={selectedSiteId} />  {/* NEW */}
  </Col>
</Row>
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7]
- [@ant-design/charts Area](https://charts.ant.design/en/examples/area/bindAngle)
- [Existing detection storage functions](apis-server/internal/storage/detections.go)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

None

### Completion Notes List

- Added GetTrendData storage function with hourly/daily/weekly aggregation
- Added GetTrendData handler with range-based aggregation
- Added route: GET /api/detections/trend
- Created useTrendData hook with TimeRangeContext integration
- Created TrendChartCard component with Area chart
- Generates all time periods (even with zero counts) for continuous axis
- Three states: no-site, loading, error, empty, and chart view
- Proper accessibility with aria-label on chart container

### File List

- `apis-server/internal/storage/detections.go` - MODIFIED: Added GetTrendData
- `apis-server/internal/handlers/detections.go` - MODIFIED: Added GetTrendData handler
- `apis-server/cmd/server/main.go` - MODIFIED: Added route for trend
- `apis-dashboard/src/hooks/useTrendData.ts` - NEW: Hook for fetching trend data
- `apis-dashboard/src/components/TrendChartCard.tsx` - NEW: Area chart component
- `apis-dashboard/src/components/index.ts` - MODIFIED: Export TrendChartCard
- `apis-dashboard/src/pages/Dashboard.tsx` - MODIFIED: Added TrendChartCard to grid

## Change Log

- 2026-01-24: Story 3.7 created with comprehensive developer context
- 2026-01-24: Implementation completed - all tasks done, build passes
- 2026-01-24: Code review completed - fixed 2 issues:
  - M1: Extracted animation config to static constant
  - M2: Removed unnecessary transformData function (use points directly)
- 2026-01-26: Remediation: Fixed 7 issues from code review
  - I1: Added useTrendData export to hooks barrel file
  - I2: Created useTrendData.test.ts with 12 test cases
  - I3: Created TrendChartCard.test.tsx with 17 test cases
  - I4: Added 13 GetTrendData handler tests
  - I5: Accepted deviation (autoHide handles labels)
  - I6: Fixed y-axis max edge case
  - I7: Fixed tooltip format to match AC
