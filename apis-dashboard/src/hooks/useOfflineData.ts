/**
 * Offline Data Hook
 *
 * React hook for fetching data with automatic offline caching.
 * Integrates with IndexedDB via Dexie for seamless offline support.
 *
 * When online: fetches from API, caches result, returns fresh data
 * When offline: returns cached data with lastSynced timestamp
 *
 * @module hooks/useOfflineData
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useOnlineStatus } from './useOnlineStatus';
import { db, type CacheableTable } from '../services/db';
import {
  cacheApiResponse,
  getLastSyncTime,
} from '../services/offlineCache';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the useOfflineData hook
 */
export interface UseOfflineDataOptions<T> {
  /** The IndexedDB table to use for caching */
  table: CacheableTable;
  /** Function to fetch data from the API */
  fetchFn: () => Promise<T[]>;
  /** Optional filter to apply when querying cached data */
  filter?: Record<string, unknown>;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
}

/**
 * Result returned by the useOfflineData hook
 */
export interface UseOfflineDataResult<T> {
  /** The data (from cache or API) */
  data: T[] | undefined;
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Whether the device is offline */
  isOffline: boolean;
  /** When the data was last synced from the server */
  lastSynced: Date | null;
  /** Error that occurred during fetch */
  error: Error | null;
  /** Whether the cached data is stale */
  isStale: boolean;
  /** Whether cached data exists but no API data has been fetched yet */
  isCachedData: boolean;
  /** Function to manually trigger a refetch */
  refetch: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default stale time: 5 minutes */
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for fetching data with offline caching support
 *
 * Uses Dexie's useLiveQuery for reactive updates from IndexedDB,
 * and automatically syncs with the API when online.
 *
 * @param options - Configuration options
 * @returns Object containing data, loading state, and sync info
 *
 * @example
 * ```tsx
 * function HivesList() {
 *   const { data: hives, isLoading, isOffline, lastSynced, refetch } = useOfflineData({
 *     table: 'hives',
 *     fetchFn: async () => {
 *       const response = await fetch('/api/hives');
 *       return response.json();
 *     },
 *   });
 *
 *   if (isLoading) return <Spin />;
 *
 *   return (
 *     <div>
 *       {isOffline && <OfflineBanner />}
 *       <SyncStatus lastSynced={lastSynced} onSyncNow={refetch} />
 *       {hives?.map(hive => <HiveCard key={hive.id} hive={hive} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useOfflineData<T extends { id: string }>({
  table,
  fetchFn,
  filter,
  enabled = true,
  staleTime = DEFAULT_STALE_TIME,
}: UseOfflineDataOptions<T>): UseOfflineDataResult<T> {
  const isOnline = useOnlineStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Track if this is the initial mount
  const isMounted = useRef(false);
  const fetchInProgress = useRef(false);

  // Live query from IndexedDB - automatically re-renders when data changes
  const cachedData = useLiveQuery(
    async () => {
      let collection = db.table(table).toCollection();

      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          collection = collection.filter(
            (item) => (item as Record<string, unknown>)[key] === value
          );
        }
      }

      return collection.toArray() as Promise<T[]>;
    },
    [table, JSON.stringify(filter)],
    undefined // Initial value while loading
  );

  // Load last sync time on mount and when table changes
  useEffect(() => {
    getLastSyncTime(table).then(setLastSynced);
  }, [table]);

  // Fetch data from API and cache it
  const refetch = useCallback(async () => {
    if (!enabled || fetchInProgress.current) return;

    fetchInProgress.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchFn();
      await cacheApiResponse(table, data);
      const syncTime = await getLastSyncTime(table);
      setLastSynced(syncTime);
      setHasFetched(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch data');
      setError(error);
      console.error(`[useOfflineData] Error fetching ${table}:`, error);
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [enabled, fetchFn, table]);

  // Initial fetch when online and enabled
  useEffect(() => {
    if (!enabled || !isOnline) return;

    // Skip if we've already fetched in this session
    if (hasFetched) return;

    // Check if data is stale
    const checkAndFetch = async () => {
      const syncTime = await getLastSyncTime(table);
      setLastSynced(syncTime);

      const isStaleData = !syncTime || Date.now() - syncTime.getTime() > staleTime;

      if (isStaleData && !fetchInProgress.current) {
        await refetch();
      } else {
        setHasFetched(true);
      }
    };

    // Small delay to prevent immediate fetch on mount
    const timeoutId = setTimeout(checkAndFetch, 100);

    return () => clearTimeout(timeoutId);
  }, [enabled, isOnline, table, staleTime, hasFetched, refetch]);

  // Re-fetch when coming back online if data is stale
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    if (isOnline && enabled && !fetchInProgress.current) {
      const checkStale = async () => {
        const syncTime = await getLastSyncTime(table);
        const isStaleData = !syncTime || Date.now() - syncTime.getTime() > staleTime;

        if (isStaleData) {
          await refetch();
        }
      };

      checkStale();
    }
  }, [isOnline, enabled, table, staleTime, refetch]);

  // Calculate if data is stale
  const isStale = lastSynced
    ? Date.now() - lastSynced.getTime() > staleTime
    : true;

  // Determine if we're showing cached data (have cache but haven't fetched)
  const isCachedData = !hasFetched && (cachedData?.length ?? 0) > 0;

  return {
    data: cachedData,
    isLoading,
    isOffline: !isOnline,
    lastSynced,
    error,
    isStale,
    isCachedData,
    refetch,
  };
}

export default useOfflineData;
