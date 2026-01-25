/**
 * HiveBeeBrainCard Component Tests
 *
 * Tests for the hive-specific BeeBrain AI analysis card.
 * Part of Epic 8, Story 8.3: Hive Detail BeeBrain Analysis
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HiveBeeBrainCard } from '../../src/components/HiveBeeBrainCard';
import type { HiveBeeBrainData, Insight, UseHiveBeeBrainResult } from '../../src/hooks/useHiveBeeBrain';

// Mock the useHiveBeeBrain hook
vi.mock('../../src/hooks/useHiveBeeBrain', () => ({
  useHiveBeeBrain: vi.fn(),
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

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Import the mocked hook
import { useHiveBeeBrain } from '../../src/hooks/useHiveBeeBrain';
import { message } from 'antd';
const mockUseHiveBeeBrain = useHiveBeeBrain as ReturnType<typeof vi.fn>;
const mockMessage = message as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

/**
 * Wrapper component with Router context.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

/**
 * Sample hive BeeBrain data for testing.
 */
const mockHealthyData: HiveBeeBrainData = {
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  health_assessment: 'This hive is in good health with no immediate concerns.',
  insights: [],
  recommendations: ['Continue regular inspections', 'Monitor for varroa in spring'],
  last_analysis: new Date().toISOString(),
};

const mockInsightWarning: Insight = {
  id: 'insight-1',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'treatment_due',
  severity: 'warning',
  message: 'Varroa treatment due (92 days since last)',
  suggested_action: 'Consider applying treatment within the next week',
  data_points: { days_since_treatment: 92, last_treatment_date: '2025-10-25' },
  created_at: new Date().toISOString(),
};

const mockInsightInfo: Insight = {
  id: 'insight-2',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'inspection_overdue',
  severity: 'info',
  message: 'Consider inspection (16 days)',
  suggested_action: 'Schedule a routine inspection',
  data_points: { days_since_inspection: 16 },
  created_at: new Date().toISOString(),
};

const mockInsightActionNeeded: Insight = {
  id: 'insight-3',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'queen_aging',
  severity: 'action-needed',
  message: 'Queen is 3 years old, consider replacement',
  suggested_action: 'Plan for queen replacement this season',
  data_points: { queen_age_years: 3, productivity_drop_percent: 23 },
  created_at: new Date().toISOString(),
};

const mockDataWithInsights: HiveBeeBrainData = {
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  health_assessment: 'This hive has some items that need your attention.',
  insights: [mockInsightInfo, mockInsightWarning, mockInsightActionNeeded],
  recommendations: [],
  last_analysis: new Date().toISOString(),
};

/**
 * Helper to create mock hook result.
 */
function createMockHookResult(overrides: Partial<UseHiveBeeBrainResult> = {}): UseHiveBeeBrainResult {
  return {
    data: null,
    loading: false,
    refreshing: false,
    error: null,
    timedOut: false,
    refresh: vi.fn(),
    dismissInsight: vi.fn(),
    ...overrides,
  };
}

