/**
 * HiveDetailMobile Component Tests
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HiveDetailMobile, HiveDetailMobileHive } from '../../src/components/HiveDetailMobile';

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

// Mock MobileTasksSection to avoid its deep hook dependencies
vi.mock('../../src/components/MobileTasksSection', () => ({
  MobileTasksSection: ({ hiveId }: { hiveId: string }) => (
    <div data-testid="mobile-tasks-section">Tasks for {hiveId}</div>
  ),
}));

// Mock BottomAnchorNav
vi.mock('../../src/components/BottomAnchorNav', () => ({
  BottomAnchorNav: () => <nav aria-label="Section navigation">Nav Mock</nav>,
}));

// Mock useActiveSection hook
vi.mock('../../src/hooks/useActiveSection', () => ({
  useActiveSection: vi.fn(() => ({
    activeSection: 'status-section',
    scrollToSection: vi.fn(),
  })),
}));

// Mock scrollIntoView
const mockScrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;

describe('HiveDetailMobile', () => {
  const mockHive: HiveDetailMobileHive = {
    id: 'hive-1',
    site_id: 'site-1',
    name: 'Test Hive',
    queen_introduced_at: '2024-01-15',
    queen_source: 'breeder',
    brood_boxes: 2,
    honey_supers: 1,
    notes: 'Test notes',
    queen_history: [],
    box_changes: [],
    hive_status: 'active',
    lost_at: null,
    task_summary: { open: 3, overdue: 1 },
    last_inspection_at: '2024-01-20',
    created_at: '2024-01-01',
    updated_at: '2024-01-20',
  };

  const mockHandlers = {
    onBack: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onNewInspection: vi.fn(),
    onReplaceQueen: vi.fn(),
    onMarkLost: vi.fn(),
    onShowQR: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('section rendering', () => {
    it('renders all three sections', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      // Status section
      expect(document.getElementById('status-section')).toBeInTheDocument();

      // Tasks section header - SectionHeader renders "TASKS (3)" via displayText
      expect(screen.getByText('TASKS (3)')).toBeInTheDocument();
      expect(document.getElementById('tasks-section')).toBeInTheDocument();

      // Inspect section header
      expect(screen.getByText('INSPECT')).toBeInTheDocument();
      expect(document.getElementById('inspect-section')).toBeInTheDocument();
    });

    it('renders hive name in header', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      expect(screen.getByText('Test Hive')).toBeInTheDocument();
    });

    it('renders queen information when available', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      expect(screen.getByText('Breeder')).toBeInTheDocument();
      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    });

    it('renders box configuration', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      expect(screen.getByText('Brood 1')).toBeInTheDocument();
      expect(screen.getByText('Brood 2')).toBeInTheDocument();
      expect(screen.getByText('Super 1')).toBeInTheDocument();
      expect(screen.getByText('2 brood, 1 super')).toBeInTheDocument();
    });

    it('renders task summary', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      // Task summary displays in the format "Tasks: X open - Y overdue"
      expect(screen.getByText('Tasks:')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // open count
      expect(screen.getByText('1')).toBeInTheDocument(); // overdue count
    });

    it('renders last inspection date', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      expect(screen.getByText('Last Inspection:')).toBeInTheDocument();
      // The getLastInspectionText utility will show days ago text
    });
  });

  describe('section anchor IDs', () => {
    it('status section has correct ID and accessibility attributes', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const statusSection = document.getElementById('status-section');
      expect(statusSection).toBeInTheDocument();
      expect(statusSection?.tagName.toLowerCase()).toBe('section');
      expect(statusSection).toHaveAttribute('role', 'region');
      expect(statusSection).toHaveAttribute('aria-labelledby', 'status-section-title');
    });

    it('tasks section wrapper has correct ID for scroll targeting', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const tasksSection = document.getElementById('tasks-section');
      expect(tasksSection).toBeInTheDocument();
      expect(tasksSection?.tagName.toLowerCase()).toBe('section');
    });

    it('inspect section wrapper has correct ID for scroll targeting', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const inspectSection = document.getElementById('inspect-section');
      expect(inspectSection).toBeInTheDocument();
      expect(inspectSection?.tagName.toLowerCase()).toBe('section');
    });
  });

  describe('Start New Inspection button', () => {
    it('renders with 64px height for touch-friendly sizing', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const inspectionButton = screen.getByRole('button', { name: /start new inspection/i });
      expect(inspectionButton).toHaveStyle({ height: '64px' });
    });

    it('calls onNewInspection when clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const inspectionButton = screen.getByRole('button', { name: /start new inspection/i });
      fireEvent.click(inspectionButton);

      expect(mockHandlers.onNewInspection).toHaveBeenCalledTimes(1);
    });

    it('is not rendered for lost hives', () => {
      const lostHive = {
        ...mockHive,
        hive_status: 'lost' as const,
        lost_at: '2024-01-18',
      };

      render(<HiveDetailMobile hive={lostHive} {...mockHandlers} />);

      expect(screen.queryByRole('button', { name: /start new inspection/i })).not.toBeInTheDocument();
    });
  });

  describe('inspection history accordion', () => {
    it('renders inspection history in collapsible accordion', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      // The collapse header should be visible
      expect(screen.getByText('Inspection History')).toBeInTheDocument();

      // Click the accordion to expand it
      const accordionHeader = screen.getByText('Inspection History');
      fireEvent.click(accordionHeader);

      // After expanding, the mock content should be visible
      expect(screen.getByTestId('inspection-history')).toBeInTheDocument();
    });
  });

  describe('navigation handlers', () => {
    it('calls onBack when back button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      expect(mockHandlers.onBack).toHaveBeenCalledTimes(1);
    });

    it('calls onEdit when edit button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      expect(mockHandlers.onEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onDelete when delete button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(mockHandlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it('calls onShowQR when QR button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const qrButton = screen.getByRole('button', { name: /qr/i });
      fireEvent.click(qrButton);

      expect(mockHandlers.onShowQR).toHaveBeenCalledTimes(1);
    });

    it('calls onMarkLost when Lost button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const lostButton = screen.getByRole('button', { name: /lost/i });
      fireEvent.click(lostButton);

      expect(mockHandlers.onMarkLost).toHaveBeenCalledTimes(1);
    });

    it('calls onReplaceQueen when Replace button is clicked', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      const replaceButton = screen.getByRole('button', { name: /replace/i });
      fireEvent.click(replaceButton);

      expect(mockHandlers.onReplaceQueen).toHaveBeenCalledTimes(1);
    });
  });

  describe('lost hive display', () => {
    it('shows LostHiveBadge for lost hives', () => {
      const lostHive = {
        ...mockHive,
        hive_status: 'lost' as const,
        lost_at: '2024-01-18',
      };

      render(<HiveDetailMobile hive={lostHive} {...mockHandlers} />);

      // LostHiveBadge should be rendered (it displays the lost date)
      // The badge shows "Lost" text
      expect(screen.getByText(/lost/i)).toBeInTheDocument();
    });

    it('hides action buttons for lost hives', () => {
      const lostHive = {
        ...mockHive,
        hive_status: 'lost' as const,
        lost_at: '2024-01-18',
      };

      render(<HiveDetailMobile hive={lostHive} {...mockHandlers} />);

      // Edit, QR, and Mark Lost buttons should not be visible
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^qr$/i })).not.toBeInTheDocument();
    });
  });

  describe('tasks section with MobileTasksSection', () => {
    it('renders MobileTasksSection with hive id', () => {
      render(<HiveDetailMobile hive={mockHive} {...mockHandlers} />);

      expect(screen.getByTestId('mobile-tasks-section')).toBeInTheDocument();
      expect(screen.getByText('Tasks for hive-1')).toBeInTheDocument();
    });
  });

  describe('no queen info', () => {
    it('shows empty state when no queen info', () => {
      const hiveNoQueen = {
        ...mockHive,
        queen_introduced_at: null,
        queen_source: null,
      };

      render(<HiveDetailMobile hive={hiveNoQueen} {...mockHandlers} />);

      expect(screen.getByText('No queen info')).toBeInTheDocument();
    });
  });
});
