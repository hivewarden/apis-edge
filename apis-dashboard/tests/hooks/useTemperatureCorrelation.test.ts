/**
 * useTemperatureCorrelation Hook Tests
 *
 * Tests for the temperature correlation data hook.
 * Part of Epic 3, Story 3.6: Temperature Correlation Chart
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTemperatureCorrelation } from '../../src/hooks/useTemperatureCorrelation';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiClient = apiClient as { get: ReturnType<typeof vi.fn> };

describe('useTemperatureCorrelation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns empty points and loading true initially when siteId is provided', () => {
      mockApiClient.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      expect(result.current.points).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.isHourly).toBe(false);
    });

    it('returns empty points and loading false when siteId is null', async () => {
      const { result } = renderHook(() => useTemperatureCorrelation(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.points).toEqual([]);
      expect(result.current.isHourly).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful fetch', () => {
    it('fetches daily correlation data for a site with default month range', async () => {
      const mockPoints = [
        { date: '2026-01-23', avg_temp: 15.0, detection_count: 5 },
        { date: '2026-01-24', avg_temp: 18.0, detection_count: 12 },
        { date: '2026-01-25', avg_temp: 22.0, detection_count: 20 },
      ];

      mockApiClient.get.mockResolvedValue({
        data: {
          data: mockPoints,
          meta: {
            range: 'month',
            total_points: 3,
            is_hourly: false,
          },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.points).toEqual(mockPoints);
      expect(result.current.isHourly).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=month');
    });

    it('fetches hourly correlation data for day range', async () => {
      const mockPoints = [
        { hour: 9, avg_temp: 15.2, detection_count: 1 },
        { hour: 10, avg_temp: 17.8, detection_count: 3 },
        { hour: 11, avg_temp: 19.5, detection_count: 5 },
      ];

      mockApiClient.get.mockResolvedValue({
        data: {
          data: mockPoints,
          meta: {
            range: 'day',
            date: '2026-01-25',
            total_points: 3,
            is_hourly: true,
          },
        },
      });

      const testDate = new Date('2026-01-25');
      const { result } = renderHook(() => useTemperatureCorrelation('site-1', 'day', testDate));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.points).toEqual(mockPoints);
      expect(result.current.isHourly).toBe(true);
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=day&date=2026-01-25');
    });

    it('includes date parameter only for day range', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [],
          meta: { range: 'week', total_points: 0, is_hourly: false },
        },
      });

      const testDate = new Date('2026-01-25');
      const { result } = renderHook(() => useTemperatureCorrelation('site-1', 'week', testDate));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Date should NOT be included for non-day ranges
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=week');
    });

    it('uses week range when specified', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [{ date: '2026-01-20', avg_temp: 16.0, detection_count: 8 }],
          meta: { range: 'week', total_points: 1, is_hourly: false },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1', 'week'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=week');
    });
  });

  describe('empty data handling', () => {
    it('handles empty response correctly', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [],
          meta: { range: 'month', total_points: 0, is_hourly: false },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.points).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('handles null data in response', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: null,
          meta: { range: 'month', total_points: 0, is_hourly: false },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.points).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('sets error on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockApiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
    });

    it('keeps stale data on subsequent fetch failure', async () => {
      const mockPoints = [
        { date: '2026-01-25', avg_temp: 22.0, detection_count: 15 },
      ];

      // First call succeeds
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: mockPoints,
          meta: { range: 'month', total_points: 1, is_hourly: false },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.points).toEqual(mockPoints);
      });

      // Second call fails
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'));

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Points should still be available (stale data)
      expect(result.current.points).toEqual(mockPoints);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('site and range changes', () => {
    it('refetches when siteId changes', async () => {
      const mockPoints1 = [{ date: '2026-01-25', avg_temp: 18.0, detection_count: 10 }];
      const mockPoints2 = [{ date: '2026-01-25', avg_temp: 22.0, detection_count: 20 }];

      mockApiClient.get
        .mockResolvedValueOnce({
          data: { data: mockPoints1, meta: { range: 'month', total_points: 1, is_hourly: false } },
        })
        .mockResolvedValueOnce({
          data: { data: mockPoints2, meta: { range: 'month', total_points: 1, is_hourly: false } },
        });

      const { result, rerender } = renderHook(
        ({ siteId }) => useTemperatureCorrelation(siteId),
        { initialProps: { siteId: 'site-1' } }
      );

      await waitFor(() => {
        expect(result.current.points).toEqual(mockPoints1);
      });

      // Change site
      rerender({ siteId: 'site-2' });

      await waitFor(() => {
        expect(result.current.points).toEqual(mockPoints2);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=month');
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-2&range=month');
    });

    it('refetches when range changes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [],
          meta: { range: 'month', total_points: 0, is_hourly: false },
        },
      });

      const { rerender } = renderHook(
        ({ range }) => useTemperatureCorrelation('site-1', range),
        { initialProps: { range: 'month' } }
      );

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      });

      // Change range
      rerender({ range: 'week' });

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      });

      expect(mockApiClient.get).toHaveBeenLastCalledWith('/detections/temperature-correlation?site_id=site-1&range=week');
    });

    it('sets loading true when siteId changes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [{ date: '2026-01-25', avg_temp: 20.0, detection_count: 10 }],
          meta: { range: 'month', total_points: 1, is_hourly: false },
        },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useTemperatureCorrelation(siteId),
        { initialProps: { siteId: 'site-1' } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Change site - should go back to loading
      rerender({ siteId: 'site-2' });

      expect(result.current.loading).toBe(true);
    });
  });

  describe('refetch function', () => {
    it('provides a refetch function that can be called manually', async () => {
      const mockPoints = [
        { date: '2026-01-25', avg_temp: 22.0, detection_count: 15 },
      ];

      mockApiClient.get.mockResolvedValue({
        data: {
          data: mockPoints,
          meta: { range: 'month', total_points: 1, is_hourly: false },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);

      // Manually refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('date formatting', () => {
    it('formats date parameter correctly as YYYY-MM-DD', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [],
          meta: { range: 'day', total_points: 0, is_hourly: true },
        },
      });

      const testDate = new Date('2026-03-15T14:30:00Z');
      const { result } = renderHook(() => useTemperatureCorrelation('site-1', 'day', testDate));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('date=2026-03-15')
      );
    });

    it('handles null date gracefully', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: [],
          meta: { range: 'day', total_points: 0, is_hourly: true },
        },
      });

      const { result } = renderHook(() => useTemperatureCorrelation('site-1', 'day', null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not include date parameter when null
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/temperature-correlation?site_id=site-1&range=day');
    });
  });
});
