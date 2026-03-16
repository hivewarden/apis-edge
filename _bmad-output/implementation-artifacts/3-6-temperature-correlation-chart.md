# Story 3.6: Temperature Correlation Chart

Status: done

## Story

As a **beekeeper**,
I want to see how hornet activity relates to temperature,
So that I can predict high-activity days.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the Temperature Correlation chart
   **Then** I see a scatter plot with:
   - X-axis: Temperature (°C)
   - Y-axis: Detection count
   - Each dot represents a day's data

2. **Given** there's a clear pattern (e.g., more activity at 18-22°C)
   **When** I view the chart
   **Then** I see dots clustered in that temperature range
   **And** an optional trend line shows the correlation

3. **Given** I hover over a data point
   **When** the tooltip appears
   **Then** I see: "Oct 15: 22°C, 14 detections"

4. **Given** I click on a data point
   **When** the click is processed
   **Then** I can optionally drill down to that day's detailed view

5. **Given** the time range is "Day"
   **When** the chart renders
   **Then** it shows hourly temperature vs detections for that day

6. **Given** no correlation data exists
   **When** I view the chart
   **Then** I see "No temperature data recorded for this period"

## Tasks / Subtasks

- [x] Task 1: Create Backend Temperature Correlation Endpoint (AC: #1, #5)
  - [x] 1.1: Add `GET /api/detections/temperature-correlation` endpoint
  - [x] 1.2: For non-day ranges, return daily aggregates: `[{date, avg_temp, detection_count}]`
  - [x] 1.3: For day range, return hourly aggregates: `[{hour, avg_temp, detection_count}]`
  - [x] 1.4: Handle edge case when no temperature data exists

- [x] Task 2: Create useTemperatureCorrelation Hook (AC: #1, #5, #6)
  - [x] 2.1: Create `apis-dashboard/src/hooks/useTemperatureCorrelation.ts`
  - [x] 2.2: Use TimeRangeContext for range and date
  - [x] 2.3: Handle loading, error, and empty states

- [x] Task 3: Create TemperatureCorrelationCard Component (AC: #1, #2, #3, #5, #6)
  - [x] 3.1: Create `apis-dashboard/src/components/TemperatureCorrelationCard.tsx`
  - [x] 3.2: Use Scatter chart from @ant-design/charts
  - [x] 3.3: Configure X-axis for temperature (°C), Y-axis for detection count
  - [x] 3.4: Apply Sea Buckthorn color (#f7a42d) for data points
  - [x] 3.5: Handle empty state with "No temperature data recorded" message
  - [x] 3.6: Add aria-label for accessibility

- [x] Task 4: Implement Tooltips (AC: #3)
  - [x] 4.1: For daily data: "Oct 15: 22°C, 14 detections"
  - [x] 4.2: For hourly data: "14:00: 22°C, 3 detections"

- [x] Task 5: Implement Optional Trend Line (AC: #2)
  - [x] 5.1: Add linear regression calculation (uses @ant-design/charts built-in)
  - [x] 5.2: Draw trend line on chart (when >= 3 data points)

- [x] Task 6: Integrate into Dashboard (AC: #1-6)
  - [x] 6.1: Add TemperatureCorrelationCard to Dashboard grid
  - [x] 6.2: Export from components/index.ts
  - [x] 6.3: Verify responsive behavior (build passes)

## Dev Notes

### Backend API Design

The endpoint needs to return different data structures based on time range:

```go
// GET /api/detections/temperature-correlation?site_id=xxx&range=month

// Response for range != day (daily aggregates)
{
  "data": [
    {"date": "2026-01-15", "avg_temp": 18.5, "detection_count": 12},
    {"date": "2026-01-16", "avg_temp": 22.1, "detection_count": 8},
    ...
  ],
  "meta": {
    "range": "month",
    "total_points": 31
  }
}

// Response for range == day (hourly aggregates)
{
  "data": [
    {"hour": 9, "avg_temp": 15.2, "detection_count": 1},
    {"hour": 10, "avg_temp": 17.8, "detection_count": 3},
    ...
  ],
  "meta": {
    "range": "day",
    "date": "2026-01-22",
    "total_points": 24
  }
}
```

### Data Source

Temperature data comes from weather_snapshots table (stored with detections in Story 3.3).
If no weather data exists for a detection, that detection is excluded from correlation.

### SQL Query for Daily Aggregates

```sql
SELECT
  DATE(d.detected_at) as date,
  AVG(d.temperature_c) as avg_temp,
  COUNT(*) as detection_count
FROM detections d
WHERE d.tenant_id = $1
  AND d.site_id = $2
  AND d.detected_at >= $3 AND d.detected_at < $4
  AND d.temperature_c IS NOT NULL
GROUP BY DATE(d.detected_at)
ORDER BY date;
```

### Scatter Chart Configuration

```typescript
import { Scatter } from '@ant-design/charts';

const config = {
  data: chartData,
  xField: 'temperature',
  yField: 'detections',
  colorField: 'date', // Or single color
  color: '#f7a42d',
  shape: 'circle',
  size: 6,
  xAxis: {
    title: { text: 'Temperature (°C)' },
    min: 0,
    max: 35,
  },
  yAxis: {
    title: { text: 'Detections' },
    min: 0,
  },
  tooltip: {
    formatter: (datum) => ({
      name: datum.date,
      value: `${datum.temperature}°C, ${datum.detections} detections`,
    }),
  },
  // Optional trend line
  regressionLine: {
    type: 'linear',
    style: {
      stroke: '#662604',
      strokeOpacity: 0.5,
      lineDash: [4, 4],
    },
  },
};
```

### Linear Regression for Trend Line

@ant-design/charts Scatter supports built-in regression line, but if needed manually:

```typescript
function calculateLinearRegression(data: {x: number, y: number}[]) {
  const n = data.length;
  if (n < 2) return null;

  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}
```

### Time Range Context Integration

```typescript
const { range, date } = useTimeRange();
const isHourlyMode = range === 'day';

// Different title based on mode
const title = isHourlyMode
  ? 'Hourly Temperature vs Activity'
  : 'Temperature Correlation';
```

### Theme Colors

```typescript
import { colors } from '../theme/apisTheme';
// colors.seaBuckthorn = '#f7a42d' (chart points)
// colors.brownBramble = '#662604' (trend line)
// colors.salomie = '#ffe9a9' (card background)
```

### Dashboard Layout

Add after ActivityClockCard in a new row:

```tsx
<Row gutter={[16, 16]}>
  <Col xs={24} lg={12}>
    <TemperatureCorrelationCard siteId={selectedSiteId} />
  </Col>
  <Col xs={24} lg={12}>
    <TrendChartCard siteId={selectedSiteId} />  {/* Story 3.7 */}
  </Col>
</Row>
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6]
- [@ant-design/charts Scatter](https://charts.ant.design/en/examples/scatter/bindAngle)
- [Existing useDetectionStats hook](apis-dashboard/src/hooks/useDetectionStats.ts)
- [Weather data stored in detections.temperature_c]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

None

### Completion Notes List

- Added GetTemperatureCorrelation storage function with daily/hourly aggregation support
- Added GetTemperatureCorrelation handler with range and date parameter support
- Added route: GET /api/detections/temperature-correlation
- Created useTemperatureCorrelation hook with TimeRangeContext integration
- Created TemperatureCorrelationCard component with Scatter chart
- Built-in regression line when >= 3 data points
- Three states: no-site, loading, empty, and chart view
- Proper accessibility with aria-label on chart container

### File List

- `apis-server/internal/storage/detections.go` - MODIFIED: Added GetTemperatureCorrelation
- `apis-server/internal/handlers/detections.go` - MODIFIED: Added GetTemperatureCorrelation handler
- `apis-server/cmd/server/main.go` - MODIFIED: Added route for temperature-correlation
- `apis-dashboard/src/hooks/useTemperatureCorrelation.ts` - NEW: Hook for fetching correlation data
- `apis-dashboard/src/components/TemperatureCorrelationCard.tsx` - NEW: Scatter chart component
- `apis-dashboard/src/components/index.ts` - MODIFIED: Export TemperatureCorrelationCard
- `apis-dashboard/src/pages/Dashboard.tsx` - MODIFIED: Added TemperatureCorrelationCard to grid

## Change Log

- 2026-01-24: Story 3.6 created with comprehensive developer context
- 2026-01-24: Implementation completed - all tasks done, build passes
- 2026-01-24: Code review completed - fixed 4 issues:
  - H1: Removed redundant x/y fields from transform (dead code)
  - M1: Fixed date parsing to avoid timezone issues
  - M2: Added error state display in component
  - M3: Removed redundant colorField (using single color)
- 2026-01-26: Remediation: Fixed 7 issues from code review (all issues already resolved except I7 magic number)
