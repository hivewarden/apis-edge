# Story 14.4: Portal Tasks Screen with Library + Assignment

Status: review

## Story

As a **beekeeper using the portal**,
I want **a dedicated Tasks screen to view templates and assign tasks**,
so that **I can plan work before visiting the apiary**.

## Acceptance Criteria

### AC1: Route `/tasks` Accessible from Sidebar Navigation
- Add Tasks item to sidebar navigation (after Maintenance)
- Use CheckSquareOutlined icon (or similar task-related icon)
- Route: `/tasks`
- Clicking navigates to Tasks page

### AC2: Task Library Section
- Grid layout of template cards
- Each card shows: icon (based on type), name, description
- System templates displayed first with no badge
- Custom templates displayed after with "Custom" badge
- "+ Create Custom" button at end of grid

### AC3: Create Custom Template Modal
- Opens when "+ Create Custom" button clicked
- Form fields: name (required, 1-100 chars), description (optional, max 500 chars)
- Save button creates template via POST /api/task-templates
- Cancel button closes modal without saving
- On success: modal closes, new template appears in library grid, success toast shown
- On error: error toast shown, modal stays open

### AC4: Task Assignment Section
- Task type dropdown populated from templates (system + custom)
- Hive multi-select with search (searchable by hive name)
- "Select all in site" dropdown (lists sites, selecting populates hive multi-select with all hives from that site)
- Counter showing "X of 500 max selected"
- Priority radio buttons: Low (gray), Medium (green), High (orange), Urgent (red)
- Due date picker (optional, DatePicker component)
- Notes text area (optional, max 500 chars)
- "Assign to X Hives" button (X is count of selected hives)
- Button disabled when no hives selected or no template selected

### AC5: Assignment Validation and Execution
- Shows inline error if > 500 hives selected
- On submit: calls POST /api/tasks with bulk payload
- Success: shows toast "Created X tasks successfully", clears hive selection, clears form except template
- Error: shows error toast with message

### AC6: Hooks for Tasks and Templates
- Create `useTasks` hook for task operations (create, list, etc.)
- Create `useTaskTemplates` hook for template operations (list, create, delete)
- Both hooks use `apiClient` for API calls
- Both hooks handle loading and error states

## Tasks / Subtasks

- [x] **Task 1: Add Tasks to sidebar navigation** (AC: 1)
  - [x] 1.1 Add CheckSquareOutlined import to navItems.tsx
  - [x] 1.2 Add Tasks nav item with key `/tasks`, icon, and label "Tasks"
  - [x] 1.3 Position after Maintenance in nav order

- [x] **Task 2: Create useTaskTemplates hook** (AC: 6)
  - [x] 2.1 Create `/apis-dashboard/src/hooks/useTaskTemplates.ts`
  - [x] 2.2 Define TaskTemplate interface matching API response
  - [x] 2.3 Implement `useTaskTemplates()` hook returning:
    - `templates: TaskTemplate[]`
    - `loading: boolean`
    - `error: string | null`
    - `refetch: () => Promise<void>`
  - [x] 2.4 Implement `useCreateTaskTemplate()` hook returning:
    - `createTemplate: (input: CreateTemplateInput) => Promise<TaskTemplate>`
    - `creating: boolean`
  - [x] 2.5 Implement `useDeleteTaskTemplate()` hook returning:
    - `deleteTemplate: (id: string) => Promise<void>`
    - `deleting: boolean`
  - [x] 2.6 Add to hooks/index.ts barrel export

- [x] **Task 3: Create useTasks hook** (AC: 6)
  - [x] 3.1 Create `/apis-dashboard/src/hooks/useTasks.ts`
  - [x] 3.2 Define Task, CreateTaskInput, BulkCreateInput interfaces
  - [x] 3.3 Implement `useCreateTasks()` hook for bulk creation:
    - `createTasks: (tasks: CreateTaskInput[]) => Promise<{ created: number }>`
    - `creating: boolean`
  - [x] 3.4 Add to hooks/index.ts barrel export

- [x] **Task 4: Create TaskLibrarySection component** (AC: 2)
  - [x] 4.1 Create `/apis-dashboard/src/components/TaskLibrarySection.tsx`
  - [x] 4.2 Accept props: `templates: TaskTemplate[]`, `onCreateClick: () => void`
  - [x] 4.3 Render grid of TemplateCard components using Ant Design Row/Col
  - [x] 4.4 Sort templates: system first (is_system=true), then custom by created_at DESC
  - [x] 4.5 Each card shows icon, name, truncated description
  - [x] 4.6 Custom templates show "Custom" Tag badge
  - [x] 4.7 "+ Create Custom" card at end with dashed border and PlusOutlined icon
  - [x] 4.8 Add to components/index.ts barrel export

