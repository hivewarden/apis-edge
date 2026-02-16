# Story 14.9: Mobile Tasks Section View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **beekeeper at the apiary**,
I want **to see pending tasks for the current hive**,
so that **I know what work needs to be done**.

## Acceptance Criteria

### AC1: Tasks Section Layout with Subsections
- When viewing the Tasks section on mobile, tasks are displayed organized by status
- If overdue tasks exist, show "OVERDUE" subsection with red background tint
- Always show "PENDING" subsection below overdue (if any pending tasks exist)
- Both subsections render within the SectionHeader component area (id="tasks-section")

### AC2: Overdue Subsection Styling
- Header: "OVERDUE" with warning icon
- Background: Red tint using `colors.error` at 10% opacity
- Tasks within sorted by priority (urgent first, then high, medium, low)
- Only shown when there are overdue tasks (due_date < today AND status = 'pending')

### AC3: Pending Subsection
- Header: "PENDING"
- Tasks sorted by: priority (descending), then due_date (ascending, nulls last)
- Standard background (no special tint)
- Only shown when there are non-overdue pending tasks

### AC4: Task Card Display
- Each task card displays:
  - Priority indicator emoji: Urgent, High, Medium, Low
  - Task name (from template name or custom_title)
  - Due date (if set) formatted as "Feb 1" (short month + day)
  - Cards are expandable (tap to toggle)
- "Complete" button with 64px touch target height
- "Delete" text link (less prominent, positioned after Complete button)

### AC5: Expandable Task Card Details
- When tapped (not on buttons), card expands to show:
  - Full description text (if any)
  - Notes (if any)
  - Created date formatted as "Created: Jan 15, 2026"
  - Source indicator: "Manual" or "Suggested by BeeBrain" with robot icon
- Second tap collapses the card
- Only one card expanded at a time (accordion behavior)

### AC6: Empty State
- When no tasks exist for the hive, display empty state:
  - Icon: Clipboard/checklist icon (CheckSquareOutlined or similar)
  - Text: "No tasks for this hive"
  - Subtext: "Plan your next visit by adding a task below"
- Empty state should be centered and have adequate padding

### AC7: Priority Visual Indicators
| Priority | Color Code | Emoji |
|----------|------------|-------|
| Urgent | #ef4444 (red) | (red circle) |
| High | #f97316 (orange) | (orange circle) |
| Medium | #22c55e (green) | (green circle) |
| Low | #6b7280 (gray) | (white circle) |

### AC8: Data Fetching
- Fetch tasks for current hive using GET /api/hives/{id}/tasks endpoint
- Filter for status = 'pending' by default
- Include template details for auto_effects information (needed for Story 14.10)
- Handle loading and error states gracefully

## Tasks / Subtasks

- [x] **Task 1: Create MobileTaskCard component** (AC: 4, 5, 7)
  - [x] 1.1 Create `/apis-dashboard/src/components/MobileTaskCard.tsx`
  - [x] 1.2 Props interface: `task: Task`, `expanded: boolean`, `onToggle: () => void`, `onComplete: () => void`, `onDelete: () => void`
  - [x] 1.3 Render priority indicator using emoji based on task.priority
  - [x] 1.4 Display task name (template name or custom_title)
  - [x] 1.5 Display due date in "Feb 1" format when set (use dayjs format 'MMM D')
  - [x] 1.6 Implement expandable/collapsible behavior with smooth animation
  - [x] 1.7 When expanded, show description, notes, created date, source
  - [x] 1.8 Source indicator: show robot icon for 'beebrain' source tasks
  - [x] 1.9 "Complete" button: 64px height, primary style, full width
  - [x] 1.10 "Delete" link: text button below Complete, muted color
  - [x] 1.11 Apply touch-friendly padding and spacing
  - [x] 1.12 Export from components/index.ts

- [x] **Task 2: Create TaskEmptyState component** (AC: 6)
  - [x] 2.1 Create `/apis-dashboard/src/components/TaskEmptyState.tsx`
  - [x] 2.2 Props interface: `style?: CSSProperties`
  - [x] 2.3 Render centered layout with icon, title, and subtext
  - [x] 2.4 Use CheckSquareOutlined icon from @ant-design/icons
  - [x] 2.5 Text: "No tasks for this hive"
  - [x] 2.6 Subtext: "Plan your next visit by adding a task below"
  - [x] 2.7 Apply theme colors (textMuted for subtext)
  - [x] 2.8 Export from components/index.ts

