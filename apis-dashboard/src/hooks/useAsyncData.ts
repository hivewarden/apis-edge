/**
 * useAsyncData Hook
 *
 * Generic hook for async data fetching with loading/error states.
 * Encapsulates the common pattern used across many hooks:
 * - isMountedRef for cleanup
 * - useState for loading/error/data
 * - useCallback for fetch function
 * - useEffect for mount/unmount lifecycle
 *
 * Part of Dashboard Refactoring Pass 5
 */
import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Result interface for async data fetching
 */
export interface UseAsyncDataResult<T> {
  /** The fetched data, or null if not yet loaded or error occurred */
  data: T | null;
  /** Whether the initial fetch is in progress */
  loading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch the data */
  refetch: () => Promise<void>;
}

/**
 * Generic hook for async data fetching.
 *
 * Handles common async patterns:
 * - Prevents state updates after unmount
 * - Manages loading/error/data states
 * - Provides refetch function
 * - Cleans up on unmount
 *
 * @param fetcher - Async function that returns the data
 * @param deps - Dependencies array for the fetcher (re-fetches when these change)
 *
 * @example
 * const { data, loading, error, refetch } = useAsyncData(
 *   async () => {
 *     const response = await apiClient.get('/hives/123');
 *     return response.data.data;
 *   },
 *   [hiveId]
 * );
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: any[]
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      if (isMountedRef.current) {
        setData(result);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export default useAsyncData;
