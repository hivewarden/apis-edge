# Story 14.11: Mobile Inline Task Creation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **beekeeper at the apiary**,
I want **to quickly add a task for the current hive without leaving the mobile view**,
so that **I can capture follow-up actions while I'm thinking of them during my inspection**.

## Acceptance Criteria

### AC1: Add Task Card Visibility
- Given the user views the Tasks section on mobile (MobileTasksSection component)
- When scrolling to the bottom of the tasks list (or viewing empty state)
- Then sees an "Add Task" card with a "+" icon and expand indicator
- And the card is styled consistently with MobileTaskCard (salomie background, 8px border radius)

### AC2: Inline Expansion (Not Modal)
- Given the user taps the "Add Task" card
- When the card is tapped
- Then the form expands inline (NOT as a modal or bottom sheet)
- And the expansion is animated (300ms ease-out transition)
- And the rest of the tasks list remains visible above

### AC3: Task Type Dropdown
- Given the Add Task form is expanded
- When viewing the form
- Then displays a "Task type" dropdown with placeholder "Select task type..."
- And the dropdown shows ALL system templates first, ordered by name
- And then shows ALL custom templates (if any) with a divider
- And shows "Custom task..." option at the bottom
- And dropdown uses 64px touch target height (touchTargets.mobile)

### AC4: Custom Title Input (Conditional)
- Given the user selects "Custom task..." from the dropdown
- When selection is made
- Then a text input appears below the dropdown
- And the input has placeholder "Enter task name"
- And the input is required (cannot submit empty)
- And the input has 64px height (touchTargets.mobile)

### AC5: Default Values
- Given a task is created from the mobile inline form
- When the task is submitted
- Then `priority` defaults to "medium" (not configurable in mobile form)
- And `due_date` defaults to null (not configurable in mobile form)
- And `source` is set to "manual"
- And `hive_id` is set to the current hive being viewed

### AC6: Add Button State
- Given the Add Task form is expanded
- When viewing the Add button
- Then displays "Add Task" primary button (64px height, full width)
- And button is DISABLED when no task type is selected
- And button is DISABLED when "Custom task..." is selected but title is empty
- And button is ENABLED when a template is selected OR custom title is filled

### AC7: Successful Task Creation
- Given the user fills the form and taps "Add Task"
- When the API call succeeds (POST /api/tasks)
- Then the form collapses with animation
- And the new task appears in the pending list above with slide-in animation
- And a success toast displays: "Task added"
- And the useHiveTasks hook refetches to update the list

### AC8: Form Collapse Behavior
- Given the Add Task form is expanded
- When the user taps outside the form area OR scrolls significantly away
- Then the form collapses (any unsaved input is lost)
- And collapse uses the same 300ms ease-out animation

### AC9: Loading State
- Given the user taps "Add Task" with valid input
- When the API call is in progress
- Then the "Add Task" button shows a loading spinner
- And the button is disabled during the request
- And the form inputs are disabled during the request

### AC10: Error Handling
- Given the API call fails
- When an error occurs during task creation
- Then shows error toast: "Failed to add task"
- And the form remains expanded for retry
- And the inputs retain their values

## Tasks / Subtasks

- [x] **Task 1: Create MobileAddTaskForm component** (AC: 1, 2, 3, 4, 5, 6, 9)
  - [x] 1.1 Create `/apis-dashboard/src/components/MobileAddTaskForm.tsx`
  - [x] 1.2 Props interface: `hiveId: string`, `onTaskAdded: () => void`, `templates: TaskTemplate[]`, `templatesLoading: boolean`
  - [x] 1.3 Add state: `expanded: boolean`, `selectedTemplateId: string | null`, `customTitle: string`, `creating: boolean`
  - [x] 1.4 Implement collapsed state: Card with "+" icon and "Add Task" text
  - [x] 1.5 Implement expanded state: Form with dropdown, conditional input, and button
  - [x] 1.6 Use CSS transition for expand/collapse animation (max-height + opacity, 300ms)
  - [x] 1.7 Style collapsed card: salomie background, 8px radius, shadowSm
  - [x] 1.8 Use Ant Design Select for dropdown with 64px height
  - [x] 1.9 Use Ant Design Input for custom title with 64px height
  - [x] 1.10 Use Ant Design Button (primary, large) for submit with 64px height
  - [x] 1.11 Implement button disabled logic based on AC6
  - [x] 1.12 Export from components/index.ts

