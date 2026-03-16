# Story 14.5: Portal Active Tasks List with Filters

Status: done

## Story

As a **beekeeper**,
I want **to see all active tasks with filtering and bulk actions**,
so that **I can monitor and manage pending work across all hives**.

## Acceptance Criteria

### AC1: Active Tasks Section Header
- Header displays: "Active Tasks (X open - Y overdue)"
- X = count of tasks with status = 'pending'
- Y = count of overdue tasks (due_date < today AND status = 'pending')
- Overdue count shown in red when Y > 0

### AC2: Filter Row
- Site dropdown: "All Sites" + list of user's sites
- Priority dropdown: "All", "Low", "Medium", "High", "Urgent"
- Status dropdown: "Open" (default), "Completed", "All"
- Search input: searches hive name and task name (debounced 300ms)
- Filters apply immediately on change
- Filter state persisted in URL query params for shareability

### AC3: Tasks Table
- Columns:
  - Checkbox for selection
  - Hive name (link to /hives/{id})
  - Task name (from template or custom_title)
  - Priority with color indicator (dot or tag)
  - Due date (formatted as "Feb 1" or "No due date")
  - Status with overdue indicator (red "Overdue" badge when applicable)
  - Created date (formatted as "Jan 29")
  - Actions column: Complete button, Delete button
- Table is sortable by due date, priority, created date
- Empty state when no tasks match filters

### AC4: Bulk Actions Bar
- Appears when 1+ tasks selected
- Shows "X tasks selected" count
- "Complete Selected" button
- "Delete Selected" button
- Bar fixed at bottom of card or inline above table
- Deselect all button (X icon)

### AC5: Single Task Complete (No Auto-Effects)
- Tasks without auto_effects complete immediately on click
- Calls POST /api/tasks/{id}/complete with empty completion_data
- Shows success toast: "Task completed"
- Task removed from list (or moved to completed if viewing "All")

### AC6: Task Completion Modal (With Auto-Effects)
- Opens when completing a task that has auto_effects prompts
- Modal title: "Complete Task: [Task Name]"
- Renders prompts from auto_effects.prompts schema
- Prompt types supported: select, number, text
- Required prompts marked with asterisk
- Preview section showing what will be updated
- "Complete Task" primary button (disabled until required prompts filled)
- "Cancel" text link to close without completing
- On submit: calls POST /api/tasks/{id}/complete with completion_data
- On success: close modal, show toast, remove from list

### AC7: Bulk Complete Logic
- Only completes tasks WITHOUT auto_effects prompts
- Tasks with prompts are skipped
- Shows message: "X tasks completed, Y skipped (require prompts)"
- Skipped tasks remain selected for individual completion

### AC8: Delete Task
- Single delete: confirmation dialog "Delete this task?"
- On confirm: DELETE /api/tasks/{id}, remove from list, show toast
- Bulk delete: confirmation "Delete X tasks?"
- On confirm: DELETE /api/tasks/bulk with task IDs, remove all, show toast

## Tasks / Subtasks

- [x] **Task 1: Extend useTasks hook with list/complete/delete operations** (AC: 3, 5, 6, 8)
  - [x] 1.1 Add `useFetchTasks` hook returning tasks list with filters support
  - [x] 1.2 Add query params: `site_id`, `priority`, `status`, `search`, `page`, `per_page`
  - [x] 1.3 Add `useCompleteTask` hook for single task completion
  - [x] 1.4 Add `useDeleteTask` hook for single task deletion
  - [x] 1.5 Add `useBulkDeleteTasks` hook for bulk deletion
  - [x] 1.6 Add `useBulkCompleteTasks` hook for bulk completion (filters out tasks with prompts)
  - [x] 1.7 Export all new hooks from hooks/index.ts

- [x] **Task 2: Create TaskFilters component** (AC: 2)
  - [x] 2.1 Create `/apis-dashboard/src/components/TaskFilters.tsx`
  - [x] 2.2 Accept props: `filters`, `onFilterChange`, `sites`, `sitesLoading`
  - [x] 2.3 Site dropdown using Ant Select
  - [x] 2.4 Priority dropdown using Ant Select with colored options
  - [x] 2.5 Status dropdown: "Open", "Completed", "All"
  - [x] 2.6 Search Input.Search with debounce (use useDebouncedCallback or inline)
  - [x] 2.7 Responsive layout: Row on desktop, stacked on mobile
  - [x] 2.8 Export from components/index.ts

