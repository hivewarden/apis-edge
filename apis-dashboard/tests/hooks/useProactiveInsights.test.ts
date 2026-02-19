/**
 * useProactiveInsights Hook Tests
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProactiveInsights } from '../../src/hooks/useProactiveInsights';
import { apiClient } from '../../src/providers/apiClient';

// Mock the API client
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockInsights = [
  {
    id: 'insight-1',
    hive_id: 'hive-1',
    hive_name: 'Hive Alpha',
    rule_id: 'treatment_due',
    severity: 'action-needed',
    message: 'Varroa treatment due',
    suggested_action: 'Schedule treatment within a week',
    data_points: { days_since_treatment: 92 },
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-2',
    hive_id: 'hive-2',
    hive_name: 'Hive Beta',
    rule_id: 'queen_aging',
    severity: 'warning',
    message: 'Queen is 3 years old',
    suggested_action: 'Consider requeening',
    data_points: { queen_age_years: 3 },
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-3',
    hive_id: 'hive-3',
    hive_name: 'Hive Gamma',
    rule_id: 'inspection_overdue',
    severity: 'info',
    message: 'Last inspection was 21 days ago',
    suggested_action: 'Schedule an inspection',
    data_points: { days_since_inspection: 21 },
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-4',
    hive_id: 'hive-4',
    hive_name: 'Hive Delta',
    rule_id: 'treatment_due',
    severity: 'warning',
    message: 'Oxalic acid treatment recommended',
    suggested_action: 'Apply treatment',
    data_points: {},
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'insight-5',
    hive_id: null,
    hive_name: null,
    rule_id: 'hornet_activity_spike',
    severity: 'action-needed',
    message: 'High hornet activity detected',
    suggested_action: 'Check defenses',
    data_points: { detection_count: 45 },
    created_at: '2026-01-20T10:00:00Z',
  },
];

describe('useProactiveInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          summary: 'Test summary',
          last_analysis: '2026-01-20T10:00:00Z',
          insights: mockInsights,
          all_good: false,
        },
      },
    });
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { message: 'Success' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty insights when siteId is null', async () => {
    const { result } = renderHook(() => useProactiveInsights(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.insights).toEqual([]);
    expect(result.current.visibleInsights).toEqual([]);
    expect(result.current.hiddenCount).toBe(0);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('should fetch insights when siteId is provided', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/beebrain/dashboard?site_id=site-1',
      expect.any(Object)
    );
    expect(result.current.insights).toHaveLength(5);
  });

  it('should sort insights by severity (action-needed first, then warning, then info)', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check severity order
    const severities = result.current.insights.map(i => i.severity);

    // All action-needed should come first
    const actionNeededIndices = severities
      .map((s, i) => (s === 'action-needed' ? i : -1))
      .filter(i => i !== -1);
    const warningIndices = severities
      .map((s, i) => (s === 'warning' ? i : -1))
      .filter(i => i !== -1);
    const infoIndices = severities
      .map((s, i) => (s === 'info' ? i : -1))
      .filter(i => i !== -1);

    // All action-needed should be before any warning
    for (const actionIdx of actionNeededIndices) {
      for (const warningIdx of warningIndices) {
        expect(actionIdx).toBeLessThan(warningIdx);
      }
    }

    // All warning should be before any info
    for (const warningIdx of warningIndices) {
      for (const infoIdx of infoIndices) {
        expect(warningIdx).toBeLessThan(infoIdx);
      }
    }
  });

  it('should limit visible insights to 3 by default', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.visibleInsights).toHaveLength(3);
    expect(result.current.hiddenCount).toBe(2);
    expect(result.current.showAll).toBe(false);
  });

  it('should show all insights when toggleShowAll is called', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.visibleInsights).toHaveLength(3);

    act(() => {
      result.current.toggleShowAll();
    });

    expect(result.current.showAll).toBe(true);
    expect(result.current.visibleInsights).toHaveLength(5);
    expect(result.current.hiddenCount).toBe(0);
  });

  it('should toggle back to limited view when toggleShowAll is called again', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Show all
    act(() => {
      result.current.toggleShowAll();
    });
    expect(result.current.showAll).toBe(true);

    // Toggle back
    act(() => {
      result.current.toggleShowAll();
    });
    expect(result.current.showAll).toBe(false);
    expect(result.current.visibleInsights).toHaveLength(3);
  });

  it('should dismiss insight with optimistic update', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCount = result.current.insights.length;

    await act(async () => {
      await result.current.dismissInsight('insight-1');
    });

    // Insight should be removed immediately (optimistic)
    expect(result.current.insights).toHaveLength(initialCount - 1);
    expect(result.current.insights.find(i => i.id === 'insight-1')).toBeUndefined();

    // API should be called
    expect(apiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-1/dismiss');
  });

  it('should snooze insight with optimistic update', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCount = result.current.insights.length;

    await act(async () => {
      await result.current.snoozeInsight('insight-2', 7);
    });

    // Insight should be removed immediately (optimistic)
    expect(result.current.insights).toHaveLength(initialCount - 1);
    expect(result.current.insights.find(i => i.id === 'insight-2')).toBeUndefined();

    // API should be called with correct days param
    expect(apiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-2/snooze?days=7');
  });

  it('should support snooze for 1, 7, and 30 days', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Test 1 day snooze
    await act(async () => {
      await result.current.snoozeInsight('insight-1', 1);
    });
    expect(apiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-1/snooze?days=1');

    vi.clearAllMocks();

    // Test 7 days snooze
    await act(async () => {
      await result.current.snoozeInsight('insight-2', 7);
    });
    expect(apiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-2/snooze?days=7');

    vi.clearAllMocks();

    // Test 30 days snooze
    await act(async () => {
      await result.current.snoozeInsight('insight-3', 30);
    });
    expect(apiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-3/snooze?days=30');
  });

  it('should not call API for invalid snooze days', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    await act(async () => {
      await result.current.snoozeInsight('insight-1', 5);
    });

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      '[useProactiveInsights]',
      'Invalid snooze days: 5. Must be 1, 7, or 30.'
    );

    consoleWarn.mockRestore();
  });

  it('should refresh insights when refresh is called', async () => {
    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    await act(async () => {
      await result.current.refresh();
    });

    expect(apiClient.get).toHaveBeenCalledWith('/beebrain/dashboard?site_id=site-1');
  });

  it('should reset state when siteId changes', async () => {
    const { result, rerender } = renderHook(
      ({ siteId }) => useProactiveInsights(siteId),
      { initialProps: { siteId: 'site-1' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.insights).toHaveLength(5);

    // Change site
    rerender({ siteId: 'site-2' });

    // Should reset and refetch
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/beebrain/dashboard?site_id=site-2',
        expect.any(Object)
      );
    });
  });

  it('should handle API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.insights).toEqual([]);

    consoleError.mockRestore();
  });

  it('should rollback dismiss on API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Dismiss failed')
    );

    const { result } = renderHook(() => useProactiveInsights('site-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCount = result.current.insights.length;

    await act(async () => {
      await result.current.dismissInsight('insight-1');
    });

    // Insight should be restored (rollback on error)
    expect(result.current.insights).toHaveLength(initialCount);
    expect(result.current.error?.message).toBe('Dismiss failed');

    consoleError.mockRestore();
  });
});
