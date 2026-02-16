/**
 * useUnitDetail Hook
 *
 * Fetches a single unit by ID.
 * Includes mutations for deleting unit and regenerating API key.
 * Used by UnitDetail, UnitEdit pages.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Full unit detail data returned by the API.
 */
export interface UnitDetail {
  id: string;
  serial: string;
  name: string | null;
  site_id: string | null;
  site_name: string | null;
  firmware_version: string | null;
  status: string;
  last_seen: string | null;
  last_heartbeat: string | null;
  ip_address: string | null;
  api_key?: string;
  created_at: string;
  updated_at: string;
}

interface UnitResponse {
  data: UnitDetail;
}

interface RegenerateKeyResponse {
  data: {
    api_key: string;
  };
}

export interface UseUnitDetailResult {
  unit: UnitDetail | null;
  loading: boolean;
  error: Error | null;
  deleteUnit: () => Promise<void>;
  deleting: boolean;
  regenerateKey: () => Promise<string>;
  regenerating: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch unit detail with mutations for delete and key regeneration.
 *
 * @param unitId - The unit ID to fetch
 *
 * @example
 * function UnitDetailPage() {
 *   const { id } = useParams();
 *   const { unit, loading, deleteUnit, regenerateKey } = useUnitDetail(id);
 *
 *   if (loading) return <Spin />;
 *   if (!unit) return <Empty />;
 *
 *   return (
 *     <div>
 *       <h1>{unit.name}</h1>
 *       <p>Status: {unit.status}</p>
 *       <Button onClick={regenerateKey}>Regenerate Key</Button>
 *     </div>
 *   );
 * }
 */
export function useUnitDetail(unitId: string | undefined): UseUnitDetailResult {
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const isMountedRef = useRef(true);

  const fetchUnit = useCallback(async () => {
    if (!unitId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<UnitResponse>(`/units/${unitId}`);
      if (isMountedRef.current) {
        setUnit(response.data.data);
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
  }, [unitId]);

  const deleteUnit = useCallback(async () => {
    if (!unitId) return;

    setDeleting(true);
    try {
      await apiClient.delete(`/units/${unitId}`);
      if (isMountedRef.current) {
        setUnit(null);
      }
    } finally {
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  }, [unitId]);

  const regenerateKey = useCallback(async (): Promise<string> => {
    if (!unitId) throw new Error('No unit ID');

    setRegenerating(true);
    try {
      const response = await apiClient.post<RegenerateKeyResponse>(
        `/units/${unitId}/regenerate-key`
      );
      const newKey = response.data.data.api_key;

      // Update local state with new key
      if (isMountedRef.current && unit) {
        setUnit({ ...unit, api_key: newKey });
      }

      return newKey;
    } finally {
      if (isMountedRef.current) {
        setRegenerating(false);
      }
    }
  }, [unitId, unit]);

  useEffect(() => {
    isMountedRef.current = true;
    if (unitId) {
      fetchUnit();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [unitId, fetchUnit]);

  return {
    unit,
    loading,
    error,
    deleteUnit,
    deleting,
    regenerateKey,
    regenerating,
    refetch: fetchUnit,
  };
}

export default useUnitDetail;
