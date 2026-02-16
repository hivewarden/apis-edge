# Story 14.10: Mobile Task Completion Flow with Auto-Effect Prompts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **beekeeper at the apiary**,
I want **to complete tasks with guided prompts for auto-effects**,
so that **my hive data is updated automatically when I complete certain tasks**.

## Acceptance Criteria

### AC1: Immediate Completion for Tasks Without Auto-Effects
- When user taps "Complete" on a task that has NO auto_effects or empty auto_effects.prompts array
- Then task is immediately marked complete via POST /api/tasks/{id}/complete
- And a brief success toast displays (e.g., "Task completed")
- And the task is removed from the pending list with a fade-out animation
- And the useHiveTasks hook refetches to update the list

### AC2: Bottom Sheet Modal for Tasks With Auto-Effects
- When user taps "Complete" on a task that HAS auto_effects.prompts array with items
- Then a bottom sheet modal slides up from the bottom of the screen
- And the modal header displays "Complete Task: [Task Name]"
- And the modal has a semi-transparent backdrop
- And tapping the backdrop closes the modal without completing

### AC3: Prompts Section Rendering
- Given the modal is open for a task with auto_effects
- When prompts are rendered
- Then each prompt from auto_effects.prompts is displayed:
  - **select** type: Large touch-friendly buttons (64px height) for each option
  - **number** type: Large increment/decrement buttons with number display
  - **text** type: Large text input (64px height)
- And required prompts are marked with an asterisk (*)
- And prompt labels are clearly visible above each input

### AC4: Preview Section
- Given the modal is open
- When the preview section is visible
- Then displays "This will update:" header
- And shows bullet list of changes from auto_effects.updates
- And formats updates readable (e.g., "Queen year -> 2026", "Queen marking -> [selected color]")
- And dynamic values update as user fills prompts (if value_from references completion_data)

### AC5: Modal Actions
- Given the modal is open
- When viewing action buttons
- Then "Complete Task" primary button is displayed (64px height, full width)
- And "Cancel" text link is displayed below
- And "Complete Task" is disabled until all required prompts are filled
- And clicking "Cancel" closes the modal without completing

### AC6: Successful Completion with Prompts
- When user fills all required prompts and taps "Complete Task"
- Then calls POST /api/tasks/{id}/complete with completion_data object
- And completion_data contains key-value pairs from filled prompts
- And modal closes
- And success toast displays with summary (e.g., "Task completed: Requeen")
- And task is removed from list

### AC7: Example - Requeen Task Prompts
- Given a Requeen task with auto_effects
- When modal opens
- Then shows "Queen marking color" prompt
- And displays 6 large color buttons: White, Yellow, Red, Green, Blue, Unmarked
- And shows optional notes text area
- And preview shows: "Queen year -> 2026", "Queen marking -> [selected]"

### AC8: Delete Confirmation
- When user taps "Delete" on any task
- Then shows confirmation dialog: "Delete this task?"
- And dialog has "Delete" (danger) and "Cancel" buttons
- And on confirm, calls DELETE /api/tasks/{id}
- And removes task from list
- And shows brief toast: "Task deleted"

### AC9: Loading States
- When completing a task (API in progress)
- Then "Complete Task" button shows loading spinner
- And button is disabled during request
- When deleting a task (API in progress)
- Then delete operation shows loading state
- And prevents duplicate requests

### AC10: Error Handling
- When completion API fails
- Then shows error toast with message
- And modal remains open for retry
- When delete API fails
- Then shows error toast with message
- And task remains in list

## Tasks / Subtasks

- [x] **Task 1: Create MobileTaskCompletionSheet component** (AC: 2, 3, 4, 5, 6)
  - [x] 1.1 Create `/apis-dashboard/src/components/MobileTaskCompletionSheet.tsx`
  - [x] 1.2 Props interface: `task: Task | null`, `visible: boolean`, `onClose: () => void`, `onComplete: (completionData: TaskCompletionData) => Promise<void>`, `completing: boolean`
  - [x] 1.3 Use Ant Design Drawer with placement="bottom" for bottom sheet behavior
  - [x] 1.4 Set height to "auto" with max-height ~75vh to fit prompts
  - [x] 1.5 Render header with task name and close button
  - [x] 1.6 Render AutoEffectPrompts component for prompts section
  - [x] 1.7 Render preview section showing updates from auto_effects.updates
  - [x] 1.8 Render "Complete Task" button (64px, primary, full width)
  - [x] 1.9 Render "Cancel" text link
  - [x] 1.10 Track completion_data state for filled prompts
  - [x] 1.11 Validate required prompts before enabling submit
  - [x] 1.12 Call onComplete with completion_data on submit
  - [x] 1.13 Export from components/index.ts

