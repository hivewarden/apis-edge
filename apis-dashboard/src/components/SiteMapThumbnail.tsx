/**
 * SiteMapThumbnail Component
 *
 * Displays a small non-interactive map thumbnail showing the site location.
 * Uses react-leaflet with OSM tiles (free, no API key, reliable CDN).
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites (AC3)
 */
import { EnvironmentOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface SiteMapThumbnailProps {
  latitude: number | null;
  longitude: number | null;
  width?: number;
  height?: number;
  zoom?: number;
}

export function SiteMapThumbnail({
  latitude,
  longitude,
  width = 120,
  height = 80,
  zoom = 12,
}: SiteMapThumbnailProps) {
  if (latitude === null || longitude === null) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
        }}
      >
        <Text type="secondary" style={{ fontSize: 11 }}>
          <EnvironmentOutlined style={{ marginRight: 4 }} />
          No location
        </Text>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: '#e8e4d9',
      }}
    >
      <MapContainer
        center={[latitude, longitude]}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker
          center={[latitude, longitude]}
          radius={8}
          pathOptions={{
            color: '#ffffff',
            fillColor: colors.seaBuckthorn,
            fillOpacity: 0.9,
            weight: 3,
          }}
        />
      </MapContainer>
    </div>
  );
}

export default SiteMapThumbnail;