- [x] **Task 5: Create CreateTemplateModal component** (AC: 3)
  - [x] 5.1 Create `/apis-dashboard/src/components/CreateTemplateModal.tsx`
  - [x] 5.2 Accept props: `open: boolean`, `onClose: () => void`, `onSuccess: (template: TaskTemplate) => void`
  - [x] 5.3 Form with: name Input (required), description TextArea (optional)
  - [x] 5.4 Validate name 1-100 chars, description max 500 chars
  - [x] 5.5 Submit calls `createTemplate` from useCreateTaskTemplate
  - [x] 5.6 Show loading state during submission
  - [x] 5.7 On success: call onSuccess, show success toast via message.success
  - [x] 5.8 On error: show error toast, keep modal open
  - [x] 5.9 Add to components/index.ts barrel export

- [x] **Task 6: Create TaskAssignmentSection component** (AC: 4, 5)
  - [x] 6.1 Create `/apis-dashboard/src/components/TaskAssignmentSection.tsx`
  - [x] 6.2 Accept props: `templates: TaskTemplate[]`
  - [x] 6.3 State for: selectedTemplate, selectedHives, selectedSite, priority, dueDate, notes
  - [x] 6.4 Fetch sites via API for site dropdown
  - [x] 6.5 Fetch hives via API for hive multi-select (supports search)
  - [x] 6.6 Template dropdown: Select with options from templates
  - [x] 6.7 Hive multi-select: Select mode="multiple" with search, showCount
  - [x] 6.8 "Select all in site" dropdown: on selection, auto-populate hives for that site
  - [x] 6.9 Counter text: "X of 500 max selected" (styled red if > 500)
  - [x] 6.10 Priority radio: Radio.Group with 4 options styled with colors
  - [x] 6.11 Due date: DatePicker, optional
  - [x] 6.12 Notes: Input.TextArea, optional, max 500 chars
  - [x] 6.13 Submit button: "Assign to X Hives", disabled if no template or no hives
  - [x] 6.14 On submit: validate count <= 500, call createTasks, show toast, clear selection
  - [x] 6.15 Add to components/index.ts barrel export

- [x] **Task 7: Create Tasks page** (AC: 1, 2, 3, 4, 5)
  - [x] 7.1 Create `/apis-dashboard/src/pages/Tasks.tsx`
  - [x] 7.2 Use useTaskTemplates to fetch templates
  - [x] 7.3 State for createModalOpen
  - [x] 7.4 Render page header "Tasks" with Typography.Title
  - [x] 7.5 Render TaskLibrarySection with templates and onCreateClick handler
  - [x] 7.6 Render TaskAssignmentSection with templates
  - [x] 7.7 Render CreateTemplateModal with open/close/success handlers
  - [x] 7.8 On template create success: refetch templates
  - [x] 7.9 Export from pages/index.ts

- [x] **Task 8: Add Tasks route to App.tsx** (AC: 1)
  - [x] 8.1 Import Tasks page component
  - [x] 8.2 Add Route for `/tasks` path pointing to Tasks page
  - [x] 8.3 Ensure route is within authenticated layout

- [x] **Task 9: Write tests** (AC: 1-6)
  - [x] 9.1 Create `/apis-dashboard/tests/pages/Tasks.test.tsx`
  - [x] 9.2 Test: Tasks page renders with all sections
  - [x] 9.3 Test: Template library shows system and custom templates
  - [x] 9.4 Test: Create template modal opens and closes
  - [x] 9.5 Test: Hive multi-select works with search
  - [x] 9.6 Test: "Select all in site" populates hive selection
  - [x] 9.7 Test: Assignment button disabled when no selection
  - [x] 9.8 Test: Counter shows correct count and warning at 500+
  - [x] 9.9 Create `/apis-dashboard/tests/hooks/useTasks.test.ts`
  - [x] 9.10 Test: useTaskTemplates fetches and returns templates
  - [x] 9.11 Test: useCreateTaskTemplate creates template
  - [x] 9.12 Create `/apis-dashboard/tests/hooks/useTaskTemplates.test.ts`
  - [x] 9.13 Test: useTasks bulk create works

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a FRONTEND story. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design component usage
- Color palette from apisTheme.ts
- Touch target sizing (64px for mobile)
- Grid layouts and spacing

### Architecture Compliance

**Frontend Stack (from architecture.md):**
- React + Refine + Ant Design
- Vite build
- TypeScript
- Hooks pattern for data fetching

**API Client Pattern (from existing code):**
```typescript
import { apiClient } from '../providers/apiClient';

// GET request
const response = await apiClient.get<ResponseType>('/endpoint');
const data = response.data.data;

// POST request
const response = await apiClient.post<ResponseType>('/endpoint', payload);
```

