/**
 * useHarvests Hook
 *
 * Fetches harvest list for a hive or site with CRUD operations and analytics.
 * Used by HiveDetail and SiteDetail pages to display harvest history.
 *
 * Part of Epic 6, Story 6.3 (Harvest Tracking)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Per-hive breakdown data in a harvest.
 */
export interface HarvestHive {
  hive_id: string;
  hive_name: string;
  frames?: number;
  amount_kg: number;
}

/**
 * Harvest data returned by the API.
 */
export interface Harvest {
  id: string;
  site_id: string;
  harvested_at: string;
  total_kg: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  hives?: HarvestHive[];
  is_first_harvest?: boolean;
  /** IDs of hives experiencing their first harvest (Epic 9, Story 9.2) */
  first_hive_ids?: string[];
}

/**
 * Per-hive harvest statistics for analytics.
 */
export interface HiveHarvestStat {
  hive_id: string;
  hive_name: string;
  total_kg: number;
  harvests: number;
}

/**
 * Year-over-year harvest statistics.
 */
export interface YearStat {
  year: number;
  total_kg: number;
}

/**
 * Best performing hive statistics.
 */
export interface BestHiveStat {
  hive_id: string;
  hive_name: string;
  kg_per_harvest: number;
}

/**
 * Harvest analytics data.
 */
export interface HarvestAnalytics {
  total_kg: number;
  total_harvests: number;
  per_hive: HiveHarvestStat[];
  year_over_year: YearStat[];
  best_performing_hive?: BestHiveStat;
}

interface HarvestsResponse {
  data: Harvest[];
  meta: {
    total: number;
  };
}

interface HarvestResponse {
  data: Harvest;
}

interface AnalyticsResponse {
  data: HarvestAnalytics;
}

/**
 * Per-hive input when creating a harvest.
 */
export interface HarvestHiveInput {
  hive_id: string;
  frames?: number;
  amount_kg: number;
}

/**
 * Input for creating a new harvest.
 */
export interface CreateHarvestInput {
  site_id: string;
  harvested_at: string;
  total_kg: number;
  notes?: string;
  hive_breakdown: HarvestHiveInput[];
}

/**
 * Input for updating a harvest.
 */
export interface UpdateHarvestInput {
  harvested_at?: string;
  total_kg?: number;
  notes?: string;
  hive_breakdown?: HarvestHiveInput[];
}

