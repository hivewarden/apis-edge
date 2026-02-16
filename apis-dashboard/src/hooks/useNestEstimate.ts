/**
 * useNestEstimate Hook
 *
 * Fetches nest radius estimate for a site based on hornet visit patterns.
 * Extracted from NestEstimatorCard component.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Nest estimate data returned by the API.
 */
export interface NestEstimateData {
  estimated_radius_m: number | null;
  observation_count: number;
  confidence: string | null;
  avg_visit_interval_minutes?: number;
  min_observations_required?: number;
  message?: string;
  calculation_method?: string;
}

interface NestEstimateResponse {
  data: NestEstimateData;
}

export interface UseNestEstimateResult {
  estimate: NestEstimateData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch nest radius estimate for a site.
 *
 * @param siteId - The site ID to fetch estimate for
 *
 * @example
 * function NestEstimator({ siteId, latitude, longitude }) {
 *   const { estimate, loading, error, refetch } = useNestEstimate(siteId);
 *
 *   if (loading) return <Skeleton />;
 *   if (error) return <ErrorDisplay />;
 *
 *   return (
 *     <MapWithRadius
 *       center={[latitude, longitude]}
 *       radius={estimate?.estimated_radius_m}
 *     />
 *   );
 * }
 */
export function useNestEstimate(siteId: string | null | undefined): UseNestEstimateResult {
  const [estimate, setEstimate] = useState<NestEstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchEstimate = useCallback(async () => {
    if (!siteId) {
      setEstimate(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<NestEstimateResponse>(
        `/sites/${siteId}/nest-estimate`
      );
      if (isMountedRef.current) {
        setEstimate(response.data.data);
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
    if (siteId) {
      fetchEstimate();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [siteId, fetchEstimate]);

  return {
    estimate,
    loading,
    error,
    refetch: fetchEstimate,
  };
}

export default useNestEstimate;
