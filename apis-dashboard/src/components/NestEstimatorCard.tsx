import { useEffect, useCallback } from 'react';
import { Card, Typography, Skeleton, Space, Progress, Tag, Button, Tooltip } from 'antd';
import {
  ReloadOutlined,
  AimOutlined,
  EnvironmentOutlined,
  RadarChartOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/apisTheme';
import { useNestEstimate } from '../hooks';

const { Text, Title } = Typography;

// Fix Leaflet default marker icon issue with bundlers
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Create a custom bee icon SVG as a data URL for the site marker (AC1 requirement)
const beeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- Bee body (amber/orange stripes) -->
  <ellipse cx="16" cy="16" rx="8" ry="10" fill="#F5A623"/>
  <ellipse cx="16" cy="12" rx="7" ry="3" fill="#3D2914"/>
  <ellipse cx="16" cy="18" rx="7" ry="3" fill="#3D2914"/>
  <!-- Head -->
  <circle cx="16" cy="5" r="4" fill="#3D2914"/>
  <!-- Wings -->
  <ellipse cx="9" cy="14" rx="4" ry="6" fill="rgba(255,255,255,0.7)" stroke="#666" stroke-width="0.5"/>
  <ellipse cx="23" cy="14" rx="4" ry="6" fill="rgba(255,255,255,0.7)" stroke="#666" stroke-width="0.5"/>
  <!-- Antennae -->
  <line x1="14" y1="3" x2="12" y2="0" stroke="#3D2914" stroke-width="1" stroke-linecap="round"/>
  <line x1="18" y1="3" x2="20" y2="0" stroke="#3D2914" stroke-width="1" stroke-linecap="round"/>
  <!-- Eyes -->
  <circle cx="14" cy="4" r="1" fill="white"/>
  <circle cx="18" cy="4" r="1" fill="white"/>
</svg>`;

const BeeIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(beeIconSvg)}`,
  shadowUrl: iconShadow,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});
L.Marker.prototype.options.icon = BeeIcon;

/**
 * ZoomControl Component - Custom zoom controls for the map
 */
function ZoomControl() {
  const map = useMap();

  const handleZoomIn = useCallback(() => {
    map.zoomIn();
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map.zoomOut();
  }, [map]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <button
        onClick={handleZoomIn}
        aria-label="Zoom in"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          background: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: colors.shadowMd,
          transition: 'background 0.15s ease',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = colors.coconutCream)}
        onMouseOut={(e) => (e.currentTarget.style.background = '#ffffff')}
      >
        <PlusOutlined style={{ fontSize: 16, color: colors.brownBramble }} />
      </button>
      <button
        onClick={handleZoomOut}
        aria-label="Zoom out"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          background: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: colors.shadowMd,
          transition: 'background 0.15s ease',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = colors.coconutCream)}
        onMouseOut={(e) => (e.currentTarget.style.background = '#ffffff')}
      >
        <MinusOutlined style={{ fontSize: 16, color: colors.brownBramble }} />
      </button>
    </div>
  );
}

