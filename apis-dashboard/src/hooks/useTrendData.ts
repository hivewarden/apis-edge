/**
 * useTrendData Hook
 *
 * Fetches detection trend data for line/area charts.
 * Aggregation depends on time range:
 * - day: hourly
 * - week/month: daily
 * - season/year/all: weekly
 *
 * Part of Epic 3, Story 3.7: Daily/Weekly Trend Line Chart
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * A single trend data point.
 */
export interface TrendPoint {
  label: string;
  date?: string;
  hour?: number;
  count: number;
}

interface TrendMeta {
  range: string;
  aggregation: string;
  total_detections: number;
}

interface TrendDataResponse {
  data: TrendPoint[];
  meta: TrendMeta;
}

interface UseTrendDataResult {
  points: TrendPoint[];
  aggregation: string;
  totalDetections: number;
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
 * Hook to fetch trend data for a site.
 *
 * @param siteId - The site ID to fetch data for (null if no site selected)
 * @param range - Time range ('day', 'week', 'month', etc.) defaults to 'week'
 * @param date - Optional specific date for day range queries
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const { points, loading, error } = useTrendData(siteId, 'week');
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading data" />;
 *
 *   return <AreaChart data={points} />;
 * }
 */
export function useTrendData(
  siteId: string | null,
  range: string = 'week',
  date: Date | null = null
): UseTrendDataResult {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [aggregation, setAggregation] = useState('daily');
  const [totalDetections, setTotalDetections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Convert date to stable string for dependency array
  const dateStr = formatDateParam(date);

  const fetchTrend = useCallback(async () => {
    if (!siteId) {
      setPoints([]);
      setAggregation('daily');
      setTotalDetections(0);
      setLoading(false);
      return;
    }

    try {
      // Build URL with optional date parameter
      let url = `/detections/trend?site_id=${siteId}&range=${range}`;
      if (dateStr && range === 'day') {
        url += `&date=${dateStr}`;
      }

      const response = await apiClient.get<TrendDataResponse>(url);
      setPoints(response.data.data || []);
      setAggregation(response.data.meta.aggregation);
      setTotalDetections(response.data.meta.total_detections);
      setError(null);
    } catch (err) {
      setError(err as Error);
      // Keep showing previous data on error
    } finally {
      setLoading(false);
    }
  }, [siteId, range, dateStr]);

  useEffect(() => {
    setLoading(true);
    fetchTrend();
  }, [fetchTrend]);

  return { points, aggregation, totalDetections, loading, error, refetch: fetchTrend };
}

export default useTrendData;
