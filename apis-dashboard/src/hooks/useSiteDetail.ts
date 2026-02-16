/**
 * useSiteDetail Hook
 *
 * Fetches a single site by ID along with its hives.
 * Includes mutation for deleting the site.
 * Used by SiteDetail, SiteEdit pages.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import type { HiveStatus, HiveLifecycleStatus } from '../types';

/**
 * Site detail data returned by the API.
 */
export interface SiteDetail {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/**
 * Hive data returned when fetching site hives.
 */
export interface SiteHive {
  id: string;
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
  task_summary?: {
    open: number;
    overdue: number;
  };
}

interface SiteResponse {
  data: SiteDetail;
}

interface HivesResponse {
  data: SiteHive[];
  meta: { total: number };
}

export interface UseSiteDetailResult {
  site: SiteDetail | null;
  hives: SiteHive[];
  loading: boolean;
  hivesLoading: boolean;
  error: Error | null;
  deleteSite: () => Promise<void>;
  deleting: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch site detail with its hives and provide delete mutation.
 *
 * @param siteId - The site ID to fetch
 *
 * @example
 * function SiteDetailPage() {
 *   const { id } = useParams();
 *   const { site, hives, loading, deleteSite } = useSiteDetail(id);
 *
 *   if (loading) return <Spin />;
 *   if (!site) return <Empty />;
 *
 *   return (
 *     <div>
 *       <h1>{site.name}</h1>
 *       <HivesList hives={hives} />
 *       <Button danger onClick={deleteSite}>Delete</Button>
 *     </div>
 *   );
 * }
 */
export function useSiteDetail(siteId: string | undefined): UseSiteDetailResult {
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [hives, setHives] = useState<SiteHive[]>([]);
  const [loading, setLoading] = useState(true);
  const [hivesLoading, setHivesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isMountedRef = useRef(true);

  const fetchSite = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<SiteResponse>(`/sites/${siteId}`);
      if (isMountedRef.current) {
        setSite(response.data.data);
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

  const fetchHives = useCallback(async () => {
    if (!siteId) {
      setHivesLoading(false);
      return;
    }

    setHivesLoading(true);

    try {
      const response = await apiClient.get<HivesResponse>(`/sites/${siteId}/hives`);
      if (isMountedRef.current) {
        setHives(response.data.data || []);
      }
    } catch {
      // Silently fail - hives table might not exist yet
      if (isMountedRef.current) {
        setHives([]);
      }
    } finally {
      if (isMountedRef.current) {
        setHivesLoading(false);
      }
    }
  }, [siteId]);

  const deleteSite = useCallback(async () => {
    if (!siteId) return;

    setDeleting(true);
    try {
      await apiClient.delete(`/sites/${siteId}`);
      if (isMountedRef.current) {
        setSite(null);
      }
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  }, [siteId]);

  const refetch = useCallback(async () => {
    await Promise.all([fetchSite(), fetchHives()]);
  }, [fetchSite, fetchHives]);

  useEffect(() => {
    isMountedRef.current = true;
    if (siteId) {
      fetchSite();
      fetchHives();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [siteId, fetchSite, fetchHives]);

  return {
    site,
    hives,
    loading,
    hivesLoading,
    error,
    deleteSite,
    deleting,
    refetch,
  };
}

export default useSiteDetail;
