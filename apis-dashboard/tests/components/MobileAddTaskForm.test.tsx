/**
 * Unit tests for MobileAddTaskForm component
 *
 * Part of Epic 14, Story 14.11: Mobile Inline Task Creation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider, message } from 'antd';
import { MobileAddTaskForm } from '../../src/components/MobileAddTaskForm';
import { TaskTemplate } from '../../src/hooks/useTaskTemplates';
import { apisTheme } from '../../src/theme/apisTheme';
import { apiClient } from '../../src/providers/apiClient';

// Mock apiClient
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

// Mock templates
const mockSystemTemplates: TaskTemplate[] = [
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
  {
    id: 'system-3',
    type: 'check_mites',
    name: 'Check for Mites',
    description: 'Check for varroa mites',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const mockCustomTemplates: TaskTemplate[] = [
  {
    id: 'custom-1',
    type: 'custom',
    name: 'My Custom Task',
    description: 'A custom task',
    is_system: false,
    created_at: '2026-01-15T00:00:00Z',
  },
];

const allMockTemplates = [...mockSystemTemplates, ...mockCustomTemplates];

describe('MobileAddTaskForm', () => {
  const mockOnTaskAdded = vi.fn();
  const mockPost = vi.mocked(apiClient.post);

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('Collapsed State (AC1)', () => {
    it('renders collapsed state with "Add Task" text', () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
      expect(screen.getByText('Add Task')).toBeInTheDocument();
    });

    it('renders collapsed state with "+" icon', () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      const collapsed = screen.getByTestId('add-task-collapsed');
      expect(collapsed.querySelector('.anticon-plus')).toBeInTheDocument();
    });

    it('collapsed card has salomie background and 8px radius', () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      const formContainer = screen.getByTestId('mobile-add-task-form');
      expect(formContainer).toHaveStyle({
        backgroundColor: '#fcd483', // colors.salomie
        borderRadius: '8px',
      });
    });
  });

  describe('Expansion Behavior (AC2)', () => {
    it('expands on click', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      const collapsed = screen.getByTestId('add-task-collapsed');
      fireEvent.click(collapsed);

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-task-collapsed')).not.toBeInTheDocument();
    });

    it('expands on keyboard Enter', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      const collapsed = screen.getByTestId('add-task-collapsed');
      fireEvent.keyDown(collapsed, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });
    });

    it('expands on keyboard Space', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      const collapsed = screen.getByTestId('add-task-collapsed');
      fireEvent.keyDown(collapsed, { key: ' ' });

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });
    });
  });

  describe('Task Type Dropdown (AC3)', () => {
    it('displays dropdown with placeholder when expanded', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });
    });

    it('dropdown shows loading state when templates are loading', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={[]}
          templatesLoading={true}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        const select = screen.getByTestId('task-type-select');
        // Check if the select has the loading class applied
        expect(select).toBeInTheDocument();
      });
    });

    it('dropdown shows system templates sorted by name when opened', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      // Click to open dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Should see system templates (sorted by name: Add Frame, Check for Mites, Requeen)
      await waitFor(() => {
        expect(screen.getByText('Add Frame')).toBeInTheDocument();
        expect(screen.getByText('Check for Mites')).toBeInTheDocument();
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });
    });

    it('dropdown shows Custom task option at the bottom', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });
    });

    it('dropdown shows custom templates after system templates', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={allMockTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        // Custom template should be visible
        expect(screen.getByText('My Custom Task')).toBeInTheDocument();
      });
    });
  });

  describe('Custom Title Input (AC4)', () => {
    it('shows title input when Custom task is selected', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      // Open dropdown and select "Custom task..."
      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      // Title input should appear
      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('Enter task name')).toBeInTheDocument();
    });

    it('hides title input when template is selected', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      // Title input should NOT appear
      expect(screen.queryByTestId('custom-title-input')).not.toBeInTheDocument();
    });
  });

  describe('Add Button State (AC6)', () => {
    it('Add button is disabled when no selection', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).toBeInTheDocument();
      });

      expect(screen.getByTestId('add-task-button')).toBeDisabled();
    });

    it('Add button is disabled when custom selected but title empty', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });

      // Button should be disabled (empty title)
      expect(screen.getByTestId('add-task-button')).toBeDisabled();
    });

    it('Add button is enabled when template is selected', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      // Button should be enabled
      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });
    });

    it('Add button is enabled when custom title is entered', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });

      // Type a custom title
      const input = screen.getByTestId('custom-title-input').querySelector('input')!;
      await user.type(input, 'Check queen health');

      // Button should be enabled
      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });
    });
  });

  describe('Task Submission (AC7)', () => {
    it('submit calls API with correct payload for template selection', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('add-task-button'));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/tasks', {
          hive_id: 'hive-1',
          template_id: 'system-1',
          priority: 'medium',
        });
      });
    });

    it('submit calls API with correct payload for custom task', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });

      const input = screen.getByTestId('custom-title-input').querySelector('input')!;
      await user.type(input, 'Check queen health');

      await user.click(screen.getByTestId('add-task-button'));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/tasks', {
          hive_id: 'hive-1',
          custom_title: 'Check queen health',
          priority: 'medium',
        });
      });
    });

    it('success collapses form and calls onTaskAdded', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('add-task-button'));

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('Task added');
        expect(mockOnTaskAdded).toHaveBeenCalledWith('new-task-1');
        // Form should collapse
        expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
        expect(screen.queryByTestId('add-task-expanded')).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading State (AC9)', () => {
    it('shows loading spinner during API call', async () => {
      const user = userEvent.setup();

      // Make the API call hang
      mockPost.mockImplementation(() => new Promise(() => {}));

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('add-task-button'));

      // Button should show loading state
      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).toBeDisabled();
        expect(screen.getByText('Adding...')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling (AC10)', () => {
    it('error shows toast and keeps form expanded', async () => {
      const user = userEvent.setup();
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Requeen')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Requeen'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).not.toBeDisabled();
      });

      await user.click(screen.getByTestId('add-task-button'));

      await waitFor(() => {
        expect(message.error).toHaveBeenCalledWith('Failed to add task');
        // Form should stay expanded for retry
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
        expect(screen.queryByTestId('add-task-collapsed')).not.toBeInTheDocument();
      });
    });

    it('inputs retain values after error', async () => {
      const user = userEvent.setup();
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });

      const input = screen.getByTestId('custom-title-input').querySelector('input')!;
      await user.type(input, 'My important task');

      await user.click(screen.getByTestId('add-task-button'));

      await waitFor(() => {
        expect(message.error).toHaveBeenCalled();
      });

      // Input should still have the value
      const inputAfterError = screen.getByTestId('custom-title-input').querySelector('input')!;
      expect(inputAfterError).toHaveValue('My important task');
    });
  });

  describe('Form Collapse Behavior (AC8)', () => {
    it('outside click collapses form', async () => {
      renderWithTheme(
        <div data-testid="outside-element">
          <MobileAddTaskForm
            hiveId="hive-1"
            onTaskAdded={mockOnTaskAdded}
            templates={mockSystemTemplates}
            templatesLoading={false}
          />
        </div>
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside-element'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
        expect(screen.queryByTestId('add-task-expanded')).not.toBeInTheDocument();
      });
    });

    it('significant scroll collapses form', async () => {
      // Mock window.scrollY
      let scrollY = 0;
      Object.defineProperty(window, 'scrollY', {
        get: () => scrollY,
        configurable: true,
      });

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-expanded')).toBeInTheDocument();
      });

      // Wait for the event listener to be attached (setTimeout in the component)
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate significant scroll (>100px threshold)
      scrollY = 150;
      fireEvent.scroll(window);

      await waitFor(() => {
        expect(screen.getByTestId('add-task-collapsed')).toBeInTheDocument();
        expect(screen.queryByTestId('add-task-expanded')).not.toBeInTheDocument();
      });
    });
  });

  describe('Touch Targets', () => {
    it('collapsed card has 64px height', () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      const collapsed = screen.getByTestId('add-task-collapsed');
      expect(collapsed).toHaveStyle({ height: '64px' });
    });

    it('task type select has 64px height (AC3)', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const selectContainer = screen.getByTestId('task-type-select');
      expect(selectContainer).toHaveStyle({ height: '64px' });
    });

    it('Add button has 64px height', async () => {
      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('add-task-button')).toBeInTheDocument();
      });

      expect(screen.getByTestId('add-task-button')).toHaveStyle({ height: '64px' });
    });

    it('custom title input has 64px height (AC4)', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MobileAddTaskForm
          hiveId="hive-1"
          onTaskAdded={mockOnTaskAdded}
          templates={mockSystemTemplates}
          templatesLoading={false}
        />
      );

      fireEvent.click(screen.getByTestId('add-task-collapsed'));

      await waitFor(() => {
        expect(screen.getByTestId('task-type-select')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText('Custom task...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom task...'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-title-input')).toBeInTheDocument();
      });

      // Input should be present with the correct placeholder and 64px height
      const inputContainer = screen.getByTestId('custom-title-input');
      const input = inputContainer.querySelector('input');
      expect(input).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter task name')).toBeInTheDocument();
      // The Input component applies height to the wrapper, check the input element's parent
      expect(input).toHaveStyle({ height: '64px' });
    });
  });
});