- [x] **Task 3: Create TaskRow component** (AC: 3)
  - [x] 3.1 Create `/apis-dashboard/src/components/TaskRow.tsx`
  - [x] 3.2 Accept props: `task`, `selected`, `onSelect`, `onComplete`, `onDelete`
  - [x] 3.3 Render checkbox, hive link, task name, priority tag, due date, status, actions
  - [x] 3.4 Overdue badge logic: show "Overdue" in red if due_date < today AND status pending
  - [x] 3.5 Hive name links to /hives/{hive_id}
  - [x] 3.6 Actions: Complete (CheckOutlined), Delete (DeleteOutlined)
  - [x] 3.7 Export from components/index.ts

- [x] **Task 4: Create BulkActionsBar component** (AC: 4, 7, 8)
  - [x] 4.1 Create `/apis-dashboard/src/components/BulkActionsBar.tsx`
  - [x] 4.2 Accept props: `selectedCount`, `onCompleteSelected`, `onDeleteSelected`, `onClearSelection`, `completing`, `deleting`
  - [x] 4.3 Show "X tasks selected" text
  - [x] 4.4 "Complete Selected" Button with loading state
  - [x] 4.5 "Delete Selected" Button with Popconfirm
  - [x] 4.6 Clear selection (X) button
  - [x] 4.7 Styled as sticky bar or card footer
  - [x] 4.8 Export from components/index.ts

- [x] **Task 5: Create TaskCompletionModal component** (AC: 6)
  - [x] 5.1 Create `/apis-dashboard/src/components/TaskCompletionModal.tsx`
  - [x] 5.2 Accept props: `open`, `task`, `onComplete`, `onCancel`, `completing`
  - [x] 5.3 Render modal title with task name
  - [x] 5.4 Parse auto_effects.prompts and render form fields
  - [x] 5.5 Support prompt types: select (Radio.Group or Select), number (InputNumber), text (Input)
  - [x] 5.6 Mark required fields with asterisk
  - [x] 5.7 Preview section: "This will update:" with bullet list of changes
  - [x] 5.8 Complete button disabled until required prompts filled
  - [x] 5.9 Submit calls onComplete(completionData)
  - [x] 5.10 Export from components/index.ts

- [x] **Task 6: Create ActiveTasksList component** (AC: 1, 3, 4, 5, 6, 7, 8)
  - [x] 6.1 Create `/apis-dashboard/src/components/ActiveTasksList.tsx`
  - [x] 6.2 State: selectedTaskIds, filters, completionModalTask
  - [x] 6.3 Fetch tasks using useFetchTasks with filters
  - [x] 6.4 Fetch sites for filter dropdown
  - [x] 6.5 Compute openCount and overdueCount for header
  - [x] 6.6 Render header "Active Tasks (X open - Y overdue)"
  - [x] 6.7 Render TaskFilters component
  - [x] 6.8 Render Ant Table with TaskRow-like columns (or use Table directly)
  - [x] 6.9 Table with checkbox selection via rowSelection
  - [x] 6.10 Handle single Complete: if no prompts -> immediate, else -> open modal
  - [x] 6.11 Handle single Delete with Popconfirm
  - [x] 6.12 Render BulkActionsBar when selectedTaskIds.length > 0
  - [x] 6.13 Handle bulk complete: filter tasks with prompts, complete rest, show message
  - [x] 6.14 Handle bulk delete with confirmation
  - [x] 6.15 Render TaskCompletionModal for tasks requiring prompts
  - [x] 6.16 Empty state with illustration
  - [x] 6.17 Export from components/index.ts

- [x] **Task 7: Integrate ActiveTasksList into Tasks page** (AC: 1)
  - [x] 7.1 Modify `/apis-dashboard/src/pages/Tasks.tsx`
  - [x] 7.2 Import and render ActiveTasksList in a new Card section after Task Assignment
  - [x] 7.3 Card title: "Active Tasks"

