/**
 * SiteMapView Component
 *
 * Displays a larger interactive map view showing the site location.
 * Uses react-leaflet with OSM tiles (free, no API key, reliable CDN).
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites (AC4)
 */
import { EnvironmentOutlined, ExportOutlined } from '@ant-design/icons';
import { Typography, Space, Button } from 'antd';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface SiteMapViewProps {
  latitude: number;
  longitude: number;
  width?: number;
  height?: number;
  zoom?: number;
  showOpenInMaps?: boolean;
}

/**
 * Generates a link to open the location in OpenStreetMap
 */
function getOpenStreetMapUrl(lat: number, lng: number, zoom: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

export function SiteMapView({
  latitude,
  longitude,
  width = 600,
  height = 300,
  zoom = 14,
  showOpenInMaps = true,
}: SiteMapViewProps) {
  const osmUrl = getOpenStreetMapUrl(latitude, longitude, zoom);

  return (
    <div>
      <div
        style={{
          width: '100%',
          maxWidth: width,
          height,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#e8e4d9',
          position: 'relative',
        }}
      >
        <MapContainer
          center={[latitude, longitude]}
          zoom={zoom}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          scrollWheelZoom={false}
          attributionControl={false}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <CircleMarker
            center={[latitude, longitude]}
            radius={10}
            pathOptions={{
              color: '#ffffff',
              fillColor: colors.seaBuckthorn,
              fillOpacity: 0.9,
              weight: 3,
            }}
          />
        </MapContainer>
      </div>

      <Space style={{ marginTop: 12 }} wrap>
        <Space size={4}>
          <EnvironmentOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
          <Text type="secondary">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>
        </Space>

        {showOpenInMaps && (
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined />}
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in OpenStreetMap
          </Button>
        )}
      </Space>
    </div>
  );
}

export default SiteMapView;
