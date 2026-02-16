/**
 * Unit tests for BottomAnchorNav component
 *
 * Tests the fixed bottom navigation bar for mobile hive detail.
 *
 * Part of Epic 14, Story 14.8: Mobile Bottom Anchor Navigation Bar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomAnchorNav } from '../../src/components/BottomAnchorNav';
import type { SectionId } from '../../src/hooks/useActiveSection';

describe('BottomAnchorNav', () => {
  const defaultProps = {
    activeSection: 'status-section' as SectionId,
    onNavigate: vi.fn(),
    taskCount: 5,
    hasOverdue: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render three buttons (Status, Tasks, Inspect)', () => {
      render(<BottomAnchorNav {...defaultProps} />);

      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Tasks (5)')).toBeInTheDocument();
      expect(screen.getByText('Inspect')).toBeInTheDocument();
    });

    it('should have navigation role and aria-label', () => {
      render(<BottomAnchorNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Section navigation');
    });
  });

  describe('active button styling', () => {
    it('should style active button with seaBuckthorn background', () => {
      render(<BottomAnchorNav {...defaultProps} activeSection="status-section" />);

      const statusButton = screen.getByText('Status').closest('button');
      expect(statusButton).toHaveStyle({ backgroundColor: '#f7a42d' });
    });

    it('should mark active button with aria-current', () => {
      render(<BottomAnchorNav {...defaultProps} activeSection="status-section" />);

      const statusButton = screen.getByText('Status').closest('button');
      expect(statusButton).toHaveAttribute('aria-current', 'true');
    });

    it('should not mark inactive buttons with aria-current', () => {
      render(<BottomAnchorNav {...defaultProps} activeSection="status-section" />);

      const tasksButton = screen.getByText('Tasks (5)').closest('button');
      expect(tasksButton).not.toHaveAttribute('aria-current');

      const inspectButton = screen.getByText('Inspect').closest('button');
      expect(inspectButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('inactive button styling', () => {
    it('should style inactive buttons differently from active', () => {
      render(<BottomAnchorNav {...defaultProps} activeSection="status-section" />);

      const statusButton = screen.getByText('Status').closest('button');
      const tasksButton = screen.getByText('Tasks (5)').closest('button');

      // Active button has seaBuckthorn background
      expect(statusButton).toHaveStyle({ backgroundColor: '#f7a42d' });
      // Inactive button should NOT have the active color
      expect(tasksButton).not.toHaveStyle({ backgroundColor: '#f7a42d' });
    });

    it('should style inactive buttons with textMuted color', () => {
      render(<BottomAnchorNav {...defaultProps} activeSection="status-section" />);

      const tasksButton = screen.getByText('Tasks (5)').closest('button');
      expect(tasksButton).toHaveStyle({ color: '#8b6914' });
    });
  });

  describe('task count display', () => {
    it('should display task count in Tasks button label', () => {
      render(<BottomAnchorNav {...defaultProps} taskCount={12} />);

      expect(screen.getByText('Tasks (12)')).toBeInTheDocument();
    });

    it('should display zero task count', () => {
      render(<BottomAnchorNav {...defaultProps} taskCount={0} />);

      expect(screen.getByText('Tasks (0)')).toBeInTheDocument();
    });
  });

  describe('overdue indicator', () => {
    it('should display red dot when hasOverdue is true', () => {
      render(<BottomAnchorNav {...defaultProps} hasOverdue={true} />);

      const overdueDot = screen.getByLabelText('Has overdue tasks');
      expect(overdueDot).toBeInTheDocument();
      expect(overdueDot).toHaveStyle({ backgroundColor: '#c23616' });
    });

    it('should not display red dot when hasOverdue is false', () => {
      render(<BottomAnchorNav {...defaultProps} hasOverdue={false} />);

      expect(screen.queryByLabelText('Has overdue tasks')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should call onNavigate with status-section when Status button is clicked', () => {
      const onNavigate = vi.fn();
      render(<BottomAnchorNav {...defaultProps} onNavigate={onNavigate} />);

      fireEvent.click(screen.getByText('Status'));

      expect(onNavigate).toHaveBeenCalledWith('status-section');
    });

    it('should call onNavigate with tasks-section when Tasks button is clicked', () => {
      const onNavigate = vi.fn();
      render(<BottomAnchorNav {...defaultProps} onNavigate={onNavigate} />);

      fireEvent.click(screen.getByText('Tasks (5)'));

      expect(onNavigate).toHaveBeenCalledWith('tasks-section');
    });

    it('should call onNavigate with inspect-section when Inspect button is clicked', () => {
      const onNavigate = vi.fn();
      render(<BottomAnchorNav {...defaultProps} onNavigate={onNavigate} />);

      fireEvent.click(screen.getByText('Inspect'));

      expect(onNavigate).toHaveBeenCalledWith('inspect-section');
    });
  });

  describe('positioning styles', () => {
    it('should have fixed positioning at bottom', () => {
      render(<BottomAnchorNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveStyle({
        position: 'fixed',
        bottom: '0px',
      });
    });

    it('should have height of 64px', () => {
      render(<BottomAnchorNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveStyle({ height: '64px' });
    });

    it('should have z-index for visibility above content', () => {
      render(<BottomAnchorNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveStyle({ zIndex: '1000' });
    });
  });

  describe('custom styles', () => {
    it('should accept and apply style prop', () => {
      const customStyle = { marginBottom: '10px' };
      const { container } = render(
        <BottomAnchorNav
          {...defaultProps}
          style={customStyle}
        />
      );

      // Verify nav renders and custom style is applied
      const nav = container.querySelector('nav');
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveStyle({ marginBottom: '10px' });
    });
  });
});
