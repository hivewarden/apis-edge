/**
 * useOverwintering Hook
 *
 * Fetches and manages overwintering data for the spring survey and winter reports.
 * Handles season detection, survival tracking, and historical trend analysis.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Overwintering record for a single hive.
 */
export interface OverwinteringRecord {
  id: string;
  hive_id: string;
  hive_name: string;
  winter_season: number;
  survived: boolean;
  condition?: 'strong' | 'medium' | 'weak';
  condition_display?: string;
  stores_remaining?: 'none' | 'low' | 'adequate' | 'plenty';
  stores_display?: string;
  first_inspection_notes?: string;
  recorded_at: string;
  created_at: string;
}

/**
 * Spring prompt data returned by the API.
 */
export interface SpringPromptData {
  should_show: boolean;
  winter_season: number;
  season_label: string;
  message: string;
}

/**
 * Hive with optional existing overwintering record.
 */
export interface HiveWithRecord {
  hive_id: string;
  hive_name: string;
  existing_record?: OverwinteringRecord;
}

/**
 * Summary of a lost hive in the report.
 */
export interface LostHiveSummary {
  hive_id: string;
  hive_name: string;
  cause?: string;
  cause_display?: string;
  has_post_mortem: boolean;
}

/**
 * Summary of a survived hive in the report.
 */
export interface SurvivedHiveSummary {
  hive_id: string;
  hive_name: string;
  condition?: string;
  condition_display?: string;
  stores_remaining?: string;
  stores_display?: string;
  first_inspection_notes?: string;
}

/**
 * Comparison to previous winter.
 */
export interface WinterComparison {
  previous_season: number;
  previous_season_label: string;
  previous_survival_rate: number;
  change_percent: number;
  improved: boolean;
}

/**
 * Complete winter report data.
 */
export interface WinterReport {
  winter_season: number;
  season_label: string;
  total_hives: number;
  survived_count: number;
  lost_count: number;
  weak_count: number;
  survival_rate: number;
  is_100_percent: boolean;
  lost_hives: LostHiveSummary[];
  survived_hives: SurvivedHiveSummary[];
  comparison?: WinterComparison;
}

/**
 * Historical survival trend data.
 */
export interface SurvivalTrend {
  winter_season: number;
  season_label: string;
  survival_rate: number;
  total_hives: number;
  survived_count: number;
}

/**
 * Input for creating an overwintering record.
 */
export interface CreateOverwinteringInput {
  hive_id: string;
  winter_season: number;
  survived: boolean;
  condition?: 'strong' | 'medium' | 'weak';
  stores_remaining?: 'none' | 'low' | 'adequate' | 'plenty';
  first_inspection_notes?: string;
}

interface PromptResponse {
  data: SpringPromptData;
}

interface HivesResponse {
  data: HiveWithRecord[];
  meta: { total: number };
}

interface RecordResponse {
  data: OverwinteringRecord;
  message?: string;
  redirect?: string;
}

interface ReportResponse {
  data: WinterReport;
}

interface TrendsResponse {
  data: SurvivalTrend[];
  meta: { total: number };
}

interface SeasonsResponse {
  data: number[];
  meta: { total: number };
}

