/**
 * useTaskStats Hook
 *
 * Fetches task statistics for navigation badge and overdue alerts.
 * Used by AppLayout for navigation badge and Tasks page for alert banner.
 *
 * Part of Epic 14, Story 14.14
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Task statistics returned by the API.
 */
export interface TaskStats {
  total_open: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
}

interface TaskStatsResponse {
  data: TaskStats;
}

export interface UseTaskStatsResult {
  stats: TaskStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch task statistics for the current tenant.
 *
 * Returns counts for:
 * - total_open: All pending tasks
 * - overdue: Pending tasks where due_date < today
 * - due_today: Pending tasks where due_date = today
 * - due_this_week: Pending tasks due within next 7 days
 *
 * @example
 * function NavBadge() {
 *   const { stats, loading } = useTaskStats();
 *
 *   if (loading || !stats?.overdue) return null;
 *   return <Badge count={stats.overdue} />;
 * }
 */
export function useTaskStats(): UseTaskStatsResult {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<TaskStatsResponse>('/tasks/stats');
      if (isMountedRef.current) {
        setStats(response.data.data);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}

export default useTaskStats;
