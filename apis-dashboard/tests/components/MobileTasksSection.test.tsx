/**
 * Unit tests for MobileTasksSection component
 *
 * Part of Epic 14, Stories 14.9 and 14.10
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, message } from 'antd';
import { MobileTasksSection } from '../../src/components/MobileTasksSection';
import * as useHiveTasksModule from '../../src/hooks/useHiveTasks';
import * as useTasksModule from '../../src/hooks/useTasks';
import * as useTaskTemplatesModule from '../../src/hooks/useTaskTemplates';
import { Task } from '../../src/hooks/useTasks';
import { TaskTemplate } from '../../src/hooks/useTaskTemplates';
import { apiClient } from '../../src/providers/apiClient';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock the useHiveTasks hook
vi.mock('../../src/hooks/useHiveTasks', () => ({
  useHiveTasks: vi.fn(),
}));

// Mock useCompleteTask and useDeleteTask
vi.mock('../../src/hooks/useTasks', async () => {
  const actual = await vi.importActual('../../src/hooks/useTasks');
  return {
    ...actual,
    useCompleteTask: vi.fn(),
    useDeleteTask: vi.fn(),
  };
});

// Mock useTaskTemplates
vi.mock('../../src/hooks/useTaskTemplates', () => ({
  useTaskTemplates: vi.fn(),
}));

// Mock apiClient for MobileAddTaskForm
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// Mock Ant Design message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

// Helper to create mock tasks
const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  hive_id: 'hive-1',
  title: 'Test Task',
  priority: 'medium',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  ...overrides,
});

// Mock templates for MobileAddTaskForm
const mockTemplates: TaskTemplate[] = [
  {
    id: 'system-1',
    type: 'requeen',
    name: 'Requeen',
    description: 'Replace the queen',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'system-2',
    type: 'add_frame',
    name: 'Add Frame',
    description: 'Add a new frame',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

describe('MobileTasksSection', () => {
  const mockUseHiveTasks = useHiveTasksModule.useHiveTasks as ReturnType<typeof vi.fn>;
  const mockUseCompleteTask = useTasksModule.useCompleteTask as ReturnType<typeof vi.fn>;
  const mockUseDeleteTask = useTasksModule.useDeleteTask as ReturnType<typeof vi.fn>;
  const mockUseTaskTemplates = useTaskTemplatesModule.useTaskTemplates as ReturnType<typeof vi.fn>;
  const mockPost = vi.mocked(apiClient.post);

  const mockCompleteTask = vi.fn().mockResolvedValue({ id: 'task-1', status: 'completed' });
  const mockDeleteTask = vi.fn().mockResolvedValue(undefined);
  const mockRefetch = vi.fn().mockResolvedValue(undefined);

  const defaultMockReturn = {
    tasks: [],
    overdueTasks: [],
    pendingTasks: [],
    loading: false,
    error: null,
    refetch: mockRefetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHiveTasks.mockReturnValue(defaultMockReturn);
    mockUseCompleteTask.mockReturnValue({
      completeTask: mockCompleteTask,
      completing: false,
    });
    mockUseDeleteTask.mockReturnValue({
      deleteTask: mockDeleteTask,
      deleting: false,
    });
    mockUseTaskTemplates.mockReturnValue({
      templates: mockTemplates,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockPost.mockResolvedValue({
      data: {
        data: {
          id: 'new-task-1',
          hive_id: 'hive-1',
          template_id: 'system-1',
          title: 'Requeen',
          priority: 'medium',
          status: 'pending',
          source: 'manual',
          created_at: '2026-01-30T10:30:00Z',
        },
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        loading: true,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('tasks-loading')).toBeInTheDocument();
    });

    it('does not show content when loading', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        loading: true,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.queryByTestId('mobile-tasks-section')).not.toBeInTheDocument();
      expect(screen.queryByTestId('task-empty-state')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error alert when error', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        error: 'Failed to fetch tasks',
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('tasks-error')).toBeInTheDocument();
      expect(screen.getByText('Failed to load tasks')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch tasks')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no tasks', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks: [],
        pendingTasks: [],
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('task-empty-state')).toBeInTheDocument();
      expect(screen.getByText('No tasks for this hive')).toBeInTheDocument();
    });
  });

  describe('Overdue Subsection', () => {
    it('renders Overdue subsection with red background when overdue tasks exist', () => {
      const overdueTasks = [
        createTask({ id: 'overdue-1', title: 'Overdue Task 1' }),
        createTask({ id: 'overdue-2', title: 'Overdue Task 2' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      const overdueSection = screen.getByTestId('overdue-subsection');
      expect(overdueSection).toBeInTheDocument();
      // Check for red background tint
      expect(overdueSection).toHaveStyle({
        backgroundColor: 'rgba(194, 54, 22, 0.1)',
      });
    });

    it('overdue subsection has warning icon', () => {
      const overdueTasks = [createTask({ id: 'overdue-1', title: 'Overdue Task' })];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      const overdueHeader = screen.getByTestId('overdue-header');
      expect(overdueHeader).toBeInTheDocument();
      // The WarningOutlined icon should be present
      expect(overdueHeader.querySelector('.anticon-warning')).toBeInTheDocument();
    });

    it('does not render Overdue subsection when no overdue tasks', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [createTask({ id: 'pending-1' })],
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.queryByTestId('overdue-subsection')).not.toBeInTheDocument();
    });
  });

  describe('Pending Subsection', () => {
    it('renders Pending subsection for non-overdue tasks', () => {
      const pendingTasks = [
        createTask({ id: 'pending-1', title: 'Pending Task 1' }),
        createTask({ id: 'pending-2', title: 'Pending Task 2' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('pending-subsection')).toBeInTheDocument();
      // Text is "Pending" in DOM, but CSS text-transform: uppercase makes it appear as "PENDING"
      expect(screen.getByTestId('pending-header')).toHaveTextContent('Pending');
    });

    it('does not render Pending subsection when no pending tasks', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks: [createTask({ id: 'overdue-1' })],
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.queryByTestId('pending-subsection')).not.toBeInTheDocument();
    });
  });

  describe('Both Subsections', () => {
    it('renders both sections when both overdue and pending tasks exist', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks: [createTask({ id: 'overdue-1' })],
        pendingTasks: [createTask({ id: 'pending-1' })],
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('overdue-subsection')).toBeInTheDocument();
      expect(screen.getByTestId('pending-subsection')).toBeInTheDocument();
    });
  });

  describe('Accordion Behavior', () => {
    it('only one card expanded at a time', async () => {
      const tasks = [
        createTask({ id: 'task-1', title: 'Task 1', description: 'Description 1' }),
        createTask({ id: 'task-2', title: 'Task 2', description: 'Description 2' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: tasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      // Find both task card headers
      const taskCards = screen.getAllByTestId('mobile-task-card');
      expect(taskCards).toHaveLength(2);

      // Initially no cards are expanded
      expect(screen.queryAllByTestId('expanded-details')).toHaveLength(0);

      // Click first card header
      const headers = screen.getAllByTestId('task-card-header');
      fireEvent.click(headers[0]);

      // First card should be expanded
      await waitFor(() => {
        expect(screen.getAllByTestId('expanded-details')).toHaveLength(1);
      });
      expect(screen.getByText('Description 1')).toBeInTheDocument();

      // Click second card header
      fireEvent.click(headers[1]);

      // Now second card should be expanded, first should be collapsed
      await waitFor(() => {
        const expandedDetails = screen.getAllByTestId('expanded-details');
        expect(expandedDetails).toHaveLength(1);
      });
      expect(screen.getByText('Description 2')).toBeInTheDocument();
      expect(screen.queryByText('Description 1')).not.toBeInTheDocument();
    });

    it('clicking same card again collapses it', async () => {
      const tasks = [
        createTask({ id: 'task-1', title: 'Task 1', description: 'Description 1' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: tasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      const header = screen.getByTestId('task-card-header');

      // Click to expand
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.getByTestId('expanded-details')).toBeInTheDocument();
      });

      // Click again to collapse
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.queryByTestId('expanded-details')).not.toBeInTheDocument();
      });
    });
  });

  describe('Task Card Rendering', () => {
    it('renders task cards for overdue tasks', () => {
      const overdueTasks = [
        createTask({ id: 'overdue-1', title: 'Overdue Task 1' }),
        createTask({ id: 'overdue-2', title: 'Overdue Task 2' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByText('Overdue Task 1')).toBeInTheDocument();
      expect(screen.getByText('Overdue Task 2')).toBeInTheDocument();
    });

    it('renders task cards for pending tasks', () => {
      const pendingTasks = [
        createTask({ id: 'pending-1', title: 'Pending Task 1' }),
        createTask({ id: 'pending-2', title: 'Pending Task 2' }),
      ];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByText('Pending Task 1')).toBeInTheDocument();
      expect(screen.getByText('Pending Task 2')).toBeInTheDocument();
    });
  });

  describe('Hook Integration', () => {
    it('calls useHiveTasks with correct hiveId', () => {
      render(<MobileTasksSection hiveId="test-hive-id" />);

      expect(mockUseHiveTasks).toHaveBeenCalledWith('test-hive-id');
    });
  });

  describe('Custom Styling', () => {
    it('applies custom style to container', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [createTask({ id: 'task-1' })],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" style={{ marginTop: 50 }} />);

      const container = screen.getByTestId('mobile-tasks-section');
      expect(container).toHaveStyle({ marginTop: '50px' });
    });
  });

  // Story 14.10: Task Completion Flow Tests
  describe('Task Completion Flow (Story 14.10)', () => {
    it('completes task immediately when no auto_effects prompts', async () => {
      const taskWithoutPrompts = createTask({
        id: 'task-1',
        title: 'Simple Task',
        auto_effects: { updates: [] },
      });

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [taskWithoutPrompts],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand the card to see the Complete button
      const header = screen.getByTestId('task-card-header');
      fireEvent.click(header);

      await waitFor(() => {
        expect(screen.getByTestId('complete-button')).toBeInTheDocument();
      });

      // Click complete
      fireEvent.click(screen.getByTestId('complete-button'));

      // Should call completeTask directly (with delay for animation)
      await waitFor(() => {
        expect(mockCompleteTask).toHaveBeenCalledWith('task-1');
      }, { timeout: 500 });
    });

    it('opens completion sheet when task has auto_effects prompts', async () => {
      const taskWithPrompts = createTask({
        id: 'task-2',
        title: 'Requeen Task',
        auto_effects: {
          prompts: [
            {
              key: 'color',
              label: 'Queen marking color',
              type: 'select',
              options: [{ value: 'yellow', label: 'Yellow' }],
              required: true,
            },
          ],
          updates: [],
        },
      });

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [taskWithPrompts],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand the card
      const header = screen.getByTestId('task-card-header');
      fireEvent.click(header);

      await waitFor(() => {
        expect(screen.getByTestId('complete-button')).toBeInTheDocument();
      });

      // Click complete
      fireEvent.click(screen.getByTestId('complete-button'));

      // Should open completion sheet
      await waitFor(() => {
        expect(screen.getByTestId('mobile-task-completion-sheet')).toBeInTheDocument();
      });
    });

    it('shows delete confirmation dialog when delete is clicked', async () => {
      const task = createTask({
        id: 'task-1',
        title: 'Task to Delete',
      });

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [task],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand the card
      const header = screen.getByTestId('task-card-header');
      fireEvent.click(header);

      await waitFor(() => {
        expect(screen.getByTestId('delete-button')).toBeInTheDocument();
      });

      // Click delete
      fireEvent.click(screen.getByTestId('delete-button'));

      // Should show delete confirmation
      await waitFor(() => {
        expect(screen.getByTestId('delete-task-confirmation')).toBeInTheDocument();
        expect(screen.getByText('Delete this task?')).toBeInTheDocument();
      });
    });

    it('shows success toast and refetches after completion', async () => {
      const taskWithoutPrompts = createTask({
        id: 'task-1',
        title: 'Simple Task',
        auto_effects: { updates: [] },
      });

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [taskWithoutPrompts],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand and complete
      fireEvent.click(screen.getByTestId('task-card-header'));
      await waitFor(() => {
        expect(screen.getByTestId('complete-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('complete-button'));

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('Task completed');
        expect(mockRefetch).toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('shows error toast when completion fails', async () => {
      mockCompleteTask.mockRejectedValueOnce(new Error('Network error'));

      const taskWithoutPrompts = createTask({
        id: 'task-1',
        title: 'Simple Task',
        auto_effects: { updates: [] },
      });

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [taskWithoutPrompts],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand and complete
      fireEvent.click(screen.getByTestId('task-card-header'));
      await waitFor(() => {
        expect(screen.getByTestId('complete-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('complete-button'));

      await waitFor(() => {
        expect(message.error).toHaveBeenCalledWith('Failed to complete task');
      }, { timeout: 500 });
    });
  });

  // Story 14.11: MobileAddTaskForm Integration Tests
  describe('MobileAddTaskForm Integration (Story 14.11)', () => {
    it('Add Task form appears below task list', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [createTask({ id: 'pending-1', title: 'Pending Task' })],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      expect(screen.getByTestId('mobile-add-task-form')).toBeInTheDocument();
      expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
    });

    it('Add Task form appears in empty state', () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [],
        overdueTasks: [],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Empty state should show
      expect(screen.getByTestId('task-empty-state')).toBeInTheDocument();
      // Add Task form should still be present
      expect(screen.getByTestId('mobile-add-task-form')).toBeInTheDocument();
    });

    it('outside click collapses add task form', async () => {
      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [createTask({ id: 'pending-1', title: 'Pending Task' })],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand the add task form
      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });

      // Click outside (on the section container)
      fireEvent.mouseDown(screen.getByTestId('mobile-tasks-section'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
        expect(screen.queryByTestId('add-task-expanded')).not.toBeInTheDocument();
      });
    });

    it('new task appears in list after creation and triggers refetch', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        pendingTasks: [createTask({ id: 'existing-1', title: 'Existing Task' })],
      });

      renderWithTheme(<MobileTasksSection hiveId="hive-1" />);

      // Expand the add task form
      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });

      // Select a template
      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      // Submit
      await user.click(screen.getByTestId('add-task-button'));

      // Should call API and then refetch
      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/tasks', {
          hive_id: 'hive-1',
          template_id: 'system-1',
          priority: 'medium',
        });
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });
});