interface UseSpringPromptResult {
  promptData: SpringPromptData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseOverwinteringHivesResult {
  hives: HiveWithRecord[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseWinterReportResult {
  report: WinterReport | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseSurvivalTrendsResult {
  trends: SurvivalTrend[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseAvailableWintersResult {
  seasons: number[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to check if spring prompt should be shown.
 *
 * @param hemisphere - 'northern' or 'southern' (defaults to 'northern')
 *
 * @example
 * function Dashboard() {
 *   const { promptData, loading } = useSpringPrompt();
 *
 *   if (loading) return null;
 *
 *   if (promptData?.should_show) {
 *     return <OverwinteringPrompt winterSeason={promptData.winter_season} />;
 *   }
 * }
 */
export function useSpringPrompt(hemisphere: string = 'northern'): UseSpringPromptResult {
  const [promptData, setPromptData] = useState<SpringPromptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPrompt = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<PromptResponse>(`/overwintering/prompt?hemisphere=${hemisphere}`);
      setPromptData(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [hemisphere]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  return {
    promptData,
    loading,
    error,
    refetch: fetchPrompt,
  };
}

/**
 * Hook to fetch hives for the overwintering survey.
 *
 * @param winterSeason - The winter season year to fetch hives for
 *
 * @example
 * function OverwinteringSurvey({ winterSeason }) {
 *   const { hives, loading } = useOverwinteringHives(winterSeason);
 *
 *   if (loading) return <Spin />;
 *
 *   return hives.map(hive => <HiveWinterStatusCard key={hive.hive_id} hive={hive} />);
 * }
 */
export function useOverwinteringHives(winterSeason: number | null): UseOverwinteringHivesResult {
  const [hives, setHives] = useState<HiveWithRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHives = useCallback(async () => {
    if (!winterSeason) {
      setHives([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get<HivesResponse>(`/overwintering/hives?winter_season=${winterSeason}`);
      setHives(response.data.data || []);
      setTotal(response.data.meta.total);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [winterSeason]);

  useEffect(() => {
    fetchHives();
  }, [fetchHives]);

  return {
    hives,
    total,
    loading,
    error,
    refetch: fetchHives,
  };
}

/**
 * Submit an overwintering record for a hive.
 *
 * @param input - The overwintering record input
 * @returns The created record and optional redirect URL for lost hives
 *
 * @example
 * const { createRecord, creating } = useCreateOverwinteringRecord();
 *
 * const handleSubmit = async () => {
 *   const result = await createRecord({
 *     hive_id: 'hive-123',
 *     winter_season: 2025,
 *     survived: true,
 *     condition: 'strong',
 *   });
 *
 *   if (result.redirect) {
 *     navigate(result.redirect); // Go to post-mortem for lost hives
 *   }
 * };
 */
export async function submitOverwinteringRecord(
  input: CreateOverwinteringInput
): Promise<{ record: OverwinteringRecord; message?: string; redirect?: string }> {
  const response = await apiClient.post<RecordResponse>('/overwintering', input);
  return {
    record: response.data.data,
    message: response.data.message,
    redirect: response.data.redirect,
  };
}

/**
 * Hook to fetch the winter report.
 *
 * @param winterSeason - The winter season year (optional, defaults to current)
 *
 * @example
 * function WinterReportPage({ winterSeason }) {
 *   const { report, loading } = useWinterReport(winterSeason);
 *
 *   if (loading) return <Spin />;
 *
 *   return (
 *     <div>
 *       <h2>Survival Rate: {report.survival_rate}%</h2>
 *       {report.is_100_percent && <SurvivalCelebration />}
 *     </div>
 *   );
 * }
 */
export function useWinterReport(winterSeason?: number): UseWinterReportResult {
  const [report, setReport] = useState<WinterReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = winterSeason ? `?winter_season=${winterSeason}` : '';
      const response = await apiClient.get<ReportResponse>(`/overwintering/report${params}`);
      setReport(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [winterSeason]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return {
    report,
    loading,
    error,
    refetch: fetchReport,
  };
}

/**
 * Hook to fetch survival trends over multiple winters.
 *
 * @param years - Number of years to include (default: 5)
 *
 * @example
 * function SurvivalTrendChart({ years }) {
 *   const { trends, loading } = useSurvivalTrends(years);
 *
 *   if (loading) return <Spin />;
 *
 *   return <LineChart data={trends} xKey="season_label" yKey="survival_rate" />;
 * }
 */
export function useSurvivalTrends(years: number = 5): UseSurvivalTrendsResult {
  const [trends, setTrends] = useState<SurvivalTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<TrendsResponse>(`/overwintering/trends?years=${years}`);
      setTrends(response.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [years]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  return {
    trends,
    loading,
    error,
    refetch: fetchTrends,
  };
}

/**
 * Hook to fetch available winter seasons with data.
 *
 * @example
 * function WinterSelector() {
 *   const { seasons, loading } = useAvailableWinters();
 *
 *   if (loading) return <Spin />;
 *
 *   return (
 *     <Select>
 *       {seasons.map(season => (
 *         <Option key={season} value={season}>
 *           {getSeasonLabel(season)}
 *         </Option>
 *       ))}
 *     </Select>
 *   );
 * }
 */
export function useAvailableWinters(): UseAvailableWintersResult {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSeasons = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<SeasonsResponse>('/overwintering/seasons');
      setSeasons(response.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
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
 * Format winter season as a display label.
 * @example getSeasonLabel(2025) // "2025-2026"
 */
export function getSeasonLabel(winterSeason: number): string {
  return `${winterSeason}-${winterSeason + 1}`;
}

/**
 * Get display name for condition value.
 */
export function getConditionDisplay(condition: string): string {
  const displays: Record<string, string> = {
    strong: 'Strong',
    medium: 'Medium',
    weak: 'Weak',
  };
  return displays[condition] || condition;
}

/**
 * Get display name for stores remaining value.
 */
export function getStoresDisplay(stores: string): string {
  const displays: Record<string, string> = {
    none: 'None',
    low: 'Low',
    adequate: 'Adequate',
    plenty: 'Plenty',
  };
  return displays[stores] || stores;
}

export default useSpringPrompt;
