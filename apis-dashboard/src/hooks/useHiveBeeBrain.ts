/**
 * useHiveBeeBrain Hook
 *
 * Fetches BeeBrain AI analysis data for a specific hive.
 * Includes manual refresh capability with 10-second timeout.
 *
 * Part of Epic 8, Story 8.3: Hive Detail BeeBrain Analysis
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Timeout for refresh operations (10 seconds).
 * If analysis takes longer, we show a timeout message.
 */
const REFRESH_TIMEOUT_MS = 10000;

/**
 * Individual insight from BeeBrain analysis.
 * Represents a single observation or recommendation about a hive.
 */
export interface Insight {
  /** Unique identifier for this insight */
  id: string;
  /** Hive ID if insight is hive-specific (null for tenant-wide insights) */
  hive_id: string | null;
  /** Human-readable hive name for display */
  hive_name: string | null;
  /** Rule that generated this insight (e.g., 'treatment_due', 'queen_aging') */
  rule_id: string;
  /** Severity level: info (blue), warning (orange), action-needed (red) */
  severity: 'info' | 'warning' | 'action-needed';
  /** Main message displayed to user */
  message: string;
  /** Recommended action for the beekeeper */
  suggested_action: string;
  /** Supporting data points used to generate insight */
  data_points: Record<string, unknown>;
  /** When this insight was created */
  created_at: string;
}

/**
 * Hive-specific BeeBrain analysis data structure.
 * Contains health assessment and insights for a single hive.
 */
export interface HiveBeeBrainData {
  /** The hive ID this analysis is for */
  hive_id: string;
  /** Human-readable hive name */
  hive_name: string;
  /** Overall health assessment text */
  health_assessment: string;
  /** Array of insights (empty if all is good) */
  insights: Insight[];
  /** General recommendations list */
  recommendations: string[];
  /** ISO 8601 timestamp of when analysis was last run */
  last_analysis: string;
}

/**
 * API response wrapper for hive BeeBrain data.
 */
interface HiveBeeBrainResponse {
  data: HiveBeeBrainData;
}

/**
 * Dismiss insight response.
 */
interface DismissInsightResponse {
  data: {
    message: string;
    id: string;
  };
}

/**
 * Return type for the useHiveBeeBrain hook.
 */
export interface UseHiveBeeBrainResult {
  /** Current hive BeeBrain analysis data (null if not yet loaded) */
  data: HiveBeeBrainData | null;
  /** True during initial load */
  loading: boolean;
  /** True during manual refresh */
  refreshing: boolean;
  /** Error from API call (null if no error) */
  error: Error | null;
  /** True if refresh operation timed out */
  timedOut: boolean;
  /** Function to manually trigger a new analysis */
  refresh: () => Promise<void>;
  /** Function to dismiss an insight */
  dismissInsight: (insightId: string) => Promise<void>;
}

/**
 * Hook to fetch BeeBrain AI analysis data for a specific hive.
 *
 * @param hiveId - The hive ID to fetch analysis for (null if no hive selected)
 *
 * @example
 * function MyComponent({ hiveId }) {
 *   const { data, loading, refreshing, error, timedOut, refresh, dismissInsight } = useHiveBeeBrain(hiveId);
 *
 *   if (loading) return <Skeleton />;
 *   if (timedOut) return <TimeoutMessage />;
 *   if (error) return <ErrorMessage retry={refresh} />;
 *
 *   return <AnalysisContent data={data} onDismiss={dismissInsight} />;
 * }
 */
export function useHiveBeeBrain(hiveId: string | null): UseHiveBeeBrainResult {
  const [data, setData] = useState<HiveBeeBrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Use ref for timedOut to avoid stale closure in async callbacks
  const timedOutRef = useRef(false);

  /**
   * Dismiss an insight so it won't appear again for 30 days.
   * Performs optimistic update - removes from local state immediately.
   */
  const dismissInsight = useCallback(async (insightId: string) => {
    if (!hiveId) return;

    // Optimistic update - remove insight from local state
    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        insights: prevData.insights.filter((insight) => insight.id !== insightId),
      };
    });

    try {
      await apiClient.post<DismissInsightResponse>(`/beebrain/insights/${insightId}/dismiss`);
    } catch (err) {
      // Revert optimistic update on error by refetching
      try {
        const response = await apiClient.get<HiveBeeBrainResponse>(`/beebrain/hive/${hiveId}`);
        setData(response.data.data);
      } catch {
        // If refetch also fails, just show the error
      }
      throw err;
    }
  }, [hiveId]);

  /**
   * Manual refresh function that re-fetches hive BeeBrain analysis.
   * Includes 10-second timeout handling.
   */
  const refresh = useCallback(async () => {
    if (!hiveId || refreshing) return;

    // Cancel any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setRefreshing(true);
    setTimedOut(false);
    timedOutRef.current = false;
    setError(null);

    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      setTimedOut(true);
      setRefreshing(false);
      abortController.abort();
    }, REFRESH_TIMEOUT_MS);

    try {
      // Fetch fresh analysis data
      const response = await apiClient.get<HiveBeeBrainResponse>(
        `/beebrain/hive/${hiveId}`,
        { signal: abortController.signal }
      );

      // Clear timeout since we succeeded
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setData(response.data.data);
      setError(null);
      setTimedOut(false);
      timedOutRef.current = false;
    } catch (err) {
      // Handle abort errors separately from other errors
      const isAbortError = err instanceof Error && err.name === 'AbortError';
      const wasTimedOut = timedOutRef.current;

      // If aborted due to timeout, error is already handled by timeout callback
      // If aborted for other reasons (user cancellation), ignore silently
      // Only set error for non-abort failures when not timed out
      if (!isAbortError && !wasTimedOut) {
        setError(err as Error);
      }
    } finally {
      // Only update refreshing if not already handled by timeout
      if (!timedOutRef.current) {
        setRefreshing(false);
      }
      // Clear timeout ref if it wasn't already cleared
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [hiveId, refreshing]);

  // Initial fetch
  useEffect(() => {
    // Reset state when hive changes
    setData(null);
    setLoading(true);
    setError(null);
    setTimedOut(false);
    setRefreshing(false);

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!hiveId) {
      setLoading(false);
      return;
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Fetch immediately
    const doFetch = async () => {
      try {
        const response = await apiClient.get<HiveBeeBrainResponse>(
          `/beebrain/hive/${hiveId}`,
          { signal: abortController.signal }
        );
        setData(response.data.data);
        setError(null);
      } catch (err) {
        // Don't set error for abort
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    doFetch();

    // Cleanup on unmount or hive change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [hiveId]);

  return { data, loading, refreshing, error, timedOut, refresh, dismissInsight };
}