**API Endpoints (from stories 14.2 and 14.3 - DONE):**
- `GET /api/task-templates` - Returns `{ data: TaskTemplate[] }`
- `POST /api/task-templates` - Creates custom template, returns `{ data: TaskTemplate }`
- `DELETE /api/task-templates/{id}` - Returns 204
- `POST /api/tasks` - Bulk create, returns `{ data: { created: number, tasks: Task[] } }`
- `GET /api/sites` - Returns `{ data: Site[], meta: {...} }`
- `GET /api/hives` - Returns `{ data: Hive[], meta: {...} }`, supports `?site_id=X` filter

### TypeScript Interfaces

```typescript
// TaskTemplate (from API)
interface TaskTemplate {
  id: string;
  tenant_id?: string;
  type: string;  // 'requeen', 'add_frame', 'custom', etc.
  name: string;
  description?: string;
  auto_effects?: object;  // JSON schema for prompts/updates
  is_system: boolean;
  created_at: string;
  created_by?: string;
}

// CreateTemplateInput
interface CreateTemplateInput {
  name: string;
  description?: string;
}

// CreateTaskInput (for bulk creation)
interface CreateTaskInput {
  hive_id: string;
  template_id?: string;
  custom_title?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;  // ISO date string
  description?: string;
}

// BulkCreateResponse
interface BulkCreateResponse {
  data: {
    created: number;
    tasks: Task[];
  };
}
```

### Component Patterns

**Page Layout (from existing pages):**
```tsx
export function Tasks() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Tasks</Title>
      </div>

      {/* Sections */}
      <Card title="Task Library" style={{ marginBottom: 24 }}>
        <TaskLibrarySection ... />
      </Card>

      <Card title="Assign Tasks">
        <TaskAssignmentSection ... />
      </Card>
    </div>
  );
}
```

**Modal Pattern (from EquipmentFormModal.tsx):**
```tsx
<Modal
  title={<Space><Icon /> <span>Title</span></Space>}
  open={open}
  onCancel={onClose}
  footer={null}
  width={520}
  destroyOnClose
>
  <Form form={form} layout="vertical" onFinish={handleSubmit}>
    {/* Form fields */}
    <Form.Item style={{ marginBottom: 0 }}>
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={loading}>Save</Button>
      </Space>
    </Form.Item>
  </Form>
</Modal>
```

**Hook Pattern (from existing hooks):**
```typescript
export function useTaskTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{ data: TaskTemplate[] }>('/task-templates');
      setTemplates(response.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return { templates, loading, error, refetch: fetchTemplates };
}
```

### Styling Guidelines

**Colors (from apisTheme.ts):**
```typescript
import { colors } from '../theme/apisTheme';

// Primary: colors.seaBuckthorn (#f7a42d)
// Background: colors.coconutCream (#fbf9e7)
// Text: colors.brownBramble (#662604)
// Surface: colors.salomie (#fcd483)
// Success: colors.success (#2e7d32)
// Warning: colors.warning (#e67e00)
// Error: colors.error (#c23616)
```

**Priority Colors:**
| Priority | Color Code | Style |
|----------|------------|-------|
| Low | #6b7280 (gray) | Tag color="default" |
| Medium | #22c55e (green) | Tag color="success" |
| High | #f97316 (orange) | Tag color="warning" |
| Urgent | #ef4444 (red) | Tag color="error" |

**Touch Targets (from theme):**
```typescript
import { touchTargets } from '../theme/apisTheme';
// touchTargets.mobile = 48 (48px minimum touch target)
```

### NavItems Update

Add to `/apis-dashboard/src/components/layout/navItems.tsx`:
```tsx
import { CheckSquareOutlined } from '@ant-design/icons';

// Add after Maintenance item:
{ key: '/tasks', icon: <CheckSquareOutlined />, label: 'Tasks' },
```

### Route Registration

Add to `/apis-dashboard/src/App.tsx`:
```tsx
import { Tasks } from './pages';

// In routes:
<Route path="/tasks" element={<Tasks />} />
```

### Template Type Icons

Map template types to icons for library cards:
```typescript
const templateIcons: Record<string, React.ReactNode> = {
  requeen: <CrownOutlined />,
  add_frame: <PlusCircleOutlined />,
  remove_frame: <MinusCircleOutlined />,
  harvest_frames: <GoldOutlined />,
  add_feed: <CoffeeOutlined />,
  treatment: <MedicineBoxOutlined />,
  add_brood_box: <PlusSquareOutlined />,
  add_honey_super: <PlusSquareOutlined />,
  remove_box: <MinusSquareOutlined />,
  custom: <ToolOutlined />,
};
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Tasks.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskLibrarySection.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TaskAssignmentSection.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/CreateTemplateModal.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useTasks.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useTaskTemplates.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/pages/Tasks.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useTasks.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useTaskTemplates.test.ts`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/navItems.tsx` - Add Tasks nav item
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Export new components
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts` - Export new hooks
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/index.ts` - Export Tasks page
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/App.tsx` - Add Tasks route

