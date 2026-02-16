/**
 * useClips Hook
 *
 * Fetches clip list for a site with filtering and pagination.
 * Used by the Clips page to browse detection video archive.
 *
 * Part of Epic 4, Story 4.2 (Clip Archive List View)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Clip data returned by the API.
 */
export interface Clip {
  id: string;
  unit_id: string;
  unit_name?: string;
  site_id: string;
  detection_id?: string;
  duration_seconds?: number;
  file_size_bytes: number;
  recorded_at: string;
  created_at: string;
  thumbnail_url: string;
}

interface ClipsResponse {
  data: Clip[];
  meta: {
    total: number;
    page: number;
    per_page: number;
  };
}

/**
 * Filter parameters for clip queries.
 */
export interface ClipFilters {
  siteId: string | null;
  unitId?: string | null;
  from?: Date | null;
  to?: Date | null;
}

interface UseClipsResult {
  clips: Clip[];
  total: number;
  page: number;
  perPage: number;
  loading: boolean;
  error: Error | null;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  refetch: () => Promise<void>;
}

/**
 * Format date to ISO 8601 string for API parameter.
 * Preserves time precision for accurate filtering.
 */
function formatDateParam(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

/**
 * Hook to fetch clips for a site with filtering and pagination.
 *
 * @param filters - Filter parameters (siteId required, unitId/from/to optional)
 *
 * @example
 * function ClipsPage({ siteId }) {
 *   const { clips, loading, error, total, page, setPage } = useClips({ siteId });
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading clips" />;
 *
 *   return (
 *     <>
 *       <ClipGrid clips={clips} />
 *       <Pagination current={page} total={total} onChange={setPage} />
 *     </>
 *   );
 * }
 */
export function useClips(filters: ClipFilters): UseClipsResult {
  const [clips, setClips] = useState<Clip[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageInternal] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // SECURITY (S5-H1): isMountedRef prevents state updates after unmount
  const isMountedRef = useRef(true);

  // Convert dates to stable strings for dependency array
  const fromStr = formatDateParam(filters.from);
  const toStr = formatDateParam(filters.to);

  // Track previous filter values to detect changes
  const [prevFilters, setPrevFilters] = useState({
    siteId: filters.siteId,
    unitId: filters.unitId,
    fromStr,
    toStr,
  });

  // Check if filters changed (excluding page)
  const filtersChanged =
    prevFilters.siteId !== filters.siteId ||
    prevFilters.unitId !== filters.unitId ||
    prevFilters.fromStr !== fromStr ||
    prevFilters.toStr !== toStr;

  // Determine actual page to use (reset to 1 if filters changed)
  const currentPage = filtersChanged ? 1 : page;

  const fetchClips = useCallback(async () => {
    if (!filters.siteId) {
      setClips([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Build URL with query parameters
      const params = new URLSearchParams();
      params.append('site_id', filters.siteId);
      params.append('page', currentPage.toString());
      params.append('per_page', perPage.toString());

      if (filters.unitId) {
        params.append('unit_id', filters.unitId);
      }
      if (fromStr) {
        params.append('from', fromStr);
      }
      if (toStr) {
        params.append('to', toStr);
      }

      const response = await apiClient.get<ClipsResponse>(`/clips?${params.toString()}`);
      if (isMountedRef.current) {
        setClips(response.data.data || []);
        setTotal(response.data.meta.total);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
      }
      // Don't clear clips on error - keep showing stale data
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [filters.siteId, filters.unitId, fromStr, toStr, currentPage, perPage]);

  // Combined effect: update filters tracking and reset page, then fetch
  useEffect(() => {
    isMountedRef.current = true;
    if (filtersChanged) {
      setPrevFilters({
        siteId: filters.siteId,
        unitId: filters.unitId,
        fromStr,
        toStr,
      });
      setPageInternal(1);
    }
    fetchClips();
    return () => { isMountedRef.current = false; };
  }, [fetchClips, filtersChanged, filters.siteId, filters.unitId, fromStr, toStr]);

  // Expose setPage that updates internal state
  const setPage = useCallback((newPage: number) => {
    setPageInternal(newPage);
  }, []);

  return {
    clips,
    total,
    page: currentPage,
    perPage,
    loading,
    error,
    setPage,
    setPerPage,
    refetch: fetchClips,
  };
}

export default useClips;