- [x] **Task 2: Implement task creation logic** (AC: 5, 7, 10)
  - [x] 2.1 Create hook or use inline API call for single task creation
  - [x] 2.2 Build request payload: `{ hive_id, template_id?, custom_title?, priority: "medium" }`
  - [x] 2.3 Call POST /api/tasks with single task (not bulk)
  - [x] 2.4 Handle success: collapse form, show toast, call onTaskAdded
  - [x] 2.5 Handle error: show error toast, keep form expanded

- [x] **Task 3: Integrate into MobileTasksSection** (AC: 1, 2, 7, 8)
  - [x] 3.1 Modify `/apis-dashboard/src/components/MobileTasksSection.tsx`
  - [x] 3.2 Import MobileAddTaskForm and useTaskTemplates
  - [x] 3.3 Fetch templates using useTaskTemplates hook
  - [x] 3.4 Add MobileAddTaskForm at the bottom of the section (after pending tasks)
  - [x] 3.5 Pass hiveId, templates, templatesLoading, and refetch as onTaskAdded
  - [x] 3.6 Ensure form appears below tasks (not inside overdue/pending subsections)

- [x] **Task 4: Implement outside tap collapse** (AC: 8)
  - [x] 4.1 Add ref to form container
  - [x] 4.2 Use useEffect with document click listener when expanded
  - [x] 4.3 Check if click target is outside form ref
  - [x] 4.4 Collapse form if outside click detected
  - [x] 4.5 Clean up listener on unmount or collapse

- [x] **Task 5: Add new task animation** (AC: 7)
  - [x] 5.1 Track newly created task ID in MobileTasksSection state
  - [x] 5.2 Add CSS animation class for slide-in effect (translate + opacity)
  - [x] 5.3 Apply animation class to new task card
  - [x] 5.4 Remove animation class after completion (300ms)

- [x] **Task 6: Write unit tests for MobileAddTaskForm** (AC: 1-6, 9, 10)
  - [x] 6.1 Create `/apis-dashboard/tests/components/MobileAddTaskForm.test.tsx`
  - [x] 6.2 Test: Renders collapsed state with "Add Task" text
  - [x] 6.3 Test: Expands on click
  - [x] 6.4 Test: Dropdown shows system templates then custom templates
  - [x] 6.5 Test: Custom option shows title input
  - [x] 6.6 Test: Add button disabled when no selection
  - [x] 6.7 Test: Add button disabled when custom selected but title empty
  - [x] 6.8 Test: Add button enabled when template selected
  - [x] 6.9 Test: Submit calls API with correct payload
  - [x] 6.10 Test: Loading state shown during API call
  - [x] 6.11 Test: Error shows toast and keeps form expanded
  - [x] 6.12 Test: Success collapses form and calls onTaskAdded

- [x] **Task 7: Write integration tests for MobileTasksSection with add form** (AC: 7, 8)
  - [x] 7.1 Modify `/apis-dashboard/tests/components/MobileTasksSection.test.tsx`
  - [x] 7.2 Test: Add Task form appears below task list
  - [x] 7.3 Test: Outside click collapses form
  - [x] 7.4 Test: New task appears in list after creation

- [x] **Task 8: Verify build and exports** (AC: all)
  - [x] 8.1 Update `/apis-dashboard/src/components/index.ts` with MobileAddTaskForm export
  - [x] 8.2 Run `npm run build` to verify no TypeScript errors
  - [x] 8.3 Run `npm run test` to verify all tests pass

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a **FRONTEND story**. When implementing, invoke the `/frontend-design` skill for guidance on:
- Inline form expansion patterns
- Touch-optimized form controls (64px targets per NFR-HT-04)
- Animation transitions for expand/collapse
- Dropdown styling with Ant Design Select
- Loading state management

