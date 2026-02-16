/**
 * useInspectionsList Hook
 *
 * Fetches paginated inspections list for a hive.
 * Extracted from InspectionHistory component.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Frame data for an inspection.
 */
export interface InspectionFrameData {
  box_position: number;
  box_type: 'brood' | 'super';
  total_frames: number;
  drawn_frames: number;
  brood_frames: number;
  honey_frames: number;
  pollen_frames: number;
}

/**
 * Inspection data returned by the API.
 */
export interface Inspection {
  id: string;
  hive_id: string;
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string | null;
  frames?: InspectionFrameData[];
  created_at: string;
  updated_at: string;
  // Offline inspection fields (added by UI when merging with offline data)
  pending_sync?: boolean;
  local_id?: string | null;
  sync_error?: string | null;
}

interface InspectionsListResponse {
  data: Inspection[];
  meta: { total: number };
}

export interface UseInspectionsListOptions {
  /** Page size (default: 10) */
  pageSize?: number;
  /** Sort order (default: 'desc') */
  sortOrder?: 'asc' | 'desc';
}

export interface UseInspectionsListResult {
  inspections: Inspection[];
  total: number;
  page: number;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
  loading: boolean;
  error: Error | null;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  exportInspections: (hiveName: string) => Promise<void>;
  exporting: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch paginated inspections for a hive.
 *
 * @param hiveId - The hive ID to fetch inspections for
 * @param options - Pagination and sort options
 *
 * @example
 * function InspectionTable({ hiveId, hiveName }) {
 *   const {
 *     inspections,
 *     total,
 *     page,
 *     setPage,
 *     loading,
 *     exportInspections,
 *   } = useInspectionsList(hiveId);
 *
 *   return (
 *     <Table
 *       dataSource={inspections}
 *       loading={loading}
 *       pagination={{ current: page, total, onChange: setPage }}
 *     />
 *   );
 * }
 */
export function useInspectionsList(
  hiveId: string | null | undefined,
  options?: UseInspectionsListOptions
): UseInspectionsListResult {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageInternal] = useState(1);
  const [pageSize, setPageSizeInternal] = useState(options?.pageSize || 10);
  const [sortOrder, setSortOrderInternal] = useState<'asc' | 'desc'>(
    options?.sortOrder || 'desc'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [exporting, setExporting] = useState(false);
  const isMountedRef = useRef(true);

  const fetchInspections = useCallback(async () => {
    if (!hiveId) {
      setInspections([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const response = await apiClient.get<InspectionsListResponse>(
        `/hives/${hiveId}/inspections?limit=${pageSize}&offset=${offset}&sort=${sortOrder}`
      );
      if (isMountedRef.current) {
        setInspections(response.data.data || []);
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
  }, [hiveId, page, pageSize, sortOrder]);

  const exportInspections = useCallback(async (hiveName: string) => {
    if (!hiveId) return;

    setExporting(true);
    try {
      const response = await apiClient.get(`/hives/${hiveId}/inspections/export`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${hiveName.replace(/\s+/g, '_')}-inspections.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      if (isMountedRef.current) {
        setExporting(false);
      }
    }
  }, [hiveId]);

  // Setters with page reset logic
  const setPage = useCallback((newPage: number) => {
    setPageInternal(newPage);
  }, []);

  const setPageSize = useCallback((newSize: number) => {
    setPageSizeInternal(newSize);
    setPageInternal(1); // Reset to page 1 when page size changes
  }, []);

  const setSortOrder = useCallback((newOrder: 'asc' | 'desc') => {
    setSortOrderInternal(newOrder);
    setPageInternal(1); // Reset to page 1 when sort changes
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchInspections();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchInspections]);

  return {
    inspections,
    total,
    page,
    pageSize,
    sortOrder,
    loading,
    error,
    setPage,
    setPageSize,
    setSortOrder,
    exportInspections,
    exporting,
    refetch: fetchInspections,
  };
}

export default useInspectionsList;
