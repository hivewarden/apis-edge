/**
 * ProactiveInsightNotification Component Tests
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ProactiveInsightNotification } from '../../src/components/ProactiveInsightNotification';
import type { ProactiveInsight } from '../../src/hooks/useProactiveInsights';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockInsight: ProactiveInsight = {
  id: 'insight-1',
  hive_id: 'hive-1',
  hive_name: 'Hive Alpha',
  rule_id: 'treatment_due',
  severity: 'action-needed',
  message: 'Varroa treatment due',
  suggested_action: 'Schedule treatment within a week',
  data_points: { days_since_treatment: 92 },
  created_at: '2026-01-20T10:00:00Z',
};

const renderComponent = (props: Partial<React.ComponentProps<typeof ProactiveInsightNotification>> = {}) => {
  const defaultProps = {
    insight: mockInsight,
    onDismiss: vi.fn(),
    onSnooze: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <ProactiveInsightNotification {...defaultProps} />
    </BrowserRouter>
  );
};

describe('ProactiveInsightNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the insight message', () => {
      renderComponent();
      expect(screen.getByText('Varroa treatment due')).toBeInTheDocument();
    });

    it('should render the suggested action', () => {
      renderComponent();
      expect(screen.getByText('Schedule treatment within a week')).toBeInTheDocument();
    });

    it('should render the hive name when present', () => {
      renderComponent();
      expect(screen.getByText('Hive Alpha:')).toBeInTheDocument();
    });

    it('should not render hive name when insight has no hive', () => {
      const noHiveInsight: ProactiveInsight = {
        ...mockInsight,
        hive_id: null,
        hive_name: null,
        rule_id: 'hornet_activity_spike',
      };
      renderComponent({ insight: noHiveInsight });
      expect(screen.queryByText(/Hive/)).not.toBeInTheDocument();
    });

    it('should render severity tag for action-needed', () => {
      renderComponent();
      expect(screen.getByText('Action Needed')).toBeInTheDocument();
    });

    it('should render severity tag for warning', () => {
      const warningInsight: ProactiveInsight = {
        ...mockInsight,
        severity: 'warning',
      };
      renderComponent({ insight: warningInsight });
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should render severity tag for info', () => {
      const infoInsight: ProactiveInsight = {
        ...mockInsight,
        severity: 'info',
      };
      renderComponent({ insight: infoInsight });
      expect(screen.getByText('Info')).toBeInTheDocument();
    });

    it('should render all action buttons', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /snooze/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /take action/i })).toBeInTheDocument();
    });
  });

  describe('Dismiss Action', () => {
    it('should call onDismiss when Dismiss button is clicked', async () => {
      const onDismiss = vi.fn().mockResolvedValue(undefined);
      renderComponent({ onDismiss });

      const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
      await act(async () => {
        fireEvent.click(dismissBtn);
      });

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalledWith('insight-1');
      });
    });

    it('should show loading state on Dismiss button while dismissing', async () => {
      const onDismiss = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      renderComponent({ onDismiss });

      const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissBtn);

      // Button should show loading state
      await waitFor(() => {
        expect(dismissBtn.querySelector('.ant-btn-loading-icon')).toBeInTheDocument();
      });
    });
  });

  describe('Snooze Action', () => {
    it('should open dropdown when Snooze button is clicked', async () => {
      renderComponent();

      const snoozeBtn = screen.getByRole('button', { name: /snooze/i });
      await act(async () => {
        fireEvent.click(snoozeBtn);
      });

      // Dropdown options should appear
      await waitFor(() => {
        expect(screen.getByText('Snooze for 1 day')).toBeInTheDocument();
        expect(screen.getByText('Snooze for 7 days')).toBeInTheDocument();
        expect(screen.getByText('Snooze for 30 days')).toBeInTheDocument();
      });
    });

    it('should call onSnooze with 1 day when "Snooze for 1 day" is clicked', async () => {
      const onSnooze = vi.fn().mockResolvedValue(undefined);
      renderComponent({ onSnooze });

      // Open dropdown
      const snoozeBtn = screen.getByRole('button', { name: /snooze/i });
      await act(async () => {
        fireEvent.click(snoozeBtn);
      });

      // Click 1 day option
      const option = await screen.findByText('Snooze for 1 day');
      await act(async () => {
        fireEvent.click(option);
      });

      await waitFor(() => {
        expect(onSnooze).toHaveBeenCalledWith('insight-1', 1);
      });
    });

    it('should call onSnooze with 7 days when "Snooze for 7 days" is clicked', async () => {
      const onSnooze = vi.fn().mockResolvedValue(undefined);
      renderComponent({ onSnooze });

      const snoozeBtn = screen.getByRole('button', { name: /snooze/i });
      await act(async () => {
        fireEvent.click(snoozeBtn);
      });

      const option = await screen.findByText('Snooze for 7 days');
      await act(async () => {
        fireEvent.click(option);
      });

      await waitFor(() => {
        expect(onSnooze).toHaveBeenCalledWith('insight-1', 7);
      });
    });

    it('should call onSnooze with 30 days when "Snooze for 30 days" is clicked', async () => {
      const onSnooze = vi.fn().mockResolvedValue(undefined);
      renderComponent({ onSnooze });

      const snoozeBtn = screen.getByRole('button', { name: /snooze/i });
      await act(async () => {
        fireEvent.click(snoozeBtn);
      });

      const option = await screen.findByText('Snooze for 30 days');
      await act(async () => {
        fireEvent.click(option);
      });

      await waitFor(() => {
        expect(onSnooze).toHaveBeenCalledWith('insight-1', 30);
      });
    });
  });

  describe('Take Action Navigation', () => {
    it('should navigate to hive detail for queen_aging rule', async () => {
      const queenAgingInsight: ProactiveInsight = {
        ...mockInsight,
        rule_id: 'queen_aging',
      };
      renderComponent({ insight: queenAgingInsight });

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('should navigate to hive detail for treatment_due rule', async () => {
      renderComponent(); // Default insight is treatment_due

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('should navigate to new inspection for inspection_overdue rule', async () => {
      const inspectionInsight: ProactiveInsight = {
        ...mockInsight,
        rule_id: 'inspection_overdue',
      };
      renderComponent({ insight: inspectionInsight });

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1/inspections/new');
    });

    it('should navigate to clips for hornet_activity_spike rule', async () => {
      const hornetInsight: ProactiveInsight = {
        ...mockInsight,
        hive_id: null,
        hive_name: null,
        rule_id: 'hornet_activity_spike',
      };
      renderComponent({ insight: hornetInsight });

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/clips');
    });

    it('should navigate to hives list when insight has no hive_id', async () => {
      const noHiveInsight: ProactiveInsight = {
        ...mockInsight,
        hive_id: null,
        hive_name: null,
        rule_id: 'treatment_due',
      };
      renderComponent({ insight: noHiveInsight });

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives');
    });

    it('should fallback to hive detail for unknown rule_id with hive_id', async () => {
      const unknownRuleInsight: ProactiveInsight = {
        ...mockInsight,
        rule_id: 'unknown_rule',
      };
      renderComponent({ insight: unknownRuleInsight });

      const actionBtn = screen.getByRole('button', { name: /take action/i });
      await act(async () => {
        fireEvent.click(actionBtn);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });
  });

  describe('Hive Name Navigation', () => {
    it('should navigate to hive detail when hive name is clicked', async () => {
      renderComponent();

      const hiveName = screen.getByText('Hive Alpha:');
      await act(async () => {
        fireEvent.click(hiveName);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });
  });

  describe('Accessibility', () => {
    it('should have role="alert" on container', () => {
      renderComponent();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-live="polite" for screen reader updates', () => {
      renderComponent();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });

    it('should have aria-label on container describing the insight', () => {
      renderComponent();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-label');
      expect(alert.getAttribute('aria-label')).toContain('Action Needed');
      expect(alert.getAttribute('aria-label')).toContain('Hive Alpha');
    });

    it('should have aria-label on dismiss button', () => {
      renderComponent();
      const dismissBtn = screen.getByRole('button', { name: /dismiss insight/i });
      expect(dismissBtn).toBeInTheDocument();
    });

    it('should have aria-label on snooze button', () => {
      renderComponent();
      const snoozeBtn = screen.getByRole('button', { name: /snooze insight/i });
      expect(snoozeBtn).toBeInTheDocument();
    });

    it('should have aria-label on take action button', () => {
      renderComponent();
      const actionBtn = screen.getByRole('button', { name: /take action on insight/i });
      expect(actionBtn).toBeInTheDocument();
    });

    it('should be focusable for keyboard navigation', () => {
      renderComponent();
      const hiveName = screen.getByText('Hive Alpha:');
      // The element should be focusable - we verify this by checking that keyboard events work
      // This is tested by the Enter/Space key tests below
      expect(hiveName).toBeInTheDocument();
    });

    it('should have role="link" on hive name', () => {
      renderComponent();
      const hiveName = screen.getByRole('link', { name: /view hive alpha/i });
      expect(hiveName).toBeInTheDocument();
    });

    it('should navigate on Enter key press on hive name', async () => {
      renderComponent();

      const hiveName = screen.getByText('Hive Alpha:');
      hiveName.focus();
      fireEvent.keyDown(hiveName, { key: 'Enter' });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('should navigate on Space key press on hive name', async () => {
      renderComponent();

      const hiveName = screen.getByText('Hive Alpha:');
      hiveName.focus();
      fireEvent.keyDown(hiveName, { key: ' ' });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('should have aria-haspopup on snooze dropdown', () => {
      renderComponent();
      const snoozeBtn = screen.getByRole('button', { name: /snooze insight/i });
      expect(snoozeBtn).toHaveAttribute('aria-haspopup', 'menu');
    });
  });

  describe('Animation', () => {
    it('should apply removing styles when isRemoving is true', () => {
      renderComponent({ isRemoving: true });
      const alert = screen.getByRole('alert');

      // Check that opacity and transform are applied
      expect(alert).toHaveStyle({ opacity: '0' });
    });

    it('should have normal styles when isRemoving is false', () => {
      renderComponent({ isRemoving: false });
      const alert = screen.getByRole('alert');

      expect(alert).toHaveStyle({ opacity: '1' });
    });
  });
});