- [x] **Task 3: Create useHiveTasks hook** (AC: 8)
  - [x] 3.1 Create `/apis-dashboard/src/hooks/useHiveTasks.ts`
  - [x] 3.2 Parameters: `hiveId: string`, `status?: 'pending' | 'completed' | 'all'`
  - [x] 3.3 Fetch from GET /api/hives/{hiveId}/tasks?status={status}
  - [x] 3.4 Return: `{ tasks, loading, error, refetch }`
  - [x] 3.5 Separate tasks into overdue and pending arrays
  - [x] 3.6 Sort overdue by priority (urgent > high > medium > low)
  - [x] 3.7 Sort pending by priority, then by due_date (nulls last)
  - [x] 3.8 Expose `overdueTasks` and `pendingTasks` separately
  - [x] 3.9 Export from hooks/index.ts

- [x] **Task 4: Create MobileTasksSection component** (AC: 1, 2, 3)
  - [x] 4.1 Create `/apis-dashboard/src/components/MobileTasksSection.tsx`
  - [x] 4.2 Props interface: `hiveId: string`, `style?: CSSProperties`
  - [x] 4.3 Use useHiveTasks hook to fetch tasks
  - [x] 4.4 Track expanded task ID in state (accordion behavior - only one expanded)
  - [x] 4.5 Render Overdue subsection when overdueTasks.length > 0:
        - Header with warning icon and "OVERDUE" text
        - Red background tint: `${colors.error}1A` (colors.error at 10%)
        - Render MobileTaskCard for each overdue task
  - [x] 4.6 Render Pending subsection when pendingTasks.length > 0:
        - Header: "PENDING"
        - Render MobileTaskCard for each pending task
  - [x] 4.7 Render TaskEmptyState when no tasks exist
  - [x] 4.8 Handle loading state (Spin component)
  - [x] 4.9 Handle error state (Alert component)
  - [x] 4.10 Pass onComplete and onDelete handlers to cards (placeholder for Story 14.10)
  - [x] 4.11 Export from components/index.ts

- [x] **Task 5: Integrate MobileTasksSection into HiveDetailMobile** (AC: all)
  - [x] 5.1 Modify `/apis-dashboard/src/components/HiveDetailMobile.tsx`
  - [x] 5.2 Import MobileTasksSection component
  - [x] 5.3 Replace placeholder Empty component in Tasks section with MobileTasksSection
  - [x] 5.4 Pass hive.id to MobileTasksSection
  - [x] 5.5 Verify section still has id="tasks-section" for scroll targeting

- [x] **Task 6: Write unit tests for MobileTaskCard** (AC: 4, 5, 7)
  - [x] 6.1 Create `/apis-dashboard/tests/components/MobileTaskCard.test.tsx`
  - [x] 6.2 Test: Renders task name correctly
  - [x] 6.3 Test: Shows correct priority emoji for each priority level
  - [x] 6.4 Test: Shows due date when set
  - [x] 6.5 Test: Hides due date when not set
  - [x] 6.6 Test: Expands on tap (shows description, notes, created date)
  - [x] 6.7 Test: Collapses on second tap
  - [x] 6.8 Test: Shows BeeBrain source indicator for beebrain tasks
  - [x] 6.9 Test: Complete button calls onComplete handler
  - [x] 6.10 Test: Delete link calls onDelete handler

- [x] **Task 7: Write unit tests for TaskEmptyState** (AC: 6)
  - [x] 7.1 Create `/apis-dashboard/tests/components/TaskEmptyState.test.tsx`
  - [x] 7.2 Test: Renders icon
  - [x] 7.3 Test: Renders title text "No tasks for this hive"
  - [x] 7.4 Test: Renders subtext about adding tasks

- [x] **Task 8: Write unit tests for useHiveTasks hook** (AC: 8)
  - [x] 8.1 Create `/apis-dashboard/tests/hooks/useHiveTasks.test.ts`
  - [x] 8.2 Test: Returns loading true initially
  - [x] 8.3 Test: Returns tasks from API
  - [x] 8.4 Test: Separates overdue from pending correctly
  - [x] 8.5 Test: Sorts overdue by priority
  - [x] 8.6 Test: Sorts pending by priority, then due_date
  - [x] 8.7 Test: Handles API error

