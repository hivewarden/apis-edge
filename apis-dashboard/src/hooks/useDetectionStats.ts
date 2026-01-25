/**
 * useDetectionStats Hook
 *
 * Fetches detection statistics for a site with automatic polling.
 * Used by dashboard components to display detection activity.
 *
 * Part of Epic 3, Story 3.1 (base) and Story 3.4 (time range support)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

const POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * Detection statistics returned by the API.
 */
export interface DetectionStats {
  total_detections: number;
  laser_activations: number;
  hourly_breakdown: number[];
  avg_confidence: number | null;
  first_detection: string | null;
  last_detection: string | null;
}

interface DetectionStatsResponse {
  data: DetectionStats;
}

interface UseDetectionStatsResult {
  stats: DetectionStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Format date to YYYY-MM-DD for API parameter.
 */
function formatDateParam(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

/**
 * Hook to fetch detection statistics for a site.
 *
 * @param siteId - The site ID to fetch stats for (null if no site selected)
 * @param range - Time range ('day', 'week', 'month', etc.) defaults to 'day'
 * @param date - Optional specific date for day range queries
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const { stats, loading, error } = useDetectionStats(siteId);
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading stats" />;
 *
 *   return <div>{stats?.total_detections} detections</div>;
 * }
 */
export function useDetectionStats(
  siteId: string | null,
  range: string = 'day',
  date: Date | null = null
): UseDetectionStatsResult {
  const [stats, setStats] = useState<DetectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Convert date to stable string for dependency array (Date objects are reference-unequal)
  const dateStr = formatDateParam(date);

  const fetchStats = useCallback(async () => {
    if (!siteId) {
      setStats(null);
      setLoading(false);
      return;
    }

    try {
      // Build URL with optional date parameter
      let url = `/detections/stats?site_id=${siteId}&range=${range}`;
      if (dateStr && range === 'day') {
        url += `&date=${dateStr}`;
      }

      const response = await apiClient.get<DetectionStatsResponse>(url);
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      // Don't clear stats on error - keep showing stale data
    } finally {
      setLoading(false);
    }
  }, [siteId, range, dateStr]);

  useEffect(() => {
    // Reset loading when parameters change
    setLoading(true);
    fetchStats();

    // Set up polling interval
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);

    // Cleanup on unmount or dependency change
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export default useDetectionStats;