- [x] **Task 8: Write tests** (AC: 1-8)
  - [x] 8.1 Create `/apis-dashboard/tests/components/ActiveTasksList.test.tsx`
  - [x] 8.2 Test: Header shows correct open/overdue counts
  - [x] 8.3 Test: Filters render and trigger onFilterChange
  - [x] 8.4 Test: Task rows render with correct data
  - [x] 8.5 Test: Hive name links to correct route
  - [x] 8.6 Test: Overdue badge shows for overdue tasks
  - [x] 8.7 Test: Single complete without prompts calls API immediately
  - [x] 8.8 Test: Single complete with prompts opens modal
  - [x] 8.9 Test: Bulk actions bar appears on selection
  - [x] 8.10 Test: Bulk complete skips tasks with prompts
  - [x] 8.11 Test: Delete shows confirmation
  - [x] 8.12 Create `/apis-dashboard/tests/components/TaskCompletionModal.test.tsx`
  - [x] 8.13 Test: Modal renders prompts from auto_effects
  - [x] 8.14 Test: Required prompts block submission
  - [x] 8.15 Test: Preview shows expected changes
  - [x] 8.16 Create `/apis-dashboard/tests/hooks/useFetchTasks.test.ts`
  - [x] 8.17 Test: useFetchTasks applies filters correctly
  - [x] 8.18 Test: useCompleteTask calls correct endpoint
  - [x] 8.19 Test: useDeleteTask calls correct endpoint

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a FRONTEND story. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design Table configuration and rowSelection
- Color palette from apisTheme.ts
- Modal and Form patterns
- Touch target sizing

### Architecture Compliance

**Frontend Stack:**
- React + Refine + Ant Design
- TypeScript
- Hooks pattern for data fetching
- apiClient for API calls

**API Endpoints (from Story 14.2 - DONE):**
- `GET /api/tasks` - List tasks with filters: `site_id`, `priority`, `status`, `hive_id`, `overdue=true`, `search`, `page`, `per_page`
  - Response: `{ data: Task[], meta: { total, page, per_page } }`
- `GET /api/tasks/{id}` - Get single task with template details
- `POST /api/tasks/{id}/complete` - Complete task with optional `completion_data`
- `DELETE /api/tasks/{id}` - Delete single task
- `GET /api/tasks/overdue` - Get overdue tasks (for badge counts)

### TypeScript Interfaces

```typescript
// Task (from useTasks.ts - already exists)
interface Task {
  id: string;
  hive_id: string;
  hive_name?: string;  // Populated by API join
  template_id?: string;
  custom_title?: string;
  title: string;  // Computed: template.name or custom_title
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string;
  created_at: string;
  completed_at?: string;
  created_by?: string;
  auto_effects?: AutoEffects;  // From template
}

// TaskFiltersState
interface TaskFiltersState {
  site_id?: string;
  priority?: TaskPriority;
  status?: 'pending' | 'completed' | 'all';
  search?: string;
}

// AutoEffects schema (from template)
interface AutoEffects {
  prompts?: Prompt[];
  updates?: Update[];
  creates?: Create[];
}

interface Prompt {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface Update {
  target: string;  // e.g., "hive.queen_year"
  action: 'set' | 'increment' | 'decrement';
  value?: string | number;
  value_from?: string;  // e.g., "completion_data.color"
}
```

### Component Patterns

**Table with Selection (from Ant Design):**
```tsx
const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

const rowSelection = {
  selectedRowKeys,
  onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
};

<Table
  rowSelection={rowSelection}
  columns={columns}
  dataSource={tasks}
  rowKey="id"
/>
```

**Debounced Search:**
```tsx
import { useMemo } from 'react';
import { debounce } from 'lodash-es';

const debouncedSearch = useMemo(
  () => debounce((value: string) => {
    onFilterChange({ ...filters, search: value });
  }, 300),
  [filters, onFilterChange]
);
```

**Popconfirm for Delete:**
```tsx
import { Popconfirm } from 'antd';

<Popconfirm
  title="Delete this task?"
  onConfirm={() => handleDelete(task.id)}
  okText="Delete"
  cancelText="Cancel"
>
  <Button danger icon={<DeleteOutlined />} />
</Popconfirm>
```

### Styling Guidelines

**Priority Colors (from useTasks.ts):**
```typescript
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#6b7280' },
  { value: 'medium', label: 'Medium', color: '#22c55e' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
];
```

