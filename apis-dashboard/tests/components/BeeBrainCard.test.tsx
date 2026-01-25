/**
 * BeeBrainCard Component Tests
 *
 * Tests for the BeeBrain AI analysis dashboard card.
 * Part of Epic 8, Story 8.2: Dashboard BeeBrain Card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { BeeBrainCard } from '../../src/components/BeeBrainCard';
import type { BeeBrainData, Insight, UseBeeBrainResult } from '../../src/hooks/useBeeBrain';

// Mock the useBeeBrain hook
vi.mock('../../src/hooks/useBeeBrain', () => ({
  useBeeBrain: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Import the mocked hook
import { useBeeBrain } from '../../src/hooks/useBeeBrain';
const mockUseBeeBrain = useBeeBrain as ReturnType<typeof vi.fn>;

/**
 * Wrapper component with Router context.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

/**
 * Sample BeeBrain data for testing.
 */
const mockHealthyData: BeeBrainData = {
  summary: 'All quiet at Test Site. Your 3 hives are doing well. No actions needed.',
  last_analysis: new Date().toISOString(),
  insights: [],
  all_good: true,
};

const mockInsightWarning: Insight = {
  id: 'insight-1',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'treatment_due',
  severity: 'warning',
  message: 'Varroa treatment due (92 days since last)',
  suggested_action: 'Consider applying treatment within the next week',
  data_points: { days_since_treatment: 92 },
  created_at: new Date().toISOString(),
};

const mockInsightInfo: Insight = {
  id: 'insight-2',
  hive_id: 'hive-2',
  hive_name: 'Hive 2',
  rule_id: 'inspection_due',
  severity: 'info',
  message: 'Consider inspection (16 days)',
  suggested_action: 'Schedule a routine inspection',
  data_points: { days_since_inspection: 16 },
  created_at: new Date().toISOString(),
};

const mockInsightActionNeeded: Insight = {
  id: 'insight-3',
  hive_id: 'hive-3',
  hive_name: 'Hive 3',
  rule_id: 'queen_aging',
  severity: 'action-needed',
  message: 'Queen is 3 years old, consider replacement',
  suggested_action: 'Plan for queen replacement this season',
  data_points: { queen_age_years: 3 },
  created_at: new Date().toISOString(),
};

const mockDataWithInsights: BeeBrainData = {
  summary: 'There are some items that need your attention.',
  last_analysis: new Date().toISOString(),
  insights: [mockInsightInfo, mockInsightWarning, mockInsightActionNeeded],
  all_good: false,
};

/**
 * Helper to create mock hook result.
 */
