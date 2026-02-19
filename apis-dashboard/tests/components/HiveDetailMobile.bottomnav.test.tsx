/**
 * Integration tests for HiveDetailMobile with BottomAnchorNav
 *
 * Tests the integration between HiveDetailMobile component and
 * the bottom anchor navigation bar.
 *
 * Part of Epic 14, Story 14.8: Mobile Bottom Anchor Navigation Bar
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HiveDetailMobile, HiveDetailMobileHive } from '../../src/components/HiveDetailMobile';

/**
 * Wrapper component that provides required contexts for testing
 */
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

// Mock child components that make API calls
vi.mock('../../src/components/InspectionHistory', () => ({
  InspectionHistory: () => <div data-testid="inspection-history">Inspection History Mock</div>,
}));

vi.mock('../../src/components/HiveBeeBrainCard', () => ({
  HiveBeeBrainCard: () => <div data-testid="beebrain-card">BeeBrain Card Mock</div>,
}));

vi.mock('../../src/components/ActivityFeedCard', () => ({
  ActivityFeedCard: () => <div data-testid="activity-feed">Activity Feed Mock</div>,
}));

// Mock MobileTasksSection to avoid deep hook dependencies
vi.mock('../../src/components/MobileTasksSection', () => ({
  MobileTasksSection: ({ hiveId }: { hiveId: string }) => (
    <div data-testid="mobile-tasks-section">Tasks for {hiveId}</div>
  ),
}));

// Mock scrollTo
const mockScrollTo = vi.fn();

// Track the scrollToSection mock
const mockScrollToSection = vi.fn((sectionId: string) => {
  if (sectionId === 'status-section') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const element = document.getElementById(sectionId);
  if (element) {
    window.scrollTo({ top: 100, behavior: 'smooth' });
  }
});

// Mock useActiveSection hook
vi.mock('../../src/hooks/useActiveSection', () => ({
  useActiveSection: vi.fn(() => ({
    activeSection: 'status-section',
    scrollToSection: mockScrollToSection,
  })),
}));

describe('HiveDetailMobile with BottomAnchorNav', () => {
  const mockHive: HiveDetailMobileHive = {
    id: 'hive-1',
    site_id: 'site-1',
    name: 'Test Hive',
    queen_introduced_at: '2025-03-15',
    queen_source: 'purchased',
    brood_boxes: 2,
    honey_supers: 1,
    notes: null,
    queen_history: [],
    box_changes: [],
    hive_status: 'active',
    lost_at: null,
    task_summary: {
      open: 5,
      overdue: 2,
    },
    last_inspection_at: '2025-06-01',
    created_at: '2025-01-01',
    updated_at: '2025-06-01',
  };

  const defaultProps = {
    hive: mockHive,
    onBack: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onNewInspection: vi.fn(),
    onReplaceQueen: vi.fn(),
    onMarkLost: vi.fn(),
    onShowQR: vi.fn(),
  };

  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { value: mockScrollTo, writable: true });
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('BottomAnchorNav rendering', () => {
    it('should render BottomAnchorNav within HiveDetailMobile', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      // Check for navigation element
      const nav = screen.getByRole('navigation', { name: 'Section navigation' });
      expect(nav).toBeInTheDocument();
    });

    it('should render all three navigation buttons', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Tasks (5)')).toBeInTheDocument();
      expect(screen.getByText('Inspect')).toBeInTheDocument();
    });
  });

  describe('task count integration', () => {
    it('should pass task count to nav matching hive.task_summary.open', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      // Task count should be 5 as per mockHive.task_summary.open
      expect(screen.getByText('Tasks (5)')).toBeInTheDocument();
    });

    it('should display zero when no tasks', () => {
      const hiveNoTasks = {
        ...mockHive,
        task_summary: { open: 0, overdue: 0 },
      };
      render(<HiveDetailMobile {...defaultProps} hive={hiveNoTasks} />, { wrapper: TestWrapper });

      expect(screen.getByText('Tasks (0)')).toBeInTheDocument();
    });

    it('should handle undefined task_summary', () => {
      const hiveUndefinedTasks = {
        ...mockHive,
        task_summary: undefined,
      };
      render(<HiveDetailMobile {...defaultProps} hive={hiveUndefinedTasks} />, { wrapper: TestWrapper });

      expect(screen.getByText('Tasks (0)')).toBeInTheDocument();
    });
  });

  describe('overdue indicator integration', () => {
    it('should show overdue indicator when overdue > 0', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      // mockHive has overdue: 2
      const overdueDot = screen.getByLabelText('Has overdue tasks');
      expect(overdueDot).toBeInTheDocument();
    });

    it('should not show overdue indicator when overdue = 0', () => {
      const hiveNoOverdue = {
        ...mockHive,
        task_summary: { open: 5, overdue: 0 },
      };
      render(<HiveDetailMobile {...defaultProps} hive={hiveNoOverdue} />, { wrapper: TestWrapper });

      expect(screen.queryByLabelText('Has overdue tasks')).not.toBeInTheDocument();
    });
  });

  describe('navigation integration', () => {
    it('should call scrollToSection when nav button is clicked', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      // Click the Tasks button
      fireEvent.click(screen.getByText('Tasks (5)'));

      // Should have called scrollToSection
      expect(mockScrollToSection).toHaveBeenCalledWith('tasks-section');
    });

    it('should call scrollToSection with status-section when Status button is clicked', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      // Click Status button
      fireEvent.click(screen.getByText('Status'));

      // Should scroll to status section
      expect(mockScrollToSection).toHaveBeenCalledWith('status-section');
    });
  });

  describe('default state', () => {
    it('should have Status as default active section', () => {
      render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      const statusButton = screen.getByText('Status').closest('button');
      expect(statusButton).toHaveAttribute('aria-current', 'true');
    });
  });

  describe('layout considerations', () => {
    it('should have paddingBottom to account for bottom nav', () => {
      const { container } = render(<HiveDetailMobile {...defaultProps} />, { wrapper: TestWrapper });

      const mainDiv = container.querySelector('.hive-detail-mobile');
      expect(mainDiv).toBeInTheDocument();
      // Verify 80px paddingBottom is applied for bottom nav clearance
      expect(mainDiv).toHaveStyle({ paddingBottom: '80px' });
    });
  });
});