- [x] **Task 9: Write unit tests for MobileTasksSection** (AC: 1, 2, 3)
  - [x] 9.1 Create `/apis-dashboard/tests/components/MobileTasksSection.test.tsx`
  - [x] 9.2 Test: Shows loading spinner when loading
  - [x] 9.3 Test: Shows error alert when error
  - [x] 9.4 Test: Shows empty state when no tasks
  - [x] 9.5 Test: Renders Overdue subsection with red background when overdue tasks exist
  - [x] 9.6 Test: Renders Pending subsection for non-overdue tasks
  - [x] 9.7 Test: Accordion behavior - only one card expanded at a time
  - [x] 9.8 Test: Overdue subsection has warning icon

- [x] **Task 10: Export components and verify build** (AC: all)
  - [x] 10.1 Update `/apis-dashboard/src/components/index.ts` with new exports
  - [x] 10.2 Update `/apis-dashboard/src/hooks/index.ts` with useHiveTasks export
  - [x] 10.3 Run `npm run build` to verify no TypeScript errors
  - [x] 10.4 Run `npm run test` to verify all tests pass

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a **FRONTEND story**. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design Collapse patterns for expandable cards
- Mobile-first touch target sizing (64px per NFR-HT-04)
- Priority color styling from theme
- Accordion behavior implementation
- Loading and error state patterns

### Architecture Compliance

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces for all component props
- Custom hooks for data fetching (useHiveTasks)
- Follow existing component composition patterns
- Colors and spacing from theme/apisTheme.ts
- Touch targets: 64px minimum per NFR-HT-04

### Existing Patterns to Follow

**From Story 14.7/14.8 - HiveDetailMobile Structure:**
```tsx
// Current placeholder in Tasks section (lines 488-497):
<SectionHeader title="TASKS" count={taskCount} id="tasks-section">
  <div style={{ padding: '0 0 24px' }}>
    {/* Placeholder for Story 14.9 implementation */}
    <Empty
      description="Tasks will appear here"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      style={{ padding: '32px 0' }}
    />
  </div>
</SectionHeader>

// Replace the Empty component with MobileTasksSection:
<SectionHeader title="TASKS" count={taskCount} id="tasks-section">
  <MobileTasksSection hiveId={hive.id} />
</SectionHeader>
```

**From useTasks.ts - Priority Configuration (already exists):**
```typescript
export const PRIORITY_OPTIONS = [
  { value: 'low' as const, label: 'Low', color: '#6b7280' },
  { value: 'medium' as const, label: 'Medium', color: '#22c55e' },
  { value: 'high' as const, label: 'High', color: '#f97316' },
  { value: 'urgent' as const, label: 'Urgent', color: '#ef4444' },
] as const;

export function getPriorityColor(priority: TaskPriority): string {
  const option = PRIORITY_OPTIONS.find(opt => opt.value === priority);
  return option?.color || '#6b7280';
}
```

**From useTasks.ts - Task Interface (already exists):**
```typescript
export interface Task {
  id: string;
  hive_id: string;
  hive_name?: string;
  template_id?: string;
  custom_title?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string;
  created_at: string;
  completed_at?: string;
  created_by?: string;
  auto_effects?: AutoEffects;
}
```

### Priority Emoji Mapping

```typescript
const PRIORITY_EMOJI: Record<TaskPriority, string> = {
  urgent: '\uD83D\uDD34', // Red circle emoji
  high: '\uD83D\uDFE0',   // Orange circle emoji
  medium: '\uD83D\uDFE2', // Green circle emoji
  low: '\u26AA',          // White circle emoji
};
```

### MobileTaskCard Component Design

```tsx
interface MobileTaskCardProps {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onDelete: () => void;
}

// Visual structure:
// +------------------------------------------+
// | [Priority Emoji] Task Name         Feb 1 |
// +------------------------------------------+
// (when expanded:)
// | Description text here...                  |
// | Notes: Some notes                         |
// | Created: Jan 15, 2026                     |
// | Source: Manual / BeeBrain                 |
// |                                           |
// | [========= Complete =========]  (64px)    |
// |           Delete                          |
// +------------------------------------------+
```

### MobileTasksSection Component Design