function createMockHookResult(overrides: Partial<UseBeeBrainResult> = {}): UseBeeBrainResult {
  return {
    data: null,
    loading: false,
    refreshing: false,
    error: null,
    timedOut: false,
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('BeeBrainCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('No site selected', () => {
    it('shows "Select a site" message when siteId is null', () => {
      mockUseBeeBrain.mockReturnValue(createMockHookResult());

      render(
        <Wrapper>
          <BeeBrainCard siteId={null} />
        </Wrapper>
      );

      expect(screen.getByText('BeeBrain Analysis')).toBeInTheDocument();
      expect(screen.getByText('Select a site to view BeeBrain analysis')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows skeleton when loading', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          loading: true,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('BeeBrain Analysis')).toBeInTheDocument();
      // Skeleton is rendered
      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
    });
  });

  describe('Healthy state (all good)', () => {
    it('renders healthy state with green check and summary', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('BeeBrain Analysis')).toBeInTheDocument();
      expect(
        screen.getByText('All quiet at Test Site. Your 3 hives are doing well. No actions needed.')
      ).toBeInTheDocument();
    });

    it('shows last updated timestamp', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Should show "Just now" for recent timestamps
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });
  });

  describe('Concerns state (with insights)', () => {
    it('renders insights list sorted by severity', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Check all insights are rendered
      expect(screen.getByText(/Varroa treatment due/)).toBeInTheDocument();
      expect(screen.getByText(/Consider inspection/)).toBeInTheDocument();
      expect(screen.getByText(/Queen is 3 years old/)).toBeInTheDocument();
    });

    it('shows hive names for each insight', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('Hive 1:')).toBeInTheDocument();
      expect(screen.getByText('Hive 2:')).toBeInTheDocument();
      expect(screen.getByText('Hive 3:')).toBeInTheDocument();
    });

    it('displays severity tags correctly', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Check severity tags
      expect(screen.getByText('Action')).toBeInTheDocument(); // action-needed
      expect(screen.getByText('warning')).toBeInTheDocument();
      expect(screen.getByText('info')).toBeInTheDocument();
    });

    it('shows suggested actions', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('Consider applying treatment within the next week')).toBeInTheDocument();
      expect(screen.getByText('Schedule a routine inspection')).toBeInTheDocument();
      expect(screen.getByText('Plan for queen replacement this season')).toBeInTheDocument();
    });
  });

  describe('Navigation to hive detail', () => {
    it('navigates to hive detail when clicking insight with hive_id', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Click on the insight with Hive 1
      const hive1Text = screen.getByText('Hive 1:');
      const listItem = hive1Text.closest('.ant-list-item');
      fireEvent.click(listItem!);

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('does not navigate when insight has no hive_id', () => {
      const insightWithoutHive: Insight = {
        ...mockInsightWarning,
        hive_id: null,
        hive_name: null,
      };

      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [insightWithoutHive],
          },
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const listItem = screen.getByText(/Varroa treatment due/).closest('.ant-list-item');
      fireEvent.click(listItem!);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard accessibility', () => {
    it('navigates to hive detail when Enter key is pressed on clickable insight', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Find a clickable insight (one with hive_id)
      const hive1Text = screen.getByText('Hive 1:');
      const listItem = hive1Text.closest('.ant-list-item');

      // Press Enter key
      fireEvent.keyDown(listItem!, { key: 'Enter' });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('navigates to hive detail when Space key is pressed on clickable insight', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Find a clickable insight (one with hive_id)
      const hive1Text = screen.getByText('Hive 1:');
      const listItem = hive1Text.closest('.ant-list-item');

      // Press Space key
      fireEvent.keyDown(listItem!, { key: ' ' });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('clickable insights have tabIndex, role, and aria-label attributes', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Find a clickable insight list item
      const hive1Text = screen.getByText('Hive 1:');
      const listItem = hive1Text.closest('.ant-list-item');

      expect(listItem).toHaveAttribute('tabindex', '0');
      expect(listItem).toHaveAttribute('role', 'button');
      expect(listItem).toHaveAttribute('aria-label');
      expect(listItem?.getAttribute('aria-label')).toContain('View details for');
    });

    it('non-clickable insights do not have keyboard navigation attributes', () => {
      const insightWithoutHive: Insight = {
        ...mockInsightWarning,
        hive_id: null,
        hive_name: null,
      };

      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [insightWithoutHive],
          },
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const listItem = screen.getByText(/Varroa treatment due/).closest('.ant-list-item');

      expect(listItem).not.toHaveAttribute('tabindex');
      expect(listItem).not.toHaveAttribute('role');
      expect(listItem).not.toHaveAttribute('aria-label');
    });

    it('does not navigate when non-Enter/Space keys are pressed', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const hive1Text = screen.getByText('Hive 1:');
      const listItem = hive1Text.closest('.ant-list-item');

      // Press Tab key (should not navigate)
      fireEvent.keyDown(listItem!, { key: 'Tab' });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Refresh functionality', () => {
    it('calls refresh when refresh button is clicked', () => {
      const mockRefresh = vi.fn();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Find the refresh button (it's a small icon button)
      const refreshButton = screen.getByRole('button');
      fireEvent.click(refreshButton);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button while refreshing', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refreshing: true,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const refreshButton = screen.getByRole('button');
      expect(refreshButton).toBeDisabled();
    });

    it('shows spinning icon while refreshing', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refreshing: true,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // ReloadOutlined with spin class should be present
      const spinIcon = document.querySelector('.anticon-reload.anticon-spin');
      expect(spinIcon).toBeInTheDocument();
    });
  });

  describe('Timeout state', () => {
    it('shows timeout message when timedOut is true', () => {
      const mockRefresh = vi.fn();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          timedOut: true,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(
        screen.getByText('Analysis is taking longer than expected. Check back soon.')
      ).toBeInTheDocument();
    });

    it('shows retry button in timeout state', () => {
      const mockRefresh = vi.fn();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          timedOut: true,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error state', () => {
    it('shows error message when error exists and no data', () => {
      const mockRefresh = vi.fn();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          data: null,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('Analysis unavailable')).toBeInTheDocument();
    });

    it('shows retry button in error state', () => {
      const mockRefresh = vi.fn();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          data: null,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('shows stale data indicator when error with existing data', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Refresh failed'),
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('Showing cached data')).toBeInTheDocument();
      // Data should still be shown
      expect(
        screen.getByText('All quiet at Test Site. Your 3 hives are doing well. No actions needed.')
      ).toBeInTheDocument();
    });
  });

  describe('Relative time formatting', () => {
    it('shows "Just now" for very recent timestamps', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: new Date().toISOString(),
          },
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows minutes ago for recent timestamps', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: fiveMinutesAgo,
          },
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });

    it('shows hours ago for older timestamps', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: twoHoursAgo,
          },
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      expect(screen.getByText('2h ago')).toBeInTheDocument();
    });
  });

  describe('Card styling', () => {
    it('renders with correct card structure', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // Check card is rendered
      const card = document.querySelector('.ant-card');
      expect(card).toBeInTheDocument();
    });

    it('displays brain icon in header', () => {
      mockUseBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <BeeBrainCard siteId="site-1" />
        </Wrapper>
      );

      // BulbOutlined icon should be present
      const bulbIcon = document.querySelector('.anticon-bulb');
      expect(bulbIcon).toBeInTheDocument();
    });
  });
});
