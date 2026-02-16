/**
 * useTrendData Hook Tests
 *
 * Tests for the trend data fetching hook used in TrendChartCard.
 *
 * Part of Epic 3, Story 3.7: Daily/Weekly Trend Line Chart
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTrendData } from '../../src/hooks/useTrendData';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiGet = vi.mocked(apiClient.get);

describe('useTrendData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty points when no siteId provided', async () => {
    const { result } = renderHook(() => useTrendData(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.totalDetections).toBe(0);
    expect(result.current.aggregation).toBe('daily');
    expect(result.current.error).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('fetches data correctly for week range', async () => {
    const mockResponse = {
      data: {
        data: [
          { label: 'Mon', date: '2026-01-20', count: 5 },
          { label: 'Tue', date: '2026-01-21', count: 3 },
          { label: 'Wed', date: '2026-01-22', count: 8 },
        ],
        meta: {
          range: 'week',
          aggregation: 'daily',
          total_detections: 16,
        },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useTrendData('site-123', 'week'));

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toHaveLength(3);
    expect(result.current.points[0].label).toBe('Mon');
    expect(result.current.totalDetections).toBe(16);
    expect(result.current.aggregation).toBe('daily');
    expect(result.current.error).toBeNull();
    expect(mockApiGet).toHaveBeenCalledWith('/detections/trend?site_id=site-123&range=week');
  });

  it('fetches data correctly for month range', async () => {
    const mockResponse = {
      data: {
        data: [
          { label: 'Jan 1', date: '2026-01-01', count: 2 },
          { label: 'Jan 2', date: '2026-01-02', count: 7 },
        ],
        meta: {
          range: 'month',
          aggregation: 'daily',
          total_detections: 9,
        },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useTrendData('site-456', 'month'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toHaveLength(2);
    expect(result.current.aggregation).toBe('daily');
    expect(mockApiGet).toHaveBeenCalledWith('/detections/trend?site_id=site-456&range=month');
  });

  it('fetches data correctly for day range with date parameter', async () => {
    const mockResponse = {
      data: {
        data: [
          { label: '08:00', hour: 8, count: 1 },
          { label: '09:00', hour: 9, count: 3 },
        ],
        meta: {
          range: 'day',
          aggregation: 'hourly',
          total_detections: 4,
        },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockResponse);

    const testDate = new Date('2026-01-15');
    const { result } = renderHook(() => useTrendData('site-789', 'day', testDate));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.aggregation).toBe('hourly');
    expect(mockApiGet).toHaveBeenCalledWith('/detections/trend?site_id=site-789&range=day&date=2026-01-15');
  });

  it('handles loading state correctly', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockApiGet.mockReturnValueOnce(promise as ReturnType<typeof mockApiGet>);

    const { result } = renderHook(() => useTrendData('site-123', 'week'));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePromise!({
        data: {
          data: [],
          meta: { range: 'week', aggregation: 'daily', total_detections: 0 },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles error state correctly', async () => {
    const mockError = new Error('Network error');
    mockApiGet.mockRejectedValueOnce(mockError);

    const { result } = renderHook(() => useTrendData('site-123', 'week'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(mockError);
  });

  it('refetch function triggers new fetch', async () => {
    const mockResponse = {
      data: {
        data: [{ label: 'Mon', date: '2026-01-20', count: 5 }],
        meta: { range: 'week', aggregation: 'daily', total_detections: 5 },
      },
    };

    mockApiGet.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useTrendData('site-123', 'week'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiGet).toHaveBeenCalledTimes(1);

    // Call refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('refetches when siteId changes', async () => {
    const mockResponse1 = {
      data: {
        data: [{ label: 'Mon', count: 5 }],
        meta: { range: 'week', aggregation: 'daily', total_detections: 5 },
      },
    };

    const mockResponse2 = {
      data: {
        data: [{ label: 'Tue', count: 10 }],
        meta: { range: 'week', aggregation: 'daily', total_detections: 10 },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

    const { result, rerender } = renderHook(
      ({ siteId }) => useTrendData(siteId, 'week'),
      { initialProps: { siteId: 'site-1' } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalDetections).toBe(5);

    // Change siteId
    rerender({ siteId: 'site-2' });

    await waitFor(() => {
      expect(result.current.totalDetections).toBe(10);
    });

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('refetches when range changes', async () => {
    const mockWeekResponse = {
      data: {
        data: [{ label: 'Mon', count: 5 }],
        meta: { range: 'week', aggregation: 'daily', total_detections: 5 },
      },
    };

    const mockMonthResponse = {
      data: {
        data: [{ label: 'Jan 1', count: 15 }],
        meta: { range: 'month', aggregation: 'daily', total_detections: 15 },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockWeekResponse).mockResolvedValueOnce(mockMonthResponse);

    const { result, rerender } = renderHook(
      ({ range }) => useTrendData('site-123', range),
      { initialProps: { range: 'week' } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalDetections).toBe(5);

    // Change range
    rerender({ range: 'month' });

    await waitFor(() => {
      expect(result.current.totalDetections).toBe(15);
    });
  });

  it('defaults to week range when not specified', async () => {
    const mockResponse = {
      data: {
        data: [],
        meta: { range: 'week', aggregation: 'daily', total_detections: 0 },
      },
    };

    mockApiGet.mockResolvedValueOnce(mockResponse);

    renderHook(() => useTrendData('site-123'));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/detections/trend?site_id=site-123&range=week');
    });
  });
});
