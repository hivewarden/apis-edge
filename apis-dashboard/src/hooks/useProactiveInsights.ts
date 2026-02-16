/**
 * useProactiveInsights Hook
 *
 * Fetches proactive insights from BeeBrain that require user attention.
 * Supports dismiss, snooze, and "show more" functionality.
 * Uses optimistic updates for responsive UX.
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { message } from 'antd';
import { apiClient } from '../providers/apiClient';
import type { Insight } from './useBeeBrain';

/**
 * Maximum number of insights shown by default (before "show more").
 */
const MAX_VISIBLE_INSIGHTS = 3;

/**
 * Severity priority for sorting (lower = higher priority).
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  'action-needed': 1,
  'warning': 2,
  'info': 3,
};

/**
 * Extended insight with optional action URL for navigation.
 */
export interface ProactiveInsight extends Insight {
  /** Optional action URL for "Take Action" navigation */
  action_url?: string;
}

/**
 * API response wrapper for BeeBrain dashboard data.
 */
interface BeeBrainDashboardResponse {
  data: {
    summary: string;
    last_analysis: string;
    insights: ProactiveInsight[];
    all_good: boolean;
  };
}

/**
 * Return type for the useProactiveInsights hook.
 */
export interface UseProactiveInsightsResult {
  /** All insights sorted by severity */
  insights: ProactiveInsight[];
  /** Currently visible insights (limited to MAX_VISIBLE_INSIGHTS unless showAll) */
  visibleInsights: ProactiveInsight[];
  /** Number of hidden insights (when showAll is false) */
  hiddenCount: number;
  /** Whether all insights are currently shown */
  showAll: boolean;
  /** True during initial load */
  loading: boolean;
  /** Error from API call (null if no error) */
  error: Error | null;
  /** Dismiss an insight permanently */
  dismissInsight: (id: string) => Promise<void>;
  /** Snooze an insight for specified days */
  snoozeInsight: (id: string, days: number) => Promise<void>;
  /** Toggle between showing top 3 and all insights */
  toggleShowAll: () => void;
  /** Manually refresh insights */
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch proactive insights from BeeBrain with dismiss/snooze support.
 *
 * @param siteId - The site ID to fetch insights for (null if no site selected)
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const {
 *     visibleInsights,
 *     hiddenCount,
 *     showAll,
 *     dismissInsight,
 *     snoozeInsight,
 *     toggleShowAll,
 *   } = useProactiveInsights(siteId);
 *
 *   return (
 *     <div>
 *       {visibleInsights.map(insight => (
 *         <InsightCard
 *           key={insight.id}
 *           insight={insight}
 *           onDismiss={() => dismissInsight(insight.id)}
 *           onSnooze={(days) => snoozeInsight(insight.id, days)}
 *         />
 *       ))}
 *       {hiddenCount > 0 && (
 *         <button onClick={toggleShowAll}>
 *           {showAll ? 'Show less' : `Show ${hiddenCount} more`}
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 */
export function useProactiveInsights(siteId: string | null): UseProactiveInsightsResult {
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showAll, setShowAll] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Sort insights by severity priority (action-needed first).
   * SECURITY (S5-M7): Wrap in useMemo to avoid re-sorting on every render.
   */
  const sortedInsights = useMemo(
    () => [...insights].sort((a, b) =>
      (SEVERITY_PRIORITY[a.severity] ?? 99) - (SEVERITY_PRIORITY[b.severity] ?? 99)
    ),
    [insights]
  );

  /**
   * Split into visible and hidden based on showAll state.
   */
  const visibleInsights = useMemo(
    () => showAll ? sortedInsights : sortedInsights.slice(0, MAX_VISIBLE_INSIGHTS),
    [showAll, sortedInsights]
  );
  const hiddenCount = showAll
    ? 0
    : Math.max(0, sortedInsights.length - MAX_VISIBLE_INSIGHTS);

  /**
   * Fetch insights from API.
   * Note: apiClient.baseURL already includes /api prefix (from config.ts),
   * so paths here are relative to /api (e.g., /beebrain/dashboard -> /api/beebrain/dashboard)
   */
  const fetchInsights = useCallback(async (signal?: AbortSignal) => {
    if (!siteId) {
      setInsights([]);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get<BeeBrainDashboardResponse>(
        `/beebrain/dashboard?site_id=${siteId}`,
        { signal }
      );
      setInsights(response.data.data.insights || []);
      setError(null);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch insights'));
      // Log error but don't disrupt UX - graceful degradation
      console.error('[useProactiveInsights] Error fetching insights:', err);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  /**
   * Initial fetch and refetch on siteId change.
   * Note: siteId is included explicitly for clarity even though fetchInsights depends on it.
   */
  useEffect(() => {
    // Reset state when site changes
    setInsights([]);
    setLoading(true);
    setError(null);
    setShowAll(false);

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    fetchInsights(abortControllerRef.current.signal);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- siteId included for clarity; fetchInsights depends on it
  }, [fetchInsights, siteId]);

  /**
   * Dismiss an insight permanently (optimistic update with error feedback).
   */
  const dismissInsight = useCallback(async (id: string) => {
    // Store previous state for potential rollback
    const previousInsights = insights;

    // Optimistic update - remove from local state immediately
    setInsights(prev => prev.filter(i => i.id !== id));

    try {
      await apiClient.post(`/beebrain/insights/${id}/dismiss`);
    } catch (err) {
      // Rollback on error - restore previous state
      setInsights(previousInsights);
      // Show user feedback
      message.error('Failed to dismiss insight. Please try again.');
      console.error('[useProactiveInsights] Error dismissing insight:', err);
      setError(err instanceof Error ? err : new Error('Failed to dismiss insight'));
    }
  }, [insights]);

  /**
   * Snooze an insight for specified number of days (optimistic update with error feedback).
   */
  const snoozeInsight = useCallback(async (id: string, days: number) => {
    // Validate days parameter
    if (![1, 7, 30].includes(days)) {
      const errorMsg = `Invalid snooze days: ${days}. Must be 1, 7, or 30.`;
      console.warn('[useProactiveInsights]', errorMsg);
      message.error(errorMsg);
      setError(new Error(errorMsg));
      return;
    }

    // Store previous state for potential rollback
    const previousInsights = insights;

    // Optimistic update - remove from local state immediately
    setInsights(prev => prev.filter(i => i.id !== id));

    try {
      await apiClient.post(`/beebrain/insights/${id}/snooze?days=${days}`);
    } catch (err) {
      // Rollback on error - restore previous state
      setInsights(previousInsights);
      // Show user feedback
      message.error('Failed to snooze insight. Please try again.');
      console.error('[useProactiveInsights] Error snoozing insight:', err);
      setError(err instanceof Error ? err : new Error('Failed to snooze insight'));
    }
  }, [insights]);

  /**
   * Toggle between showing top 3 and all insights.
   */
  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  /**
   * Manual refresh function.
   */
  const refresh = useCallback(async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<BeeBrainDashboardResponse>(
        `/beebrain/dashboard?site_id=${siteId}`
      );
      setInsights(response.data.data.insights || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh insights'));
      console.error('[useProactiveInsights] Error refreshing insights:', err);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  return {
    insights: sortedInsights,
    visibleInsights,
    hiddenCount,
    showAll,
    loading,
    error,
    dismissInsight,
    snoozeInsight,
    toggleShowAll,
    refresh,
  };
}
