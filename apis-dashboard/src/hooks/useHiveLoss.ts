/**
 * useHiveLoss Hook
 *
 * Manages hive loss post-mortem records with CRUD operations.
 * Used by HiveDetail page for recording and viewing hive losses.
 *
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Hive loss record returned by the API.
 */
export interface HiveLoss {
  id: string;
  hive_id: string;
  hive_name?: string;
  discovered_at: string;
  cause: string;
  cause_display: string;
  cause_other?: string;
  symptoms: string[];
  symptoms_display?: string[];
  symptoms_notes?: string;
  reflection?: string;
  data_choice: 'archive' | 'delete';
  created_at: string;
}

/**
 * Input for creating a new hive loss record.
 */
export interface CreateHiveLossInput {
  discovered_at: string;
  cause: string;
  cause_other?: string;
  symptoms: string[];
  symptoms_notes?: string;
  reflection?: string;
  data_choice: 'archive' | 'delete';
}

/**
 * Hive loss statistics for BeeBrain analysis.
 */
export interface HiveLossStats {
  total_losses: number;
  losses_by_cause: Record<string, number>;
  losses_by_year: Record<number, number>;
  common_symptoms: Array<{ symptom: string; count: number }>;
}

interface HiveLossResponse {
  data: HiveLoss;
  message?: string;
}

interface HiveLossListResponse {
  data: HiveLoss[];
  meta: {
    total: number;
  };
}

interface HiveLossStatsResponse {
  data: HiveLossStats;
}

interface UseHiveLossResult {
  hiveLoss: HiveLoss | null;
  loading: boolean;
  error: Error | null;
  createHiveLoss: (hiveId: string, input: CreateHiveLossInput) => Promise<HiveLoss>;
  creating: boolean;
}

interface UseHiveLossesResult {
  losses: HiveLoss[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseHiveLossStatsResult {
  stats: HiveLossStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage hive loss for a specific hive.
 *
 * @param hiveId - The ID of the hive to fetch loss record for
 *
 * @example
 * function HiveDetail({ hiveId }) {
 *   const { hiveLoss, loading, createHiveLoss } = useHiveLoss(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return hiveLoss ? <LossSummary loss={hiveLoss} /> : <MarkAsLostButton />;
 * }
 */
export function useHiveLoss(hiveId: string | null): UseHiveLossResult {
  const [hiveLoss, setHiveLoss] = useState<HiveLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchHiveLoss = useCallback(async () => {
    if (!hiveId) {
      setHiveLoss(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get<HiveLossResponse>(`/hives/${hiveId}/loss`);
      setHiveLoss(response.data.data);
      setError(null);
    } catch (err) {
      // 404 means no loss record - not an error
      // Use type guard to check for axios-like error structure
      const isAxiosError = (e: unknown): e is { response?: { status?: number } } =>
        typeof e === 'object' && e !== null && 'response' in e;

      if (isAxiosError(err) && err.response?.status === 404) {
        setHiveLoss(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchHiveLoss();
  }, [fetchHiveLoss]);

  const createHiveLoss = useCallback(async (hiveIdToCreate: string, input: CreateHiveLossInput): Promise<HiveLoss> => {
    setCreating(true);
    try {
      const response = await apiClient.post<HiveLossResponse>(`/hives/${hiveIdToCreate}/loss`, input);
      const createdLoss = response.data.data;
      // Update local state if this is for the current hive
      if (hiveIdToCreate === hiveId) {
        setHiveLoss(createdLoss);
      }
      return createdLoss;
    } finally {
      setCreating(false);
    }
  }, [hiveId]);

  return {
    hiveLoss,
    loading,
    error,
    createHiveLoss,
    creating,
  };
}

/**
 * Hook to fetch all hive losses for the tenant.
 *
 * @example
 * function LostHivesList() {
 *   const { losses, loading } = useHiveLosses();
 *
 *   if (loading) return <Spin />;
 *
 *   return <List dataSource={losses} ... />;
 * }
 */
export function useHiveLosses(): UseHiveLossesResult {
  const [losses, setLosses] = useState<HiveLoss[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLosses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<HiveLossListResponse>('/hive-losses');
      setLosses(response.data.data || []);
      setTotal(response.data.meta.total);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLosses();
  }, [fetchLosses]);

  return {
    losses,
    total,
    loading,
    error,
    refetch: fetchLosses,
  };
}

/**
 * Hook to fetch hive loss statistics for BeeBrain analysis.
 *
 * @example
 * function LossAnalytics() {
 *   const { stats, loading } = useHiveLossStats();
 *
 *   if (loading) return <Spin />;
 *
 *   return <LossPatterns stats={stats} />;
 * }
 */
export function useHiveLossStats(): UseHiveLossStatsResult {
  const [stats, setStats] = useState<HiveLossStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<HiveLossStatsResponse>('/hive-losses/stats');
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

/**
 * Valid cause codes and their display names.
 */
export const CAUSE_OPTIONS = {
  starvation: 'Starvation',
  varroa: 'Varroa/Mites',
  queen_failure: 'Queen Failure',
  pesticide: 'Pesticide Exposure',
  swarming: 'Swarming (absconded)',
  robbing: 'Robbing',
  unknown: 'Unknown',
  other: 'Other (specify)',
} as const;

/**
 * Valid symptom codes and their display names.
 */
export const SYMPTOM_OPTIONS = {
  no_bees: 'No bees remaining',
  dead_bees_entrance: 'Dead bees at entrance/inside',
  deformed_wings: 'Deformed wings visible',
  robbing_evidence: 'Evidence of robbing (wax debris)',
  moldy_frames: 'Moldy frames',
  empty_stores: 'Empty honey stores',
  dead_brood: 'Dead brood pattern',
  chalk_brood: 'Chalk brood visible',
  shb_evidence: 'Small hive beetle evidence',
  wax_moth: 'Wax moth damage',
} as const;

/**
 * Get the human-readable display name for a hive loss cause code.
 *
 * @param cause - The cause code (e.g., 'varroa', 'starvation', 'unknown')
 * @returns The display name (e.g., 'Varroa/Mites', 'Starvation', 'Unknown')
 *          If the cause code is not recognized, returns the original code.
 *
 * @example
 * getCauseDisplay('varroa') // Returns 'Varroa/Mites'
 * getCauseDisplay('unknown_code') // Returns 'unknown_code'
 */
export function getCauseDisplay(cause: string): string {
  return CAUSE_OPTIONS[cause as keyof typeof CAUSE_OPTIONS] || cause;
}

/**
 * Get the human-readable display name for a symptom code.
 *
 * @param symptom - The symptom code (e.g., 'deformed_wings', 'empty_stores')
 * @returns The display name (e.g., 'Deformed wings visible', 'Empty honey stores')
 *          If the symptom code is not recognized, returns the original code.
 *
 * @example
 * getSymptomDisplay('deformed_wings') // Returns 'Deformed wings visible'
 * getSymptomDisplay('custom_symptom') // Returns 'custom_symptom'
 */
export function getSymptomDisplay(symptom: string): string {
  return SYMPTOM_OPTIONS[symptom as keyof typeof SYMPTOM_OPTIONS] || symptom;
}

export default useHiveLoss;
