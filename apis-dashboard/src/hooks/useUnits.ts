/**
 * useUnits Hook
 *
 * Fetches units list with optional site filter.
 * Used by Dashboard, Clips pages.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Unit data returned by the API.
 * Note: This interface matches UnitStatusCard's expected props.
 */
export interface Unit {
  id: string;
  serial: string;
  name: string | null;
  site_id: string | null;
  site_name: string | null;
  firmware_version: string | null;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

interface UnitsResponse {
  data: Unit[];
  meta: {
    total: number;
  };
}

export interface UseUnitsResult {
  units: Unit[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch units with optional site filter.
 *
 * @param siteId - Optional site ID to filter units by
 *
 * @example
 * function UnitsList({ siteId }) {
 *   const { units, loading, error, refetch } = useUnits(siteId);
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading units" />;
 *
 *   return (
 *     <List dataSource={units} renderItem={...} />
 *   );
 * }
 */
export function useUnits(siteId?: string | null): UseUnitsResult {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = siteId ? `/units?site_id=${siteId}` : '/units';
      const response = await apiClient.get<UnitsResponse>(url);
      if (isMountedRef.current) {
        setUnits(response.data.data || []);
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

  useEffect(() => {
    isMountedRef.current = true;
    fetchUnits();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchUnits]);

  return {
    units,
    loading,
    error,
    refetch: fetchUnits,
  };
}

export default useUnits;
