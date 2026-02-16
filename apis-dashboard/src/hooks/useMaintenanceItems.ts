/**
 * useMaintenanceItems Hook
 *
 * Fetches maintenance items from the BeeBrain maintenance API.
 * Returns hives that need attention, sorted by priority score.
 *
 * Part of Epic 8, Story 8.5: Maintenance Priority View
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import type { Insight } from './useBeeBrain';

/**
 * Quick action button for a maintenance item.
 */
export interface QuickAction {
  /** Button label text */
  label: string;
  /** Navigation URL */
  url: string;
  /** Optional tab to activate on the target page */
  tab?: string;
}

/**
 * A hive that needs attention.
 */
export interface MaintenanceItem {
  /** Unique hive identifier */
  hive_id: string;
  /** Human-readable hive name */
  hive_name: string;
  /** Site identifier */
  site_id: string;
  /** Human-readable site name */
  site_name: string;
  /** Priority level: "Urgent", "Soon", or "Optional" */
  priority: 'Urgent' | 'Soon' | 'Optional';
  /** Numeric priority score for sorting (higher = more urgent) */
  priority_score: number;
  /** Summary text describing the most urgent issue */
  summary: string;
  /** All active insights for this hive */
  insights: Insight[];
  /** Available quick action buttons */
  quick_actions: QuickAction[];
}

/**
 * A recently completed maintenance action.
 */
export interface RecentlyCompletedItem {
  /** Hive identifier */
  hive_id: string;
  /** Hive name */
  hive_name: string;
  /** Description of the action taken */
  action: string;
  /** When the action was completed */
  completed_at: string;
}

/**
 * Maintenance API response data.
 */
export interface MaintenanceData {
  /** List of hives needing attention */
  items: MaintenanceItem[];
  /** Recently completed maintenance actions */
  recently_completed: RecentlyCompletedItem[];
  /** Total number of items needing attention */
  total_count: number;
  /** True if no maintenance is needed */
  all_caught_up: boolean;
}

/**
 * API response wrapper.
 */
interface MaintenanceResponse {
  data: MaintenanceData;
}

/**
 * UUID v4 format validation regex.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4 format.
 */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Return type for the useMaintenanceItems hook.
 */
export interface UseMaintenanceItemsResult {
  /** Maintenance data (null if not yet loaded) */
  data: MaintenanceData | null;
  /** True during initial load */
  loading: boolean;
  /** Error from API call (null if no error) */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch maintenance items from the BeeBrain maintenance API.
 *
 * @param siteId - Optional site ID to filter by (null for all sites)
 *
 * @example
 * function MaintenancePage() {
 *   const { data, loading, error, refetch } = useMaintenanceItems(null);
 *
 *   if (loading) return <Skeleton />;
 *   if (error) return <ErrorMessage />;
 *   if (data?.all_caught_up) return <AllCaughtUpMessage />;
 *
 *   return <MaintenanceList items={data.items} />;
 * }
 */
export function useMaintenanceItems(siteId: string | null): UseMaintenanceItemsResult {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // SECURITY (S5-H1): isMountedRef prevents state updates after unmount
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate site_id format if provided to prevent invalid API requests
      let queryParams = '';
      if (siteId) {
        if (!isValidUUID(siteId)) {
          throw new Error('Invalid site ID format');
        }
        queryParams = `?site_id=${encodeURIComponent(siteId)}`;
      }

      const response = await apiClient.get<MaintenanceResponse>(
        `/beebrain/maintenance${queryParams}`
      );

      if (isMountedRef.current) {
        setData(response.data.data);
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
  }, [siteId]);

  // Fetch on mount and when siteId changes
  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => { isMountedRef.current = false; };
  }, [fetchData]);

  // Refetch function for use after completing actions
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}
