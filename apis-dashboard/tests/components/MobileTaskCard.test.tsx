/**
 * Unit tests for MobileTaskCard component
 *
 * Part of Epic 14, Story 14.9: Mobile Tasks Section View
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTaskCard } from '../../src/components/MobileTaskCard';
import { Task } from '../../src/hooks/useTasks';

// Mock task factory for tests
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  hive_id: 'hive-1',
  title: 'Requeen hive',
  priority: 'high',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  ...overrides,
});

describe('MobileTaskCard', () => {
  const defaultProps = {
    expanded: false,
    onToggle: vi.fn(),
    onComplete: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders task name correctly', () => {
      const task = createMockTask({ title: 'Check for varroa' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.getByText('Check for varroa')).toBeInTheDocument();
    });

    it('renders custom_title when set', () => {
      const task = createMockTask({
        title: 'Default Title',
        custom_title: 'Custom Task Name',
      });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.getByText('Custom Task Name')).toBeInTheDocument();
      expect(screen.queryByText('Default Title')).not.toBeInTheDocument();
    });

    it('renders title when custom_title is not set', () => {
      const task = createMockTask({ title: 'Regular Title' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.getByText('Regular Title')).toBeInTheDocument();
    });
  });

  describe('Priority Indicator', () => {
    it('shows red circle emoji for urgent priority', () => {
      const task = createMockTask({ priority: 'urgent' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      const indicator = screen.getByTestId('priority-indicator');
      expect(indicator).toHaveTextContent('\uD83D\uDD34'); // Red circle
    });

    it('shows orange circle emoji for high priority', () => {
      const task = createMockTask({ priority: 'high' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      const indicator = screen.getByTestId('priority-indicator');
      expect(indicator).toHaveTextContent('\uD83D\uDFE0'); // Orange circle
    });

    it('shows green circle emoji for medium priority', () => {
      const task = createMockTask({ priority: 'medium' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      const indicator = screen.getByTestId('priority-indicator');
      expect(indicator).toHaveTextContent('\uD83D\uDFE2'); // Green circle
    });

    it('shows white circle emoji for low priority', () => {
      const task = createMockTask({ priority: 'low' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      const indicator = screen.getByTestId('priority-indicator');
      expect(indicator).toHaveTextContent('\u26AA'); // White circle
    });
  });

  describe('Due Date Display', () => {
    it('shows due date when set', () => {
      const task = createMockTask({ due_date: '2026-02-15' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.getByTestId('due-date')).toHaveTextContent('Feb 15');
    });

    it('hides due date when not set', () => {
      const task = createMockTask({ due_date: undefined });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.queryByTestId('due-date')).not.toBeInTheDocument();
    });

    it('formats due date as short month and day', () => {
      const task = createMockTask({ due_date: '2026-01-01' });
      render(<MobileTaskCard task={task} {...defaultProps} />);

      expect(screen.getByTestId('due-date')).toHaveTextContent('Jan 1');
    });
  });

  describe('Expandable Behavior', () => {
    it('does not show expanded details when collapsed', () => {
      const task = createMockTask({
        description: 'Task description here',
      });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={false} />);

      expect(screen.queryByTestId('expanded-details')).not.toBeInTheDocument();
    });

    it('expands on tap showing description, notes, created date', () => {
      const task = createMockTask({
        description: 'Check all frames for varroa mites',
        notes: 'Use sticky board method',
        created_at: '2026-01-15T10:30:00Z',
      });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      expect(screen.getByTestId('expanded-details')).toBeInTheDocument();
      expect(screen.getByTestId('task-description')).toHaveTextContent('Check all frames for varroa mites');
      expect(screen.getByTestId('task-notes')).toHaveTextContent('Notes: Use sticky board method');
      expect(screen.getByTestId('created-date')).toHaveTextContent('Created: Jan 15, 2026');
    });

    it('collapses on second tap (onToggle is called)', () => {
      const onToggle = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} onToggle={onToggle} />);

      const header = screen.getByTestId('task-card-header');
      fireEvent.click(header);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('calls onToggle when header is clicked', () => {
      const onToggle = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} onToggle={onToggle} />);

      const header = screen.getByTestId('task-card-header');
      fireEvent.click(header);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('BeeBrain Source Indicator', () => {
    it('shows BeeBrain source indicator for beebrain tasks', () => {
      const task = createMockTask({ source: 'beebrain' });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      const sourceIndicator = screen.getByTestId('source-indicator');
      expect(sourceIndicator).toHaveTextContent('Suggested by BeeBrain');
    });

    it('shows Manual source indicator for non-beebrain tasks', () => {
      const task = createMockTask({ source: 'manual' });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      const sourceIndicator = screen.getByTestId('source-indicator');
      expect(sourceIndicator).toHaveTextContent('Manual');
    });

    it('shows Manual source for tasks without source property', () => {
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      const sourceIndicator = screen.getByTestId('source-indicator');
      expect(sourceIndicator).toHaveTextContent('Manual');
    });
  });

  describe('Action Buttons', () => {
    it('Complete button calls onComplete handler', () => {
      const onComplete = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} onComplete={onComplete} />);

      const completeButton = screen.getByTestId('complete-button');
      fireEvent.click(completeButton);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('Complete button does not trigger onToggle', () => {
      const onToggle = vi.fn();
      const onComplete = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} onToggle={onToggle} onComplete={onComplete} />);

      const completeButton = screen.getByTestId('complete-button');
      fireEvent.click(completeButton);

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('Delete link calls onDelete handler', () => {
      const onDelete = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} onDelete={onDelete} />);

      const deleteButton = screen.getByTestId('delete-button');
      fireEvent.click(deleteButton);

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('Delete link does not trigger onToggle', () => {
      const onToggle = vi.fn();
      const onDelete = vi.fn();
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} onToggle={onToggle} onDelete={onDelete} />);

      const deleteButton = screen.getByTestId('delete-button');
      fireEvent.click(deleteButton);

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('buttons are only visible when expanded', () => {
      const task = createMockTask();
      const { rerender } = render(<MobileTaskCard task={task} {...defaultProps} expanded={false} />);

      expect(screen.queryByTestId('complete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();

      rerender(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      expect(screen.getByTestId('complete-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-button')).toBeInTheDocument();
    });
  });

  describe('Touch Target Sizing', () => {
    it('Complete button has 64px height for glove-friendly touch', () => {
      const task = createMockTask();
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      const completeButton = screen.getByTestId('complete-button');
      expect(completeButton).toHaveStyle({ height: '64px' });
    });
  });

  describe('Description and Notes', () => {
    it('does not show description section when description is empty', () => {
      const task = createMockTask({ description: undefined });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      expect(screen.queryByTestId('task-description')).not.toBeInTheDocument();
    });

    it('does not show notes section when notes is empty', () => {
      const task = createMockTask({ notes: undefined });
      render(<MobileTaskCard task={task} {...defaultProps} expanded={true} />);

      expect(screen.queryByTestId('task-notes')).not.toBeInTheDocument();
    });
  });
});
