/**
 * Tests for useFrameHistory hook
 *
 * Part of Epic 5, Story 5.6: Frame Development Graphs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFrameHistory, ChartDataPoint } from '../../src/hooks/useFrameHistory';

// Mock apiClient
const mockGet = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

describe('useFrameHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful data fetch', () => {
    it('fetches and transforms frame history data correctly', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              inspection_id: 'insp-1',
              inspected_at: '2024-06-15T10:00:00Z',
              total_brood: 6,
              total_honey: 4,
              total_pollen: 2,
              total_drawn: 12,
            },
            {
              inspection_id: 'insp-2',
              inspected_at: '2024-06-01T10:00:00Z',
              total_brood: 5,
              total_honey: 3,
              total_pollen: 1,
              total_drawn: 9,
            },
            {
              inspection_id: 'insp-3',
              inspected_at: '2024-06-22T10:00:00Z',
              total_brood: 7,
              total_honey: 5,
              total_pollen: 3,
              total_drawn: 15,
            },
          ],
          meta: { total: 3 },
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify API was called correctly
      expect(mockGet).toHaveBeenCalledWith('/hives/hive-123/frame-history?limit=50');

      // Verify data is transformed and sorted by date ascending
      expect(result.current.data).toHaveLength(9); // 3 entries x 3 types
      expect(result.current.error).toBeNull();
      expect(result.current.hasEnoughData).toBe(true);

      // First data points should be from June 1 (earliest date)
      const firstEntries = result.current.data.slice(0, 3);
      expect(firstEntries.every((d: ChartDataPoint) => d.date === '2024-06-01T10:00:00Z')).toBe(true);

      // Check all types are present
      const types = result.current.data.map((d: ChartDataPoint) => d.type);
      expect(types.filter((t: string) => t === 'Brood')).toHaveLength(3);
      expect(types.filter((t: string) => t === 'Honey')).toHaveLength(3);
      expect(types.filter((t: string) => t === 'Pollen')).toHaveLength(3);
    });

    it('transforms values correctly for each type', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              inspection_id: 'insp-1',
              inspected_at: '2024-06-15T10:00:00Z',
              total_brood: 6,
              total_honey: 4,
              total_pollen: 2,
              total_drawn: 12,
            },
          ],
          meta: { total: 1 },
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const broodEntry = result.current.data.find((d: ChartDataPoint) => d.type === 'Brood');
      const honeyEntry = result.current.data.find((d: ChartDataPoint) => d.type === 'Honey');
      const pollenEntry = result.current.data.find((d: ChartDataPoint) => d.type === 'Pollen');

      expect(broodEntry?.value).toBe(6);
      expect(honeyEntry?.value).toBe(4);
      expect(pollenEntry?.value).toBe(2);
    });
  });

  describe('loading state', () => {
    it('sets loading to true while fetching', async () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toEqual([]);
    });
  });

  describe('error state', () => {
    it('handles fetch errors gracefully', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load frame history');
      expect(result.current.data).toEqual([]);
    });
  });

  describe('hasEnoughData calculation', () => {
    it('returns true when 3 or more entries', async () => {
      const mockResponse = {
        data: {
          data: [
            { inspection_id: '1', inspected_at: '2024-06-01T10:00:00Z', total_brood: 1, total_honey: 1, total_pollen: 1, total_drawn: 3 },
            { inspection_id: '2', inspected_at: '2024-06-08T10:00:00Z', total_brood: 2, total_honey: 2, total_pollen: 2, total_drawn: 6 },
            { inspection_id: '3', inspected_at: '2024-06-15T10:00:00Z', total_brood: 3, total_honey: 3, total_pollen: 3, total_drawn: 9 },
          ],
          meta: { total: 3 },
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasEnoughData).toBe(true);
    });

    it('returns false when fewer than 3 entries', async () => {
      const mockResponse = {
        data: {
          data: [
            { inspection_id: '1', inspected_at: '2024-06-01T10:00:00Z', total_brood: 1, total_honey: 1, total_pollen: 1, total_drawn: 3 },
            { inspection_id: '2', inspected_at: '2024-06-08T10:00:00Z', total_brood: 2, total_honey: 2, total_pollen: 2, total_drawn: 6 },
          ],
          meta: { total: 2 },
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasEnoughData).toBe(false);
    });

    it('returns false for empty data', async () => {
      const mockResponse = {
        data: {
          data: [],
          meta: { total: 0 },
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasEnoughData).toBe(false);
    });
  });

  describe('empty hiveId', () => {
    it('returns empty data when hiveId is null', () => {
      const { result } = renderHook(() => useFrameHistory(null));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns empty data when hiveId is empty string', () => {
      const { result } = renderHook(() => useFrameHistory(''));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('refresh function', () => {
    it('provides a refresh function to refetch data', async () => {
      const mockResponse = {
        data: {
          data: [
            { inspection_id: '1', inspected_at: '2024-06-01T10:00:00Z', total_brood: 1, total_honey: 1, total_pollen: 1, total_drawn: 3 },
          ],
          meta: { total: 1 },
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFrameHistory('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGet).toHaveBeenCalledTimes(1);

      // Call refresh
      result.current.refresh();

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledTimes(2);
      });
    });
  });
});
