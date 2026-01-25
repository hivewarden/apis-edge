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

  const fetchWeather = useCallback(async () => {
    if (!siteId) {
      setWeather(null);
      setLoading(false);
      return;
    }

    try {
      // Only show loading spinner on initial load, not refreshes
      if (!weather) {
        setLoading(true);
      }
      const response = await apiClient.get<WeatherResponse>(
        `/sites/${siteId}/weather`
      );
      setWeather(response.data.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      // Don't clear weather on error - keep showing stale data if available
    } finally {
      setLoading(false);
    }
  }, [siteId, weather]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Reset state when site changes
    setWeather(null);
    setLoading(true);
    setError(null);

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
    const doFetch = async () => {
      try {
        const response = await apiClient.get<WeatherResponse>(
          `/sites/${siteId}/weather`
        );
        setWeather(response.data.data);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    doFetch();

    // Set up auto-refresh interval
    intervalRef.current = setInterval(doFetch, WEATHER_REFRESH_INTERVAL_MS);

    // Cleanup on unmount or site change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [siteId]);

  return { weather, loading, error, refetch: fetchWeather };
}

export default useWeather;
