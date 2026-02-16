/**
 * Tests for MobileTaskCompletionSheet component
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MobileTaskCompletionSheet } from '../../src/components/MobileTaskCompletionSheet';
import { Task } from '../../src/hooks/useTasks';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock task with auto_effects prompts
const taskWithPrompts: Task = {
  id: 'task-1',
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

// Task with number prompts
const taskWithNumberPrompt: Task = {
  id: 'task-2',
  hive_id: 'hive-1',
  title: 'Add Supers',
  priority: 'medium',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  source: 'manual',
  auto_effects: {
    prompts: [
      {
        key: 'count',
        label: 'Number of supers',
        type: 'number',
        required: true,
      },
    ],
    updates: [
      { target: 'hive.supers', action: 'increment' },
    ],
  },
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

describe('MobileTaskCompletionSheet', () => {
  const mockOnClose = vi.fn();
  const mockOnComplete = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with task name in header', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    expect(screen.getByText(/Complete Task: Requeen/)).toBeInTheDocument();
  });

  it('renders prompts from auto_effects', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    expect(screen.getByText('Queen marking color')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByTestId('prompts-section')).toBeInTheDocument();
  });

  it('renders preview section with updates', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    expect(screen.getByTestId('preview-section')).toBeInTheDocument();
    expect(screen.getByText('This will update:')).toBeInTheDocument();
  });

  it('has Complete button disabled when required prompts are empty', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    const completeButton = screen.getByTestId('complete-task-button');
    expect(completeButton).toBeDisabled();
  });

  it('enables Complete button when required prompts are filled', async () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    // Select a color (required field)
    const yellowButton = screen.getByTestId('color-option-yellow');
    fireEvent.click(yellowButton);

    await waitFor(() => {
      const completeButton = screen.getByTestId('complete-task-button');
      expect(completeButton).not.toBeDisabled();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    const cancelButton = screen.getByTestId('cancel-button');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onComplete with completion_data when submitted', async () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    // Fill the required color prompt
    const yellowButton = screen.getByTestId('color-option-yellow');
    fireEvent.click(yellowButton);

    // Submit
    await waitFor(() => {
      const completeButton = screen.getByTestId('complete-task-button');
      expect(completeButton).not.toBeDisabled();
    });

    const completeButton = screen.getByTestId('complete-task-button');
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'yellow' })
      );
    });
  });

  it('shows loading state when completing', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={true}
      />
    );

    const completeButton = screen.getByTestId('complete-task-button');
    expect(completeButton).toBeDisabled();
    expect(completeButton).toHaveTextContent('Complete Task');
  });

  it('renders number prompts correctly', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithNumberPrompt}
        visible={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    expect(screen.getByText('Number of supers')).toBeInTheDocument();
    expect(screen.getByTestId('increment-button')).toBeInTheDocument();
    expect(screen.getByTestId('decrement-button')).toBeInTheDocument();
  });

  it('does not render when visible is false', () => {
    renderWithTheme(
      <MobileTaskCompletionSheet
        task={taskWithPrompts}
        visible={false}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
        completing={false}
      />
    );

    expect(screen.queryByTestId('mobile-task-completion-sheet')).not.toBeInTheDocument();
  });
});
