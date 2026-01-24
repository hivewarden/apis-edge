import { useState, useEffect, useCallback } from 'react';
import { Card, Typography, Space, Skeleton, Button } from 'antd';
import {
  CloudOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { apiClient } from '../providers/apiClient';

const { Text, Paragraph } = Typography;

export interface WeatherData {
  temperature_c: number;
  feels_like_c: number;
  humidity: number;
  condition: string;
  weather_code: number;
  icon: string;
  wind_speed_kmh: number;
  recorded_at: string;
  is_cached: boolean;
}

interface WeatherResponse {
  data: WeatherData;
}

interface WeatherCardProps {
  siteId: string | null;
  refreshTrigger?: number;
}

const POLL_INTERVAL_MS = 300000; // 5 minutes (weather doesn't change that fast)

// Map weather icons to Unicode weather symbols
const weatherIcons: Record<string, string> = {
  sun: '☀️',
  'cloud-sun': '⛅',
  cloud: '☁️',
  fog: '🌫️',
  'cloud-rain': '🌧️',
  'cloud-showers-heavy': '🌧️',
  snowflake: '❄️',
  bolt: '⛈️',
  question: '❓',
};

/**
 * WeatherCard Component
 *
 * Displays current weather conditions for a site.
 * Uses Open-Meteo API via server (which caches for 30 minutes).
 *
 * Part of Epic 3, Story 3.3: Weather Integration
 */
export function WeatherCard({ siteId, refreshTrigger }: WeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const fetchWeather = useCallback(async (manual = false) => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    try {
      if (manual) {
        setManualRefreshing(true);
      }
      const response = await apiClient.get<WeatherResponse>(
        `/sites/${siteId}/weather`
      );
      setWeather(response.data.data);
      setError(null);
    } catch (err) {
      // Check if it's a "no GPS" error
      const errorMessage = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      if (errorMessage?.includes('GPS')) {
        setError('Add GPS coordinates to see weather');
      } else {
        setError('Weather unavailable');
      }
    } finally {
      setLoading(false);
      setManualRefreshing(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchWeather();

    // Set up polling interval
    const interval = setInterval(() => fetchWeather(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchWeather, refreshTrigger]);

  const handleManualRefresh = () => {
    fetchWeather(true);
  };

  const formatLastUpdated = (recordedAt: string) => {
    const date = new Date(recordedAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // No site selected
  if (!siteId) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #87ceeb20 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '16px 0' }}>
          <CloudOutlined style={{ fontSize: 32, color: '#87ceeb' }} />
          <Text type="secondary">Select a site to view weather</Text>
        </Space>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #87ceeb20 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #87ceeb20 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '16px 0' }}>
          <CloudOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
          <Text type="secondary">{error}</Text>
          <Button
            size="small"
            icon={<ReloadOutlined spin={manualRefreshing} />}
            onClick={handleManualRefresh}
            disabled={manualRefreshing}
          >
            Retry
          </Button>
        </Space>
      </Card>
    );
  }

  if (!weather) {
    return null;
  }

  const iconEmoji = weatherIcons[weather.icon] || '❓';

  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #87ceeb20 0%, #fbf9e7 100%)',
        borderRadius: 12,
        height: '100%',
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* Temperature and icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: '#662604' }}>
                {Math.round(weather.temperature_c)}
              </span>
              <span style={{ fontSize: 20, color: '#662604' }}>°C</span>
            </div>
            <Paragraph style={{ margin: 0, color: '#666' }}>
              Feels like {Math.round(weather.feels_like_c)}°C
            </Paragraph>
          </div>
          <div style={{ fontSize: 48 }}>{iconEmoji}</div>
        </div>

        {/* Condition */}
        <Paragraph style={{ fontSize: 16, margin: '8px 0', color: '#662604' }}>
          {weather.condition}
        </Paragraph>

        {/* Details */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 8,
            borderTop: '1px solid #87ceeb30',
          }}
        >
          <Text type="secondary">
            💧 {weather.humidity}%
          </Text>
          <Text type="secondary">
            💨 {Math.round(weather.wind_speed_kmh)} km/h
          </Text>
        </div>

        {/* Last updated */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Updated: {formatLastUpdated(weather.recorded_at)}
            {weather.is_cached && ' (cached)'}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={manualRefreshing} />}
            onClick={handleManualRefresh}
            disabled={manualRefreshing}
          />
        </div>
      </Space>
    </Card>
  );
}

export default WeatherCard;
