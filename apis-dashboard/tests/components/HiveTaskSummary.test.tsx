/**
 * HiveTaskSummary Component Tests
 *
 * Tests for the task summary display on hive detail page.
 *
 * Part of Epic 14, Story 14.6: Portal Hive Detail Task Count Integration
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HiveTaskSummary } from '../../src/components/HiveTaskSummary';
import { colors } from '../../src/theme/apisTheme';

describe('HiveTaskSummary', () => {
  const defaultProps = {
    open: 3,
    overdue: 1,
  };

  it('renders correct format with open and overdue counts', () => {
    render(<HiveTaskSummary {...defaultProps} />);

    expect(screen.getByText('Tasks:')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/open/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('displays overdue count in red when > 0', () => {
    render(<HiveTaskSummary {...defaultProps} overdue={2} />);

    // Find the overdue count element
    const overdueCount = screen.getByText('2');
    // The color should be the error color from theme
    expect(overdueCount).toHaveStyle({ color: colors.error });
  });

  it('does not style overdue count in red when = 0', () => {
    render(<HiveTaskSummary {...defaultProps} overdue={0} />);

    // When overdue is 0, it should not have the error color
    const overdueCount = screen.getByText('0');
    // Check it doesn't have the red color style
    expect(overdueCount).not.toHaveStyle({ color: colors.error });
  });

  it('triggers onClick callback when clicked', () => {
    const handleClick = vi.fn();
    render(<HiveTaskSummary {...defaultProps} onClick={handleClick} />);

    // Click on the container
    const container = screen.getByRole('button');
    fireEvent.click(container);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows "No tasks" when counts are both 0', () => {
    render(<HiveTaskSummary open={0} overdue={0} />);

    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('is accessible with keyboard navigation when clickable', () => {
    const handleClick = vi.fn();
    render(<HiveTaskSummary {...defaultProps} onClick={handleClick} />);

    const container = screen.getByRole('button');

    // Should have tabIndex for keyboard focus
    expect(container).toHaveAttribute('tabIndex', '0');

    // Enter key should trigger click
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Space key should also trigger click
    fireEvent.keyDown(container, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('has correct aria-label with dynamic counts', () => {
    const handleClick = vi.fn();
    render(<HiveTaskSummary open={5} overdue={2} onClick={handleClick} />);

    const container = screen.getByRole('button');
    // Verify aria-label contains the actual dynamic values
    expect(container).toHaveAttribute('aria-label', 'Tasks: 5 open, 2 overdue');
  });

  it('does not have button role when no onClick provided', () => {
    render(<HiveTaskSummary {...defaultProps} onClick={undefined} />);

    // Should not have button role when not clickable
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows cursor pointer when clickable', () => {
    const handleClick = vi.fn();
    render(<HiveTaskSummary {...defaultProps} onClick={handleClick} />);

    const container = screen.getByRole('button');
    expect(container).toHaveStyle({ cursor: 'pointer' });
  });

  it('handles high task counts', () => {
    render(<HiveTaskSummary open={99} overdue={50} />);

    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });
});
