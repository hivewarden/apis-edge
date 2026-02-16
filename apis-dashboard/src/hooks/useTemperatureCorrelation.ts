/**
 * useTemperatureCorrelation Hook
 *
 * Fetches temperature vs detection correlation data for a site.
 * For range == "day": returns hourly data points
 * For other ranges: returns daily data points
 *
 * Part of Epic 3, Story 3.6: Temperature Correlation Chart
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * A single correlation data point.
 * Uses discriminated union for type safety:
 * - DailyCorrelationPoint: has date field (YYYY-MM-DD)
 * - HourlyCorrelationPoint: has hour field (0-23)
 */
interface DailyCorrelationPoint {
  date: string;
  hour?: never;
  avg_temp: number;
  detection_count: number;
}

interface HourlyCorrelationPoint {
  date?: never;
  hour: number;
  avg_temp: number;
  detection_count: number;
}

export type CorrelationPoint = DailyCorrelationPoint | HourlyCorrelationPoint;

interface CorrelationMeta {
  range: string;
  date?: string;
  total_points: number;
  is_hourly: boolean;
}

interface TemperatureCorrelationResponse {
  data: CorrelationPoint[];
  meta: CorrelationMeta;
}

interface UseTemperatureCorrelationResult {
  points: CorrelationPoint[];
  isHourly: boolean;
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
 * Hook to fetch temperature correlation data for a site.
 *
 * @param siteId - The site ID to fetch data for (null if no site selected)
 * @param range - Time range ('day', 'week', 'month', etc.) defaults to 'month'
 * @param date - Optional specific date for day range queries
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const { points, isHourly, loading, error } = useTemperatureCorrelation(siteId, 'month');
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading data" />;
 *
 *   return <ScatterChart data={points} />;
 * }
 */
export function useTemperatureCorrelation(
  siteId: string | null,
  range: string = 'month',
  date: Date | null = null
): UseTemperatureCorrelationResult {
  const [points, setPoints] = useState<CorrelationPoint[]>([]);
  const [isHourly, setIsHourly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // SECURITY (S5-H1): isMountedRef prevents state updates after unmount
  const isMountedRef = useRef(true);

  // Convert date to stable string for dependency array
  const dateStr = formatDateParam(date);

  const fetchCorrelation = useCallback(async () => {
    if (!siteId) {
      setPoints([]);
      setIsHourly(false);
      setLoading(false);
      return;
    }

    try {
      // Build URL with optional date parameter
      let url = `/detections/temperature-correlation?site_id=${siteId}&range=${range}`;
      if (dateStr && range === 'day') {
        url += `&date=${dateStr}`;
      }

      const response = await apiClient.get<TemperatureCorrelationResponse>(url);
      if (isMountedRef.current) {
        setPoints(response.data.data || []);
        setIsHourly(response.data.meta.is_hourly);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
      }
      // Keep showing previous data on error
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [siteId, range, dateStr]);

  useEffect(() => {
    isMountedRef.current = true;
    setLoading(true);
    fetchCorrelation();
    return () => { isMountedRef.current = false; };
  }, [fetchCorrelation]);

  return { points, isHourly, loading, error, refetch: fetchCorrelation };
}

export default useTemperatureCorrelation;
