# Story 14.6: Portal Hive Detail Task Count Integration

Status: done

## Story

As a **beekeeper viewing a hive in the portal**,
I want **to see a task count summary**,
so that **I know if there's pending work for this hive**.

## Acceptance Criteria

### AC1: Task Summary Display on Hive Detail Page
- Task summary displays in status section of hive detail page
- Format: "Tasks: X open - Y overdue" (clipboard emoji optional)
- X = count of pending tasks for this hive
- Y = count of overdue tasks (due_date < today AND status = 'pending')
- If Y > 0, overdue count shown in red color

### AC2: Task Count Click Navigation
- Task count summary is clickable
- On desktop: navigates to /tasks page with hive_id filter applied
- On mobile (future story 14.7): smooth-scrolls to Tasks section

### AC3: Hive List Overdue Badge
- Hives with overdue tasks show small red indicator badge
- Badge displays overdue count number
- Visible in hive list views (Sites page hive cards)

### AC4: API Extension - GET /api/hives/{id}
- Response includes new `task_summary` object
- Schema:
  ```json
  {
    "data": {
      "id": "...",
      "name": "...",
      "task_summary": {
        "open": 3,
        "overdue": 1
      }
    }
  }
  ```
- Counts are computed server-side for accuracy

## Tasks / Subtasks

- [x] **Task 1: Extend hives storage layer with task count query** (AC: 4)
  - [x] 1.1 Add `GetTaskSummaryForHive(ctx, conn, hiveID)` function in `apis-server/internal/storage/hives.go`
  - [x] 1.2 Query returns `TaskSummary{Open int, Overdue int}`
  - [x] 1.3 Overdue query: `due_date < CURRENT_DATE AND status = 'pending'`
  - [x] 1.4 Open query: `status = 'pending'` (includes overdue)
  - [x] 1.5 Add `GetTaskSummariesForHives(ctx, conn, hiveIDs)` for batch operation (list views)

- [x] **Task 2: Extend hives handler to include task_summary** (AC: 4)
  - [x] 2.1 Add `TaskSummary` struct to HiveResponse in `apis-server/internal/handlers/hives.go`
  - [x] 2.2 Modify `GetHive` handler to call storage and populate task_summary
  - [x] 2.3 Modify `ListHives` and `ListHivesBySite` to batch-populate task_summary
  - [x] 2.4 Follow existing enrichment pattern (like `enrichHiveResponseWithInspection`)

- [x] **Task 3: Create HiveTaskSummary component** (AC: 1, 2)
  - [x] 3.1 Create `/apis-dashboard/src/components/HiveTaskSummary.tsx`
  - [x] 3.2 Props: `open: number, overdue: number, hiveId: string, onClick?: () => void`
  - [x] 3.3 Render format: "Tasks: {open} open - {overdue} overdue"
  - [x] 3.4 Overdue count styled red when > 0 using `colors.error` or `#ef4444`
  - [x] 3.5 Cursor pointer, hover state for clickable feedback
  - [x] 3.6 Export from components/index.ts

- [x] **Task 4: Integrate HiveTaskSummary into HiveDetail page** (AC: 1, 2)
  - [x] 4.1 Modify `/apis-dashboard/src/pages/HiveDetail.tsx`
  - [x] 4.2 Add `task_summary` to Hive interface
  - [x] 4.3 Render HiveTaskSummary in the "Hive Information" card Descriptions section
  - [x] 4.4 onClick handler navigates to `/tasks?hive_id={id}`
  - [x] 4.5 Use `useNavigate` hook for navigation

- [x] **Task 5: Create OverdueBadge component for list views** (AC: 3)
  - [x] 5.1 Create `/apis-dashboard/src/components/OverdueBadge.tsx`
  - [x] 5.2 Props: `count: number` (if 0 or undefined, render nothing)
  - [x] 5.3 Small red circle with white text, positioned as overlay
  - [x] 5.4 Use Ant Badge component with `count` prop and `status="error"`
  - [x] 5.5 Export from components/index.ts

