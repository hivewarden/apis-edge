/**
 * ActivityFeedCard Component Tests
 *
 * Tests for the ActivityFeedCard component that displays recent activity.
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityFeedCard } from '../../src/components/ActivityFeedCard';

// Mock the useActivityFeed hook
vi.mock('../../src/hooks/useActivityFeed', () => ({
  useActivityFeed: vi.fn(),
}));

// Mock the theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#F7A42D',
    brownBramble: '#4A3728',
    textMuted: '#8c8c8c',
  },
}));

import { useActivityFeed } from '../../src/hooks/useActivityFeed';

const mockUseActivityFeed = vi.mocked(useActivityFeed);

// Wrapper component with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('ActivityFeedCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner when loading', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: true,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      const { container } = renderWithRouter(<ActivityFeedCard />);

      // Should show spinner (Ant Design Spin component)
      expect(container.querySelector('.ant-spin')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no activities', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when error occurs', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: new Error('Network error'),
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('Failed to load activity')).toBeInTheDocument();
    });
  });

  describe('activities display', () => {
    it('displays activity items with messages', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [
          {
            id: 'activity-1',
            activity_type: 'inspection_created',
            icon: 'FileSearchOutlined',
            message: 'John recorded an inspection on Hive Alpha',
            relative_time: '2 hours ago',
            timestamp: '2026-01-25T14:30:00Z',
            entity_type: 'inspections',
            entity_id: 'inspection-123',
          },
          {
            id: 'activity-2',
            activity_type: 'treatment_recorded',
            icon: 'MedicineBoxOutlined',
            message: 'Jane applied Oxalic acid treatment',
            relative_time: '5 hours ago',
            timestamp: '2026-01-25T11:30:00Z',
            entity_type: 'treatments',
            entity_id: 'treatment-456',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('John recorded an inspection on Hive Alpha')).toBeInTheDocument();
      expect(screen.getByText('Jane applied Oxalic acid treatment')).toBeInTheDocument();
    });

    it('displays relative time for each activity', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [
          {
            id: 'activity-1',
            activity_type: 'inspection_created',
            icon: 'FileSearchOutlined',
            message: 'Test activity',
            relative_time: '2 hours ago',
            timestamp: '2026-01-25T14:30:00Z',
            entity_type: 'inspections',
            entity_id: 'inspection-123',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });
  });

  describe('card title', () => {
    it('shows default title', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    it('shows custom title when provided', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard title="Hive Activity" />);

      expect(screen.getByText('Hive Activity')).toBeInTheDocument();
    });
  });

  describe('view all link', () => {
    it('shows View All link by default', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [
          {
            id: 'activity-1',
            activity_type: 'inspection_created',
            icon: 'FileSearchOutlined',
            message: 'Test activity',
            relative_time: '2 hours ago',
            timestamp: '2026-01-25T14:30:00Z',
            entity_type: 'inspections',
            entity_id: 'inspection-123',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard />);

      expect(screen.getByText('View All Activity')).toBeInTheDocument();
    });

    it('hides View All link when showViewAll is false', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [
          {
            id: 'activity-1',
            activity_type: 'inspection_created',
            icon: 'FileSearchOutlined',
            message: 'Test activity',
            relative_time: '2 hours ago',
            timestamp: '2026-01-25T14:30:00Z',
            entity_type: 'inspections',
            entity_id: 'inspection-123',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard showViewAll={false} />);

      expect(screen.queryByText('View All Activity')).not.toBeInTheDocument();
    });
  });

  describe('filter props', () => {
    it('passes siteId filter to hook', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard siteId="site-123" />);

      expect(mockUseActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            siteId: 'site-123',
          }),
        })
      );
    });

    it('passes hiveId filter to hook', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard hiveId="hive-456" />);

      expect(mockUseActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            hiveId: 'hive-456',
          }),
        })
      );
    });

    it('passes limit prop to hook', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<ActivityFeedCard limit={10} />);

      expect(mockUseActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        })
      );
    });
  });
});
