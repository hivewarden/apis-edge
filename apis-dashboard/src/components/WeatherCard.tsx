import { Card, Typography, Skeleton, Button, Space, Tooltip } from 'antd';
import {
  ReloadOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useWeather } from '../hooks/useWeather';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;

interface WeatherCardProps {
  siteId: string | null;
  hasGPS: boolean;
}

/**
 * Map weather icon code to Material Symbols icon name
 */
function getWeatherIcon(icon: string): string {
  switch (icon) {
    case 'sun':
      return 'wb_sunny';
    case 'cloud-sun':
      return 'partly_cloudy_day';
    case 'cloud':
      return 'cloud';
    case 'fog':
      return 'foggy';
    case 'cloud-drizzle':
      return 'rainy';
    case 'cloud-rain':
      return 'rainy';
    case 'cloud-showers':
      return 'rainy';
    case 'cloud-snow':
      return 'weather_snowy';
    case 'thunderstorm':
      return 'thunderstorm';
    default:
      return 'cloud';
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

// Card styling per DESIGN-KEY specifications
const cardStyle = {
  background: '#ffffff',
  borderColor: '#ece8d6', // orange-100
  borderRadius: 16,
  boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)', // shadow-soft
};

// Icon container styling per DESIGN-KEY
const iconContainerStyle = {
  padding: 8, // p-2
  backgroundColor: '#eff6ff', // bg-blue-50
  borderRadius: 12, // rounded-xl
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

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
      <Card style={cardStyle}>
        <Text type="secondary">Select a site to view weather</Text>
      </Card>
    );
  }

  // No GPS coordinates state
  if (!hasGPS) {
    return (
      <Card style={cardStyle}>
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
      <Card style={cardStyle}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Error state (but only if we have no weather data at all)
  if (error && !weather) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={iconContainerStyle}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 24, color: '#999' }}
            >
              cloud
            </span>
          </div>
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
    <Card style={cardStyle}>
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
          <div style={{ ...iconContainerStyle, padding: 12 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 40, color: colors.seaBuckthorn }}
            >
              {getWeatherIcon(weather.condition_icon)}
            </span>
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
            borderTop: `1px solid #ece8d640`,
            paddingTop: 8,
            marginTop: 4,
          }}
        >
          <Space size="large">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={iconContainerStyle}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: '#3b82f6' }}
                >
                  water_drop
                </span>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Humidity</Text>
                <div>
                  <Text strong style={{ fontSize: 14 }}>
                    {weather.humidity}%
                  </Text>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={iconContainerStyle}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: '#3b82f6' }}
                >
                  device_thermostat
                </span>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Feels like</Text>
                <div>
                  <Text strong style={{ fontSize: 14 }}>
                    {formatTemp(weather.apparent_temperature)}
                  </Text>
                </div>
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
