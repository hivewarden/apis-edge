import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock ALL modules to prevent module resolution chain from hanging

// Explicit @ant-design/icons mock to override setup.ts Proxy mock.
// The Proxy mock hangs during module resolution for transitive imports;
// explicit named exports resolve instantly.
vi.mock('@ant-design/icons', () => {
  const S = () => null;
  return {
    __esModule: true,
    default: {},
    ReloadOutlined: S,
    AimOutlined: S,
    EnvironmentOutlined: S,
    RadarChartOutlined: S,
    InfoCircleOutlined: S,
    PlusOutlined: S,
    MinusOutlined: S,
    FileSearchOutlined: S,
    MedicineBoxOutlined: S,
    CoffeeOutlined: S,
    GiftOutlined: S,
    HomeOutlined: S,
    EditOutlined: S,
    DeleteOutlined: S,
    VideoCameraOutlined: S,
    UserAddOutlined: S,
    ClockCircleOutlined: S,
  };
});

// Mock the hooks barrel and direct module to avoid importing all hooks
const mockRefetch = vi.fn();
const mockUseNestEstimate = vi.fn();
vi.mock('../../src/hooks/useNestEstimate', () => ({
  useNestEstimate: (...args: unknown[]) => mockUseNestEstimate(...args),
  default: (...args: unknown[]) => mockUseNestEstimate(...args),
}));
vi.mock('../../src/hooks', () => ({
  useNestEstimate: (...args: unknown[]) => mockUseNestEstimate(...args),
}));

// Mock apiClient to prevent its import chain
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

// Mock heavy transitive deps that hooks barrel imports pull in
vi.mock('@refinedev/core', () => ({
  useIsAuthenticated: vi.fn(() => ({ data: { authenticated: false }, isLoading: false })),
  useGetIdentity: vi.fn(() => ({ data: null, isLoading: false })),
  useLogout: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useLogin: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));
vi.mock('../../src/providers/keycloakAuthProvider', () => ({
  keycloakAuthProvider: {},
  keycloakUserManager: { signinRedirect: vi.fn(), signoutRedirect: vi.fn() },
  userManager: { getUser: vi.fn(), removeUser: vi.fn(), signinRedirect: vi.fn(), signinSilent: vi.fn() },
  loginWithReturnTo: vi.fn(),
}));
vi.mock('oidc-client-ts', () => ({
  UserManager: vi.fn(),
  InMemoryWebStorage: vi.fn(),
  WebStorageStateStore: vi.fn(),
}));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => []),
}));
vi.mock('../../src/services/db', () => ({
  db: {
    clips: { toArray: vi.fn(() => []) },
    inspections: { toArray: vi.fn(() => []) },
    pendingInspections: { toArray: vi.fn(() => []) },
    syncQueue: { toArray: vi.fn(() => []) },
    detections: { toArray: vi.fn(() => []) },
    hives: { toArray: vi.fn(() => []) },
    sites: { toArray: vi.fn(() => []) },
    tasks: { toArray: vi.fn(() => []) },
  },
}));

// Mock config to prevent its import chain
vi.mock('../../src/config', () => ({
  API_URL: 'http://localhost:3000/api',
  DEV_MODE: false,
  getAuthConfigSync: vi.fn(() => null),
  fetchAuthConfig: vi.fn(),
  clearAuthConfigCache: vi.fn(),
  KEYCLOAK_AUTHORITY: '',
  KEYCLOAK_CLIENT_ID: '',
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#f7a42d',
    coconutCream: '#fbf9e7',
    brownBramble: '#662604',
    salomie: '#fcd483',
    success: '#52c41a',
    error: '#ff4d4f',
    border: '#d9d9d9',
    shadowMd: '0 2px 8px rgba(0,0,0,0.15)',
    shadowLg: '0 4px 16px rgba(0,0,0,0.15)',
  },
}));

// Mock Leaflet and its assets
vi.mock('leaflet', () => ({
  default: {
    icon: vi.fn(() => ({})),
    Marker: { prototype: { options: {} } },
  },
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({
  default: 'mock-marker-shadow.png',
}));

// Mock react-leaflet components
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-marker">{children}</div>
  ),
  Circle: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-circle">{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-popup">{children}</div>
  ),
  useMap: vi.fn(() => ({
    setView: vi.fn(), fitBounds: vi.fn(), getZoom: vi.fn(() => 10), setZoom: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(),
  })),
}));

// Mock virtual:pwa-register used by some hooks
vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => vi.fn()),
}));

// Mock sanitizeError used by useAuth
vi.mock('../../src/utils/sanitizeError', () => ({
  sanitizeError: vi.fn((e: unknown) => e),
}));

// Import the component under test
import { NestEstimatorCard } from '../../src/components/NestEstimatorCard';

