/**
 * useFeedings Hook
 *
 * Fetches feeding list for a hive with CRUD operations.
 * Used by HiveDetail page to display feeding history.
 *
 * Part of Epic 6, Story 6.2 (Feeding Log)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Feeding data returned by the API.
 */
export interface Feeding {
  id: string;
  hive_id: string;
  fed_at: string;
  feed_type: string;
  amount: number;
  unit: string;
  concentration?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Season total for a feed type.
 */
export interface SeasonTotal {
  feed_type: string;
  unit: string;
  total: number;
}

interface FeedingsResponse {
  data: Feeding[];
  meta: {
    total: number;
  };
}

interface FeedingResponse {
  data: Feeding;
}

interface FeedingsDataResponse {
  data: Feeding[];
}

interface SeasonTotalsResponse {
  data: SeasonTotal[];
}

/**
 * Input for creating a new feeding.
 */
export interface CreateFeedingInput {
  hive_ids: string[];
  fed_at: string;
  feed_type: string;
  amount: number;
  unit: string;
  concentration?: string;
  notes?: string;
}

/**
 * Input for updating a feeding.
 */
export interface UpdateFeedingInput {
  fed_at?: string;
  feed_type?: string;
  amount?: number;
  unit?: string;
  concentration?: string;
  notes?: string;
}

interface UseFeedingsResult {
  feedings: Feeding[];
  total: number;
  seasonTotals: SeasonTotal[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createFeeding: (input: CreateFeedingInput) => Promise<Feeding[]>;
  updateFeeding: (id: string, input: UpdateFeedingInput) => Promise<Feeding>;
  deleteFeeding: (id: string) => Promise<void>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Hook to fetch and manage feedings for a hive.
 *
 * @param hiveId - The ID of the hive to fetch feedings for
 *
 * @example
 * function FeedingHistory({ hiveId }) {
 *   const { feedings, seasonTotals, loading, createFeeding } = useFeedings(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return <FeedingList feedings={feedings} totals={seasonTotals} />;
 * }
 */
export function useFeedings(hiveId: string | null): UseFeedingsResult {
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [total, setTotal] = useState(0);
  const [seasonTotals, setSeasonTotals] = useState<SeasonTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchFeedings = useCallback(async () => {
    if (!hiveId) {
      setFeedings([]);
      setTotal(0);
      setSeasonTotals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch feedings and season totals in parallel
      const [feedingsRes, totalsRes] = await Promise.all([
        apiClient.get<FeedingsResponse>(`/hives/${hiveId}/feedings`),
        apiClient.get<SeasonTotalsResponse>(`/hives/${hiveId}/feedings/season-totals`),
      ]);

      setFeedings(feedingsRes.data.data || []);
      setTotal(feedingsRes.data.meta.total);
      setSeasonTotals(totalsRes.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchFeedings();
  }, [fetchFeedings]);

  const createFeeding = useCallback(async (input: CreateFeedingInput): Promise<Feeding[]> => {
    setCreating(true);
    try {
      const response = await apiClient.post<FeedingsDataResponse>('/feedings', input);
      // Refetch to update the list and season totals
      await fetchFeedings();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchFeedings]);

  const updateFeeding = useCallback(async (id: string, input: UpdateFeedingInput): Promise<Feeding> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<FeedingResponse>(`/feedings/${id}`, input);
      // Refetch to update the list and season totals
      await fetchFeedings();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchFeedings]);

  const deleteFeeding = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/feedings/${id}`);
      // Refetch to update the list and season totals
      await fetchFeedings();
    } finally {
      setDeleting(false);
    }
  }, [fetchFeedings]);

  return {
    feedings,
    total,
    seasonTotals,
    loading,
    error,
    refetch: fetchFeedings,
    createFeeding,
    updateFeeding,
    deleteFeeding,
    creating,
    updating,
    deleting,
  };
}

/**
 * Feed type options for dropdown.
 */
export const FEED_TYPES = [
  { value: 'sugar_syrup', label: 'Sugar Syrup', hasConcentration: true },
  { value: 'fondant', label: 'Fondant', hasConcentration: false },
  { value: 'pollen_patty', label: 'Pollen Patty', hasConcentration: false },
  { value: 'pollen_substitute', label: 'Pollen Substitute', hasConcentration: false },
  { value: 'honey', label: 'Honey', hasConcentration: false },
  { value: 'other', label: 'Other', hasConcentration: false },
];

/**
 * Feed unit options for dropdown.
 */
export const FEED_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'liters', label: 'liters' },
];

/**
 * Concentration options for syrup.
 */
export const CONCENTRATION_OPTIONS = [
  { value: '1:1', label: '1:1 (Light/Stimulative)' },
  { value: '2:1', label: '2:1 (Heavy/Winter Prep)' },
];

/**
 * Format feed type for display.
 */
export function formatFeedType(type: string): string {
  const found = FEED_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}

/**
 * Format amount with unit for display.
 */
export function formatAmount(amount: number, unit: string): string {
  return `${amount} ${unit}`;
}

/**
 * Check if a feed type has concentration field.
 */
export function feedTypeHasConcentration(type: string): boolean {
  const found = FEED_TYPES.find(t => t.value === type);
  return found?.hasConcentration ?? false;
}

export default useFeedings;
