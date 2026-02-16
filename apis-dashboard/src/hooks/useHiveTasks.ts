/**
 * useHiveTasks Hook
 *
 * Fetches tasks for a specific hive and separates them into overdue and pending arrays.
 * Provides sorting by priority and due date for proper display in the mobile tasks section.
 * Supports offline mode with IndexedDB caching (Story 14.16).
 *
 * Part of Epic 14, Stories 14.9 and 14.16
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import { Task } from './useTasks';
import {
  cachedToTask,
  isCacheStale,
  isOverdue,
  sortByPriority,
  sortByPriorityThenDueDate,
} from '../utils';
import {
  cacheTasksFromServer,
  getCachedTasks,
  getTasksCacheTimestamp,
  getPendingTaskSyncItems,
  type ServerTask,
} from '../services/offlineTasks';

/**
 * API response structure for hive tasks
 */
interface HiveTasksResponse {
  data: Task[];
  meta: {
    total: number;
  };
}

/**
 * Status filter for task queries
 */
export type TaskStatusFilter = 'pending' | 'completed' | 'all';

/**
 * Hook result interface
 */
export interface UseHiveTasksResult {
  /** All tasks for the hive */
  tasks: Task[];
  /** Tasks that are overdue (due_date < today AND status = 'pending') */
  overdueTasks: Task[];
  /** Tasks that are pending but not overdue */
  pendingTasks: Task[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch tasks from the server */
  refetch: () => Promise<void>;
  /** Whether the user is currently offline (Story 14.16) */
  isOffline: boolean;
  /** Number of tasks pending sync (Story 14.16) */
  pendingSyncCount: number;
}


/**
 * Hook for fetching and managing tasks for a specific hive.
 *
 * Features:
 * - Fetches tasks from GET /api/hives/{hiveId}/tasks
 * - Separates tasks into overdue and pending arrays
 * - Sorts overdue by priority
 * - Sorts pending by priority, then due date
 * - Supports offline mode with IndexedDB caching (Story 14.16)
 * - Cache-first strategy with 5-minute staleness threshold
 *
 * @param hiveId - The ID of the hive to fetch tasks for
 * @param status - Optional status filter (defaults to 'pending')
 * @param tenantId - Optional tenant ID for caching (uses auth context if not provided)
 *
 * @example
 * const { overdueTasks, pendingTasks, loading, error, refetch, isOffline, pendingSyncCount } = useHiveTasks(hive.id);
 *
 * if (loading) return <Spin />;
 * if (error) return <Alert message={error} type="error" />;
 *
 * return (
 *   <>
 *     {isOffline && <OfflineTasksBanner pendingSyncCount={pendingSyncCount} />}
 *     {overdueTasks.length > 0 && <OverdueSection tasks={overdueTasks} />}
 *     {pendingTasks.length > 0 && <PendingSection tasks={pendingTasks} />}
 *   </>
 * );
 */
export function useHiveTasks(
  hiveId: string,
  status: TaskStatusFilter = 'pending',
  tenantId?: string
): UseHiveTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const isMountedRef = useRef(true);

  // Track online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update pending sync count
  const updatePendingSyncCount = useCallback(async () => {
    try {
      const items = await getPendingTaskSyncItems();
      if (isMountedRef.current) {
        setPendingSyncCount(items.length);
      }
    } catch {
      // Ignore errors in counting
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!hiveId) {
      if (isMountedRef.current) {
        setTasks([]);
        setLoading(false);
      }
      return;
    }

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      // Check cache staleness
      const cacheTimestamp = await getTasksCacheTimestamp(hiveId);
      const currentlyOffline = !navigator.onLine;
      const shouldFetchFromApi = !currentlyOffline && isCacheStale(cacheTimestamp);

      if (shouldFetchFromApi) {
        // Fetch from API
        const params = new URLSearchParams();
        if (status !== 'all') {
          params.append('status', status);
        }

        const queryString = params.toString();
        const url = `/hives/${hiveId}/tasks${queryString ? `?${queryString}` : ''}`;

        const response = await apiClient.get<HiveTasksResponse>(url);
        const serverTasks = response.data.data || [];

        // Cache the tasks (if tenantId is available)
        if (tenantId) {
          await cacheTasksFromServer(hiveId, tenantId, serverTasks as ServerTask[]);
        }

        if (isMountedRef.current) {
          setTasks(serverTasks);
        }
      } else {
        // Use cached tasks
        const cachedTasks = await getCachedTasks(hiveId);
        if (isMountedRef.current) {
          setTasks(cachedTasks.map(cachedToTask));
        }
      }

      // Update pending sync count
      await updatePendingSyncCount();
    } catch (err) {
      // On error, try to fall back to cache
      try {
        const cachedTasks = await getCachedTasks(hiveId);
        if (isMountedRef.current && cachedTasks.length > 0) {
          setTasks(cachedTasks.map(cachedToTask));
          // Still set error for visibility but we have data
          const message = err instanceof Error ? err.message : 'Failed to load tasks';
          setError(message);
        } else if (isMountedRef.current) {
          const message = err instanceof Error ? err.message : 'Failed to load tasks';
          setError(message);
          setTasks([]);
        }
      } catch {
        if (isMountedRef.current) {
          const message = err instanceof Error ? err.message : 'Failed to load tasks';
          setError(message);
          setTasks([]);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [hiveId, status, tenantId, updatePendingSyncCount]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    isMountedRef.current = true;
    fetchTasks();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchTasks]);

  // Separate and sort tasks
  const { overdueTasks, pendingTasks } = useMemo(() => {
    // Filter for pending tasks only when separating
    const pendingOnly = tasks.filter((t) => t.status === 'pending');

    // Separate into overdue and not-overdue
    const overdue = pendingOnly.filter(isOverdue).sort(sortByPriority);
    const pending = pendingOnly.filter((t) => !isOverdue(t)).sort(sortByPriorityThenDueDate);

    return {
      overdueTasks: overdue,
      pendingTasks: pending,
    };
  }, [tasks]);

  return {
    tasks,
    overdueTasks,
    pendingTasks,
    loading,
    error,
    refetch: fetchTasks,
    isOffline,
    pendingSyncCount,
  };
}

export default useHiveTasks;
