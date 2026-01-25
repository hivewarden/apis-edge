import { Card, Typography, Skeleton, Button, Space, Tooltip } from 'antd';
import {
  ReloadOutlined,
  EnvironmentOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { useWeather } from '../hooks/useWeather';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;

interface WeatherCardProps {
  siteId: string | null;
  hasGPS: boolean;
}

/**
 * Map weather icon code to visual representation
 */
function getWeatherEmoji(icon: string): string {
  switch (icon) {
    case 'sun':
      return '☀️';
    case 'cloud-sun':
      return '⛅';
    case 'cloud':
      return '☁️';
    case 'fog':
      return '🌫️';
    case 'cloud-drizzle':
      return '🌦️';
    case 'cloud-rain':
      return '🌧️';
    case 'cloud-showers':
      return '🌧️';
    case 'cloud-snow':
      return '🌨️';
    case 'thunderstorm':
      return '⛈️';
    default:
      return '☁️';
  }
}

/**
 * Format temperature for display
 */
function formatTemp(temp: number): string {
  return `${Math.round(temp)}°C`;
}

/**
 * Format relative time for "last updated" display
 */
function formatLastUpdated(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * WeatherCard Component
 *
 * Displays current weather conditions for a site.
 * Shows temperature, feels like, humidity, and condition icon.
 *
 * Part of Epic 3, Story 3.3: Weather Integration
 */
export function WeatherCard({ siteId, hasGPS }: WeatherCardProps) {
  const { weather, loading, error, refetch } = useWeather(siteId);

  // No site selected state
  if (!siteId) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Text type="secondary">Select a site to view weather</Text>
      </Card>
    );
  }

  // No GPS coordinates state
  if (!hasGPS) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Space direction="vertical" size="small">
          <EnvironmentOutlined style={{ fontSize: 24, color: colors.brownBramble }} />
          <Text type="secondary">
            Add GPS coordinates to this site to see weather
          </Text>
        </Space>
      </Card>
    );
  }

  // Loading state with skeleton
  if (loading && !weather) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Error state (but only if we have no weather data at all)
  if (error && !weather) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <CloudOutlined style={{ fontSize: 24, color: '#999' }} />
          <Text type="secondary">Weather unavailable</Text>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={refetch}
          >
            Retry
          </Button>
        </Space>
      </Card>
    );
  }

  // Weather data available
  if (!weather) return null;

  return (
    <Card
      style={{
        background: `linear-gradient(135deg, ${colors.salomie} 0%, #e3f2fd 100%)`,
        borderColor: colors.seaBuckthorn,
        borderWidth: 2,
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
            Current Weather
          </Text>
          <Tooltip title={`Updated ${formatLastUpdated(weather.fetched_at)}`}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatLastUpdated(weather.fetched_at)}
            </Text>
          </Tooltip>
        </div>

        {/* Main temperature and icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>
            {getWeatherEmoji(weather.condition_icon)}
          </div>
          <div>
            <Title
              level={2}
              style={{
                margin: 0,
                color: colors.brownBramble,
                lineHeight: 1,
              }}
            >
              {formatTemp(weather.temperature)}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {weather.condition}
            </Text>
          </div>
        </div>

        {/* Additional details */}
        <div
          style={{
            borderTop: `1px solid ${colors.seaBuckthorn}40`,
            paddingTop: 8,
            marginTop: 4,
          }}
        >
          <Space size="large">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Feels like</Text>
              <div>
                <Text strong style={{ fontSize: 14 }}>
                  {formatTemp(weather.apparent_temperature)}
                </Text>
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Humidity</Text>
              <div>
                <Text strong style={{ fontSize: 14 }}>
                  {weather.humidity}%
                </Text>
              </div>
            </div>
          </Space>
        </div>

        {/* Stale data indicator */}
        {error && weather && (
          <div style={{ marginTop: 4 }}>
            <Text type="warning" style={{ fontSize: 11 }}>
              Showing cached data
              <Button
                type="link"
                size="small"
                onClick={refetch}
                style={{ padding: '0 4px', fontSize: 11 }}
              >
                Refresh
              </Button>
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );
}

export default WeatherCard;
