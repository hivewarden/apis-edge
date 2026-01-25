/**
 * useTreatments Hook
 *
 * Fetches treatment list for a hive with CRUD operations.
 * Used by HiveDetail page to display treatment history.
 *
 * Part of Epic 6, Story 6.1 (Treatment Log)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Treatment data returned by the API.
 */
export interface Treatment {
  id: string;
  hive_id: string;
  treated_at: string;
  treatment_type: string;
  method?: string;
  dose?: string;
  mite_count_before?: number;
  mite_count_after?: number;
  efficacy?: number;
  efficacy_display?: string;
  weather?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface TreatmentsResponse {
  data: Treatment[];
  meta: {
    total: number;
  };
}

interface TreatmentResponse {
  data: Treatment;
}

interface TreatmentsDataResponse {
  data: Treatment[];
}

/**
 * Input for creating a new treatment.
 */
export interface CreateTreatmentInput {
  hive_ids: string[];
  treated_at: string;
  treatment_type: string;
  method?: string;
  dose?: string;
  mite_count_before?: number;
  mite_count_after?: number;
  weather?: string;
  notes?: string;
}

/**
 * Input for updating a treatment (e.g., adding follow-up mite count).
 */
export interface UpdateTreatmentInput {
  treated_at?: string;
  treatment_type?: string;
  method?: string;
  dose?: string;
  mite_count_before?: number;
  mite_count_after?: number;
  weather?: string;
  notes?: string;
}

interface UseTreatmentsResult {
  treatments: Treatment[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createTreatment: (input: CreateTreatmentInput) => Promise<Treatment[]>;
  updateTreatment: (id: string, input: UpdateTreatmentInput) => Promise<Treatment>;
  deleteTreatment: (id: string) => Promise<void>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Hook to fetch and manage treatments for a hive.
 *
 * @param hiveId - The ID of the hive to fetch treatments for
 *
 * @example
 * function TreatmentHistory({ hiveId }) {
 *   const { treatments, loading, createTreatment, updateTreatment } = useTreatments(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return <TreatmentList treatments={treatments} />;
 * }
 */
export function useTreatments(hiveId: string | null): UseTreatmentsResult {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTreatments = useCallback(async () => {
    if (!hiveId) {
      setTreatments([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get<TreatmentsResponse>(`/hives/${hiveId}/treatments`);
      setTreatments(response.data.data || []);
      setTotal(response.data.meta.total);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchTreatments();
  }, [fetchTreatments]);

  const createTreatment = useCallback(async (input: CreateTreatmentInput): Promise<Treatment[]> => {
    setCreating(true);
    try {
      const response = await apiClient.post<TreatmentsDataResponse>('/treatments', input);
      // Refetch to update the list
      await fetchTreatments();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchTreatments]);

  const updateTreatment = useCallback(async (id: string, input: UpdateTreatmentInput): Promise<Treatment> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<TreatmentResponse>(`/treatments/${id}`, input);
      // Refetch to update the list
      await fetchTreatments();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchTreatments]);

  const deleteTreatment = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/treatments/${id}`);
      // Refetch to update the list
      await fetchTreatments();
    } finally {
      setDeleting(false);
    }
  }, [fetchTreatments]);

  return {
    treatments,
    total,
    loading,
    error,
    refetch: fetchTreatments,
    createTreatment,
    updateTreatment,
    deleteTreatment,
    creating,
    updating,
    deleting,
  };
}

/**
 * Treatment type options for dropdown.
 */
export const TREATMENT_TYPES = [
  { value: 'oxalic_acid', label: 'Oxalic Acid' },
  { value: 'formic_acid', label: 'Formic Acid' },
  { value: 'apiguard', label: 'Apiguard' },
  { value: 'apivar', label: 'Apivar' },
  { value: 'maqs', label: 'MAQS' },
  { value: 'api_bioxal', label: 'Api-Bioxal' },
  { value: 'other', label: 'Other' },
];

/**
 * Treatment method options for dropdown.
 */
export const TREATMENT_METHODS = [
  { value: 'vaporization', label: 'Vaporization' },
  { value: 'dribble', label: 'Dribble' },
  { value: 'strips', label: 'Strips' },
  { value: 'spray', label: 'Spray' },
  { value: 'other', label: 'Other' },
];

/**
 * Format treatment type for display.
 */
export function formatTreatmentType(type: string): string {
  const found = TREATMENT_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}

/**
 * Format treatment method for display.
 */
export function formatTreatmentMethod(method: string | undefined): string {
  if (!method) return '-';
  const found = TREATMENT_METHODS.find(m => m.value === method);
  return found ? found.label : method;
}

/**
 * Calculate efficacy percentage.
 */
export function calculateEfficacy(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined || after === undefined || before <= 0) return null;
  return Math.round(((before - after) / before) * 100);
}

export default useTreatments;