### Architecture Compliance

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces for all component props
- Colors and spacing from theme/apisTheme.ts
- Touch targets: 64px minimum per NFR-HT-04
- Follow existing MobileTaskCard and MobileTasksSection patterns
- Use Ant Design components (Select, Input, Button) per project standards

### Existing Components and Hooks to Use

**From Story 14.9 - MobileTasksSection:**
```tsx
// Location: /apis-dashboard/src/components/MobileTasksSection.tsx
// This is where MobileAddTaskForm will be integrated
// Props already has hiveId
// useHiveTasks provides refetch() for refreshing after task creation
```

**From useTasks.ts - Single Task Creation:**
```typescript
// POST /api/tasks (single task format)
// Request:
{
  hive_id: string;
  template_id?: string;  // OR custom_title, not both
  custom_title?: string;
  priority: "medium";    // Always medium for mobile
}

// Response:
{
  data: Task
}
```

**From useTaskTemplates.ts:**
```typescript
// Location: /apis-dashboard/src/hooks/useTaskTemplates.ts
export function useTaskTemplates(): UseTaskTemplatesResult {
  templates: TaskTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface TaskTemplate {
  id: string;
  tenant_id?: string;
  type: string;
  name: string;
  description?: string;
  auto_effects?: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  created_by?: string;
}
```

### API Endpoint Details

```typescript
// POST /api/tasks (single task)
// Headers: Authorization: Bearer <jwt>

// Request body for template-based task:
{
  "hive_id": "uuid-of-hive",
  "template_id": "uuid-of-template",
  "priority": "medium"
}

// Request body for custom task:
{
  "hive_id": "uuid-of-hive",
  "custom_title": "Check for varroa mites",
  "priority": "medium"
}

// Response (201 Created):
{
  "data": {
    "id": "uuid-of-task",
    "hive_id": "uuid-of-hive",
    "template_id": "uuid-of-template",
    "title": "Requeen",
    "priority": "medium",
    "status": "pending",
    "source": "manual",
    "created_at": "2026-01-30T10:30:00Z"
  }
}
```

### Component Structure

```tsx
// MobileAddTaskForm.tsx
interface MobileAddTaskFormProps {
  hiveId: string;
  onTaskAdded: () => void;
  templates: TaskTemplate[];
  templatesLoading: boolean;
}

// State
const [expanded, setExpanded] = useState(false);
const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
const [isCustom, setIsCustom] = useState(false);
const [customTitle, setCustomTitle] = useState('');
const [creating, setCreating] = useState(false);

// Dropdown options structure
const options = [
  // System templates first
  ...systemTemplates.map(t => ({ value: t.id, label: t.name })),
  // Divider
  { type: 'divider' },
  // Custom templates (if any)
  ...customTemplates.map(t => ({ value: t.id, label: t.name, isCustom: true })),
  // Custom option at bottom
  { value: 'custom', label: 'Custom task...' }
];
```

### Inline Form Expansion Animation

```css
/* Collapsed state */
.add-task-form {
  max-height: 64px;
  overflow: hidden;
  transition: max-height 300ms ease-out, opacity 300ms ease-out;
}

/* Expanded state */
.add-task-form.expanded {
  max-height: 300px; /* Enough for dropdown + input + button */
}
```

Or using JavaScript for smoother animation:
```tsx
const formRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (formRef.current) {
    if (expanded) {
      formRef.current.style.maxHeight = `${formRef.current.scrollHeight}px`;
    } else {
      formRef.current.style.maxHeight = '64px';
    }
  }
}, [expanded]);
```

### Toast Messages

```typescript
import { message } from 'antd';

// Success
message.success('Task added');

// Error
message.error('Failed to add task');
```

### Theme Colors Reference

