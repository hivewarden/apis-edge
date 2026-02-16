/**
 * useHiveActivity - Hook for fetching hive activity log entries
 *
 * Story 14.13: Task Completion Inspection Note Logging
 * Follows layered hooks architecture pattern.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../providers/apiClient";

/**
 * Activity log entry metadata for task completions.
 */
export interface ActivityLogMetadata {
  task_id?: string;
  task_name?: string;
  completion_data?: Record<string, unknown>;
  notes?: string;
  auto_applied?: boolean;
  changes?: string[];
}

/**
 * Activity log entry from the API.
 */
export interface ActivityLogEntry {
  id: string;
  hive_id: string;
  type: string;
  content: string;
  metadata?: ActivityLogMetadata;
  created_by: string;
  created_at: string;
}

/**
 * Options for the useHiveActivity hook.
 */
export interface UseHiveActivityOptions {
  /** Filter by activity type (e.g., 'task_completion') */
  type?: string;
  /** Current page (1-indexed) */
  page?: number;
  /** Items per page (max 100) */
  pageSize?: number;
}

/**
 * Result type for the useHiveActivity hook.
 */
export interface UseHiveActivityResult {
  data: ActivityLogEntry[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch activity log entries for a hive.
 *
 * @param hiveId - The hive ID to fetch activity for
 * @param options - Optional filtering and pagination options
 * @returns Activity entries with loading and error states
 *
 * @example
 * ```tsx
 * const { data, loading, error, total, refetch } = useHiveActivity(hiveId, {
 *   type: 'task_completion',
 *   page: 1,
 *   pageSize: 20
 * });
 * ```
 */
export function useHiveActivity(
  hiveId: string,
  options?: UseHiveActivityOptions
): UseHiveActivityResult {
  const [data, setData] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!hiveId) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options?.type) params.set("type", options.type);
      if (options?.page) params.set("page", options.page.toString());
      if (options?.pageSize) params.set("per_page", options.pageSize.toString());

      const queryString = params.toString();
      const url = queryString
        ? `/hives/${hiveId}/activity?${queryString}`
        : `/hives/${hiveId}/activity`;

      const response = await apiClient.get(url);

      if (isMountedRef.current) {
        setData(response.data.data || []);
        setTotal(response.data.meta?.total || 0);
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
  }, [hiveId, options?.type, options?.page, options?.pageSize]);

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetch]);

  return { data, total, loading, error, refetch: fetch };
}

export default useHiveActivity;