- [x] **Task 6: Integrate OverdueBadge into hive list views** (AC: 3)
  - [x] 6.1 Identify hive card/list components used in Sites page
  - [x] 6.2 Pass `task_summary` data from API response
  - [x] 6.3 Render OverdueBadge when `overdue > 0`
  - [x] 6.4 Position badge in top-right corner of hive card

- [x] **Task 7: Write tests** (AC: 1-4)
  - [x] 7.1 Create `/apis-dashboard/tests/components/HiveTaskSummary.test.tsx`
  - [x] 7.2 Test: Renders correct format with open and overdue counts
  - [x] 7.3 Test: Overdue count displays in red when > 0
  - [x] 7.4 Test: Click triggers onClick callback
  - [x] 7.5 Test: Hidden or "No tasks" when counts are 0
  - [x] 7.6 Create `/apis-dashboard/tests/components/OverdueBadge.test.tsx`
  - [x] 7.7 Test: Renders nothing when count is 0
  - [x] 7.8 Test: Displays count in red badge when > 0
  - [x] 7.9 Create `/apis-server/tests/handlers/hives_task_summary_test.go` (optional - integration test)

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a FRONTEND story. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design Badge component usage
- Color palette from apisTheme.ts
- Descriptions.Item styling within Ant Design
- Touch target sizing for mobile compatibility

### Architecture Compliance

**Backend (Go):**
- Follow existing `enrichHiveResponseWith*` pattern in handlers/hives.go
- Use batch queries to avoid N+1 when listing hives
- Storage functions in storage/hives.go or new storage/tasks.go section

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces in component files or types/
- Hooks pattern for data fetching
- apiClient for API calls
- Colors from theme/apisTheme.ts

### Existing Patterns to Follow

**Handler Enrichment Pattern (hives.go lines 196-243):**
```go
// enrichHiveResponseWithInspection adds inspection status to a HiveResponse.
func enrichHiveResponseWithInspection(ctx context.Context, conn *pgxpool.Conn, resp *HiveResponse) {
    lastInspection, err := storage.GetLastInspectionForHive(ctx, conn, resp.ID)
    if err != nil {
        return
    }
    applyInspectionToResponse(resp, lastInspection)
}

// enrichHiveResponsesWithInspections batch-enriches multiple HiveResponses.
// This is optimized to avoid N+1 queries by fetching all inspections in a single query.
func enrichHiveResponsesWithInspections(ctx context.Context, conn *pgxpool.Conn, responses []HiveResponse) {
    // ... batch fetch pattern
}
```

**Apply same pattern for task_summary:**
```go
func enrichHiveResponseWithTaskSummary(ctx context.Context, conn *pgxpool.Conn, resp *HiveResponse) {
    summary, err := storage.GetTaskSummaryForHive(ctx, conn, resp.ID)
    if err != nil {
        return // Non-fatal - just won't have task summary
    }
    resp.TaskSummary = &TaskSummaryResponse{
        Open:    summary.Open,
        Overdue: summary.Overdue,
    }
}

func enrichHiveResponsesWithTaskSummaries(ctx context.Context, conn *pgxpool.Conn, responses []HiveResponse) {
    // Batch query to avoid N+1
}
```

**Frontend Component Patterns (from HiveDetail.tsx):**
```tsx
// Descriptions.Item for displaying key-value data
<Descriptions column={1} bordered size="small">
  <Descriptions.Item label="Name">{hive.name}</Descriptions.Item>
  <Descriptions.Item label="Tasks">
    <HiveTaskSummary
      open={hive.task_summary?.open || 0}
      overdue={hive.task_summary?.overdue || 0}
      hiveId={hive.id}
      onClick={() => navigate(`/tasks?hive_id=${hive.id}`)}
    />
  </Descriptions.Item>
</Descriptions>
```

### TypeScript Interfaces

**Add to Hive interface in HiveDetail.tsx:**
```typescript
interface TaskSummary {
  open: number;
  overdue: number;
}

interface Hive {
  // ... existing fields
  task_summary?: TaskSummary;
}
```

