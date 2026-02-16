/**
 * useSites Hook
 *
 * Fetches the list of all sites for the current tenant.
 * Used by Dashboard, Clips, TaskAssignmentSection, ActiveTasksList,
 * UnitRegister, UnitEdit, Maintenance, Export pages.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Site data returned by the API.
 */
export interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface SitesResponse {
  data: Site[];
  meta: {
    total: number;
  };
}

export interface UseSitesResult {
  sites: Site[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all sites for the current tenant.
 *
 * @example
 * function SiteSelector() {
 *   const { sites, loading, error } = useSites();
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Error loading sites" />;
 *
 *   return (
 *     <Select options={sites.map(s => ({ value: s.id, label: s.name }))} />
 *   );
 * }
 */
export function useSites(): UseSitesResult {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<SitesResponse>('/sites');
      if (isMountedRef.current) {
        setSites(response.data.data || []);
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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchSites();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchSites]);

  return {
    sites,
    loading,
    error,
    refetch: fetchSites,
  };
}

export default useSites;