**Overdue Styling:**
```tsx
// Red text/badge for overdue
const isOverdue = task.due_date &&
  new Date(task.due_date) < new Date() &&
  task.status === 'pending';

{isOverdue && <Tag color="error">Overdue</Tag>}
```

**Date Formatting:**
```typescript
import { format, isToday, isTomorrow, isPast } from 'date-fns';

function formatDueDate(dateString?: string): string {
  if (!dateString) return 'No due date';
  const date = new Date(dateString);
  return format(date, 'MMM d');  // "Feb 1"
}
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskFilters.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskRow.tsx` (optional - may use Table columns directly)
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/BulkActionsBar.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskCompletionModal.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ActiveTasksList.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/ActiveTasksList.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/TaskCompletionModal.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useFetchTasks.test.ts`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useTasks.ts` - Add fetch, complete, delete hooks
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts` - Export new hooks
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Export new components
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Tasks.tsx` - Add ActiveTasksList section

### Dependencies (Already Complete)

**From Story 14.1 (DONE):**
- `hive_tasks` table exists with all required fields

**From Story 14.2 (DONE):**
- `GET /api/tasks` endpoint with filtering
- `POST /api/tasks/{id}/complete` endpoint
- `DELETE /api/tasks/{id}` endpoint
- `GET /api/tasks/overdue` endpoint

**From Story 14.3 (DONE):**
- Task templates with `auto_effects` schema defined

**From Story 14.4 (DONE - in review):**
- Tasks page exists at `/tasks`
- `useTasks` hook with `useCreateTasks`
- `useTaskTemplates` hook
- Task type interfaces defined
- PRIORITY_OPTIONS and helper functions

### API Response Examples

**GET /api/tasks:**
```json
{
  "data": [
    {
      "id": "uuid-1",
      "hive_id": "hive-uuid-1",
      "hive_name": "Hive Alpha",
      "template_id": "template-uuid",
      "title": "Requeen",
      "description": "Replace aging queen",
      "priority": "high",
      "status": "pending",
      "due_date": "2026-02-01",
      "created_at": "2026-01-29T10:00:00Z",
      "auto_effects": {
        "prompts": [
          {"key": "color", "label": "Queen marking color", "type": "select", "options": [...], "required": true}
        ],
        "updates": [
          {"target": "hive.queen_year", "action": "set", "value": "{{current_year}}"},
          {"target": "hive.queen_marking", "action": "set", "value_from": "completion_data.color"}
        ]
      }
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "per_page": 20
  }
}
```

