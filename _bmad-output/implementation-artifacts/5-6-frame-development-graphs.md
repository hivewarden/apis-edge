# Story 5.6: Frame Development Graphs

Status: done

## Story

As a **beekeeper**,
I want to visualize frame data over the season,
So that I can see hive development patterns.

## Acceptance Criteria

1. **Given** I am on a hive detail page with frame history **When** I view the Frame Development chart **Then** I see a stacked area chart showing: X-axis (Time/inspection dates), Y-axis (Frame count), Layers (Brood brown, Honey gold, Pollen orange)

2. **Given** I hover over a point on the chart **When** the tooltip appears **Then** I see: "Jun 15: 6 brood, 4 honey, 2 pollen frames"

3. **Given** insufficient frame data (<3 inspections with frame data) **When** I view the chart **Then** I see "Record more inspections to see frame trends" **And** a preview of what the chart will look like

## Tasks / Subtasks

### Task 1: Frontend - Frame History Hook (AC: #1)
- [ ] 1.1 Create useFrameHistory hook to fetch /api/hives/{id}/frame-history
- [ ] 1.2 Transform data for chart format

### Task 2: Frontend - Frame Development Chart (AC: #1, #2, #3)
- [ ] 2.1 Create FrameDevelopmentChart component using @ant-design/charts Area
- [ ] 2.2 Configure stacked area with correct colors
- [ ] 2.3 Add tooltip formatting
- [ ] 2.4 Show empty state when insufficient data

### Task 3: Frontend - Integration (AC: #1)
- [ ] 3.1 Add chart to HiveDetail page (only when advancedMode enabled)

## Dev Notes

### Chart Colors
- Brood: #8B4513 (saddle brown)
- Honey: #f7a42d (sea buckthorn - primary color)
- Pollen: #FFA500 (orange)

### API Endpoint
GET /api/hives/{hive_id}/frame-history
Returns aggregated frame data by inspection date.

### Dependencies
- @ant-design/charts (already in package.json)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- Created useFrameHistory hook
- Created FrameDevelopmentChart component using @ant-design/charts Area
- Integrated chart into HiveDetail (only shown when advancedMode enabled)
- Added proper tooltip formatting
- Added empty state with preview

### Completion Notes List

1. Hook: useFrameHistory fetches /api/hives/{id}/frame-history and transforms for chart
2. Chart: Stacked area chart with correct colors (Brood=#8B4513, Honey=#f7a42d, Pollen=#FFA500)
3. Tooltip: Shows date and frame counts per type on hover
4. Empty state: Shows guidance when < 3 inspections with frame data
5. Integration: Chart only visible when advancedMode enabled in Settings

### File List

**Frontend:**
- `apis-dashboard/src/hooks/useFrameHistory.ts`
- `apis-dashboard/src/hooks/index.ts` (modified)
- `apis-dashboard/src/components/FrameDevelopmentChart.tsx`
- `apis-dashboard/src/components/index.ts` (modified)
- `apis-dashboard/src/pages/HiveDetail.tsx` (modified)
