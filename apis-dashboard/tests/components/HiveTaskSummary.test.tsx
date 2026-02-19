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

describe('HiveTaskSummary', () => {
  const defaultProps = {
    open: 3,
    overdue: 1,
  };

  it('renders correct format with open and overdue counts', () => {
    render(<HiveTaskSummary {...defaultProps} />);

    // Text format: "Tasks: {open} open · {overdue} overdue"
    expect(screen.getByText(/Tasks: 3 open/)).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument();
  });

  it('displays overdue count in muted-rose when > 0', () => {
    render(<HiveTaskSummary {...defaultProps} overdue={2} />);

    // Find the overdue span element
    const overdueSpan = screen.getByText(/2 overdue/);
    // The color should be muted-rose (#c4857a) per v2 mockup
    expect(overdueSpan).toHaveStyle({ color: '#c4857a' });
  });

  it('does not show overdue when count is 0', () => {
    render(<HiveTaskSummary {...defaultProps} overdue={0} />);

    // When overdue is 0, the overdue section is not rendered
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
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

    expect(screen.getByText(/Tasks: 99 open/)).toBeInTheDocument();
    expect(screen.getByText(/50 overdue/)).toBeInTheDocument();
  });
});
