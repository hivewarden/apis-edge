/**
 * useActivityFeed Hook
 *
 * Fetches activity feed with cursor-based pagination and filtering.
 * Used by Dashboard, Activity page, and detail pages.
 *
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import { ACTIVITY_FEED_DEFAULT_LIMIT } from '../constants';

/**
 * Activity item returned by the API.
 */
export interface ActivityItem {
  id: string;
  activity_type: string;
  icon: string;
  message: string;
  relative_time: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  hive_id?: string;
  hive_name?: string;
}

interface ActivityResponse {
  data: ActivityItem[];
  meta: {
    cursor?: string;
    cursor_time?: string;
    has_more: boolean;
  };
}

/**
 * Filter parameters for activity queries.
 */
export interface ActivityFilters {
  entityTypes?: string[];
  hiveId?: string;
  siteId?: string;
}

/**
 * Options for the useActivityFeed hook.
 */
export interface UseActivityFeedOptions {
  filters?: ActivityFilters;
  limit?: number;
  enabled?: boolean;
}

/**
 * Result returned by the useActivityFeed hook.
 */
export interface UseActivityFeedResult {
  activities: ActivityItem[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Hook to fetch activity feed with cursor-based pagination.
 *
 * @param options - Filter and limit options
 *
 * @example
 * function DashboardActivityCard() {
 *   const { activities, loading, error, hasMore, loadMore } = useActivityFeed({
 *     limit: 5,
 *   });
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading activity" />;
 *
 *   return (
 *     <>
 *       <List dataSource={activities} renderItem={...} />
 *       {hasMore && <Button onClick={loadMore}>Load More</Button>}
 *     </>
 *   );
 * }
 */
export function useActivityFeed(options: UseActivityFeedOptions = {}): UseActivityFeedResult {
  const { filters, limit = ACTIVITY_FEED_DEFAULT_LIMIT, enabled = true } = options;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Use refs for cursor to avoid stale closure issues
  const cursorRef = useRef<string | null>(null);
  const cursorTimeRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);

  // Serialize filters for dependency tracking and comparison
  const filterKey = JSON.stringify({
    entityTypes: filters?.entityTypes?.sort(),
    hiveId: filters?.hiveId,
    siteId: filters?.siteId,
  });

  // Reset cursor when filters change
  useEffect(() => {
    cursorRef.current = null;
    cursorTimeRef.current = null;
  }, [filterKey]);

  const fetchActivity = useCallback(async (isLoadMore = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      // Reset state for fresh fetch
      setActivities([]);
      cursorRef.current = null;
      cursorTimeRef.current = null;
    }

    try {
      // Build URL with query parameters
      const params = new URLSearchParams();
      params.append('limit', limit.toString());

      if (filters?.entityTypes && filters.entityTypes.length > 0) {
        params.append('entity_type', filters.entityTypes.join(','));
      }
      if (filters?.hiveId) {
        params.append('hive_id', filters.hiveId);
      }
      if (filters?.siteId) {
        params.append('site_id', filters.siteId);
      }
      // Use tuple cursor for reliable pagination
      if (isLoadMore && cursorRef.current && cursorTimeRef.current) {
        params.append('cursor', cursorRef.current);
        params.append('cursor_time', cursorTimeRef.current);
      }

      const response = await apiClient.get<ActivityResponse>(`/activity?${params.toString()}`);
      const newActivities = response.data.data || [];
      const meta = response.data.meta;

      if (isLoadMore) {
        setActivities(prev => [...prev, ...newActivities]);
      } else {
        setActivities(newActivities);
      }

      // Update cursor refs
      cursorRef.current = meta.cursor || null;
      cursorTimeRef.current = meta.cursor_time || null;
      setHasMore(meta.has_more);
      setError(null);
    } catch (err) {
      setError(err as Error);
      // Don't clear activities on error - keep showing stale data
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [enabled, limit, filters?.entityTypes, filters?.hiveId, filters?.siteId]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchActivity(false);
  }, [fetchActivity, filterKey]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && cursorRef.current && cursorTimeRef.current) {
      fetchActivity(true);
    }
  }, [hasMore, loadingMore, fetchActivity]);

  const refetch = useCallback(() => {
    cursorRef.current = null;
    cursorTimeRef.current = null;
    fetchActivity(false);
  }, [fetchActivity]);

  return {
    activities,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}

export default useActivityFeed;
