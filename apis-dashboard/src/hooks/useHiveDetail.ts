/**
 * useHiveDetail Hook
 *
 * Fetches a single hive by ID along with its site info and sibling hives.
 * Includes mutations for deleting hive and replacing queen.
 * Used by HiveDetail, HiveEdit pages.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Queen history entry.
 */
export interface QueenHistory {
  id: string;
  introduced_at: string;
  source: string | null;
  replaced_at: string | null;
  replacement_reason: string | null;
}

/**
 * Box change entry.
 */
export interface BoxChange {
  id: string;
  change_type: 'added' | 'removed';
  box_type: 'brood' | 'super';
  changed_at: string;
  notes: string | null;
}

/**
 * Task summary for hive.
 */
export interface TaskSummary {
  open: number;
  overdue: number;
}

/**
 * Full hive detail data returned by the API.
 */
export interface HiveDetail {
  id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  brood_boxes: number;
  honey_supers: number;
  notes: string | null;
  queen_history: QueenHistory[];
  box_changes: BoxChange[];
  hive_status?: 'active' | 'lost' | 'archived';
  lost_at?: string | null;
  task_summary?: TaskSummary;
  created_at: string;
  updated_at: string;
}

/**
 * Site info for the hive.
 */
export interface HiveSiteInfo {
  id: string;
  name: string;
}

/**
 * Sibling hive (same site) for multi-hive operations.
 */
export interface SiteHive {
  id: string;
  name: string;
}

interface HiveResponse {
  data: HiveDetail;
}

interface SiteResponse {
  data: HiveSiteInfo;
}

interface SiteHivesResponse {
  data: SiteHive[];
}

export interface ReplaceQueenInput {
  new_introduced_at: string;
  new_source?: string | null;
  replacement_reason?: string | null;
}

export interface UseHiveDetailResult {
  hive: HiveDetail | null;
  site: HiveSiteInfo | null;
  siteHives: SiteHive[];
  loading: boolean;
  error: Error | null;
  deleteHive: () => Promise<void>;
  deleting: boolean;
  replaceQueen: (input: ReplaceQueenInput) => Promise<void>;
  replacingQueen: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch hive detail with site info and sibling hives.
 * Provides mutations for delete and queen replacement.
 *
 * @param hiveId - The hive ID to fetch
 *
 * @example
 * function HiveDetailPage() {
 *   const { id } = useParams();
 *   const { hive, site, siteHives, loading, deleteHive, replaceQueen } = useHiveDetail(id);
 *
 *   if (loading) return <Spin />;
 *   if (!hive) return <Empty />;
 *
 *   return (
 *     <div>
 *       <h1>{hive.name}</h1>
 *       <p>Site: {site?.name}</p>
 *     </div>
 *   );
 * }
 */
export function useHiveDetail(hiveId: string | undefined): UseHiveDetailResult {
  const [hive, setHive] = useState<HiveDetail | null>(null);
  const [site, setSite] = useState<HiveSiteInfo | null>(null);
  const [siteHives, setSiteHives] = useState<SiteHive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replacingQueen, setReplacingQueen] = useState(false);
  const isMountedRef = useRef(true);

  const fetchHive = useCallback(async () => {
    if (!hiveId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<HiveResponse>(`/hives/${hiveId}`);
      if (isMountedRef.current) {
        setHive(response.data.data);
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
  }, [hiveId]);

  // Fetch site info and sibling hives when hive loads
  useEffect(() => {
    if (!hive?.site_id) return;

    const fetchSiteData = async () => {
      try {
        // Fetch site info
        const siteResponse = await apiClient.get<SiteResponse>(`/sites/${hive.site_id}`);
        if (isMountedRef.current) {
          setSite(siteResponse.data.data);
        }

        // Fetch sibling hives for multi-hive operations
        const hivesResponse = await apiClient.get<SiteHivesResponse>(`/sites/${hive.site_id}/hives`);
        if (isMountedRef.current) {
          setSiteHives(hivesResponse.data.data || []);
        }
      } catch {
        // Non-critical - site info and sibling hives are supplementary
      }
    };

    fetchSiteData();
  }, [hive?.site_id]);

  const deleteHive = useCallback(async () => {
    if (!hiveId) return;

    setDeleting(true);
    try {
      await apiClient.delete(`/hives/${hiveId}`);
      if (isMountedRef.current) {
        setHive(null);
      }
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  }, [hiveId]);

  const replaceQueen = useCallback(async (input: ReplaceQueenInput) => {
    if (!hiveId) return;

    setReplacingQueen(true);
    try {
      await apiClient.post(`/hives/${hiveId}/replace-queen`, input);
      // Refetch hive to get updated queen info
      await fetchHive();
    } finally {
      if (isMountedRef.current) {
        setReplacingQueen(false);
      }
    }
  }, [hiveId, fetchHive]);

  useEffect(() => {
    isMountedRef.current = true;
    if (hiveId) {
      fetchHive();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [hiveId, fetchHive]);

  return {
    hive,
    site,
    siteHives,
    loading,
    error,
    deleteHive,
    deleting,
    replaceQueen,
    replacingQueen,
    refetch: fetchHive,
  };
}

export default useHiveDetail;