interface NestEstimatorCardProps {
  siteId: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Get confidence styling
 */
function getConfidenceStyle(confidence: string | null): { color: string; bg: string } {
  switch (confidence) {
    case 'high':
      return { color: colors.success, bg: `${colors.success}15` };
    case 'medium':
      return { color: colors.seaBuckthorn, bg: colors.salomie };
    case 'low':
      return { color: colors.error, bg: `${colors.error}15` };
    default:
      return { color: colors.brownBramble, bg: colors.coconutCream };
  }
}

/**
 * NestEstimatorCard Component
 *
 * Immersive radar-style map visualization for estimating hornet nest location.
 * Features concentric rings and pulsing animations to create a surveillance feel.
 *
 * Part of Epic 4, Story 4.5: Nest Radius Estimator Map
 * Refactored for Layered Hooks Architecture
 */
export function NestEstimatorCard({ siteId, latitude, longitude }: NestEstimatorCardProps) {
  // Use hook for nest estimate data
  const { estimate, loading, error, refetch } = useNestEstimate(siteId);

  // Inject pulse animation CSS once to avoid repeated style tag creation
  useEffect(() => {
    const styleId = 'nest-estimator-pulse-animation';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes nest-estimator-pulse {
          0%, 100% {
            box-shadow: 0 0 20px ${colors.seaBuckthorn}60;
          }
          50% {
            box-shadow: 0 0 30px ${colors.seaBuckthorn}90, 0 0 60px ${colors.seaBuckthorn}40;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // No site selected state
  if (!siteId) {
    return (
      <Card
        style={{
          background: `linear-gradient(145deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
          borderColor: colors.seaBuckthorn,
          borderRadius: 16,
          height: 420,
        }}
      >
        <EmptyState
          icon={<RadarChartOutlined />}
          title="Select a Site"
          subtitle="Choose a site to view nest location estimates"
        />
      </Card>
    );
  }

  // No GPS coordinates state
  if (latitude == null || longitude == null) {
    return (
      <Card
        style={{
          background: `linear-gradient(145deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
          borderColor: colors.seaBuckthorn,
          borderRadius: 16,
          height: 420,
        }}
      >
        <EmptyState
          icon={<EnvironmentOutlined />}
          title="GPS Required"
          subtitle="Add GPS coordinates to this site to enable nest estimation"
        />
      </Card>
    );
  }

  // Loading state
  if (loading && !estimate) {
    return (
      <Card
        style={{
          background: `linear-gradient(145deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
          borderColor: colors.seaBuckthorn,
          borderRadius: 16,
          height: 420,
        }}
      >
        <Skeleton active paragraph={{ rows: 10 }} />
      </Card>
    );
  }

  // Error state
  if (error && !estimate) {
    return (
      <Card
        style={{
          background: `linear-gradient(145deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
          borderColor: colors.seaBuckthorn,
          borderRadius: 16,
          height: 420,
        }}
      >
        <EmptyState
          icon={<AimOutlined />}
          title="Error Loading"
          subtitle={error?.message || 'Failed to load nest estimate'}
          action={
            <Button icon={<ReloadOutlined />} onClick={refetch}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  const hasEstimate = estimate?.estimated_radius_m != null;
  const minRequired = estimate?.min_observations_required || 20;
  const observationCount = estimate?.observation_count || 0;
  const progressPercent = Math.min(100, Math.round((observationCount / minRequired) * 100));
  const confidenceStyle = getConfidenceStyle(estimate?.confidence || null);

  return (
    <Card
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 16,
        overflow: 'hidden',
      }}
      styles={{
        body: { padding: 0 },
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          background: `linear-gradient(135deg, ${colors.brownBramble} 0%, #4a1a04 100%)`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Radar icon with pulse animation */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, #e68a00 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${colors.seaBuckthorn}60`,
              animation: hasEstimate ? 'nest-estimator-pulse 2s infinite' : 'none',
            }}
          >
            <AimOutlined style={{ color: 'white', fontSize: 18 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0, color: colors.salomie, fontWeight: 600 }}>
              Nest Radius Estimator
            </Title>
            <Text style={{ color: colors.salomie, opacity: 0.7, fontSize: 12 }}>
              Based on hornet visit patterns
            </Text>
          </div>
        </div>

        <Button
          type="text"
          icon={<ReloadOutlined spin={loading} />}
          onClick={refetch}
          disabled={loading}
          style={{ color: colors.salomie }}
        />
      </div>

      {/* Map container */}
      <div
        style={{
          height: 560,
          position: 'relative',
          border: `2px solid ${colors.seaBuckthorn}40`,
          borderTop: 'none',
        }}
      >
        {/* Radar overlay effect */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 1000,
            background: `radial-gradient(circle at center, transparent 0%, ${colors.brownBramble}10 100%)`,
          }}
        />

        <MapContainer
          center={[latitude, longitude]}
          zoom={hasEstimate ? 14 : 15}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[latitude, longitude]}>
            <Popup>
              <div role="region" aria-label="Site location information">
                <h3 style={{ fontWeight: 600, margin: 0, fontSize: 14 }}>Your Site</h3>
                <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0 0' }} aria-label={`Coordinates: ${latitude.toFixed(5)} latitude, ${longitude.toFixed(5)} longitude`}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>

          {/* Estimated radius circle with gradient effect */}
          {hasEstimate && estimate?.estimated_radius_m && (
            <>
              {/* Outer glow */}
              <Circle
                center={[latitude, longitude]}
                radius={estimate.estimated_radius_m * 1.1}
                pathOptions={{
                  color: 'transparent',
                  fillColor: colors.seaBuckthorn,
                  fillOpacity: 0.05,
                  weight: 0,
                }}
              />
              {/* Main circle */}
              <Circle
                center={[latitude, longitude]}
                radius={estimate.estimated_radius_m}
                pathOptions={{
                  color: colors.seaBuckthorn,
                  fillColor: colors.seaBuckthorn,
                  fillOpacity: 0.4,
                  weight: 3,
                  dashArray: '8, 8',
                }}
              >
                <Popup>
                  <div style={{ fontWeight: 600, color: colors.brownBramble }}>
                    Estimated Nest Range
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Radius: <strong>{Math.round(estimate.estimated_radius_m)}m</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Based on {observationCount} observations
                  </div>
                </Popup>
              </Circle>
              {/* Inner reference circles */}
              <Circle
                center={[latitude, longitude]}
                radius={estimate.estimated_radius_m * 0.5}
                pathOptions={{
                  color: colors.seaBuckthorn,
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  weight: 1,
                  opacity: 0.3,
                }}
              />
            </>
          )}
          {/* Custom zoom controls */}
          <ZoomControl />
        </MapContainer>

        {/* Floating info panel - top-right overlay */}
        {hasEstimate && estimate && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 1000,
              background: '#ffffff',
              borderRadius: 12,
              padding: '12px 16px',
              boxShadow: colors.shadowLg,
              border: `1px solid ${colors.border}`,
              minWidth: 160,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <Typography.Title
                level={4}
                style={{
                  margin: 0,
                  color: colors.brownBramble,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {Math.round(estimate.estimated_radius_m!)}m
              </Typography.Title>
              <Text style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
                radius
              </Text>
            </div>
            {estimate.confidence && (
              <Tag
                style={{
                  background: getConfidenceStyle(estimate.confidence).bg,
                  color: getConfidenceStyle(estimate.confidence).color,
                  border: `1px solid ${getConfidenceStyle(estimate.confidence).color}40`,
                  fontWeight: 600,
                  fontSize: 10,
                  padding: '2px 8px',
                  margin: 0,
                }}
              >
                {estimate.confidence.toUpperCase()}
              </Tag>
            )}
          </div>
        )}
      </div>

      {/* Info panel */}
      <div
        style={{
          padding: '16px 20px',
          background: `linear-gradient(180deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          border: `2px solid ${colors.seaBuckthorn}40`,
          borderTop: 'none',
        }}
      >
        {hasEstimate && estimate ? (
          <div>
            {/* Main estimate display */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <Title
                    level={3}
                    style={{
                      margin: 0,
                      color: colors.brownBramble,
                      fontWeight: 700,
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {Math.round(estimate.estimated_radius_m!)}m
                  </Title>
                  <Text style={{ color: colors.brownBramble, opacity: 0.6 }}>
                    radius
                  </Text>
                </div>
                <Text style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 13 }}>
                  Nest likely within this area
                </Text>
              </div>

              {/* Confidence badge */}
              {estimate.confidence && (
                <Tag
                  style={{
                    background: confidenceStyle.bg,
                    color: confidenceStyle.color,
                    border: `1px solid ${confidenceStyle.color}40`,
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '4px 10px',
                  }}
                >
                  {estimate.confidence.toUpperCase()} CONFIDENCE
                </Tag>
              )}
            </div>

            {/* Stats row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 20,
                paddingTop: 12,
                borderTop: `1px solid ${colors.seaBuckthorn}30`,
              }}
            >
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <Text style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
                    Observations
                  </Text>
                  <div style={{ fontWeight: 600, color: colors.brownBramble }}>
                    {observationCount}
                  </div>
                </div>
                {estimate.avg_visit_interval_minutes && (
                  <div>
                    <Tooltip title="Average time between hornet visits - used to estimate flight distance">
                      <Text style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
                        Avg. Interval <InfoCircleOutlined style={{ fontSize: 10 }} />
                      </Text>
                    </Tooltip>
                    <div style={{ fontWeight: 600, color: colors.brownBramble }}>
                      {estimate.avg_visit_interval_minutes.toFixed(1)} min
                    </div>
                  </div>
                )}
              </div>
              {/* Report Nest Location CTA */}
              <Button
                type="primary"
                icon={<EnvironmentOutlined />}
                style={{
                  borderRadius: 9999, // rounded-full
                  background: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                  fontWeight: 600,
                }}
              >
                Report Nest Location
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Text style={{ color: colors.brownBramble, opacity: 0.8, display: 'block', marginBottom: 8 }}>
              {estimate?.message || 'Collecting data to estimate nest location...'}
            </Text>
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <Text style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
                  Progress
                </Text>
                <Text style={{ color: colors.brownBramble, opacity: 0.8, fontSize: 12, fontWeight: 500 }}>
                  {observationCount} / {minRequired}
                </Text>
              </div>
              <Progress
                percent={progressPercent}
                strokeColor={{
                  '0%': colors.salomie,
                  '100%': colors.seaBuckthorn,
                }}
                trailColor={`${colors.brownBramble}15`}
                size="small"
                showInfo={false}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.brownBramble, opacity: 0.5, fontSize: 11 }}>
                Need {minRequired - observationCount} more observations
              </Text>
              {/* Report Nest Location CTA - available even without estimate */}
              <Button
                type="primary"
                size="small"
                icon={<EnvironmentOutlined />}
                style={{
                  borderRadius: 9999, // rounded-full
                  background: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                  fontWeight: 600,
                }}
              >
                Report Nest
              </Button>
            </div>
          </div>
        )}
      </div>

    </Card>
  );
}

/**
 * Empty state component
 */
function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <Space
      direction="vertical"
      align="center"
      style={{
        width: '100%',
        paddingTop: 100,
        paddingBottom: 100,
      }}
    >
      <div
        style={{
          fontSize: 48,
          color: colors.brownBramble,
          opacity: 0.3,
        }}
      >
        {icon}
      </div>
      <Text
        strong
        style={{
          color: colors.brownBramble,
          fontSize: 16,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.brownBramble,
          opacity: 0.6,
          fontSize: 14,
        }}
      >
        {subtitle}
      </Text>
      {action}
    </Space>
  );
}

export default NestEstimatorCard;
