/**
 * useWeather Hook
 *
 * Fetches weather data for a site with auto-refresh every 5 minutes.
 * Used by dashboard components to display current weather conditions.
 *
 * Part of Epic 3, Story 3.3: Weather Integration
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Weather refresh interval (5 minutes).
 * Weather doesn't change rapidly, so refresh less frequently than detection stats.
 */
const WEATHER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Weather data returned by the API.
 */
export interface WeatherData {
  temperature: number;
  apparent_temperature: number;
  humidity: number;
  weather_code: number;
  condition: string;
  condition_icon: string;
  fetched_at: string;
}

interface WeatherResponse {
  data: WeatherData;
}

interface UseWeatherResult {
  weather: WeatherData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch weather data for a site with auto-refresh.
 *
 * @param siteId - The site ID to fetch weather for (null if no site selected)
 *
 * @example
 * function MyComponent({ siteId }) {
 *   const { weather, loading, error, refetch } = useWeather(siteId);
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message="Weather unavailable" />;
 *
 *   return <div>{weather?.temperature}°C</div>;
 * }
 */
export function useWeather(siteId: string | null): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // SECURITY (S5-H1): isMountedRef prevents state updates after unmount
  const isMountedRef = useRef(true);
  // Track initial load state with ref to avoid stale closure issues
  const isInitialLoadRef = useRef(true);
  // Store siteId in ref to avoid stale closures in interval
  const siteIdRef = useRef(siteId);
  siteIdRef.current = siteId;

  const fetchWeather = useCallback(async () => {
    const currentSiteId = siteIdRef.current;
    if (!currentSiteId) {
      setWeather(null);
      setLoading(false);
      return;
    }

    try {
      // Only show loading spinner on initial load, not refreshes
      if (isInitialLoadRef.current) {
        setLoading(true);
      }
      const response = await apiClient.get<WeatherResponse>(
        `/sites/${currentSiteId}/weather`
      );
      if (isMountedRef.current) {
        setWeather(response.data.data);
        setError(null);
        isInitialLoadRef.current = false;
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
      }
      // Don't clear weather on error - keep showing stale data if available
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []); // No deps needed - uses refs

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    isMountedRef.current = true;

    // Reset state when site changes
    setWeather(null);
    setLoading(true);
    setError(null);
    isInitialLoadRef.current = true;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!siteId) {
      setLoading(false);
      return;
    }

    // Fetch immediately
    fetchWeather();

    // Set up auto-refresh interval
    intervalRef.current = setInterval(fetchWeather, WEATHER_REFRESH_INTERVAL_MS);

    // Cleanup on unmount or site change
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [siteId, fetchWeather]);

  return { weather, loading, error, refetch: fetchWeather };
}

export default useWeather;
