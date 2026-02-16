/**
 * OverdueAlertBanner Component Tests
 *
 * Tests for the overdue alert banner component.
 * Part of Epic 14, Story 14.14 (Overdue Alerts + Navigation Badge)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverdueAlertBanner } from '../../src/components/OverdueAlertBanner';

describe('OverdueAlertBanner component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('shows banner when overdueCount > 0', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/You have 3 overdue tasks/)).toBeInTheDocument();
    });

    it('hides banner when overdueCount = 0', () => {
      render(<OverdueAlertBanner overdueCount={0} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('uses singular "task" when overdueCount = 1', () => {
      render(<OverdueAlertBanner overdueCount={1} />);

      expect(screen.getByText(/You have 1 overdue task$/)).toBeInTheDocument();
    });

    it('uses plural "tasks" when overdueCount > 1', () => {
      render(<OverdueAlertBanner overdueCount={5} />);

      expect(screen.getByText(/You have 5 overdue tasks/)).toBeInTheDocument();
    });
  });

  describe('dismissal', () => {
    it('dismisses banner when close button clicked', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      // Find and click the close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Banner should be hidden
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('dismissed state persists within session', () => {
      const { rerender } = render(<OverdueAlertBanner overdueCount={3} />);

      // Dismiss the banner
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Re-render with same count (simulating navigation back)
      rerender(<OverdueAlertBanner overdueCount={3} />);

      // Banner should still be hidden (dismissed state persists)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('View link', () => {
    it('shows View link when onView callback provided', () => {
      const onView = vi.fn();
      render(<OverdueAlertBanner overdueCount={3} onView={onView} />);

      expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
    });

    it('hides View link when no onView callback', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      expect(screen.queryByRole('button', { name: /view/i })).not.toBeInTheDocument();
    });

    it('calls onView callback when View link clicked', () => {
      const onView = vi.fn();
      render(<OverdueAlertBanner overdueCount={3} onView={onView} />);

      fireEvent.click(screen.getByRole('button', { name: /view/i }));

      expect(onView).toHaveBeenCalledTimes(1);
    });
  });

  describe('styling', () => {
    it('has warning type alert', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('ant-alert-warning');
    });

    it('is closable', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('includes warning icon', () => {
      render(<OverdueAlertBanner overdueCount={3} />);

      // Warning icon should be in the message (use data-testid)
      expect(screen.getByTestId('overdue-alert-icon')).toBeInTheDocument();
    });
  });
});

describe('OverdueAlertBanner integration', () => {
  it('matches expected behavior for navigation badge usage', () => {
    // Document the relationship between navigation badge and alert banner
    // Both use the same overdue count from useTaskStats
    const overdueCount = 3;

    // Navigation badge: shows count > 0
    const shouldShowBadge = overdueCount > 0;
    expect(shouldShowBadge).toBe(true);

    // Alert banner: shows when count > 0
    const { container } = render(<OverdueAlertBanner overdueCount={overdueCount} />);
    expect(container.querySelector('.ant-alert')).toBeInTheDocument();
  });

  it('both badge and banner hidden when overdue = 0', () => {
    const overdueCount = 0;

    // Navigation badge: hidden when count = 0
    const shouldShowBadge = overdueCount > 0;
    expect(shouldShowBadge).toBe(false);

    // Alert banner: hidden when count = 0
    const { container } = render(<OverdueAlertBanner overdueCount={overdueCount} />);
    expect(container.querySelector('.ant-alert')).not.toBeInTheDocument();
  });
});
