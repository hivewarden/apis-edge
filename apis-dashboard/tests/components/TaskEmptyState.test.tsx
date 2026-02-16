/**
 * Unit tests for TaskEmptyState component
 *
 * Part of Epic 14, Story 14.9: Mobile Tasks Section View
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskEmptyState } from '../../src/components/TaskEmptyState';

describe('TaskEmptyState', () => {
  describe('Basic Rendering', () => {
    it('renders the empty state container', () => {
      render(<TaskEmptyState />);

      expect(screen.getByTestId('task-empty-state')).toBeInTheDocument();
    });

    it('renders icon', () => {
      render(<TaskEmptyState />);

      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    });

    it('renders title text "No tasks for this hive"', () => {
      render(<TaskEmptyState />);

      expect(screen.getByTestId('empty-state-title')).toHaveTextContent('No tasks for this hive');
    });

    it('renders subtext about adding tasks', () => {
      render(<TaskEmptyState />);

      expect(screen.getByTestId('empty-state-subtext')).toHaveTextContent(
        'Plan your next visit by adding a task below'
      );
    });
  });

  describe('Styling', () => {
    it('applies custom style when provided', () => {
      render(<TaskEmptyState style={{ marginTop: 100 }} />);

      const container = screen.getByTestId('task-empty-state');
      expect(container).toHaveStyle({ marginTop: '100px' });
    });

    it('centers content', () => {
      render(<TaskEmptyState />);

      const container = screen.getByTestId('task-empty-state');
      expect(container).toHaveStyle({ textAlign: 'center' });
      expect(container).toHaveStyle({ alignItems: 'center' });
    });
  });

  describe('Accessibility', () => {
    it('has appropriate heading level for title', () => {
      render(<TaskEmptyState />);

      const title = screen.getByTestId('empty-state-title');
      expect(title.tagName).toBe('H5');
    });
  });
});