```tsx
interface MobileTasksSectionProps {
  hiveId: string;
  style?: CSSProperties;
}

// Visual structure:
// +------------------------------------------+
// | [!] OVERDUE                     (red bg) |
// |   [Task Card 1]                          |
// |   [Task Card 2]                          |
// +------------------------------------------+
// | PENDING                                  |
// |   [Task Card 3]                          |
// |   [Task Card 4]                          |
// +------------------------------------------+
// OR (when no tasks):
// +------------------------------------------+
// |        [Clipboard Icon]                  |
// |    No tasks for this hive                |
// | Plan your next visit by adding a task    |
// +------------------------------------------+
```

### Overdue Detection Logic

```typescript
const isOverdue = (task: Task): boolean => {
  if (!task.due_date || task.status !== 'pending') return false;
  return dayjs(task.due_date).isBefore(dayjs(), 'day');
};
```

### Task Sorting Logic

```typescript
const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const sortByPriority = (a: Task, b: Task): number => {
  return priorityOrder[a.priority] - priorityOrder[b.priority];
};

const sortByPriorityThenDueDate = (a: Task, b: Task): number => {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // Sort by due_date, nulls last
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return dayjs(a.due_date).diff(dayjs(b.due_date));
};
```

### Theme Colors Reference

From `/apis-dashboard/src/theme/apisTheme.ts`:
```typescript
colors = {
  seaBuckthorn: '#f7a42d',  // Primary accent
  coconutCream: '#fbf9e7',  // Background
  brownBramble: '#662604',  // Dark text
  salomie: '#fcd483',       // Card surface
  error: '#c23616',         // Red for overdue
  textMuted: '#8b6914',     // Secondary text
}
```

### Touch Target Compliance

```typescript
// From apisTheme.ts
touchTargets = {
  standard: 48,   // Standard buttons
  mobile: 64,     // Glove-friendly mobile (required for Complete button)
  gap: 16,        // Minimum gap between targets
}
```

### API Endpoint Used

```
GET /api/hives/{id}/tasks
Query params:
  - status: 'pending' | 'completed' | 'all' (default: 'pending')

Response:
{
  "data": [
    {
      "id": "uuid",
      "hive_id": "uuid",
      "template_id": "uuid",
      "title": "Requeen",
      "custom_title": null,
      "description": "Replace the queen",
      "priority": "high",
      "status": "pending",
      "due_date": "2026-02-01",
      "created_at": "2026-01-15T10:30:00Z",
      "created_by": "uuid",
      "source": "manual",
      "auto_effects": { ... }
    }
  ],
  "meta": {
    "total": 5
  }
}
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileTaskCard.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskEmptyState.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileTasksSection.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useHiveTasks.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileTaskCard.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/TaskEmptyState.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileTasksSection.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useHiveTasks.test.ts`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailMobile.tsx` - Replace placeholder with MobileTasksSection
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Add exports
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts` - Add useHiveTasks export

### Dependencies (from previous stories)

**From Story 14.7 (DONE):**
- `HiveDetailMobile` component with Tasks section placeholder
- `SectionHeader` component for section headers
- Section ID `tasks-section` for scroll targeting

**From Story 14.8 (IN REVIEW):**
- `BottomAnchorNav` with Tasks button showing count
- `useActiveSection` hook for section navigation
- Bottom nav scrolls to tasks-section when Tasks button tapped

**For Story 14.10 (NEXT):**
- MobileTaskCard's `onComplete` and `onDelete` handlers will be implemented
- Task completion flow with auto-effect prompts
- Delete confirmation and API call

**For Story 14.11 (FUTURE):**
- "Add Task" inline form will be added below the tasks list
- MobileTasksSection will need to expose refetch capability

### Reusable Components from useTasks.ts

The `useTasks.ts` hook already provides:
- `Task` interface
- `TaskPriority` type
- `getPriorityColor()` function
- `getPriorityLabel()` function
- `PRIORITY_OPTIONS` constant
- `useCompleteTask()` hook (for Story 14.10)
- `useDeleteTask()` hook (for Story 14.10)

### Ant Design Components to Use

```tsx
import {
  Typography,
  Button,
  Space,
  Spin,
  Alert,
  Card,        // Optional for card wrapper
  Collapse,    // Alternative for accordion behavior
} from 'antd';

import {
  CheckSquareOutlined,    // Empty state icon
  RobotOutlined,          // BeeBrain source indicator
  WarningOutlined,        // Overdue header icon
  ClockCircleOutlined,    // Due date icon (optional)
} from '@ant-design/icons';
```