From `/apis-dashboard/src/theme/apisTheme.ts`:
```typescript
colors = {
  seaBuckthorn: '#f7a42d',  // Primary accent
  coconutCream: '#fbf9e7',  // Background
  brownBramble: '#662604',  // Dark text
  salomie: '#fcd483',       // Card surface
  error: '#c23616',         // Red for errors
  textMuted: '#8b6914',     // Secondary text
  border: 'rgba(102, 38, 4, 0.12)',
  shadowSm: '0 1px 3px rgba(102, 38, 4, 0.08)',
}

touchTargets = {
  standard: 48,   // Standard buttons
  mobile: 64,     // Glove-friendly mobile (required for all inputs)
  gap: 16,        // Minimum gap between targets
}
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileAddTaskForm.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileAddTaskForm.test.tsx`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileTasksSection.tsx` - Add MobileAddTaskForm integration
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Add MobileAddTaskForm export
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileTasksSection.test.tsx` - Add integration tests

### Dependencies (from previous stories)

**From Story 14.9 (DONE):**
- MobileTasksSection component with useHiveTasks hook
- MobileTaskCard component for consistent card styling
- TaskEmptyState component

**From Story 14.10 (DONE):**
- MobileTaskCompletionSheet for completion flow
- DeleteTaskConfirmation for deletion
- Task completion and deletion handlers integrated

**From Story 14.4 (DONE):**
- useTaskTemplates hook for fetching templates
- TaskTemplate interface

**From Story 14.2 (DONE):**
- POST /api/tasks endpoint for single task creation
- CreateTaskRequest format

### Key Implementation Notes

1. **NOT a modal**: The epic specification explicitly states "Add Task shall expand inline (not modal)" (FR-HT-40). Use CSS transition for smooth expansion.

2. **Template ordering**: System templates first (sorted by name), then custom templates (if any), then "Custom task..." option at the bottom.

3. **Priority is fixed**: Mobile-created tasks always use "medium" priority. The full task assignment form on the portal allows priority selection, but mobile keeps it simple.

4. **Template vs Custom**: When a template is selected, pass `template_id` to the API. When "Custom task..." is selected and a title is entered, pass `custom_title` instead. Never send both.

5. **Outside click handling**: Use a ref and document click listener to detect clicks outside the form for collapse behavior.

6. **Animation timing**: Match existing animations in the codebase (300ms with ease-out).

### Ant Design Select with Custom Option

```tsx
import { Select, Divider } from 'antd';

const options = useMemo(() => {
  const systemOpts = templates
    .filter(t => t.is_system)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => ({ value: t.id, label: t.name }));

  const customOpts = templates
    .filter(t => !t.is_system)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => ({ value: t.id, label: t.name }));

  return [
    ...systemOpts,
    ...(customOpts.length > 0 ? [{ type: 'divider' as const }] : []),
    ...customOpts,
    { value: 'custom', label: 'Custom task...' },
  ];
}, [templates]);

<Select
  placeholder="Select task type..."
  options={options}
  onChange={(value) => {
    if (value === 'custom') {
      setSelectedTemplateId(null);
      setIsCustom(true);
    } else {
      setSelectedTemplateId(value);
      setIsCustom(false);
    }
  }}
  style={{ width: '100%', height: touchTargets.mobile }}
  size="large"
  loading={templatesLoading}
/>
```

### Testing Strategy

**Mock API responses:**
```typescript
// Create task success
vi.mocked(apiClient.post).mockResolvedValueOnce({
  data: {
    data: {
      id: 'new-task-1',
      hive_id: 'hive-1',
      template_id: 'template-1',
      title: 'Requeen',
      priority: 'medium',
      status: 'pending',
      source: 'manual',
      created_at: '2026-01-30T10:30:00Z',
    },
  },
});

// Create task error
vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network error'));
```