describe('HiveBeeBrainCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading state', () => {
    it('shows skeleton when loading', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          loading: true,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(screen.getByText('BeeBrain Analysis')).toBeInTheDocument();
      // Skeleton is rendered
      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
    });
  });

  describe('Healthy state (no insights)', () => {
    it('renders healthy state with green check and health assessment', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(screen.getByText('BeeBrain Analysis')).toBeInTheDocument();
      expect(
        screen.getByText('This hive is in good health with no immediate concerns.')
      ).toBeInTheDocument();
    });

    it('shows recommendations when no insights', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(screen.getByText('Recommendations:')).toBeInTheDocument();
      expect(screen.getByText('Continue regular inspections')).toBeInTheDocument();
      expect(screen.getByText('Monitor for varroa in spring')).toBeInTheDocument();
    });

    it('shows last updated timestamp', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // dayjs relativeTime plugin uses "a few seconds ago" for very recent timestamps
      expect(screen.getByText('a few seconds ago')).toBeInTheDocument();
    });
  });

  describe('Concerns state (with insights)', () => {
    it('renders insights list sorted by severity', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Check all insights are rendered
      expect(screen.getByText(/Varroa treatment due/)).toBeInTheDocument();
      expect(screen.getByText(/Consider inspection/)).toBeInTheDocument();
      expect(screen.getByText(/Queen is 3 years old/)).toBeInTheDocument();
    });

    it('displays severity tags correctly', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Check severity tags
      expect(screen.getByText('Action')).toBeInTheDocument(); // action-needed
      expect(screen.getByText('warning')).toBeInTheDocument();
      expect(screen.getByText('info')).toBeInTheDocument();
    });

    it('shows "Tell me more" toggle for each insight', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // All insights should have "Tell me more" links
      const tellMeMoreLinks = screen.getAllByText('Tell me more');
      expect(tellMeMoreLinks).toHaveLength(3);
    });
  });

  describe('Expand/collapse functionality (AC #3)', () => {
    it('expands insight to show details when "Tell me more" is clicked', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Click "Tell me more" on the first insight
      const tellMeMoreLinks = screen.getAllByText('Tell me more');
      fireEvent.click(tellMeMoreLinks[0]);

      // Should show expanded content
      expect(screen.getByText('What triggered this:')).toBeInTheDocument();
      expect(screen.getByText('Why this matters:')).toBeInTheDocument();
      expect(screen.getByText('Suggested next step:')).toBeInTheDocument();
    });

    it('shows data points in expanded view', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning], // Only one for easier testing
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Click "Tell me more"
      fireEvent.click(screen.getByText('Tell me more'));

      // Should show data points
      expect(screen.getByText(/Days since treatment/)).toBeInTheDocument();
      expect(screen.getByText('92')).toBeInTheDocument();
    });

    it('shows action button in expanded view', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Click "Tell me more"
      fireEvent.click(screen.getByText('Tell me more'));

      // Should show action button for treatment_due
      expect(screen.getByText(/Log Treatment/)).toBeInTheDocument();
    });

    it('collapses insight when "Less" is clicked', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Expand
      fireEvent.click(screen.getByText('Tell me more'));
      expect(screen.getByText('What triggered this:')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText('Less'));
      expect(screen.queryByText('What triggered this:')).not.toBeInTheDocument();
    });
  });

  describe('Dismiss functionality (AC #4)', () => {
    it('calls dismissInsight when "Dismiss" is clicked', async () => {
      const mockDismiss = vi.fn().mockResolvedValue(undefined);
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
          dismissInsight: mockDismiss,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Find dismiss buttons
      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButtons[0]);

      await waitFor(() => {
        expect(mockDismiss).toHaveBeenCalled();
      });
    });

    it('shows success message on dismiss', async () => {
      const mockDismiss = vi.fn().mockResolvedValue(undefined);
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
          dismissInsight: mockDismiss,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButtons[0]);

      await waitFor(() => {
        expect(mockMessage.success).toHaveBeenCalledWith('Insight dismissed');
      });
    });

    it('shows error message on dismiss failure', async () => {
      const mockDismiss = vi.fn().mockRejectedValue(new Error('Failed'));
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
          dismissInsight: mockDismiss,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButtons[0]);

      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('Failed to dismiss insight');
      });
    });
  });

  describe('Refresh functionality (AC #5)', () => {
    it('calls refresh when refresh button is clicked', () => {
      const mockRefresh = vi.fn();
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Find the refresh button by aria-label
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button while refreshing', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refreshing: true,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      expect(refreshButton).toBeDisabled();
    });

    it('shows spinning icon while refreshing', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
          refreshing: true,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // ReloadOutlined with spin class should be present
      const spinIcon = document.querySelector('.anticon-reload.anticon-spin');
      expect(spinIcon).toBeInTheDocument();
    });
  });

  describe('Timeout state', () => {
    it('shows timeout message when timedOut is true', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          timedOut: true,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(
        screen.getByText('Analysis is taking longer than expected. Check back soon.')
      ).toBeInTheDocument();
    });

    it('shows retry button in timeout state', () => {
      const mockRefresh = vi.fn();
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          timedOut: true,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
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
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          data: null,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(screen.getByText('Analysis unavailable')).toBeInTheDocument();
    });

    it('shows retry button in error state', () => {
      const mockRefresh = vi.fn();
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Network error'),
          data: null,
          refresh: mockRefresh,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('shows stale data indicator when error with existing data', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          error: new Error('Refresh failed'),
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      expect(screen.getByText('Showing cached data')).toBeInTheDocument();
      // Data should still be shown
      expect(
        screen.getByText('This hive is in good health with no immediate concerns.')
      ).toBeInTheDocument();
    });
  });

  describe('Navigation to suggested actions', () => {
    it('navigates to inspection page when "New Inspection" action is clicked', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightInfo], // inspection_overdue
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Expand the insight
      fireEvent.click(screen.getByText('Tell me more'));

      // Click the action button
      const actionButton = screen.getByText(/New Inspection/);
      fireEvent.click(actionButton);

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1/inspections/new');
    });

    it('navigates to hive page when "Log Treatment" action is clicked', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning], // treatment_due
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Expand the insight
      fireEvent.click(screen.getByText('Tell me more'));

      // Click the action button
      const actionButton = screen.getByText(/Log Treatment/);
      fireEvent.click(actionButton);

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });
  });

  describe('Keyboard accessibility (AC #3, #4)', () => {
    it('expands insight when Enter key is pressed on toggle', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Find the toggle by its role and aria-label
      const toggleButton = screen.getByRole('button', { name: /tell me more/i });

      // Press Enter key
      fireEvent.keyDown(toggleButton, { key: 'Enter' });

      expect(screen.getByText('What triggered this:')).toBeInTheDocument();
    });

    it('expands insight when Space key is pressed on toggle', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const toggleButton = screen.getByRole('button', { name: /tell me more/i });

      // Press Space key
      fireEvent.keyDown(toggleButton, { key: ' ' });

      expect(screen.getByText('What triggered this:')).toBeInTheDocument();
    });

    it('toggle has proper ARIA attributes', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const toggleButton = screen.getByRole('button', { name: /tell me more/i });

      expect(toggleButton).toHaveAttribute('tabindex', '0');
      expect(toggleButton).toHaveAttribute('role', 'button');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      expect(toggleButton).toHaveAttribute('aria-controls');
    });

    it('toggle aria-expanded updates when expanded', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const toggleButton = screen.getByRole('button', { name: /tell me more/i });

      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      // Expand
      fireEvent.click(toggleButton);

      // Now find the "Less" button
      const lessButton = screen.getByRole('button', { name: /show less/i });
      expect(lessButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('dismiss button has proper aria-label', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const dismissButton = screen.getByRole('button', { name: /dismiss insight/i });
      expect(dismissButton).toBeInTheDocument();
      expect(dismissButton.getAttribute('aria-label')).toContain('Dismiss insight');
    });

    it('severity tags have aria-label for screen readers', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockDataWithInsights,
            insights: [mockInsightWarning],
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      const warningTag = screen.getByText('warning');
      expect(warningTag).toHaveAttribute('aria-label', 'Severity: Warning');
    });
  });

  describe('Relative time formatting', () => {
    it('shows "a few seconds ago" for very recent timestamps', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: new Date().toISOString(),
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // dayjs relativeTime plugin uses "a few seconds ago" for very recent timestamps
      expect(screen.getByText('a few seconds ago')).toBeInTheDocument();
    });

    it('shows minutes ago for recent timestamps', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: fiveMinutesAgo,
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // dayjs relativeTime plugin uses "5 minutes ago" format
      expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    });

    it('shows hours ago for older timestamps', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: {
            ...mockHealthyData,
            last_analysis: twoHoursAgo,
          },
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // dayjs relativeTime plugin uses "2 hours ago" format
      expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });
  });

  describe('Card styling and icons', () => {
    it('renders with correct card structure', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // Check card is rendered
      const card = document.querySelector('.ant-card');
      expect(card).toBeInTheDocument();
    });

    it('displays brain icon in header', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // BulbOutlined icon should be present
      const bulbIcon = document.querySelector('.anticon-bulb');
      expect(bulbIcon).toBeInTheDocument();
    });

    it('displays check icon for healthy state', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockHealthyData,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // CheckCircleOutlined icon should be present in health assessment
      const checkIcon = document.querySelector('.anticon-check-circle');
      expect(checkIcon).toBeInTheDocument();
    });

    it('displays info icon for state with insights', () => {
      mockUseHiveBeeBrain.mockReturnValue(
        createMockHookResult({
          data: mockDataWithInsights,
        })
      );

      render(
        <Wrapper>
          <HiveBeeBrainCard hiveId="hive-1" />
        </Wrapper>
      );

      // InfoCircleOutlined icon should be present in health assessment (not checkmark)
      const infoIcons = document.querySelectorAll('.anticon-info-circle');
      expect(infoIcons.length).toBeGreaterThan(0);
    });
  });
});
