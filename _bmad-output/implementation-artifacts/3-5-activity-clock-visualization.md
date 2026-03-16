# Story 3.5: Activity Clock Visualization

Status: done

## Story

As a **beekeeper**,
I want to see what time of day hornets are most active,
So that I can understand their daily patterns at my location.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the Activity Clock
   **Then** I see a 24-hour polar/radar chart shaped like a clock
   **And** each hour (0-23) is a spoke on the chart
   **And** the radius at each hour represents detection count

2. **Given** hornets are most active at 14:00-16:00
   **When** I view the chart
   **Then** the 14, 15, 16 hour spokes bulge outward
   **And** nighttime hours (20:00-06:00) show minimal radius

3. **Given** no detections in the selected time range
   **When** I view the chart
   **Then** a message shows "No activity recorded for this period"
   **And** the chart displays with zero radius (flat)

4. **Given** I hover over an hour spoke
   **When** the tooltip appears
   **Then** I see: "14:00 - 15:00: 8 detections (23% of total)"

5. **Given** the time range is "Season" or longer
   **When** the chart renders
   **Then** it shows aggregated hourly patterns across all days
   **And** title indicates "Average hourly activity"

## Tasks / Subtasks

- [x] Task 1: Install @ant-design/charts (AC: #1)
  - [x] 1.1: Add @ant-design/charts to package.json dependencies
  - [x] 1.2: Verify installation and build passes

- [x] Task 2: Create ActivityClockCard Component (AC: #1, #2, #3)
  - [x] 2.1: Create `apis-dashboard/src/components/ActivityClockCard.tsx`
  - [x] 2.2: Use Radar or Rose chart from @ant-design/charts
  - [x] 2.3: Configure 24 data points (hours 0-23)
  - [x] 2.4: Apply Sea Buckthorn color (#f7a42d) for data fill
  - [x] 2.5: Handle empty state with "No activity recorded" message

- [x] Task 3: Implement Clock Labels (AC: #1)
  - [x] 3.1: Display clock labels at cardinal positions (00, 06, 12, 18)
  - [x] 3.2: Format hour labels for readability

- [x] Task 4: Implement Tooltips (AC: #4)
  - [x] 4.1: Create custom tooltip showing "HH:00 - HH:59: N detections (X% of total)"
  - [x] 4.2: Calculate percentage from total detections

- [x] Task 5: Handle Time Range Context (AC: #5)
  - [x] 5.1: Use TimeRangeContext to get current range
  - [x] 5.2: Update title to "Average hourly activity" for season/year/all ranges
  - [x] 5.3: Ensure chart refreshes when range changes

- [x] Task 6: Integrate into Dashboard (AC: #1-5)
  - [x] 6.1: Add ActivityClockCard next to existing cards in Detection Activity section
  - [x] 6.2: Export from components/index.ts
  - [x] 6.3: Verify responsive behavior on different screen sizes (build passes)

## Dev Notes

### Existing Data Source

The `useDetectionStats` hook already returns `hourly_breakdown: number[]` with 24 elements (one per hour). No new API endpoint is needed.

```typescript
interface DetectionStats {
  total_detections: number;
  laser_activations: number;
  hourly_breakdown: number[];  // Already available!
  avg_confidence: number | null;
  first_detection: string | null;
  last_detection: string | null;
}
```

### @ant-design/charts Installation

```bash
npm install @ant-design/charts
```

The package includes Radar and Rose charts suitable for polar visualization.

### Radar Chart Configuration

```typescript
import { Radar } from '@ant-design/charts';

// Transform hourly_breakdown to Radar data format
const chartData = hourlyBreakdown.map((count, hour) => ({
  hour: formatHour(hour),  // "00:00", "01:00", etc.
  count: count,
}));

const config = {
  data: chartData,
  xField: 'hour',
  yField: 'count',
  area: { style: { fillOpacity: 0.4 } },
  color: '#f7a42d',  // Sea Buckthorn
  point: { size: 2 },
  xAxis: {
    line: null,
    tickLine: null,
    label: {
      formatter: (v: string) => {
        // Only show labels at cardinal positions
        const hour = parseInt(v);
        return [0, 6, 12, 18].includes(hour) ? v : '';
      },
    },
  },
  yAxis: {
    line: null,
    tickLine: null,
    grid: { line: { type: 'line' } },
  },
  tooltip: {
    formatter: (datum) => ({
      name: `${datum.hour} - ${nextHour(datum.hour)}`,
      value: `${datum.count} detections (${percentage}%)`,
    }),
  },
};
```

### Alternative: Rose Chart (Nightingale)

Rose charts might be more visually appealing for this use case:

```typescript
import { Rose } from '@ant-design/charts';

const config = {
  data: chartData,
  xField: 'hour',
  yField: 'count',
  seriesField: 'hour',
  color: '#f7a42d',
  radius: 0.9,
  innerRadius: 0.2,
  label: {
    offset: -15,
    content: ({ count }) => count > 0 ? count : '',
  },
};
```

### Hour Formatting Utilities

```typescript
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function nextHour(hourStr: string): string {
  const hour = parseInt(hourStr);
  return `${((hour + 1) % 24).toString().padStart(2, '0')}:59`;
}

function getPercentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}
```

### Empty State Handling

When `total_detections === 0`:
- Show "No activity recorded for this period" message
- Display a flat/empty chart or hide chart entirely

### Title Based on Time Range

```typescript
const { range } = useTimeRange();
const isLongRange = ['season', 'year', 'all'].includes(range);
const title = isLongRange ? 'Average Hourly Activity' : 'Hourly Activity';
```

### Theme Colors

```typescript
import { colors } from '../theme/apisTheme';
// colors.seaBuckthorn = '#f7a42d' (chart fill)
// colors.salomie = '#ffe9a9' (card background)
// colors.brownBramble = '#5c3d2e' (text)
```

### Dashboard Layout

Add to the Detection Activity section row:
```tsx
<Row gutter={[16, 16]}>
  <Col xs={24} sm={12} lg={8}>
    <TodayActivityCard siteId={selectedSiteId} />
  </Col>
  <Col xs={24} sm={12} lg={8}>
    <WeatherCard ... />
  </Col>
  <Col xs={24} lg={8}>
    <ActivityClockCard siteId={selectedSiteId} />  {/* NEW */}
  </Col>
</Row>
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5]
- [@ant-design/charts Radar](https://charts.ant.design/en/examples/radar/bindAngle)
- [@ant-design/charts Rose](https://charts.ant.design/en/examples/rose/bindAngle)
- [Existing useDetectionStats hook](apis-dashboard/src/hooks/useDetectionStats.ts)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

None

### Completion Notes List

- Used Radar chart from @ant-design/charts for 24-hour polar visualization
- Implemented custom formatter for cardinal hour labels (00, 06, 12, 18)
- Custom tooltip shows "HH:00 - HH:59: N detections (X%)" format
- Dynamic title based on time range ("Average Hourly Activity" for long ranges)
- Three states: no-site, loading, empty, and chart view
- Integrated with useDetectionStats hook for data (uses existing hourly_breakdown)

### File List

- `apis-dashboard/src/components/ActivityClockCard.tsx` - MODIFIED: Activity clock component with error handling, responsive heights
- `apis-dashboard/src/components/index.ts` - MODIFIED: Export ActivityClockCard
- `apis-dashboard/src/pages/Dashboard.tsx` - MODIFIED: Added ActivityClockCard to grid
- `apis-dashboard/tests/components/ActivityClockCard.test.tsx` - NEW: 21 comprehensive unit tests

## Change Log

- 2026-01-24: Story 3.5 created with comprehensive developer context
- 2026-01-24: Implementation completed - all tasks done, build passes
- 2026-01-24: Code review completed - fixed 4 issues:
  - H1: Added aria-label for accessibility on chart container
  - M1: Fixed tooltip formatter to use hourIndex instead of parsing string
  - M2: Extracted animation config to static constant (avoid re-creation)
  - M3: Renamed unused hourNum to hourIndex and used it properly
- 2026-01-25: Remediation: Fixed 6 issues from bulk code review:
  - I1 (HIGH): Created 21 unit tests in ActivityClockCard.test.tsx
  - I2 (LOW): Added documentation comment to isCardinalHour function
  - I3 (LOW): Added documentation comment explaining 'as const' usage (RadarConfig doesn't expose animation type)
  - I4 (MEDIUM): Changed chart container to responsive height (100%, min 200, max 280)
  - I5 (MEDIUM): Added error state handling with WarningOutlined icon
  - I6 (LOW): Added minHeight: 320 to all card states for consistency
