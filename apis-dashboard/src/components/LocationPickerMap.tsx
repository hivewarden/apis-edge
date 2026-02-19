/**
 * LocationPickerMap Component
 *
 * Interactive map for picking GPS coordinates with:
 * - Address search via Nominatim (free OSM geocoding)
 * - Click-to-place marker
 * - Draggable marker for fine-tuning
 * - Browser geolocation ("Use My Location")
 * - Real-time coordinate display
 * - Bidirectional sync with parent form
 *
 * Part of Epic 2: Site Management — GPS location picker
 */
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Input, Button, List, Typography, Space, Spin } from 'antd';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

// Fix default marker icon issue with bundlers
// Leaflet's default icon paths break with webpack/vite — set them explicitly
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  height?: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

/** Handles click events on the map to place/move the marker */
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Flies the map to new coordinates when they change externally */
function MapUpdater({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const prevRef = useRef<string>('');

  useEffect(() => {
    if (lat != null && lng != null) {
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (key !== prevRef.current) {
        prevRef.current = key;
        map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
      }
    }
  }, [lat, lng, map]);

  return null;
}

export function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  height = 320,
}: LocationPickerMapProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const markerRef = useRef<L.Marker>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Prevent Enter in search input from submitting the parent form.
  // Attaches a native submit listener on the ancestor <form> element.
  // React synthetic events can't reliably intercept native keyboard dispatches,
  // so we must use a native DOM listener in the capture phase.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const formEl = el.closest('form');
    if (!formEl) return;
    const handler = (e: Event) => {
      const active = document.activeElement as HTMLInputElement | null;
      if (active?.placeholder === 'Search address...') {
        e.preventDefault();
      }
    };
    formEl.addEventListener('submit', handler, true);
    return () => formEl.removeEventListener('submit', handler, true);
  }, []);

  const hasPosition = latitude != null && longitude != null;
  const center: [number, number] = hasPosition
    ? [latitude, longitude]
    : [50.85, 4.35]; // Default: Brussels

  // Fetch results from Nominatim
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (res.ok) {
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search on typing (500ms, max 1 req/sec per Nominatim usage policy)
  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => doSearch(query), 500);
  }, [doSearch]);

  // Select a search result
  const handleSelectResult = useCallback(
    (result: NominatimResult) => {
      // Clear pending debounce to prevent stale search from re-showing results
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      onChange(lat, lng);
      setSearchResults([]);
      setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
    },
    [onChange]
  );

  // Click on map to place marker
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      onChange(lat, lng);
    },
    [onChange]
  );

  // Drag end for marker
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const pos = marker.getLatLng();
          onChange(pos.lat, pos.lng);
        }
      },
    }),
    [onChange]
  );

  // Browser geolocation
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onChange]);

  // Clear coordinates
  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange(null, null);
    setSearchQuery('');
    setSearchResults([]);
  }, [onChange]);

  return (
    <div ref={rootRef} data-location-picker>
      {/* Search bar */}
      <div style={{ marginBottom: 8, position: 'relative' }}>
        <Input
          placeholder="Search address..."
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          onPressEnter={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            doSearch(searchQuery);
          }}
          prefix={
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20, color: colors.brownBramble, opacity: 0.4 }}
            >
              search
            </span>
          }
          suffix={searching ? <Spin size="small" /> : undefined}
          allowClear
          onClear={() => {
            setSearchQuery('');
            setSearchResults([]);
          }}
          style={{
            height: 48,
            borderRadius: 12,
          }}
        />

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.12)',
              border: '1px solid #ece8d6',
              marginTop: 4,
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            <List
              size="small"
              dataSource={searchResults}
              renderItem={(item) => (
                <List.Item
                  onClick={() => handleSelectResult(item)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 16px',
                    borderBottom: '1px solid #f5f3ea',
                  }}
                  className="location-picker-result"
                >
                  <Text
                    style={{ fontSize: 13, color: colors.brownBramble }}
                    ellipsis
                  >
                    {item.display_name}
                  </Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <Space size={8} style={{ marginBottom: 8 }}>
        <Button
          size="small"
          onClick={handleUseMyLocation}
          loading={locating}
          icon={
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
            >
              my_location
            </span>
          }
          style={{
            borderRadius: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
        >
          Use My Location
        </Button>
        {hasPosition && (
          <Button
            size="small"
            type="link"
            onClick={handleClear}
            style={{ fontSize: 12, color: '#8c7e72' }}
          >
            Clear
          </Button>
        )}
      </Space>

      {/* Map */}
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #ece8d6',
          height,
        }}
      >
        <MapContainer
          center={center}
          zoom={hasPosition ? 13 : 6}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler onClick={handleMapClick} />
          <MapUpdater lat={latitude} lng={longitude} />
          {hasPosition && (
            <Marker
              position={[latitude!, longitude!]}
              draggable
              eventHandlers={eventHandlers}
              ref={markerRef}
            />
          )}
        </MapContainer>
      </div>

      {/* Coordinate readout */}
      {hasPosition && (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: colors.brownBramble, opacity: 0.7 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}
            >
              location_on
            </span>
            {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
          </Text>
        </div>
      )}

      {/* Hover style for search results */}
      <style>{`
        .location-picker-result:hover {
          background-color: ${colors.coconutCream} !important;
        }
      `}</style>
    </div>
  );
}

export default LocationPickerMap;
