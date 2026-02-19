/**
 * TaskCompletionModal Component Tests
 *
 * Tests for the task completion modal component including:
 * - Rendering prompts from auto_effects
 * - Required prompt validation
 * - Preview section for updates
 * - Form submission
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { TaskCompletionModal } from '../../src/components/TaskCompletionModal';
import type { Task } from '../../src/hooks/useTasks';

const mockTaskWithPrompts: Task = {
  id: 'task-1',
  hive_id: 'hive-1',
  hive_name: 'Hive Alpha',
  title: 'Requeen Colony',
  description: 'Replace the aging queen with a new one',
  priority: 'high',
  status: 'pending',
  due_date: '2026-02-01',
  created_at: '2026-01-29T10:00:00Z',
  auto_effects: {
    prompts: [
      {
        key: 'color',
        label: 'Queen marking color',
        type: 'select',
        required: true,
        options: [
          { value: 'white', label: 'White (2021, 2026)' },
          { value: 'yellow', label: 'Yellow (2022, 2027)' },
          { value: 'red', label: 'Red (2023, 2028)' },
          { value: 'green', label: 'Green (2024, 2029)' },
        ],
      },
      {
        key: 'notes',
        label: 'Additional notes',
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

const mockTaskWithNumberPrompt: Task = {
  id: 'task-2',
  hive_id: 'hive-2',
  hive_name: 'Hive Beta',
  title: 'Add Frames',
  priority: 'medium',
  status: 'pending',
  created_at: '2026-01-29T10:00:00Z',
  auto_effects: {
    prompts: [
      {
        key: 'frame_count',
        label: 'Number of frames to add',
        type: 'number',
        required: true,
      },
    ],
    updates: [
      { target: 'hive.frame_count', action: 'increment', value_from: 'completion_data.frame_count' },
    ],
  },
};

const mockTaskWithoutPrompts: Task = {
  id: 'task-3',
  hive_id: 'hive-3',
  hive_name: 'Hive Gamma',
  title: 'General Inspection',
  priority: 'low',
  status: 'pending',
  created_at: '2026-01-29T10:00:00Z',
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      {ui}
    </ConfigProvider>
  );
};

describe('TaskCompletionModal', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Rendering', () => {
    it('renders modal with task title', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText(/Complete Task: Requeen Colony/)).toBeInTheDocument();
    });

    it('displays task description when present', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Replace the aging queen with a new one')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={false}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByText(/Complete Task:/)).not.toBeInTheDocument();
    });

    it('does not render when task is null', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={null}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByText(/Complete Task:/)).not.toBeInTheDocument();
    });
  });

  describe('Prompt Rendering (AC6)', () => {
    it('renders select prompts as radio buttons', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Queen marking color')).toBeInTheDocument();
      expect(screen.getByText('White (2021, 2026)')).toBeInTheDocument();
      expect(screen.getByText('Yellow (2022, 2027)')).toBeInTheDocument();
    });

    it('renders text prompts as input fields', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Additional notes')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter additional notes/i)).toBeInTheDocument();
    });

    it('renders number prompts as number inputs', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithNumberPrompt}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Number of frames to add')).toBeInTheDocument();
    });

    it('marks required prompts with required indicator', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // Required field should have ant-form-item-required class (asterisk is via CSS ::before)
      const requiredLabels = document.querySelectorAll('.ant-form-item-required');
      expect(requiredLabels.length).toBeGreaterThan(0);
    });
  });

  describe('Required Prompt Validation (AC6)', () => {
    it('disables Complete button when required prompts are not filled', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const completeButton = screen.getByRole('button', { name: /Complete Task/i });
      expect(completeButton).toBeDisabled();
    });

    it('enables Complete button when required prompts are filled', async () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // Select a color option
      const yellowOption = screen.getByText('Yellow (2022, 2027)');
      fireEvent.click(yellowOption);

      await waitFor(() => {
        const completeButton = screen.getByRole('button', { name: /Complete Task/i });
        expect(completeButton).not.toBeDisabled();
      });
    });
  });

  describe('Preview Section (AC6)', () => {
    it('shows preview section with expected updates', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Preview Update')).toBeInTheDocument();
    });

    it('lists update actions in preview', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // Check for update descriptions
      expect(screen.getByText(/Set Queen Year/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('calls onComplete with completion data when submitted', async () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // Fill required field
      const yellowOption = screen.getByText('Yellow (2022, 2027)');
      fireEvent.click(yellowOption);

      await waitFor(() => {
        const completeButton = screen.getByRole('button', { name: /Complete Task/i });
        expect(completeButton).not.toBeDisabled();
      });

      // Submit form
      const completeButton = screen.getByRole('button', { name: /Complete Task/i });
      fireEvent.click(completeButton);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith(expect.objectContaining({
          color: 'yellow',
        }));
      });
    });

    it('calls onCancel when Cancel is clicked', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Task Without Prompts', () => {
    it('shows simple completion message for tasks without prompts', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithoutPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText(/Click "Complete Task" to mark this task as done/i)).toBeInTheDocument();
    });

    it('Complete button is enabled for tasks without required prompts', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithoutPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      const completeButton = screen.getByRole('button', { name: /Complete Task/i });
      expect(completeButton).not.toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('shows loading state on Complete button when completing', () => {
      renderWithProviders(
        <TaskCompletionModal
          open={true}
          task={mockTaskWithoutPrompts}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
          completing={true}
        />
      );

      const completeButton = screen.getByRole('button', { name: /Complete Task/i });
      expect(completeButton).toHaveClass('ant-btn-loading');
    });
  });
});
