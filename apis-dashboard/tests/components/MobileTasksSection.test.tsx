/**
 * Unit tests for MobileTasksSection component
 *
 * Part of Epic 14, Stories 14.9, 14.10, 14.11, 14.15, and 14.16
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

// Mock useTaskSuggestions
vi.mock('../../src/hooks/useTaskSuggestions', () => ({
  useTaskSuggestions: vi.fn(() => ({
    suggestions: [],
    loading: false,
    refetch: vi.fn(),
    acceptSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    accepting: false,
    dismissing: false,
  })),
}));

// Mock useAuth
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { tenant_id: 'test-tenant' },
    isAuthenticated: true,
    loading: false,
  })),
}));

// Mock offline tasks service
vi.mock('../../src/services/offlineTasks', () => ({
  completeOfflineTask: vi.fn(),
  deleteOfflineTask: vi.fn(),
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
      warning: vi.fn(),
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
    isOffline: false,
    pendingSyncCount: 0,
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
    it('renders Overdue subsection when overdue tasks exist', () => {
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
    });

    it('overdue subsection has header text', () => {
      const overdueTasks = [createTask({ id: 'overdue-1', title: 'Overdue Task' })];

      mockUseHiveTasks.mockReturnValue({
        ...defaultMockReturn,
        overdueTasks,
      });

      render(<MobileTasksSection hiveId="hive-1" />);

      const overdueHeader = screen.getByTestId('overdue-header');
      expect(overdueHeader).toBeInTheDocument();
      expect(overdueHeader).toHaveTextContent('Overdue');
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

      expect(mockUseHiveTasks).toHaveBeenCalledWith('test-hive-id', 'pending', 'test-tenant');
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
    it('completes task immediately when Complete Task button is clicked', async () => {
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

      // The v2 layout has Complete Task buttons inline (not behind an expand)
      const completeButtons = screen.getAllByRole('button', { name: /complete task/i });
      expect(completeButtons.length).toBeGreaterThan(0);

      // Click Complete Task
      fireEvent.click(completeButtons[0]);

      // Should call completeTask directly (with delay for animation)
      await waitFor(() => {
        expect(mockCompleteTask).toHaveBeenCalledWith('task-1');
      }, { timeout: 500 });
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

      // Click Complete Task
      const completeButtons = screen.getAllByRole('button', { name: /complete task/i });
      fireEvent.click(completeButtons[0]);

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

      // Click Complete Task
      const completeButtons = screen.getAllByRole('button', { name: /complete task/i });
      fireEvent.click(completeButtons[0]);

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

    it('new task triggers refetch after creation', async () => {
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
        expect(mockPost).toHaveBeenCalledWith('/tasks', expect.objectContaining({
          hive_id: 'hive-1',
          template_id: 'system-1',
        }));
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });
});