### Dependencies (Already Complete)

**From Story 14.1 (DONE):**
- `task_templates` table exists with system templates seeded
- `hive_tasks` table exists for storing assigned tasks

**From Story 14.2 (DONE):**
- `POST /api/tasks` endpoint supports bulk creation
- Task CRUD operations functional

**From Story 14.3 (DONE):**
- `GET /api/task-templates` returns system + tenant templates
- `POST /api/task-templates` creates custom templates
- `DELETE /api/task-templates/{id}` removes custom templates

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.4]
- [Source: CLAUDE.md#Frontend-Development]
- [Source: apis-dashboard/src/pages/Hives.tsx - Page pattern]
- [Source: apis-dashboard/src/components/EquipmentFormModal.tsx - Modal pattern]
- [Source: apis-dashboard/src/hooks/index.ts - Hook barrel export]
- [Source: apis-dashboard/src/components/layout/navItems.tsx - Nav configuration]
- [Source: _bmad-output/implementation-artifacts/14-2-task-crud-api-endpoints.md - API contracts]
- [Source: _bmad-output/implementation-artifacts/14-3-task-templates-api.md - Template API]

## Test Criteria

- [x] Tasks page accessible at `/tasks` route
- [x] Tasks item visible in sidebar navigation
- [x] Template library shows system and custom templates
- [x] System templates displayed first, custom templates after
- [x] Custom templates show "Custom" badge
- [x] "+ Create Custom" button opens modal
- [x] Create template modal validates name (1-100 chars)
- [x] Create template modal validates description (max 500 chars)
- [x] New template appears in library after creation
- [x] Task type dropdown shows all templates
- [x] Hive multi-select supports search
- [x] "Select all in site" populates hives for selected site
- [x] Counter shows "X of 500 max selected"
- [x] Counter shows red warning when > 500 selected
- [x] Priority radio buttons styled with correct colors
- [x] "Assign to X Hives" button disabled when no template or no hives
- [x] Bulk task creation works and shows success toast
- [x] Form clears after successful assignment
- [x] All tests pass (64 tests passing)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation proceeded without blockers.

### Completion Notes List

- Implemented complete Portal Tasks Screen with Task Library and Assignment sections
- Created `useTaskTemplates` hook with list, create, and delete operations
- Created `useTasks` hook with bulk task creation support
- Created `TaskLibrarySection` component displaying template cards in a responsive grid
- Created `CreateTemplateModal` for adding custom templates
- Created `TaskAssignmentSection` with multi-hive selection and bulk assignment
- Added Tasks item to sidebar navigation after Maintenance
- Registered `/tasks` route in App.tsx within authenticated layout
- Wrote 64 tests covering hooks and page components
- Updated deprecated Ant Design props (`bodyStyle` -> `styles.body`, `destroyOnClose` -> `destroyOnHidden`)

### File List

**Created:**
- apis-dashboard/src/hooks/useTaskTemplates.ts
- apis-dashboard/src/hooks/useTasks.ts
- apis-dashboard/src/components/TaskLibrarySection.tsx
- apis-dashboard/src/components/TaskAssignmentSection.tsx
- apis-dashboard/src/components/CreateTemplateModal.tsx
- apis-dashboard/src/pages/Tasks.tsx
- apis-dashboard/tests/hooks/useTaskTemplates.test.ts
- apis-dashboard/tests/hooks/useTasks.test.ts
- apis-dashboard/tests/pages/Tasks.test.tsx

**Modified:**
- apis-dashboard/src/components/layout/navItems.tsx (added CheckSquareOutlined icon and Tasks nav item)
- apis-dashboard/src/components/index.ts (exported TaskLibrarySection, CreateTemplateModal, TaskAssignmentSection)
- apis-dashboard/src/hooks/index.ts (exported useTaskTemplates, useCreateTaskTemplate, useDeleteTaskTemplate, useCreateTasks, PRIORITY_OPTIONS, getPriorityColor, getPriorityLabel)
- apis-dashboard/src/pages/index.ts (exported Tasks page)
- apis-dashboard/src/App.tsx (added Tasks import and /tasks route)

### Change Log

- 2026-01-30: Initial implementation of Story 14.4 - Portal Tasks Screen complete