**HiveTaskSummary component props:**
```typescript
interface HiveTaskSummaryProps {
  open: number;
  overdue: number;
  hiveId: string;
  onClick?: () => void;
}
```

**OverdueBadge component props:**
```typescript
interface OverdueBadgeProps {
  count: number;
}
```

### SQL Query for Task Summary

```sql
-- Single hive query
SELECT
  COUNT(*) FILTER (WHERE status = 'pending') AS open,
  COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) AS overdue
FROM hive_tasks
WHERE hive_id = $1 AND tenant_id = $2;

-- Batch query for multiple hives
SELECT
  hive_id,
  COUNT(*) FILTER (WHERE status = 'pending') AS open,
  COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) AS overdue
FROM hive_tasks
WHERE hive_id = ANY($1) AND tenant_id = $2
GROUP BY hive_id;
```

### Styling Guidelines

**Colors (from apisTheme.ts):**
```typescript
// For overdue count - use error red
const overdueStyle = overdue > 0 ? { color: '#ef4444' } : {};

// Or use theme colors
import { colors } from '../theme/apisTheme';
// colors.error or colors.danger if available
```

**Badge styling:**
```tsx
import { Badge } from 'antd';

// For hive list cards - small red count badge
<Badge count={overdue} size="small" offset={[-5, 5]}>
  <HiveCard {...} />
</Badge>
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveTaskSummary.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/OverdueBadge.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/HiveTaskSummary.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/OverdueBadge.test.tsx`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/hives.go` - Add task summary query functions
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/hives.go` - Add TaskSummary to response, enrichment functions
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/HiveDetail.tsx` - Add task summary display
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Export new components

### Dependencies (Already Complete)

**From Story 14.1 (DONE):**
- `hive_tasks` table exists with columns: `hive_id`, `status`, `due_date`

**From Story 14.2 (DONE):**
- Task CRUD API endpoints working
- `GET /api/hives/{id}/tasks` endpoint exists

**From Story 14.5 (DONE):**
- `useTasks` hooks for fetching tasks
- Task type interfaces and utilities

### API Response Extension

**Current GET /api/hives/{id} response:**
```json
{
  "data": {
    "id": "uuid",
    "site_id": "uuid",
    "name": "Hive Alpha",
    "queen_introduced_at": "2024-05-15",
    "queen_source": "breeder",
    "brood_boxes": 2,
    "honey_supers": 1,
    "notes": "Strong colony",
    "status": "healthy",
    "hive_status": "active"
  }
}
```

**Extended response with task_summary:**
```json
{
  "data": {
    "id": "uuid",
    "site_id": "uuid",
    "name": "Hive Alpha",
    "queen_introduced_at": "2024-05-15",
    "queen_source": "breeder",
    "brood_boxes": 2,
    "honey_supers": 1,
    "notes": "Strong colony",
    "status": "healthy",
    "hive_status": "active",
    "task_summary": {
      "open": 3,
      "overdue": 1
    }
  }
}
```

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.6]
- [Source: CLAUDE.md#Frontend-Development]
- [Source: apis-server/internal/handlers/hives.go - enrichHiveResponseWithInspection pattern]
- [Source: apis-dashboard/src/pages/HiveDetail.tsx - Page structure]
- [Source: apis-dashboard/src/hooks/useTasks.ts - Task interfaces]
- [Source: _bmad-output/implementation-artifacts/14-5-portal-active-tasks-list.md - Previous story patterns]

## Test Criteria

- [x] Task summary displays on hive detail page
- [x] Format shows "X open - Y overdue" correctly
- [x] Overdue count shown in red when > 0
- [x] Clicking task summary navigates to /tasks with hive_id filter
- [x] API returns task_summary in GET /api/hives/{id} response
- [x] API returns task_summary in GET /api/hives list response
- [x] Hive cards in list views show overdue badge when applicable
- [x] Badge hidden when no overdue tasks
- [x] All component tests pass
- [x] No regression in existing hive functionality

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation proceeded without issues.

### Completion Notes List

1. **Backend Storage Layer (Task 1)**: Utilized existing `GetTaskCountByHive` function in `storage/tasks.go` (already existed from Story 14.2). Added new `GetTaskCountsForHives` function for batch operations to avoid N+1 queries in list views.

2. **Backend Handler Integration (Task 2)**: Added `TaskSummaryResponse` struct and `TaskSummary` field to `HiveResponse`. Implemented `enrichHiveResponseWithTaskSummary` and `enrichHiveResponsesWithTaskSummaries` functions following the existing enrichment pattern. Updated `GetHive`, `ListHives`, and `ListHivesBySite` handlers to include task_summary.

3. **HiveTaskSummary Component (Task 3)**: Created new component displaying "{open} open - {overdue} overdue" format. Uses `colors.error` (#c23616) from apisTheme.ts for overdue styling. Supports click navigation with proper accessibility (keyboard navigation, ARIA role).

4. **HiveDetail Integration (Task 4)**: Added TaskSummary interface to Hive type. Integrated HiveTaskSummary component into the "Hive Information" Descriptions section. Click navigates to `/tasks?hive_id={id}`.

5. **OverdueBadge Component (Task 5)**: Created component using Ant Design Badge. Returns null/children when count is 0. Uses small size with offset positioning for card overlays.

6. **SiteDetail Integration (Task 6)**: Updated Hive interface with task_summary. Wrapped MiniHiveVisualization with OverdueBadge in hive list items. Badge appears when overdue > 0.

7. **Tests (Task 7)**: Created comprehensive test suites for both components (17 tests total, all passing). Tests cover rendering, styling, click handlers, accessibility, and edge cases.

### Change Log

- 2026-01-30: Implemented Story 14.6 - Portal Hive Detail Task Count Integration
  - Added task_summary to hive API responses (single and list endpoints)
  - Created HiveTaskSummary and OverdueBadge React components
  - Integrated task summary display on HiveDetail page
  - Added overdue badge to hive cards on SiteDetail page
  - All 17 component tests passing
- 2026-01-30: Remediation - Fixed 8 issues from code review
  - H1/H2: Added tenant_id filter to GetTaskCountByHive and GetTaskCountsForHives (security fix)
  - H3: Added status="error" prop to OverdueBadge Badge component for red styling
  - H4: Clarified HiveTaskSummary logic for open=0 case (overdue subset of open)
  - M1: Updated test to use colors.error import instead of hardcoded color value
  - M2: Added "Tasks:" prefix to HiveTaskSummary component per AC1 specification
  - M3: Added aria-label to Space component for screen reader accessibility
  - L1: Replaced document.querySelector with container.querySelector in tests
- 2026-01-30: Second remediation - Fixed 5 additional issues from re-review
  - M1: Added test for aria-label content accuracy with dynamic counts
  - M3: Removed confusing status="error" prop from OverdueBadge (count prop handles styling via theme)
  - L1: Removed unused hiveId prop from HiveTaskSummary component and call sites
  - L2: Added documentation comment to TaskCountResult struct in Go storage package

### File List

**Created:**
- apis-dashboard/src/components/HiveTaskSummary.tsx
- apis-dashboard/src/components/OverdueBadge.tsx
- apis-dashboard/tests/components/HiveTaskSummary.test.tsx
- apis-dashboard/tests/components/OverdueBadge.test.tsx

**Modified:**
- apis-server/internal/storage/tasks.go (added GetTaskCountsForHives batch function, added tenant_id param to both count functions, added documentation)
- apis-server/internal/handlers/hives.go (added TaskSummaryResponse, enrichment functions, updated handlers with tenant_id)
- apis-dashboard/src/components/index.ts (exported new components)
- apis-dashboard/src/pages/HiveDetail.tsx (added TaskSummary interface, integrated HiveTaskSummary, removed unused hiveId prop)
- apis-dashboard/src/pages/SiteDetail.tsx (added TaskSummary interface, integrated OverdueBadge)
