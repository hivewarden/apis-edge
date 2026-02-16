/**
 * useHivesList Hook
 *
 * Fetches hives list with optional site filter.
 * Used by Activity, Export, TaskAssignmentSection, Hives page.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import type { HiveStatus, HiveLifecycleStatus } from '../types';

/**
 * Hive list item data returned by the API.
 */
export interface HiveListItem {
  id: string;
  site_id: string;
  site_name?: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  queen_age_display: string | null;
  brood_boxes: number;
  honey_supers: number;
  last_inspection_at: string | null;
  last_inspection_issues: string[] | null;
  status: HiveStatus;
  hive_status: HiveLifecycleStatus;
  lost_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HivesResponse {
  data: HiveListItem[];
  meta: {
    total: number;
  };
}

export interface UseHivesListResult {
  hives: HiveListItem[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseHivesListOptions {
  /** Filter to only active hives (exclude lost/archived) */
  activeOnly?: boolean;
  /** Include task summary in response */
  includeTasks?: boolean;
}

/**
 * Hook to fetch hives list with optional site filter.
 *
 * @param siteId - Optional site ID to filter hives by
 * @param options - Additional filter options
 *
 * @example
 * function HivesList({ siteId }) {
 *   const { hives, loading, error } = useHivesList(siteId);
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading hives" />;
 *
 *   return (
 *     <List dataSource={hives} renderItem={...} />
 *   );
 * }
 */
export function useHivesList(
  siteId?: string | null,
  options?: UseHivesListOptions
): UseHivesListResult {
  const [hives, setHives] = useState<HiveListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchHives = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (siteId) {
        params.append('site_id', siteId);
      }
      if (options?.activeOnly) {
        params.append('status', 'active');
      }
      if (options?.includeTasks) {
        params.append('include_tasks', 'true');
      }

      const queryString = params.toString();
      const url = queryString ? `/hives?${queryString}` : '/hives';

      const response = await apiClient.get<HivesResponse>(url);
      if (isMountedRef.current) {
        setHives(response.data.data || []);
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
  }, [siteId, options?.activeOnly, options?.includeTasks]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchHives();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchHives]);

  return {
    hives,
    total,
    loading,
    error,
    refetch: fetchHives,
  };
}

export default useHivesList;