interface UseHarvestsResult {
  harvests: Harvest[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createHarvest: (input: CreateHarvestInput) => Promise<Harvest>;
  updateHarvest: (id: string, input: UpdateHarvestInput) => Promise<Harvest>;
  deleteHarvest: (id: string) => Promise<void>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  /** Season totals in kg (Apr-Mar beekeeping year) */
  seasonTotalKg: number;
  /** Number of harvests this season */
  seasonHarvestCount: number;
}

interface UseHarvestAnalyticsResult {
  analytics: HarvestAnalytics | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage harvests for a hive.
 *
 * @param hiveId - The ID of the hive to fetch harvests for
 *
 * @example
 * function HarvestHistory({ hiveId }) {
 *   const { harvests, loading, createHarvest } = useHarvestsByHive(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return <HarvestList harvests={harvests} />;
 * }
 */
/**
 * Calculate season totals from harvests array.
 * Season runs April 1 to March 31 (standard beekeeping year).
 *
 * NOTE: This frontend calculation uses the same logic as the backend's
 * GetHarvestSeasonTotals (storage/harvests.go). The frontend calculates
 * from already-fetched harvest data to avoid an extra API round-trip.
 * Both implementations use April 1 (month >= 3 in JS, >= April in Go)
 * as the season start date.
 */
function calculateSeasonTotals(harvests: Harvest[]): { totalKg: number; count: number } {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = new Date(seasonStartYear, 3, 1); // April 1

  const seasonHarvests = harvests.filter((h) => new Date(h.harvested_at) >= seasonStart);
  const totalKg = seasonHarvests.reduce((sum, h) => sum + h.total_kg, 0);

  return { totalKg, count: seasonHarvests.length };
}

export function useHarvestsByHive(hiveId: string | null): UseHarvestsResult {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seasonTotalKg, setSeasonTotalKg] = useState(0);
  const [seasonHarvestCount, setSeasonHarvestCount] = useState(0);

  const fetchHarvests = useCallback(async () => {
    if (!hiveId) {
      setHarvests([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get<HarvestsResponse>(`/hives/${hiveId}/harvests`);
      const fetchedHarvests = response.data.data || [];
      setHarvests(fetchedHarvests);
      setTotal(response.data.meta.total);

      // Calculate season totals
      const seasonTotals = calculateSeasonTotals(fetchedHarvests);
      setSeasonTotalKg(seasonTotals.totalKg);
      setSeasonHarvestCount(seasonTotals.count);

      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchHarvests();
  }, [fetchHarvests]);

  const createHarvest = useCallback(async (input: CreateHarvestInput): Promise<Harvest> => {
    setCreating(true);
    try {
      const response = await apiClient.post<HarvestResponse>('/harvests', input);
      // Refetch to update the list
      await fetchHarvests();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchHarvests]);

  const updateHarvest = useCallback(async (id: string, input: UpdateHarvestInput): Promise<Harvest> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<HarvestResponse>(`/harvests/${id}`, input);
      // Refetch to update the list
      await fetchHarvests();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchHarvests]);

  const deleteHarvest = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/harvests/${id}`);
      // Refetch to update the list
      await fetchHarvests();
    } finally {
      setDeleting(false);
    }
  }, [fetchHarvests]);

  return {
    harvests,
    total,
    loading,
    error,
    refetch: fetchHarvests,
    createHarvest,
    updateHarvest,
    deleteHarvest,
    creating,
    updating,
    deleting,
    seasonTotalKg,
    seasonHarvestCount,
  };
}

/**
 * Hook to fetch and manage harvests for a site.
 *
 * @param siteId - The ID of the site to fetch harvests for
 */
export function useHarvestsBySite(siteId: string | null): UseHarvestsResult {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seasonTotalKg, setSeasonTotalKg] = useState(0);
  const [seasonHarvestCount, setSeasonHarvestCount] = useState(0);

  const fetchHarvests = useCallback(async () => {
    if (!siteId) {
      setHarvests([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get<HarvestsResponse>(`/sites/${siteId}/harvests`);
      const fetchedHarvests = response.data.data || [];
      setHarvests(fetchedHarvests);
      setTotal(response.data.meta.total);

      // Calculate season totals
      const seasonTotals = calculateSeasonTotals(fetchedHarvests);
      setSeasonTotalKg(seasonTotals.totalKg);
      setSeasonHarvestCount(seasonTotals.count);

      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchHarvests();
  }, [fetchHarvests]);

  const createHarvest = useCallback(async (input: CreateHarvestInput): Promise<Harvest> => {
    setCreating(true);
    try {
      const response = await apiClient.post<HarvestResponse>('/harvests', input);
      // Refetch to update the list
      await fetchHarvests();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchHarvests]);

  const updateHarvest = useCallback(async (id: string, input: UpdateHarvestInput): Promise<Harvest> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<HarvestResponse>(`/harvests/${id}`, input);
      // Refetch to update the list
      await fetchHarvests();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchHarvests]);

  const deleteHarvest = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/harvests/${id}`);
      // Refetch to update the list
      await fetchHarvests();
    } finally {
      setDeleting(false);
    }
  }, [fetchHarvests]);

  return {
    harvests,
    total,
    loading,
    error,
    refetch: fetchHarvests,
    createHarvest,
    updateHarvest,
    deleteHarvest,
    creating,
    updating,
    deleting,
    seasonTotalKg,
    seasonHarvestCount,
  };
}

/**
 * Hook to fetch harvest analytics for the current tenant.
 */
export function useHarvestAnalytics(): UseHarvestAnalyticsResult {
  const [analytics, setAnalytics] = useState<HarvestAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<AnalyticsResponse>('/harvests/analytics');
      setAnalytics(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    analytics,
    loading,
    error,
    refetch: fetchAnalytics,
  };
}

/**
 * Format harvest date for display.
 */
export function formatHarvestDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format amount in kg for display.
 */
export function formatKg(amount: number): string {
  return `${amount.toFixed(1)} kg`;
}

/**
 * Get current beekeeping season label.
 * Season runs April 1 to March 31.
 */
export function getCurrentSeasonLabel(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year} season`;
}

export default useHarvestsByHive;
