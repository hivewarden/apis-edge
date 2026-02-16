/**
 * useDetectionStats Hook Tests
 *
 * Tests for the detection statistics hook.
 * Part of Epic 3, Story 3.2: Today's Detection Count Card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDetectionStats } from '../../src/hooks/useDetectionStats';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiClient = apiClient as { get: ReturnType<typeof vi.fn> };

describe('useDetectionStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('returns null stats and loading true initially when siteId is provided', () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            total_detections: 5,
            laser_activations: 3,
            hourly_breakdown: [],
            avg_confidence: 0.85,
            first_detection: null,
            last_detection: null,
          },
        },
      });

      const { result } = renderHook(() => useDetectionStats('site-1'));

      expect(result.current.stats).toBeNull();
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('returns null stats and loading false when siteId is null', async () => {
      const { result } = renderHook(() => useDetectionStats(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful fetch', () => {
    it('fetches detection stats for a site', async () => {
      const mockStats = {
        total_detections: 10,
        laser_activations: 8,
        hourly_breakdown: [0, 1, 2, 0, 0, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        avg_confidence: 0.92,
        first_detection: '2026-01-25T08:00:00Z',
        last_detection: '2026-01-25T14:30:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockStats },
      });

      const { result } = renderHook(() => useDetectionStats('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.error).toBeNull();
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/stats?site_id=site-1&range=day');
    });

    it('includes date parameter for day range when date is provided', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            total_detections: 0,
            laser_activations: 0,
            hourly_breakdown: [],
            avg_confidence: null,
            first_detection: null,
            last_detection: null,
          },
        },
      });

      const testDate = new Date('2026-01-20');
      const { result } = renderHook(() => useDetectionStats('site-1', 'day', testDate));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/stats?site_id=site-1&range=day&date=2026-01-20');
    });

    it('uses week range when specified', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            total_detections: 25,
            laser_activations: 20,
            hourly_breakdown: [],
            avg_confidence: 0.88,
            first_detection: null,
            last_detection: null,
          },
        },
      });

      const { result } = renderHook(() => useDetectionStats('site-1', 'week'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/stats?site_id=site-1&range=week');
    });
  });

  describe('error handling', () => {
    it('sets error on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockApiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useDetectionStats('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.stats).toBeNull();
    });

    it('keeps stale data on subsequent fetch failure', async () => {
      const mockStats = {
        total_detections: 5,
        laser_activations: 3,
        hourly_breakdown: [],
        avg_confidence: 0.85,
        first_detection: null,
        last_detection: null,
      };

      // First call succeeds
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockStats },
      });

      const { result } = renderHook(() => useDetectionStats('site-1'));

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockStats);
      });

      // Second call fails
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'));

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Stats should still be available (stale data)
      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('polling', () => {
    it('polls for new data every 30 seconds', async () => {
      const mockStats = {
        total_detections: 5,
        laser_activations: 3,
        hourly_breakdown: [],
        avg_confidence: 0.85,
        first_detection: null,
        last_detection: null,
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockStats },
      });

      renderHook(() => useDetectionStats('site-1'));

      // Wait for initial fetch
      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      });

      // Advance time by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);

      // Advance another 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
    });

    it('cleans up interval on unmount', async () => {
      const mockStats = {
        total_detections: 5,
        laser_activations: 3,
        hourly_breakdown: [],
        avg_confidence: 0.85,
        first_detection: null,
        last_detection: null,
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockStats },
      });

      const { unmount } = renderHook(() => useDetectionStats('site-1'));

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Advance time - should NOT trigger more calls
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('site changes', () => {
    it('refetches when siteId changes', async () => {
      const mockStats1 = {
        total_detections: 5,
        laser_activations: 3,
        hourly_breakdown: [],
        avg_confidence: 0.85,
        first_detection: null,
        last_detection: null,
      };

      const mockStats2 = {
        total_detections: 10,
        laser_activations: 8,
        hourly_breakdown: [],
        avg_confidence: 0.92,
        first_detection: null,
        last_detection: null,
      };

      mockApiClient.get
        .mockResolvedValueOnce({ data: { data: mockStats1 } })
        .mockResolvedValueOnce({ data: { data: mockStats2 } });

      const { result, rerender } = renderHook(
        ({ siteId }) => useDetectionStats(siteId),
        { initialProps: { siteId: 'site-1' } }
      );

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockStats1);
      });

      // Change site
      rerender({ siteId: 'site-2' });

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockStats2);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/stats?site_id=site-1&range=day');
      expect(mockApiClient.get).toHaveBeenCalledWith('/detections/stats?site_id=site-2&range=day');
    });

    it('sets loading true when siteId changes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            total_detections: 5,
            laser_activations: 3,
            hourly_breakdown: [],
            avg_confidence: 0.85,
            first_detection: null,
            last_detection: null,
          },
        },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useDetectionStats(siteId),
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
      const mockStats = {
        total_detections: 5,
        laser_activations: 3,
        hourly_breakdown: [],
        avg_confidence: 0.85,
        first_detection: null,
        last_detection: null,
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockStats },
      });

      const { result } = renderHook(() => useDetectionStats('site-1'));

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
});
