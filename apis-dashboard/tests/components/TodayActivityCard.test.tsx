/**
 * TodayActivityCard Component Tests
 *
 * Tests for the Today's Activity dashboard card.
 * Part of Epic 3, Story 3.2: Today's Detection Count Card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TodayActivityCard } from '../../src/components/TodayActivityCard';
import type { DetectionStats } from '../../src/hooks/useDetectionStats';
import { TimeRangeProvider } from '../../src/context';

// Mock the useDetectionStats hook
vi.mock('../../src/hooks/useDetectionStats', () => ({
  useDetectionStats: vi.fn(),
}));

// Import the mocked hook
import { useDetectionStats } from '../../src/hooks/useDetectionStats';
const mockUseDetectionStats = useDetectionStats as ReturnType<typeof vi.fn>;

/**
 * Wrapper component with TimeRangeProvider context.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return <TimeRangeProvider>{children}</TimeRangeProvider>;
}

/**
 * Sample detection stats for testing.
 */
const mockZeroStats: DetectionStats = {
  total_detections: 0,
  laser_activations: 0,
  hourly_breakdown: [],
  avg_confidence: null,
  first_detection: null,
  last_detection: null,
};

const mockDetectionStats: DetectionStats = {
  total_detections: 12,
  laser_activations: 10,
  hourly_breakdown: [0, 0, 0, 0, 0, 1, 2, 3, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  avg_confidence: 0.89,
  first_detection: '2026-01-25T06:30:00Z',
  last_detection: '2026-01-25T13:45:00Z',
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

describe('TodayActivityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('No site selected', () => {
    it('shows "Select a site" message when siteId is null', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      render(
        <Wrapper>
          <TodayActivityCard siteId={null} />
        </Wrapper>
      );

      expect(screen.getByText('Select a site to view activity')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows skeleton when loading and no stats', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          loading: true,
          stats: null,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      // Skeleton is rendered
      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
    });
  });

  describe('Error state - no flash (AC #5)', () => {
    it('shows skeleton instead of error message on initial error to prevent flash', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          stats: null,
          loading: false,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      // Should show skeleton, not error text (prevents error flash)
      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load detection data')).not.toBeInTheDocument();
    });
  });

  describe('Zero detections state (AC #2)', () => {
    it('shows "All quiet" with green styling when zero detections', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('All quiet')).toBeInTheDocument();
      expect(screen.getByText(/No hornets detected today/)).toBeInTheDocument();
    });

    it('shows checkmark icon in zero detection state', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      // CheckCircleFilled icon should be present
      const checkIcon = document.querySelector('.anticon-check-circle');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  describe('Detection stats state (AC #1, AC #3)', () => {
    it('shows large detection count', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('hornets deterred')).toBeInTheDocument();
    });

    it('shows "Today\'s Activity" header', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText("Today's Activity")).toBeInTheDocument();
    });

    it('shows last detection time', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText(/Last detection:/)).toBeInTheDocument();
    });

    it('shows laser activation stats with percentage', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      // 10 of 12 = 83%
      expect(screen.getByText(/10 of 12 deterred with laser/)).toBeInTheDocument();
      expect(screen.getByText(/83%/)).toBeInTheDocument();
    });

    it('uses singular "hornet" for count of 1', () => {
      const singleDetection: DetectionStats = {
        ...mockDetectionStats,
        total_detections: 1,
        laser_activations: 1,
      };

      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: singleDetection,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('hornet deterred')).toBeInTheDocument();
    });
  });

  describe('Accessibility (I6)', () => {
    it('has aria-label on card with detection stats', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveAttribute('aria-label', "Today's Activity: 12 hornets deterred");
      expect(card).toHaveAttribute('role', 'region');
    });

    it('has aria-label on card with zero detections', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveAttribute('aria-label', "Today's Activity: All quiet, no hornets detected");
      expect(card).toHaveAttribute('role', 'region');
    });
  });

  describe('Smooth transitions (I4)', () => {
    it('has CSS transition on card with detections', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockDetectionStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ transition: 'all 0.3s ease-in-out' });
    });

    it('has CSS transition on card with zero detections', () => {
      mockUseDetectionStats.mockReturnValue(
        createMockHookResult({
          stats: mockZeroStats,
        })
      );

      render(
        <Wrapper>
          <TodayActivityCard siteId="site-1" />
        </Wrapper>
      );

      const card = document.querySelector('.ant-card');
      expect(card).toHaveStyle({ transition: 'all 0.3s ease-in-out' });
    });
  });

  describe('Hook integration', () => {
    it('passes siteId to useDetectionStats', () => {
      mockUseDetectionStats.mockReturnValue(createMockHookResult());

      render(
        <Wrapper>
          <TodayActivityCard siteId="my-site-123" />
        </Wrapper>
      );

      expect(mockUseDetectionStats).toHaveBeenCalledWith(
        'my-site-123',
        expect.any(String),
        expect.anything()
      );
    });
  });
});
