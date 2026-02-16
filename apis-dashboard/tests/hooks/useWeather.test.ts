/**
 * useWeather Hook Tests
 *
 * Tests for the weather data hook.
 * Part of Epic 3, Story 3.3: Weather Integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWeather } from '../../src/hooks/useWeather';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiClient = apiClient as { get: ReturnType<typeof vi.fn> };

describe('useWeather', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('returns null weather and loading true initially when siteId is provided', () => {
      mockApiClient.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useWeather('site-1'));

      expect(result.current.weather).toBeNull();
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('returns null weather and loading false when siteId is null', async () => {
      const { result } = renderHook(() => useWeather(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.weather).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful fetch', () => {
    it('fetches weather data for a site', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.weather).toEqual(mockWeather);
      expect(result.current.error).toBeNull();
      expect(mockApiClient.get).toHaveBeenCalledWith('/sites/site-1/weather');
    });

    it('returns all weather data fields', async () => {
      const mockWeather = {
        temperature: 22.3,
        apparent_temperature: 21.5,
        humidity: 45,
        weather_code: 0,
        condition: 'Clear sky',
        condition_icon: 'sun',
        fetched_at: '2026-01-25T14:30:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result } = renderHook(() => useWeather('site-2'));

      await waitFor(() => {
        expect(result.current.weather).not.toBeNull();
      });

      expect(result.current.weather?.temperature).toBe(22.3);
      expect(result.current.weather?.apparent_temperature).toBe(21.5);
      expect(result.current.weather?.humidity).toBe(45);
      expect(result.current.weather?.weather_code).toBe(0);
      expect(result.current.weather?.condition).toBe('Clear sky');
      expect(result.current.weather?.condition_icon).toBe('sun');
    });
  });

  describe('error handling', () => {
    it('sets error on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockApiClient.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.weather).toBeNull();
    });

    it('keeps stale data on subsequent fetch failure', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      // First call succeeds
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockWeather },
      });

      const { result } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.weather).toEqual(mockWeather);
      });

      // Second call fails
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'));

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      // Weather should still be available (stale data)
      expect(result.current.weather).toEqual(mockWeather);
      expect(result.current.error).toBeTruthy();
    });

    it('handles 400 error for missing GPS', async () => {
      const gpsError = new Error('Site has no GPS coordinates');
      mockApiClient.get.mockRejectedValue(gpsError);

      const { result } = renderHook(() => useWeather('site-no-gps'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(gpsError);
      expect(result.current.weather).toBeNull();
    });

    it('handles 503 error for weather unavailable', async () => {
      const serviceError = new Error('Weather unavailable');
      mockApiClient.get.mockRejectedValue(serviceError);

      const { result } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(serviceError);
    });
  });

  describe('site changes', () => {
    it('refetches when siteId changes', async () => {
      const mockWeather1 = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      const mockWeather2 = {
        temperature: 22.0,
        apparent_temperature: 21.5,
        humidity: 50,
        weather_code: 0,
        condition: 'Clear sky',
        condition_icon: 'sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get
        .mockResolvedValueOnce({ data: { data: mockWeather1 } })
        .mockResolvedValueOnce({ data: { data: mockWeather2 } });

      const { result, rerender } = renderHook(
        ({ siteId }) => useWeather(siteId),
        { initialProps: { siteId: 'site-1' } }
      );

      await waitFor(() => {
        expect(result.current.weather).toEqual(mockWeather1);
      });

      // Change site
      rerender({ siteId: 'site-2' });

      await waitFor(() => {
        expect(result.current.weather).toEqual(mockWeather2);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/sites/site-1/weather');
      expect(mockApiClient.get).toHaveBeenCalledWith('/sites/site-2/weather');
    });

    it('resets state when siteId changes', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useWeather(siteId),
        { initialProps: { siteId: 'site-1' } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Change site - should reset to loading
      rerender({ siteId: 'site-2' });

      expect(result.current.loading).toBe(true);
      expect(result.current.weather).toBeNull();
    });

    it('handles transition from valid siteId to null', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useWeather(siteId),
        { initialProps: { siteId: 'site-1' as string | null } }
      );

      await waitFor(() => {
        expect(result.current.weather).toEqual(mockWeather);
      });

      // Change to null
      rerender({ siteId: null });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.weather).toBeNull();
    });
  });

  describe('refetch function', () => {
    it('provides a refetch function that can be called manually', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result } = renderHook(() => useWeather('site-1'));

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

    it('does not show loading on refetch (background refresh)', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start a refetch - loading should not become true for background refresh
      act(() => {
        result.current.refetch();
      });

      // Loading should stay false during background refresh
      expect(result.current.loading).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('does not make API calls after unmount', async () => {
      const mockWeather = {
        temperature: 18.5,
        apparent_temperature: 17.2,
        humidity: 65,
        weather_code: 3,
        condition: 'Partly cloudy',
        condition_icon: 'cloud-sun',
        fetched_at: '2026-01-25T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockWeather },
      });

      const { result, unmount } = renderHook(() => useWeather('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCountBeforeUnmount = mockApiClient.get.mock.calls.length;
      unmount();

      // Verify unmount happened cleanly (interval should be cleared)
      expect(mockApiClient.get).toHaveBeenCalledTimes(callCountBeforeUnmount);
    });
  });
});