- [x] **Task 2: Create AutoEffectPrompts component** (AC: 3)
  - [x] 2.1 Create `/apis-dashboard/src/components/AutoEffectPrompts.tsx`
  - [x] 2.2 Props interface: `prompts: Prompt[]`, `values: Record<string, any>`, `onChange: (key: string, value: any) => void`
  - [x] 2.3 Render each prompt based on type (select, number, text)
  - [x] 2.4 For select type: render large buttons using ColorSelectPrompt or generic SelectPrompt
  - [x] 2.5 For number type: render NumberPrompt with increment/decrement
  - [x] 2.6 For text type: render large text input
  - [x] 2.7 Mark required prompts with asterisk
  - [x] 2.8 Apply 64px touch targets to all interactive elements
  - [x] 2.9 Export from components/index.ts

- [x] **Task 3: Create ColorSelectPrompt component** (AC: 3, 7)
  - [x] 3.1 Create `/apis-dashboard/src/components/ColorSelectPrompt.tsx`
  - [x] 3.2 Props interface: `label: string`, `options: {value: string, label: string}[]`, `value: string | undefined`, `onChange: (value: string) => void`, `required?: boolean`
  - [x] 3.3 Render label with optional asterisk
  - [x] 3.4 Render color buttons in a flex grid (2-3 columns)
  - [x] 3.5 Each button 64px height, shows color name
  - [x] 3.6 Selected button has primary background/border
  - [x] 3.7 Colors: White (#f5f5f5), Yellow (#fcd34d), Red (#ef4444), Green (#22c55e), Blue (#3b82f6), Unmarked (#9ca3af)
  - [x] 3.8 Export from components/index.ts

- [x] **Task 4: Create NumberPrompt component** (AC: 3)
  - [x] 4.1 Create `/apis-dashboard/src/components/NumberPrompt.tsx`
  - [x] 4.2 Props interface: `label: string`, `value: number`, `onChange: (value: number) => void`, `min?: number`, `max?: number`, `required?: boolean`
  - [x] 4.3 Render label with optional asterisk
  - [x] 4.4 Render large minus button (64px), value display, large plus button (64px)
  - [x] 4.5 Disable minus when at min, plus when at max
  - [x] 4.6 Use theme colors for buttons
  - [x] 4.7 Export from components/index.ts

- [x] **Task 5: Create TextPrompt component** (AC: 3)
  - [x] 5.1 Create `/apis-dashboard/src/components/TextPrompt.tsx`
  - [x] 5.2 Props interface: `label: string`, `value: string`, `onChange: (value: string) => void`, `placeholder?: string`, `required?: boolean`
  - [x] 5.3 Render label with optional asterisk
  - [x] 5.4 Render Input.TextArea with 64px min-height
  - [x] 5.5 Apply theme styling
  - [x] 5.6 Export from components/index.ts

- [x] **Task 6: Create DeleteTaskConfirmation component** (AC: 8)
  - [x] 6.1 Create `/apis-dashboard/src/components/DeleteTaskConfirmation.tsx`
  - [x] 6.2 Props interface: `visible: boolean`, `taskName: string`, `onConfirm: () => void`, `onCancel: () => void`, `deleting: boolean`
  - [x] 6.3 Use Ant Design Modal with simple confirmation layout
  - [x] 6.4 Display "Delete this task?" with task name
  - [x] 6.5 "Delete" button (danger type) and "Cancel" button
  - [x] 6.6 Show loading state on Delete button when deleting
  - [x] 6.7 Export from components/index.ts

- [x] **Task 7: Update MobileTasksSection with completion/deletion logic** (AC: 1, 6, 8, 9, 10)
  - [x] 7.1 Modify `/apis-dashboard/src/components/MobileTasksSection.tsx`
  - [x] 7.2 Import MobileTaskCompletionSheet, DeleteTaskConfirmation, useCompleteTask, useDeleteTask
  - [x] 7.3 Add state: `completingTask: Task | null`, `deletingTask: Task | null`
  - [x] 7.4 Add state: `showCompletionSheet: boolean`, `showDeleteConfirm: boolean`
  - [x] 7.5 Implement handleComplete: check if task has prompts, if not -> immediate complete, if yes -> show sheet
  - [x] 7.6 Implement handleCompleteWithData: call useCompleteTask.completeTask, show toast, refetch
  - [x] 7.7 Implement handleDelete: show confirmation dialog
  - [x] 7.8 Implement handleDeleteConfirm: call useDeleteTask.deleteTask, show toast, refetch
  - [x] 7.9 Add success/error toast messages using message.success/message.error
  - [x] 7.10 Render MobileTaskCompletionSheet and DeleteTaskConfirmation modals

- [x] **Task 8: Add task removal animation** (AC: 1)
  - [x] 8.1 Add CSS transition for task card fade-out on completion
  - [x] 8.2 Use 300ms fade transition before removing from DOM
  - [x] 8.3 Apply same animation for deletion

- [x] **Task 9: Write unit tests for MobileTaskCompletionSheet** (AC: 2, 3, 4, 5, 6)
  - [x] 9.1 Create `/apis-dashboard/tests/components/MobileTaskCompletionSheet.test.tsx`
  - [x] 9.2 Test: Renders with task name in header
  - [x] 9.3 Test: Renders prompts from auto_effects
  - [x] 9.4 Test: Preview section shows updates
  - [x] 9.5 Test: Complete button disabled when required prompts empty
  - [x] 9.6 Test: Complete button enabled when required prompts filled
  - [x] 9.7 Test: Cancel closes modal
  - [x] 9.8 Test: Submit calls onComplete with completion_data

- [x] **Task 10: Write unit tests for AutoEffectPrompts** (AC: 3)
  - [x] 10.1 Create `/apis-dashboard/tests/components/AutoEffectPrompts.test.tsx`
  - [x] 10.2 Test: Renders select prompt as buttons
  - [x] 10.3 Test: Renders number prompt with +/- buttons
  - [x] 10.4 Test: Renders text prompt as textarea
  - [x] 10.5 Test: Shows asterisk for required prompts
  - [x] 10.6 Test: onChange called with correct key/value

- [x] **Task 11: Write unit tests for ColorSelectPrompt** (AC: 3, 7)
  - [x] 11.1 Create `/apis-dashboard/tests/components/ColorSelectPrompt.test.tsx`
  - [x] 11.2 Test: Renders all color options
  - [x] 11.3 Test: Selected option is highlighted
  - [x] 11.4 Test: Clicking option calls onChange
  - [x] 11.5 Test: Buttons have 64px height

- [x] **Task 12: Write unit tests for DeleteTaskConfirmation** (AC: 8)
  - [x] 12.1 Create `/apis-dashboard/tests/components/DeleteTaskConfirmation.test.tsx`
  - [x] 12.2 Test: Shows task name
  - [x] 12.3 Test: Confirm button calls onConfirm
  - [x] 12.4 Test: Cancel button calls onCancel
  - [x] 12.5 Test: Shows loading state when deleting

- [x] **Task 13: Write integration tests for MobileTasksSection completion flow** (AC: 1, 6, 9, 10)
  - [x] 13.1 Modify `/apis-dashboard/tests/components/MobileTasksSection.test.tsx`
  - [x] 13.2 Test: Task without auto_effects completes immediately
  - [x] 13.3 Test: Task with auto_effects opens completion sheet
  - [x] 13.4 Test: Delete shows confirmation dialog
  - [x] 13.5 Test: Successful completion shows toast and removes task
  - [x] 13.6 Test: API error shows error toast

- [x] **Task 14: Export components and verify build** (AC: all)
  - [x] 14.1 Update `/apis-dashboard/src/components/index.ts` with all new exports
  - [x] 14.2 Run `npm run build` to verify no TypeScript errors
  - [x] 14.3 Run `npm run test` to verify all tests pass

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a **FRONTEND story**. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design Drawer for bottom sheet behavior
- Touch-optimized form controls (64px targets per NFR-HT-04)
- Modal/confirmation patterns
- Loading state management
- Animation transitions

### Architecture Compliance

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces for all component props
- Use existing hooks from useTasks.ts (useCompleteTask, useDeleteTask)
- Colors and spacing from theme/apisTheme.ts
- Touch targets: 64px minimum per NFR-HT-04
- Follow existing MobileTaskCard patterns from Story 14.9

### Existing Patterns to Follow

**From Story 14.9 - MobileTasksSection Placeholder Handlers:**
```tsx
// Current placeholder handlers (lines 55-61):
const handleComplete = useCallback((_taskId: string) => {
  // Will be implemented in Story 14.10
}, []);

const handleDelete = useCallback((_taskId: string) => {
  // Will be implemented in Story 14.10
}, []);

// Replace with actual implementation using useCompleteTask and useDeleteTask
```

**From useTasks.ts - Existing Hooks:**
```typescript
// useCompleteTask hook:
export function useCompleteTask(): UseCompleteTaskResult {
  const [completing, setCompleting] = useState(false);
  const completeTask = useCallback(
    async (taskId: string, completionData: TaskCompletionData = {}): Promise<CompleteTaskResponse['data']> => {
      // POST /api/tasks/{id}/complete with completion_data
    },
    []
  );
  return { completeTask, completing };
}

// useDeleteTask hook:
export function useDeleteTask(): UseDeleteTaskResult {
  const [deleting, setDeleting] = useState(false);
  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    // DELETE /api/tasks/{id}
  }, []);
  return { deleteTask, deleting };
}
```

**From useTasks.ts - AutoEffects Types:**
```typescript
export interface Prompt {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface AutoEffectUpdate {
  target: string;
  action: 'set' | 'increment' | 'decrement';
  value?: string | number;
  value_from?: string;
}

export interface AutoEffects {
  prompts?: Prompt[];
  updates?: AutoEffectUpdate[];
  creates?: Record<string, unknown>[];
}
```

### Bottom Sheet Modal Implementation

Use Ant Design Drawer with bottom placement:
```tsx
<Drawer
  placement="bottom"
  open={visible}
  onClose={onClose}
  height="auto"
  style={{ maxHeight: '75vh' }}
  styles={{
    body: { padding: 16 }
  }}
  closable
  title={`Complete Task: ${task?.title}`}
>
  {/* Content */}
</Drawer>
```

### Detecting Tasks with Auto-Effects

```typescript
const hasAutoEffectPrompts = (task: Task): boolean => {
  return !!(task.auto_effects?.prompts && task.auto_effects.prompts.length > 0);
};

// In handleComplete:
const handleComplete = useCallback((task: Task) => {
  if (hasAutoEffectPrompts(task)) {
    // Show completion sheet
    setCompletingTask(task);
    setShowCompletionSheet(true);
  } else {
    // Complete immediately
    completeTaskImmediately(task);
  }
}, []);
```

### Preview Section Formatting

```typescript
const formatUpdatePreview = (update: AutoEffectUpdate, completionData: Record<string, any>): string => {
  const target = update.target.replace('hive.', '').replace(/_/g, ' ');
  let value: string;

  if (update.value !== undefined) {
    value = String(update.value);
  } else if (update.value_from) {
    const key = update.value_from.replace('completion_data.', '');
    value = completionData[key] ? String(completionData[key]) : '[select above]';
  } else if (update.action === 'increment') {
    value = '+1';
  } else if (update.action === 'decrement') {
    value = '-1';
  } else {
    value = '...';
  }

  return `${target} -> ${value}`;
};
```

### Queen Marking Color Options

Standard international queen marking colors (5-year cycle):
```typescript
const QUEEN_MARKING_COLORS = [
  { value: 'white', label: 'White', color: '#f5f5f5' },   // Years ending in 1, 6
  { value: 'yellow', label: 'Yellow', color: '#fcd34d' }, // Years ending in 2, 7
  { value: 'red', label: 'Red', color: '#ef4444' },       // Years ending in 3, 8
  { value: 'green', label: 'Green', color: '#22c55e' },   // Years ending in 4, 9
  { value: 'blue', label: 'Blue', color: '#3b82f6' },     // Years ending in 5, 0
  { value: 'unmarked', label: 'Unmarked', color: '#9ca3af' },
];
```

### Toast Messages

```typescript
import { message } from 'antd';

// Success messages
message.success('Task completed');
message.success('Task deleted');

// Error messages
message.error('Failed to complete task');
message.error('Failed to delete task');
```

### Theme Colors Reference

From `/apis-dashboard/src/theme/apisTheme.ts`:
```typescript
colors = {
  seaBuckthorn: '#f7a42d',  // Primary accent
  coconutCream: '#fbf9e7',  // Background
  brownBramble: '#662604',  // Dark text
  salomie: '#fcd483',       // Card surface
  error: '#c23616',         // Red for delete/danger
  textMuted: '#8b6914',     // Secondary text
}

touchTargets = {
  standard: 48,   // Standard buttons
  mobile: 64,     // Glove-friendly mobile (required for all inputs)
  gap: 16,        // Minimum gap between targets
}
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileTaskCompletionSheet.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/AutoEffectPrompts.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ColorSelectPrompt.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/NumberPrompt.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/TextPrompt.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/DeleteTaskConfirmation.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileTaskCompletionSheet.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/AutoEffectPrompts.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/ColorSelectPrompt.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/DeleteTaskConfirmation.test.tsx`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/MobileTasksSection.tsx` - Replace placeholder handlers with actual completion/deletion logic
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Add exports
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/MobileTasksSection.test.tsx` - Add completion flow tests

### Dependencies (from previous stories)

**From Story 14.9 (DONE):**
- `MobileTaskCard` component with onComplete and onDelete props
- `MobileTasksSection` component with placeholder handlers
- `useHiveTasks` hook with refetch capability
- `Task` interface with `auto_effects` property

**From Story 14.2 (DONE):**
- `POST /api/tasks/{id}/complete` endpoint accepts `completion_data`
- `DELETE /api/tasks/{id}` endpoint for task deletion

**For Story 14.12 (FUTURE):**
- Auto-effects will actually update hive configuration
- Story 14.10 passes completion_data; 14.12 processes it server-side

### API Endpoints Used

```
POST /api/tasks/{id}/complete
Body: { completion_data: { color: "yellow", notes: "New queen from breeder" } }
Response: {
  "data": {
    "id": "uuid",
    "status": "completed",
    "completed_at": "2026-01-30T10:30:00Z",
    "auto_applied_changes": { "queen_year": 2026, "queen_marking": "yellow" }
  }
}

DELETE /api/tasks/{id}
Response: 204 No Content
```

### Ant Design Components to Use

```tsx
import {
  Drawer,
  Button,
  Space,
  Typography,
  Modal,
  Input,
  message,
  Spin,
} from 'antd';

import {
  CheckOutlined,
  MinusOutlined,
  PlusOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
```

### Testing Strategy

**Mock API responses:**
```typescript
// Complete task success
vi.mocked(apiClient.post).mockResolvedValueOnce({
  data: {
    data: {
      id: 'task-1',
      status: 'completed',
      completed_at: '2026-01-30T10:30:00Z',
    },
  },
});

// Delete task success
vi.mocked(apiClient.delete).mockResolvedValueOnce({ status: 204 });

// API error
vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network error'));
```

**Mock task data:**
```typescript
const taskWithoutPrompts: Task = {
  id: 'task-1',
  hive_id: 'hive-1',
  title: 'Add honey super',
  priority: 'medium',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  source: 'manual',
  auto_effects: {
    prompts: [], // No prompts
    updates: [{ target: 'hive.supers', action: 'increment' }],
  },
};

const taskWithPrompts: Task = {
  id: 'task-2',
  hive_id: 'hive-1',
  title: 'Requeen',
  priority: 'high',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  source: 'manual',
  auto_effects: {
    prompts: [
      {
        key: 'color',
        label: 'Queen marking color',
        type: 'select',
        options: [
          { value: 'white', label: 'White' },
          { value: 'yellow', label: 'Yellow' },
          { value: 'red', label: 'Red' },
          { value: 'green', label: 'Green' },
          { value: 'blue', label: 'Blue' },
          { value: 'unmarked', label: 'Unmarked' },
        ],
        required: true,
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'text',
        required: false,
      },
    ],
    updates: [
      { target: 'hive.queen_year', action: 'set', value: '{{current_year}}' },
      { target: 'hive.queen_marking', action: 'set', value_from: 'completion_data.color' },
    ],
  },
};
```

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.10]
- [Source: _bmad-output/implementation-artifacts/14-9-mobile-tasks-section-view.md - MobileTaskCard and MobileTasksSection patterns]
- [Source: apis-dashboard/src/hooks/useTasks.ts - useCompleteTask, useDeleteTask hooks]
- [Source: apis-dashboard/src/components/MobileTasksSection.tsx - Placeholder handlers to replace]
- [Source: apis-dashboard/src/theme/apisTheme.ts - Touch targets and colors]
- [Source: CLAUDE.md#Frontend-Development - Use /frontend-design skill]

## Test Criteria

- [ ] Task without auto_effects completes immediately on button tap
- [ ] Task with auto_effects opens bottom sheet modal
- [ ] Modal header shows task name
- [ ] Select prompts render as large touch-friendly buttons (64px)
- [ ] Number prompts show increment/decrement buttons (64px)
- [ ] Text prompts render as large input (64px min-height)
- [ ] Required prompts marked with asterisk
- [ ] Complete button disabled until required prompts filled
- [ ] Preview section shows what will be updated
- [ ] Cancel closes modal without completing
- [ ] Successful completion shows toast and removes task
- [ ] Delete shows confirmation dialog
- [ ] Delete confirm removes task and shows toast
- [ ] API errors show error toast
- [ ] Loading states shown during API calls
- [ ] All touch targets are 64px minimum
- [ ] All unit tests pass
- [ ] Build compiles without TypeScript errors

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without errors.

### Completion Notes List

- Implemented mobile task completion flow with auto-effect prompts
- Created 6 new components: MobileTaskCompletionSheet, AutoEffectPrompts, ColorSelectPrompt, NumberPrompt, TextPrompt, SelectPrompt, DeleteTaskConfirmation
- All components follow 64px touch target requirements (NFR-HT-04)
- MobileTasksSection updated with completion/deletion logic including:
  - Immediate completion for tasks without prompts
  - Bottom sheet modal for tasks with auto-effect prompts
  - Delete confirmation dialog
  - 300ms fade-out animation for removed tasks
  - Toast notifications for success/error states
- 55 tests passing for Story 14.10 components
- Build compiles successfully with no TypeScript errors

### File List

**New Files:**
- apis-dashboard/src/components/ColorSelectPrompt.tsx
- apis-dashboard/src/components/NumberPrompt.tsx
- apis-dashboard/src/components/TextPrompt.tsx
- apis-dashboard/src/components/SelectPrompt.tsx
- apis-dashboard/src/components/DeleteTaskConfirmation.tsx
- apis-dashboard/tests/components/MobileTaskCompletionSheet.test.tsx
- apis-dashboard/tests/components/AutoEffectPrompts.test.tsx
- apis-dashboard/tests/components/ColorSelectPrompt.test.tsx
- apis-dashboard/tests/components/DeleteTaskConfirmation.test.tsx

**Modified Files:**
- apis-dashboard/src/components/MobileTasksSection.tsx
- apis-dashboard/src/components/index.ts
- apis-dashboard/tests/components/MobileTasksSection.test.tsx

**Pre-existing (from prior partial implementation):**
- apis-dashboard/src/components/MobileTaskCompletionSheet.tsx
- apis-dashboard/src/components/AutoEffectPrompts.tsx

## Change Log

- 2026-01-30: Code review remediation - Fixed 5 issues:
  - M1: Fixed missing `completeTaskImmediately` dependency in `handleComplete` useCallback
  - M2: Fixed race condition - API call now completes before fade animation starts (prevents visual inconsistency on failure)
  - M5: Added focus-visible styling to ColorSelectPrompt and SelectPrompt for keyboard accessibility
  - L1: Added hover state feedback to SelectPrompt buttons
  - L2: Corrected test count in story file (55 tests, not 80)
- 2026-01-30: Completed Story 14.10 implementation - mobile task completion flow with auto-effect prompts, delete confirmation, and animations
