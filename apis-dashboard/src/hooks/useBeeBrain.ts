/**
 * useBeeBrain Hook
 *
 * Fetches BeeBrain AI analysis data for a site with auto-refresh every hour.
 * Includes manual refresh capability with 10-second timeout.
 *
 * Part of Epic 8, Story 8.2: Dashboard BeeBrain Card
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Auto-refresh interval (1 hour) - matches server cache TTL.
 * BeeBrain analysis is computationally expensive, so we cache results.
 */
const BEEBRAIN_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Timeout for manual refresh operations (10 seconds).
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
 * BeeBrain analysis data structure.
 * Contains summary text and any insights/warnings.
 */
export interface BeeBrainData {
  /** Summary text describing overall status */
  summary: string;
  /** ISO 8601 timestamp of when analysis was last run */
  last_analysis: string;
  /** Array of insights (empty if all_good is true) */
  insights: Insight[];
  /** True if there are no warnings or action items */
  all_good: boolean;
}

/**
 * API response wrapper for BeeBrain data.
 */
interface BeeBrainResponse {
  data: BeeBrainData;
}

/**
 * Return type for the useBeeBrain hook.
 */
export interface UseBeeBrainResult {
  /** Current BeeBrain analysis data (null if not yet loaded) */
  data: BeeBrainData | null;
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
}

/**
 * Hook to fetch BeeBrain AI analysis data with auto-refresh.
 *
 * @param siteId - The site ID to fetch analysis for (null if no site selected)
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const { data, loading, refreshing, error, timedOut, refresh } = useBeeBrain(siteId);
 *
 *   if (loading) return <Skeleton />;
 *   if (timedOut) return <TimeoutMessage />;
 *   if (error) return <ErrorMessage retry={refresh} />;
 *
 *   return data?.all_good ? <AllGoodMessage /> : <InsightsList insights={data.insights} />;
 * }
 */
export function useBeeBrain(siteId: string | null): UseBeeBrainResult {
  const [data, setData] = useState<BeeBrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Use ref for timedOut to avoid stale closure in async callbacks
  const timedOutRef = useRef(false);

  /**
   * Manual refresh function that triggers a new BeeBrain analysis.
   * Includes 10-second timeout handling.
   */
  const refresh = useCallback(async () => {
    if (!siteId || refreshing) return;

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
      // Trigger new analysis
      await apiClient.post(`/beebrain/refresh?site_id=${siteId}`, {}, {
        signal: abortController.signal,
      });

      // Fetch updated data
      const response = await apiClient.get<BeeBrainResponse>(
        `/beebrain/dashboard?site_id=${siteId}`,
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
  }, [siteId, refreshing]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Reset state when site changes
    setData(null);
    setLoading(true);
    setError(null);
    setTimedOut(false);
    setRefreshing(false);

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

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

    if (!siteId) {
      setLoading(false);
      return;
    }

    // Fetch immediately
    const doFetch = async () => {
      try {
        const response = await apiClient.get<BeeBrainResponse>(
          `/beebrain/dashboard?site_id=${siteId}`
        );
        setData(response.data.data);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    doFetch();

    // Set up auto-refresh interval
    intervalRef.current = setInterval(doFetch, BEEBRAIN_REFRESH_INTERVAL_MS);

    // Cleanup on unmount or site change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [siteId]);

  return { data, loading, refreshing, error, timedOut, refresh };
}
