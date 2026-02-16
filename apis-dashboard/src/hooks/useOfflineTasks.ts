/**
 * useOfflineTasks Hook
 *
 * Manages offline-aware task fetching with cache-first strategy.
 * Uses IndexedDB for offline storage and syncs with the server when online.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
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
  data: ServerTask[];
  meta: {
    total: number;
  };
}

/**
 * Hook result interface
 */
export interface UseOfflineTasksResult {
  /** All tasks for the hive (synced + pending offline) */
  tasks: Task[];
  /** Tasks that are overdue (due_date < today AND status = 'pending') */
  overdueTasks: Task[];
  /** Tasks that are pending but not overdue */
  pendingTasks: Task[];
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch tasks from the server (if online) or cache */
  refetch: () => Promise<void>;
  /** Whether the user is currently offline */
  isOffline: boolean;
  /** Number of tasks pending sync */
  pendingSyncCount: number;
}

/**
 * Hook for offline-aware task management.
 *
 * Features:
 * - Cache-first strategy: uses cached tasks if available and not stale
 * - Automatic API fetch when online and cache is stale (> 5 min)
 * - Offline mode: uses cached tasks when offline
 * - Tracks pending sync count
 * - Separates tasks into overdue and pending arrays
 *
 * @param hiveId - The ID of the hive to fetch tasks for
 * @param tenantId - The tenant ID for caching
 *
 * @example
 * const { tasks, overdueTasks, pendingTasks, isOffline, pendingSyncCount } = useOfflineTasks(hive.id, tenantId);
 *
 * if (isOffline) {
 *   return <OfflineBanner pendingSyncCount={pendingSyncCount} />;
 * }
 */
export function useOfflineTasks(
  hiveId: string,
  tenantId: string
): UseOfflineTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
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
    const items = await getPendingTaskSyncItems();
    if (isMountedRef.current) {
      setPendingSyncCount(items.length);
    }
  }, []);

  // Fetch tasks with cache-first strategy
  const fetchTasks = useCallback(async () => {
    if (!hiveId || !tenantId) {
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
      // Get cache timestamp to check staleness
      const cacheTimestamp = await getTasksCacheTimestamp(hiveId);
      const shouldFetchFromApi = !isOffline && isCacheStale(cacheTimestamp);

      if (shouldFetchFromApi) {
        // Fetch from API
        const params = new URLSearchParams();
        params.append('status', 'pending');
        const url = `/hives/${hiveId}/tasks?${params.toString()}`;

        const response = await apiClient.get<HiveTasksResponse>(url);
        const serverTasks = response.data.data || [];

        // Cache the tasks
        await cacheTasksFromServer(hiveId, tenantId, serverTasks);

        if (isMountedRef.current) {
          setTasks(serverTasks.map((t) => ({
            ...t,
            title: t.template_name || t.custom_title || t.title || '',
          }) as Task));
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
      // On error, fall back to cache
      try {
        const cachedTasks = await getCachedTasks(hiveId);
        if (isMountedRef.current) {
          setTasks(cachedTasks.map(cachedToTask));
          setError(err as Error);
        }
      } catch {
        if (isMountedRef.current) {
          setError(err as Error);
          setTasks([]);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [hiveId, tenantId, isOffline, updatePendingSyncCount]);

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

export default useOfflineTasks;