describe('NestEstimatorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no estimate, not loading, no error
    mockUseNestEstimate.mockReturnValue({
      estimate: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when no siteId is provided', () => {
    it('renders "Select a Site" empty state', () => {
      render(<NestEstimatorCard siteId={null} latitude={null} longitude={null} />);

      expect(screen.getByText('Select a Site')).toBeInTheDocument();
      expect(screen.getByText('Choose a site to view nest location estimates')).toBeInTheDocument();
    });

    it('calls useNestEstimate with null siteId', () => {
      render(<NestEstimatorCard siteId={null} latitude={null} longitude={null} />);

      expect(mockUseNestEstimate).toHaveBeenCalledWith(null);
    });
  });

  describe('when site has no GPS coordinates', () => {
    it('renders "GPS Required" empty state when latitude is null', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={null} longitude={10.0} />);

      expect(screen.getByText('GPS Required')).toBeInTheDocument();
      expect(screen.getByText('Add GPS coordinates to this site to enable nest estimation')).toBeInTheDocument();
    });

    it('renders "GPS Required" empty state when longitude is null', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={null} />);

      expect(screen.getByText('GPS Required')).toBeInTheDocument();
    });
  });

  describe('when loading estimate', () => {
    it('shows skeleton loading state initially', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: null,
        loading: true,
        error: null,
        refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
    });
  });

  describe('when API returns an error', () => {
    it('renders error state with retry button', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: null,
        loading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('Error Loading')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls refetch when retry button is clicked', async () => {
      const user = userEvent.setup();
      mockUseNestEstimate.mockReturnValue({
        estimate: null,
        loading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('when estimate is available (sufficient data)', () => {
    const mockEstimate = {
      estimated_radius_m: 350,
      observation_count: 42,
      confidence: 'medium',
      avg_visit_interval_minutes: 12.5,
      calculation_method: 'visit_interval',
    };

    beforeEach(() => {
      mockUseNestEstimate.mockReturnValue({
        estimate: mockEstimate,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });
    });

    it('renders the map with site marker', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(screen.getByTestId('map-marker')).toBeInTheDocument();
    });

    it('displays the estimated radius', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      // Both floating info panel and bottom info panel render "350m" and "radius"
      const radiusTexts = screen.getAllByText('350m');
      expect(radiusTexts.length).toBeGreaterThanOrEqual(1);
      const radiusLabels = screen.getAllByText('radius');
      expect(radiusLabels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Nest likely within this area')).toBeInTheDocument();
    });

    it('displays the confidence badge', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('MEDIUM CONFIDENCE')).toBeInTheDocument();
    });

    it('displays the observation count', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Observations')).toBeInTheDocument();
    });

    it('displays the average interval', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('12.5 min')).toBeInTheDocument();
    });

    it('renders the radius circle on the map', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      const circles = screen.getAllByTestId('map-circle');
      expect(circles.length).toBeGreaterThan(0);
    });

    it('displays high confidence correctly', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: { estimated_radius_m: 400, observation_count: 100, confidence: 'high', avg_visit_interval_minutes: 15 },
        loading: false, error: null, refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('HIGH CONFIDENCE')).toBeInTheDocument();
    });

    it('displays low confidence correctly', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: { estimated_radius_m: 200, observation_count: 25, confidence: 'low', avg_visit_interval_minutes: 8 },
        loading: false, error: null, refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      expect(screen.getByText('LOW CONFIDENCE')).toBeInTheDocument();
    });
  });

  describe('when insufficient data (progress state)', () => {
    beforeEach(() => {
      mockUseNestEstimate.mockReturnValue({
        estimate: {
          estimated_radius_m: null, observation_count: 12, confidence: null,
          min_observations_required: 20, message: 'Need more observations to estimate nest location',
        },
        loading: false, error: null, refetch: mockRefetch,
      });
    });

    it('displays the progress message', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);
      expect(screen.getByText('Need more observations to estimate nest location')).toBeInTheDocument();
    });

    it('displays the progress bar', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);
      expect(document.querySelector('.ant-progress')).toBeInTheDocument();
    });

    it('displays current vs required observation count', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);
      expect(screen.getByText('12 / 20')).toBeInTheDocument();
    });

    it('displays how many more observations needed', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);
      expect(screen.getByText('Need 8 more observations')).toBeInTheDocument();
    });

    it('still shows the map', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  describe('refresh functionality', () => {
    it('has a refresh button', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: { estimated_radius_m: 350, observation_count: 42, confidence: 'medium' },
        loading: false, error: null, refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      // The reload button is rendered as ant-btn-text variant in the header
      const textButton = document.querySelector('.ant-btn-variant-text');
      expect(textButton).toBeInTheDocument();
    });

    it('calls refetch when refresh button is clicked', async () => {
      const user = userEvent.setup();
      mockUseNestEstimate.mockReturnValue({
        estimate: { estimated_radius_m: 350, observation_count: 42, confidence: 'medium' },
        loading: false, error: null, refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      // The reload button is the text-variant button in the header
      const textButton = document.querySelector('.ant-btn-variant-text');
      if (textButton) {
        await user.click(textButton);
      }

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('hook integration', () => {
    it('passes the correct siteId to useNestEstimate', () => {
      render(<NestEstimatorCard siteId="my-site-123" latitude={50.0} longitude={10.0} />);
      expect(mockUseNestEstimate).toHaveBeenCalledWith('my-site-123');
    });

    it('passes updated siteId when siteId changes', () => {
      const { rerender } = render(
        <NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />
      );
      expect(mockUseNestEstimate).toHaveBeenCalledWith('site-1');

      rerender(<NestEstimatorCard siteId="site-2" latitude={50.0} longitude={10.0} />);
      expect(mockUseNestEstimate).toHaveBeenCalledWith('site-2');
    });
  });

  describe('accessibility', () => {
    it('has accessible popup content', () => {
      mockUseNestEstimate.mockReturnValue({
        estimate: { estimated_radius_m: 350, observation_count: 42, confidence: 'medium' },
        loading: false, error: null, refetch: mockRefetch,
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.12345} longitude={10.67890} />);

      // Multiple map-popup elements exist (Marker popup + Circle popup)
      const popups = screen.getAllByTestId('map-popup');
      expect(popups.length).toBeGreaterThanOrEqual(1);
      // The site Marker popup (first one) has the accessible region
      const sitePopup = popups[0];
      expect(sitePopup.querySelector('[role="region"]')).toBeInTheDocument();
      expect(sitePopup.querySelector('h3')).toHaveTextContent('Your Site');
    });
  });
});