**POST /api/tasks/{id}/complete:**
```json
// Request body
{
  "completion_data": {
    "color": "yellow"
  }
}

// Response
{
  "data": {
    "id": "uuid-1",
    "status": "completed",
    "completed_at": "2026-01-30T14:30:00Z",
    "auto_applied_changes": {
      "queen_year": 2026,
      "queen_marking": "yellow"
    }
  }
}
```

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.5]
- [Source: CLAUDE.md#Frontend-Development]
- [Source: apis-dashboard/src/hooks/useTasks.ts - Existing task interfaces]
- [Source: apis-dashboard/src/pages/Tasks.tsx - Page structure]
- [Source: _bmad-output/implementation-artifacts/14-4-portal-tasks-screen.md - Previous story patterns]
- [Source: _bmad-output/implementation-artifacts/14-2-task-crud-api-endpoints.md - API contracts]

## Test Criteria

- [x] Active Tasks section displays on Tasks page
- [x] Header shows correct open and overdue counts
- [x] Site filter dropdown populates with user's sites
- [x] Priority filter works correctly
- [x] Status filter toggles between Open, Completed, All
- [x] Search filters by hive name and task name
- [x] Table displays all required columns
- [x] Hive name links to hive detail page
- [x] Overdue tasks show red "Overdue" badge
- [x] Tasks without prompts complete immediately
- [x] Tasks with prompts open completion modal
- [x] Completion modal renders prompts correctly
- [x] Required prompts block submission until filled
- [x] Preview shows what will be updated
- [x] Single delete shows confirmation dialog
- [x] Bulk actions bar appears on selection
- [x] Bulk complete skips tasks with prompts and shows message
- [x] Bulk delete shows confirmation with count
- [x] Empty state displays when no tasks match filters
- [x] All tests pass

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

**Created:**
- `apis-dashboard/src/components/TaskFilters.tsx`
- `apis-dashboard/src/components/BulkActionsBar.tsx`
- `apis-dashboard/src/components/TaskCompletionModal.tsx`
- `apis-dashboard/src/components/ActiveTasksList.tsx`
- `apis-dashboard/tests/components/ActiveTasksList.test.tsx`
- `apis-dashboard/tests/components/TaskCompletionModal.test.tsx`
- `apis-dashboard/tests/hooks/useFetchTasks.test.ts`

**Modified:**
- `apis-dashboard/src/hooks/useTasks.ts` - Added useFetchTasks, useCompleteTask, useDeleteTask, useBulkDeleteTasks, useBulkCompleteTasks hooks
- `apis-dashboard/src/hooks/index.ts` - Exported new hooks
- `apis-dashboard/src/components/index.ts` - Exported new components
- `apis-dashboard/src/pages/Tasks.tsx` - Added ActiveTasksList section

## Senior Developer Review (AI)

### Review Date: 2026-01-30

### Reviewer: Claude Opus 4.5 (Adversarial Code Review)

### Outcome: ✅ APPROVED (after fixes applied)

### Issues Found and Fixed:

**HIGH Severity (5 fixed):**
1. **6 tests were failing** - Fixed test mocks (reduced options to <=4 for Radio.Button), fixed element queries
2. **Missing test file** - Created `tests/hooks/useFetchTasks.test.ts` with comprehensive hook tests
3. **Empty File List** - Populated with actual files created/modified
4. **Modal rendered when task=null** - Fixed by adding `isVisible = open && task !== null` guard
5. **Deprecated `destroyOnClose`** - Changed to `destroyOnHidden` per Ant Design v6 API

**MEDIUM Severity (4 fixed):**
1. **Debounce memory leak** - Refactored to use refs pattern, added cleanup on unmount
2. **Type coercion hacks** - Replaced `as unknown as` with empty string sentinel pattern
3. **Hardcoded page size** - Now uses `perPage` from hook, added `showSizeChanger`
4. **Form not resetting** - Added `preserve={false}` to Form component

**LOW Severity (2 noted):**
1. Color import inconsistency - noted for future cleanup
2. Console warnings in tests - acceptable for now

### Test Results:
- **58 tests passing** (17 TaskCompletionModal, 24 ActiveTasksList, 17 useFetchTasks hooks)
- All acceptance criteria validated

### Files Modified During Review:
- `apis-dashboard/src/components/TaskCompletionModal.tsx` - Bug fixes, API update
- `apis-dashboard/src/components/TaskFilters.tsx` - Debounce fix, type safety
- `apis-dashboard/src/components/ActiveTasksList.tsx` - Pagination fix
- `apis-dashboard/tests/components/TaskCompletionModal.test.tsx` - Mock data fix
- `apis-dashboard/tests/components/ActiveTasksList.test.tsx` - Query fixes
- `apis-dashboard/tests/hooks/useFetchTasks.test.ts` - NEW FILE

### Second Review Pass: 2026-01-30

**Additional Issues Found and Fixed:**

**HIGH Severity (2 fixed):**
1. **isTaskOverdue incorrect logic** - Was marking tasks overdue on their due date instead of after. Fixed to compare `today > dueDate`.
2. **Pagination not triggering refetch** - Table pagination wasn't connected to data fetching. Added currentPage/pageSize state and wired to useFetchTasks hook.

**MEDIUM Severity (4 fixed):**
3. **Row interactions during bulk ops** - Added `isOperationInProgress` flag to disable checkboxes and action buttons during bulk complete/delete.
4. **Sort state not persisted** - Added sortField/sortOrder state with URL persistence via searchParams.
5. **Error boundary missing** - Wrapped ActiveTasksList in ErrorBoundary in Tasks.tsx.
6. **Action buttons disabled during bulk** - Extended disable logic to include bulkCompleting and bulkDeleting states.

**LOW Severity (2 fixed):**
7. **Missing aria-labels** - Added aria-label attributes to Complete and Delete action buttons.
8. **Popconfirm disabled during ops** - Added disabled prop to Popconfirm during bulk operations.

### Files Modified in Second Review:
- `apis-dashboard/src/components/ActiveTasksList.tsx` - All fixes above
- `apis-dashboard/src/pages/Tasks.tsx` - Added ErrorBoundary wrapper
