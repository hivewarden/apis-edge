/**
 * Mock for leaflet
 * Leaflet requires DOM APIs not available in jsdom.
 */
import { vi } from 'vitest';

const icon = vi.fn(() => ({}));
const divIcon = vi.fn(() => ({}));
const latLng = vi.fn((lat: number, lng: number) => ({ lat, lng }));
const latLngBounds = vi.fn(() => ({
  getNorthEast: vi.fn(() => ({ lat: 0, lng: 0 })),
  getSouthWest: vi.fn(() => ({ lat: 0, lng: 0 })),
  getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
}));

export { icon, divIcon, latLng, latLngBounds };
export const Icon = { Default: { mergeOptions: vi.fn(), imagePath: '' } };
export default { icon, divIcon, latLng, latLngBounds, Icon };
