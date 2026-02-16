/**
 * Activity Page Tests
 *
 * Tests for the Activity page that displays the full activity feed.
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Activity } from '../../src/pages/Activity';

// Mock the hooks
vi.mock('../../src/hooks/useActivityFeed', () => ({
  useActivityFeed: vi.fn(),
}));

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
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
import { apiClient } from '../../src/providers/apiClient';

const mockUseActivityFeed = vi.mocked(useActivityFeed);
const mockApiClient = vi.mocked(apiClient);

// Wrapper component with router
const renderWithRouter = (ui: React.ReactElement, initialEntries: string[] = ['/activity']) => {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
};

describe('Activity Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for hives API call
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [
          { id: 'hive-1', name: 'Hive Alpha' },
          { id: 'hive-2', name: 'Hive Beta' },
        ],
      },
    });
  });

  describe('page header', () => {
    it('displays page title', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Activity')).toBeInTheDocument();
    });

    it('displays page description', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText("See what's been happening in your apiary")).toBeInTheDocument();
    });
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

      renderWithRouter(<Activity />);

      expect(document.querySelector('.ant-spin')).toBeTruthy();
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

      renderWithRouter(<Activity />);

      expect(screen.getByText('No activity yet')).toBeInTheDocument();
    });

    it('shows different message when filters are active', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      // With a filter in URL
      renderWithRouter(<Activity />, ['/activity?entity_type=inspections']);

      expect(screen.getByText('No activity matches your filters')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error alert when error occurs', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: new Error('Network error'),
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Failed to load activity')).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: new Error('Network error'),
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('activities display', () => {
    it('displays activity items', () => {
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
            hive_id: 'hive-1',
            hive_name: 'Hive Alpha',
          },
        ],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('John recorded an inspection on Hive Alpha')).toBeInTheDocument();
      expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('shows Load More button when hasMore is true', () => {
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
        hasMore: true,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Load More')).toBeInTheDocument();
    });

    it('hides Load More button when hasMore is false', () => {
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

      renderWithRouter(<Activity />);

      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });

    it('calls loadMore when Load More button is clicked', () => {
      const mockLoadMore = vi.fn();
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
        hasMore: true,
        loadMore: mockLoadMore,
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      fireEvent.click(screen.getByText('Load More'));

      expect(mockLoadMore).toHaveBeenCalled();
    });

    it('shows loading state when loadingMore is true', () => {
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
        loadingMore: true,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('displays filter controls', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />);

      expect(screen.getByText('Filters:')).toBeInTheDocument();
    });

    it('shows Clear Filters button when filters are active', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      // With filter in URL
      renderWithRouter(<Activity />, ['/activity?entity_type=inspections']);

      // There might be multiple "Clear Filters" buttons
      const clearFilterButtons = screen.getAllByText('Clear Filters');
      expect(clearFilterButtons.length).toBeGreaterThan(0);
    });
  });

  describe('filter integration', () => {
    it('passes filters to useActivityFeed hook', () => {
      mockUseActivityFeed.mockReturnValue({
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithRouter(<Activity />, ['/activity?hive_id=hive-123']);

      expect(mockUseActivityFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            hiveId: 'hive-123',
          }),
        })
      );
    });
  });
});
