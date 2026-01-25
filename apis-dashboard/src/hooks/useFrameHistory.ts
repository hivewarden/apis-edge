import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

interface FrameHistoryEntry {
  inspection_id: string;
  inspected_at: string;
  total_brood: number;
  total_honey: number;
  total_pollen: number;
  total_drawn: number;
}

interface FrameHistoryResponse {
  data: FrameHistoryEntry[];
  meta: { total: number };
}

export interface ChartDataPoint {
  date: string;
  type: 'Brood' | 'Honey' | 'Pollen';
  value: number;
}

/**
 * Hook to fetch and transform frame history data for chart display.
 *
 * Part of Epic 5, Story 5.6: Frame Development Graphs
 */
export function useFrameHistory(hiveId: string | null) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [rawData, setRawData] = useState<FrameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!hiveId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<FrameHistoryResponse>(
        `/hives/${hiveId}/frame-history?limit=50`
      );

      const entries = response.data.data;
      setRawData(entries);

      // Transform data for stacked area chart
      // Each entry becomes 3 data points (one per type)
      const chartData: ChartDataPoint[] = [];

      // Sort by date ascending for chart display
      const sortedEntries = [...entries].sort(
        (a, b) => new Date(a.inspected_at).getTime() - new Date(b.inspected_at).getTime()
      );

      for (const entry of sortedEntries) {
        const date = entry.inspected_at;
        chartData.push({ date, type: 'Brood', value: entry.total_brood });
        chartData.push({ date, type: 'Honey', value: entry.total_honey });
        chartData.push({ date, type: 'Pollen', value: entry.total_pollen });
      }

      setData(chartData);
    } catch (err) {
      setError('Failed to load frame history');
      console.error('Error fetching frame history:', err);
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    data,
    rawData,
    loading,
    error,
    refresh: fetchHistory,
    hasEnoughData: rawData.length >= 3,
  };
}

export default useFrameHistory;
