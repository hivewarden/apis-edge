/**
 * ProactiveInsightBanner Component Tests
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ProactiveInsightBanner } from '../../src/components/ProactiveInsightBanner';
import * as useProactiveInsightsModule from '../../src/hooks/useProactiveInsights';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const mockInsights = [
  {
    id: 'insight-1',
    hive_id: 'hive-1',
    hive_name: 'Hive Alpha',
    rule_id: 'treatment_due',
    severity: 'action-needed' as const,
    message: 'Varroa treatment due',
    suggested_action: 'Schedule treatment',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-2',
    hive_id: 'hive-2',
    hive_name: 'Hive Beta',
    rule_id: 'queen_aging',
    severity: 'warning' as const,
    message: 'Queen is aging',
    suggested_action: 'Consider requeening',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-3',
    hive_id: 'hive-3',
    hive_name: 'Hive Gamma',
    rule_id: 'inspection_overdue',
    severity: 'info' as const,
    message: 'Inspection overdue',
    suggested_action: 'Schedule inspection',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-4',
    hive_id: 'hive-4',
    hive_name: 'Hive Delta',
    rule_id: 'treatment_due',
    severity: 'warning' as const,
    message: 'Another treatment',
    suggested_action: 'Apply',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-5',
    hive_id: 'hive-5',
    hive_name: 'Hive Epsilon',
    rule_id: 'hornet_activity_spike',
    severity: 'action-needed' as const,
    message: 'High hornet activity',
    suggested_action: 'Check defenses',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
];

const defaultHookReturn: useProactiveInsightsModule.UseProactiveInsightsResult = {
  insights: mockInsights,
  visibleInsights: mockInsights.slice(0, 3),
  hiddenCount: 2,
  showAll: false,
  loading: false,
  error: null,
  dismissInsight: vi.fn().mockResolvedValue(undefined),
  snoozeInsight: vi.fn().mockResolvedValue(undefined),
  toggleShowAll: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
};

const renderComponent = (siteId: string | null = 'site-1') => {
  return render(
    <BrowserRouter>
      <ProactiveInsightBanner siteId={siteId} />
    </BrowserRouter>
  );
};

describe('ProactiveInsightBanner', () => {
  beforeEach(() => {
    vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue(defaultHookReturn);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Empty State', () => {
    it('should not render when siteId is null', () => {
      const { container } = renderComponent(null);
      expect(container.firstChild).toBeNull();
    });

    it('should not render when there are no insights', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        insights: [],
        visibleInsights: [],
        hiddenCount: 0,
      });

      const { container } = renderComponent();
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should show skeleton while loading', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        loading: true,
      });

      renderComponent();

      // Should show loading skeleton and header
      expect(screen.getByText('BeeBrain Insights')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should not render on error (graceful degradation)', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        error: new Error('Failed to load'),
        insights: [],
        visibleInsights: [],
      });

      const { container } = renderComponent();
      expect(container.firstChild).toBeNull();

      consoleError.mockRestore();
    });
  });

  describe('Content Rendering', () => {
    it('should render banner header with title', () => {
      renderComponent();
      expect(screen.getByText('BeeBrain Insights')).toBeInTheDocument();
    });

    it('should render insight count in header', () => {
      renderComponent();
      expect(screen.getByText('5 insights requiring attention')).toBeInTheDocument();
    });

    it('should use singular when only 1 insight', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        insights: [mockInsights[0]],
        visibleInsights: [mockInsights[0]],
        hiddenCount: 0,
      });

      renderComponent();
      expect(screen.getByText('1 insight requiring attention')).toBeInTheDocument();
    });

    it('should render visible insight cards', () => {
      renderComponent();

      // Should show first 3 insights
      expect(screen.getByText('Varroa treatment due')).toBeInTheDocument();
      expect(screen.getByText('Queen is aging')).toBeInTheDocument();
      expect(screen.getByText('Inspection overdue')).toBeInTheDocument();
    });

    it('should not show hidden insights initially', () => {
      renderComponent();

      // Should not show insights 4 and 5
      expect(screen.queryByText('Another treatment')).not.toBeInTheDocument();
      expect(screen.queryByText('High hornet activity')).not.toBeInTheDocument();
    });
  });

  describe('Show More/Less Toggle', () => {
    it('should show "Show X more" link when there are hidden insights', () => {
      renderComponent();
      expect(screen.getByText('Show 2 more insights')).toBeInTheDocument();
    });

    it('should use singular when only 1 hidden insight', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        hiddenCount: 1,
      });

      renderComponent();
      expect(screen.getByText('Show 1 more insight')).toBeInTheDocument();
    });

    it('should call toggleShowAll when "Show more" is clicked', async () => {
      const toggleShowAll = vi.fn();
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        toggleShowAll,
      });

      renderComponent();

      const showMoreBtn = screen.getByText('Show 2 more insights');
      await act(async () => {
        fireEvent.click(showMoreBtn);
      });

      expect(toggleShowAll).toHaveBeenCalled();
    });

    it('should show "Show less" when showAll is true', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        showAll: true,
        visibleInsights: mockInsights,
        hiddenCount: 0,
      });

      renderComponent();
      expect(screen.getByText('Show less')).toBeInTheDocument();
    });

    it('should not show toggle when exactly 3 or fewer insights', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        insights: mockInsights.slice(0, 3),
        visibleInsights: mockInsights.slice(0, 3),
        hiddenCount: 0,
        showAll: false,
      });

      renderComponent();
      expect(screen.queryByText(/Show/)).not.toBeInTheDocument();
    });
  });

  describe('Dismiss Animation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle dismiss with animation delay', async () => {
      const dismissInsight = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        dismissInsight,
      });

      renderComponent();

      // Click first dismiss button
      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButtons[0]);

      // Should not have called dismissInsight yet (animation delay)
      expect(dismissInsight).not.toHaveBeenCalled();

      // Fast-forward through animation
      await vi.advanceTimersByTimeAsync(300);

      // Now it should have been called
      expect(dismissInsight).toHaveBeenCalledWith('insight-1');
    });
  });

  describe('Snooze Animation', () => {
    it('should call snoozeInsight when snooze option is clicked', async () => {
      const snoozeInsight = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        snoozeInsight,
      });

      renderComponent();

      // Open snooze dropdown for first insight
      const snoozeButtons = screen.getAllByRole('button', { name: /snooze/i });
      await act(async () => {
        fireEvent.click(snoozeButtons[0]);
      });

      // Click snooze option
      const snooze7Days = await screen.findByText('Snooze for 7 days');
      await act(async () => {
        fireEvent.click(snooze7Days);
      });

      // Should call snoozeInsight after animation
      await waitFor(() => {
        expect(snoozeInsight).toHaveBeenCalledWith('insight-1', 7);
      }, { timeout: 1000 });
    });
  });

  describe('Accessibility', () => {
    it('should have role="region" on banner', () => {
      renderComponent();
      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('should have aria-label on banner', () => {
      renderComponent();
      const banner = screen.getByRole('region');
      expect(banner).toHaveAttribute('aria-label', 'BeeBrain proactive insights');
    });

    it('should have aria-live="polite" for updates', () => {
      renderComponent();
      const banner = screen.getByRole('region');
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });

    it('should have show more/less button', () => {
      renderComponent();
      const showMoreBtn = screen.getByText('Show 2 more insights');
      expect(showMoreBtn).toBeInTheDocument();
    });

    it('should show Show less when showAll is true', () => {
      vi.spyOn(useProactiveInsightsModule, 'useProactiveInsights').mockReturnValue({
        ...defaultHookReturn,
        showAll: true,
        visibleInsights: mockInsights,
        hiddenCount: 0,
      });

      renderComponent();
      const showLessBtn = screen.getByText('Show less');
      expect(showLessBtn).toBeInTheDocument();
    });
  });

  describe('Responsive Styles', () => {
    it('should have maxWidth 100% for responsive layout', () => {
      renderComponent();
      const banner = screen.getByRole('region');
      expect(banner).toHaveStyle({ maxWidth: '100%' });
    });
  });
});
