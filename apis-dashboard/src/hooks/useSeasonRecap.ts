/**
 * useSeasonRecap Hook
 *
 * Fetches season recap data including harvest totals, detection counts,
 * milestones, and per-hive breakdowns. Supports year selection and caching.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Season dates with display formatting.
 */
export interface SeasonDates {
  start: string;
  end: string;
  display_text: string;
}

/**
 * Milestone event during the season.
 */
export interface Milestone {
  type: string; // "first_harvest", "new_hive", "queen_replaced", "hive_loss"
  description: string;
  date: string;
  hive_id?: string;
  hive_name?: string;
}

/**
 * Per-hive statistics for the season.
 */
export interface HiveSeasonStat {
  hive_id: string;
  hive_name: string;
  harvest_kg: number;
  status: string; // "healthy", "treated", "new_queen", "lost"
  status_detail?: string;
  issues?: string[];
}

/**
 * Year-over-year comparison data.
 */
export interface YearComparison {
  previous_year: number;
  previous_harvest_kg: number;
  harvest_change_percent: number;
  previous_hornets: number;
  hornets_change_percent: number;
}

/**
 * Full season recap data.
 */
export interface SeasonRecap {
  id: string;
  season_year: number;
  hemisphere: string;
  season_dates: SeasonDates;
  total_harvest_kg: number;
  hornets_deterred: number;
  inspections_count: number;
  treatments_count: number;
  feedings_count: number;
  milestones: Milestone[];
  per_hive_stats: HiveSeasonStat[];
  comparison_data?: YearComparison;
  generated_at: string;
}

interface RecapResponse {
  data: SeasonRecap;
}

interface SeasonsResponse {
  data: number[];
  meta: { total: number };
}

interface RecapTextResponse {
  data: {
    text: string;
  };
}

interface IsRecapTimeResponse {
  data: {
    is_recap_time: boolean;
    current_season: number;
    hemisphere: string;
  };
}

export interface UseSeasonRecapResult {
  recap: SeasonRecap | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  regenerate: () => Promise<void>;
  regenerating: boolean;
}

export interface UseAvailableSeasonsResult {
  seasons: number[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseRecapTimeResult {
  isRecapTime: boolean;
  currentSeason: number;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch season recap data.
 *
 * @param year - Season year (default: current season)
 * @param hemisphere - "northern" or "southern" (default: "northern")
 */
export function useSeasonRecap(
  year?: number,
  hemisphere: string = 'northern'
): UseSeasonRecapResult {
  const [recap, setRecap] = useState<SeasonRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchRecap = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year) {
        params.set('season', String(year));
      }
      params.set('hemisphere', hemisphere);

      const url = `/recap${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<RecapResponse>(url);
      setRecap(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setRecap(null);
    } finally {
      setLoading(false);
    }
  }, [year, hemisphere]);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const response = await apiClient.post<RecapResponse>('/recap/regenerate', {
        season: year || new Date().getFullYear(),
        hemisphere,
      });
      setRecap(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setRegenerating(false);
    }
  }, [year, hemisphere]);

  useEffect(() => {
    fetchRecap();
  }, [fetchRecap]);

  return {
    recap,
    loading,
    error,
    refetch: fetchRecap,
    regenerate,
    regenerating,
  };
}

/**
 * Hook to fetch list of available seasons.
 */
export function useAvailableSeasons(): UseAvailableSeasonsResult {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSeasons = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<SeasonsResponse>('/recap/seasons');
      setSeasons(response.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setSeasons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeasons();
  }, [fetchSeasons]);

  return {
    seasons,
    loading,
    error,
    refetch: fetchSeasons,
  };
}

/**
 * Hook to check if it's season recap time.
 *
 * @param hemisphere - "northern" or "southern" (default: "northern")
 */
export function useRecapTime(hemisphere: string = 'northern'): UseRecapTimeResult {
  const [isRecapTime, setIsRecapTime] = useState(false);
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchRecapTime = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<IsRecapTimeResponse>(
          `/recap/is-time?hemisphere=${hemisphere}`
        );
        setIsRecapTime(response.data.data.is_recap_time);
        setCurrentSeason(response.data.data.current_season);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecapTime();
  }, [hemisphere]);

  return {
    isRecapTime,
    currentSeason,
    loading,
    error,
  };
}

/**
 * Get recap as formatted text for sharing.
 *
 * @param year - Season year
 * @param hemisphere - "northern" or "southern"
 */
export async function getRecapText(
  year: number,
  hemisphere: string = 'northern'
): Promise<string> {
  const response = await apiClient.get<RecapTextResponse>(
    `/recap/text?season=${year}&hemisphere=${hemisphere}`
  );
  return response.data.data.text;
}

/**
 * Format harvest amount for display.
 */
export function formatHarvestKg(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

/**
 * Get status color for hive status.
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'treated':
      return 'orange';
    case 'new_queen':
      return 'blue';
    case 'lost':
      return 'red';
    default:
      return 'default';
  }
}

/**
 * Get human-readable status label.
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'treated':
      return 'Treated';
    case 'new_queen':
      return 'New Queen';
    case 'lost':
      return 'Lost';
    default:
      return status;
  }
}

/**
 * Get milestone icon type based on milestone type.
 */
export function getMilestoneIcon(type: string): string {
  switch (type) {
    case 'first_harvest':
      return 'trophy';
    case 'new_hive':
      return 'plus-circle';
    case 'queen_replaced':
      return 'crown';
    case 'hive_loss':
      return 'warning';
    default:
      return 'star';
  }
}

export default useSeasonRecap;
