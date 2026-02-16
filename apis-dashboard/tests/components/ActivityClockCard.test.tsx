/**
 * ActivityClockCard Component Tests
 *
 * Tests for the Activity Clock radar chart card.
 * Part of Epic 3, Story 3.5: Activity Clock Visualization
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { ActivityClockCard } from '../../src/components/ActivityClockCard';
import type { DetectionStats } from '../../src/hooks/useDetectionStats';
import { TimeRangeProvider } from '../../src/context';

// Mock the useDetectionStats hook
vi.mock('../../src/hooks/useDetectionStats', () => ({
  useDetectionStats: vi.fn(),
}));

// Mock @ant-design/charts Radar component
vi.mock('@ant-design/charts', () => ({
  Radar: vi.fn(({ data }) => (
    <div data-testid="radar-chart" data-points={data?.length || 0}>
      Mock Radar Chart
    </div>
  )),
}));

// Import the mocked hook
import { useDetectionStats } from '../../src/hooks/useDetectionStats';
const mockUseDetectionStats = useDetectionStats as ReturnType<typeof vi.fn>;

/**
 * Helper to render with required providers (MemoryRouter + TimeRangeProvider).
 */
function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {}
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TimeRangeProvider>{ui}</TimeRangeProvider>
    </MemoryRouter>
  );
}

/**
 * Sample detection stats for testing.
 */
const mockZeroStats: DetectionStats = {
  total_detections: 0,
  laser_activations: 0,
  hourly_breakdown: Array(24).fill(0),
  avg_confidence: null,
  first_detection: null,
  last_detection: null,
};

const mockDetectionStats: DetectionStats = {
  total_detections: 42,
  laser_activations: 38,
  hourly_breakdown: [0, 0, 0, 0, 0, 1, 2, 4, 6, 5, 4, 3, 3, 2, 2, 3, 4, 3, 0, 0, 0, 0, 0, 0],
  avg_confidence: 0.91,
  first_detection: '2026-01-25T05:15:00Z',
  last_detection: '2026-01-25T17:45:00Z',
};

/**
 * Helper to create mock hook result.
 */
interface MockHookResult {
  stats: DetectionStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function createMockHookResult(overrides: Partial<MockHookResult> = {}): MockHookResult {
  return {
    stats: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('ActivityClockCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('No site selected', () => {
    it('shows "Select a site" message when siteId is null', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      renderWithProviders(
          <ActivityClockCard siteId={null} />
      );

      expect(screen.getByText('Select a site to view activity patterns')).toBeInTheDocument();
    });

    it('shows clock icon when no site selected', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      renderWithProviders(
          <ActivityClockCard siteId={null} />
      );

      const clockIcon = document.querySelector('.anticon-clock-circle');
      expect(clockIcon).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading and no stats', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          loading: true,
          stats: null,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('Loading activity data...')).toBeInTheDocument();
    });

    it('shows spinning clock icon during loading', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          loading: true,
          stats: null,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const spinningIcon = document.querySelector('.anticon-clock-circle.anticon-spin');
      expect(spinningIcon).toBeInTheDocument();
    });
  });

  describe('Error state (I5 fix)', () => {
    it('shows error message when API fails', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          stats: null,
          loading: false,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('Failed to load activity data')).toBeInTheDocument();
    });

    it('shows warning icon when error occurs', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          stats: null,
          loading: false,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const warningIcon = document.querySelector('.anticon-warning');
      expect(warningIcon).toBeInTheDocument();
    });

    it('shows stale data if available when error occurs', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          stats: mockDetectionStats, // Has stale data
          loading: false,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      // Should show chart with stale data, not error
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load activity data')).not.toBeInTheDocument();
    });
  });

  describe('Empty state - no detections (AC3)', () => {
    it('shows "No activity recorded for this period" when zero detections', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('No activity recorded for this period')).toBeInTheDocument();
    });

    it('shows "Hourly Activity" title in empty state', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('Hourly Activity')).toBeInTheDocument();
    });
  });

  describe('Chart state with detections (AC1, AC2)', () => {
    it('renders radar chart with 24 data points', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const chart = screen.getByTestId('radar-chart');
      expect(chart).toBeInTheDocument();
      expect(chart).toHaveAttribute('data-points', '24');
    });

    it('shows "Hourly Activity" title', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('Hourly Activity')).toBeInTheDocument();
    });

    it('shows total detections count', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('42 total detections')).toBeInTheDocument();
    });

    it('uses singular "detection" for count of 1', () => {
      const singleDetection: DetectionStats = {
        ...mockDetectionStats,
        total_detections: 1,
        hourly_breakdown: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };

      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: singleDetection,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('1 total detection')).toBeInTheDocument();
    });
  });

  describe('Long range title (AC5)', () => {
    // Note: We can't easily test the TimeRange context change from the component test,
    // but we can verify the title rendering logic by checking the function output.
    // The TimeRangeProvider defaults to 'day' range.

    it('shows "Hourly Activity" for day range (default)', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      expect(screen.getByText('Hourly Activity')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has aria-label on chart container', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      // Query by the specific aria-label to avoid matching icon role="img" elements
      const chartContainer = document.querySelector(
        '[aria-label="Hourly activity chart showing 42 total detections across 24 hours"]'
      );
      expect(chartContainer).toBeInTheDocument();
      expect(chartContainer).toHaveAttribute('role', 'img');
    });
  });

  describe('Responsive behavior (I4, I6 fixes)', () => {
    it('card has minHeight for consistent sizing', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ minHeight: '320px' });
    });

    it('no-site state card has minHeight for consistent sizing', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      renderWithProviders(
          <ActivityClockCard siteId={null} />
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ minHeight: '320px' });
    });

    it('loading state card has minHeight for consistent sizing', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          loading: true,
          stats: null,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ minHeight: '320px' });
    });

    it('error state card has minHeight for consistent sizing', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          stats: null,
          loading: false,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ minHeight: '320px' });
    });

    it('empty state card has minHeight for consistent sizing', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      renderWithProviders(
          <ActivityClockCard siteId="site-1" />
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ minHeight: '320px' });
    });
  });

  describe('Hook integration', () => {
    it('passes siteId to useDetectionStats', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      renderWithProviders(
          <ActivityClockCard siteId="my-site-456" />
      );

      // Verify the hook was called with the correct siteId
      // The range will be 'day' (default) and date will be null
      expect(mockUseDetectionStats).toHaveBeenCalledWith(
        'my-site-456',
        'day',
        null
      );
    });
  });
});