### Testing Strategy

**Mock API response for tests:**
```typescript
const mockTasks: Task[] = [
  {
    id: '1',
    hive_id: 'hive-1',
    title: 'Requeen',
    priority: 'high',
    status: 'pending',
    due_date: '2026-01-15', // Overdue
    created_at: '2026-01-01T10:00:00Z',
    source: 'manual',
  },
  {
    id: '2',
    hive_id: 'hive-1',
    title: 'Add feed',
    priority: 'medium',
    status: 'pending',
    due_date: '2026-02-15', // Future
    created_at: '2026-01-10T10:00:00Z',
    source: 'beebrain',
    description: 'Low honey stores detected',
  },
];
```

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.9]
- [Source: _bmad-output/implementation-artifacts/14-7-mobile-hive-detail-single-scroll.md - Mobile layout patterns]
- [Source: _bmad-output/implementation-artifacts/14-8-mobile-bottom-anchor-navigation.md - Section navigation]
- [Source: apis-dashboard/src/components/HiveDetailMobile.tsx - Current implementation to modify]
- [Source: apis-dashboard/src/hooks/useTasks.ts - Existing task types and utilities]
- [Source: apis-dashboard/src/theme/apisTheme.ts - Colors and touch targets]
- [Source: CLAUDE.md#Frontend-Development - Use /frontend-design skill]

## Test Criteria

- [x] Overdue tasks shown first with red background styling
- [x] Overdue header shows warning icon
- [x] Tasks sorted by priority (urgent > high > medium > low)
- [x] Pending tasks sorted by priority, then due date (nulls last)
- [x] Task cards show correct priority emoji
- [x] Task cards show due date when set (formatted as "Feb 1")
- [x] Cards are expandable/collapsible (accordion - only one expanded)
- [x] Expanded cards show description, notes, created date, source
- [x] BeeBrain source shows robot icon
- [x] Empty state displays when no tasks
- [x] Complete button has 64px height (touch-friendly)
- [x] Delete link is visible but less prominent
- [x] Loading spinner shows during fetch
- [x] Error alert shows on API failure
- [x] All unit tests pass (63 tests passing)
- [x] Build compiles without TypeScript errors

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Initial implementation created all components and tests
- Code review found 10 issues (2 critical, 3 high, 3 medium, 2 low)
- All auto-fixable issues remediated

### Completion Notes List

1. **Task interface extended** - Added `source` and `notes` properties to Task interface in useTasks.ts to eliminate type assertions
2. **PRIORITY_EMOJI exported** - Moved emoji mapping to useTasks.ts for reuse across components
3. **isMountedRef pattern added** - useHiveTasks hook now uses CLAUDE.md required pattern to prevent state updates on unmounted components
4. **ARIA accessibility added** - MobileTaskCard header now has `role="button"`, `aria-expanded`, and keyboard navigation support
5. **Theme-based colors** - Overdue background now uses `${colors.error}1A` instead of hardcoded RGBA
6. **Console.log removed** - Placeholder handlers now use no-op pattern with underscore-prefixed unused params
7. **Unused import removed** - Removed unused `dayjs` import from MobileTasksSection.test.tsx

### File List

**Created:**
- `apis-dashboard/src/components/MobileTaskCard.tsx`
- `apis-dashboard/src/components/MobileTasksSection.tsx`
- `apis-dashboard/src/components/TaskEmptyState.tsx`
- `apis-dashboard/src/hooks/useHiveTasks.ts`
- `apis-dashboard/tests/components/MobileTaskCard.test.tsx`
- `apis-dashboard/tests/components/MobileTasksSection.test.tsx`
- `apis-dashboard/tests/components/TaskEmptyState.test.tsx`
- `apis-dashboard/tests/hooks/useHiveTasks.test.ts`

**Modified:**
- `apis-dashboard/src/hooks/useTasks.ts` - Added TaskSource type, source/notes to Task interface, PRIORITY_EMOJI export
- `apis-dashboard/src/components/HiveDetailMobile.tsx` - Integrated MobileTasksSection
- `apis-dashboard/src/components/index.ts` - Added exports
- `apis-dashboard/src/hooks/index.ts` - Added useHiveTasks export
