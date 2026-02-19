/**
 * Mock for react-leaflet
 * Leaflet requires DOM APIs not available in jsdom.
 */
import { vi } from 'vitest';

const noop = () => null;

export const MapContainer = noop;
export const TileLayer = noop;
export const Marker = noop;
export const Circle = noop;
export const CircleMarker = noop;
export const Popup = noop;
export const useMap = vi.fn(() => ({
  setView: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 10),
  setZoom: vi.fn(),
}));
export const useMapEvents = vi.fn(() => null);
export default {};