**Mock templates:**
```typescript
const mockTemplates: TaskTemplate[] = [
  { id: 't1', name: 'Requeen', type: 'requeen', is_system: true, created_at: '2026-01-01' },
  { id: 't2', name: 'Add frame', type: 'add_frame', is_system: true, created_at: '2026-01-01' },
  { id: 't3', name: 'My Custom Task', type: 'custom', is_system: false, created_at: '2026-01-15' },
];
```

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.11]
- [Source: _bmad-output/implementation-artifacts/14-10-mobile-task-completion-flow.md - MobileTasksSection patterns]
- [Source: _bmad-output/implementation-artifacts/14-9-mobile-tasks-section-view.md - MobileTaskCard styling]
- [Source: apis-dashboard/src/hooks/useTasks.ts - Task interfaces]
- [Source: apis-dashboard/src/hooks/useTaskTemplates.ts - Template fetching]
- [Source: apis-dashboard/src/theme/apisTheme.ts - Touch targets and colors]
- [Source: apis-server/internal/handlers/tasks.go - API endpoint format]
- [Source: CLAUDE.md#Frontend-Development - Use /frontend-design skill]
- [Source: CLAUDE.md#Layered-Hooks-Architecture - Data fetching patterns]

## Test Criteria

- [x] Add Task card appears at bottom of MobileTasksSection
- [x] Card shows "+" icon and "Add Task" text when collapsed
- [x] Tapping card expands form inline (not modal)
- [x] Expansion animates smoothly (300ms)
- [x] Dropdown shows system templates first, sorted by name
- [x] Dropdown shows custom templates after system templates (with divider if any)
- [x] "Custom task..." option appears at bottom of dropdown
- [x] Selecting "Custom task..." shows text input
- [x] Text input has 64px height
- [x] Add button disabled when no selection
- [x] Add button disabled when custom selected but title empty
- [x] Add button enabled when template selected
- [x] Add button enabled when custom title entered
- [x] Successful creation shows "Task added" toast
- [x] Form collapses after successful creation
- [x] New task appears in list with animation
- [x] API error shows "Failed to add task" toast
- [x] Form stays expanded on error for retry
- [x] Outside click collapses form
- [x] All touch targets are 64px minimum
- [x] All unit tests pass (29 unit tests, 54 total)
- [x] Build compiles without TypeScript errors

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Clean implementation

### Completion Notes List

- Created MobileAddTaskForm component with inline expansion pattern (not modal)
- Implemented template dropdown with system templates first, custom templates after divider, "Custom task..." at bottom
- Added 64px touch targets for all inputs and buttons per NFR-HT-04
- Implemented outside click collapse with special handling for Ant Design Select dropdown portals
- Added slide-in animation for newly created tasks using CSS keyframes injected at runtime
- Integrated MobileAddTaskForm into MobileTasksSection at the bottom of the section
- Form appears in both populated and empty states
- 29 unit tests written for MobileAddTaskForm component (including 64px height tests for all form elements)
- 4 integration tests added to MobileTasksSection for add form functionality
- All tests pass, build compiles cleanly

**Code Review Fixes Applied (2026-01-30):**
- Fixed Select dropdown to have explicit 64px height (AC3 compliance)
- Added scroll collapse behavior when user scrolls >100px (AC8 full compliance)
- Added new task animation support to overdue section for edge case coverage (AC7)
- Added test for Select 64px height (AC3 test coverage)
- Added test for Input 64px height (AC4 test coverage)
- Added test for scroll collapse behavior (AC8 test coverage)

### File List

**New Files:**
- `apis-dashboard/src/components/MobileAddTaskForm.tsx` - Main inline add task form component
- `apis-dashboard/tests/components/MobileAddTaskForm.test.tsx` - Unit tests (27 tests)

**Modified Files:**
- `apis-dashboard/src/components/MobileTasksSection.tsx` - Integrated MobileAddTaskForm, added templates hook, new task animation
- `apis-dashboard/src/components/index.ts` - Added MobileAddTaskForm export
- `apis-dashboard/tests/components/MobileTasksSection.test.tsx` - Added integration tests for add form (4 tests)

## Change Log

- 2026-01-30: Implemented Story 14.11 Mobile Inline Task Creation - created MobileAddTaskForm component with inline expansion, template dropdown, custom task support, 64px touch targets, outside click collapse, and new task animation. All tests pass (52 total).
- 2026-01-30: Code review fixes - Added 64px height to Select, scroll collapse behavior (AC8), animation for overdue section edge case, and 2 new tests. All tests pass (54 total).
