import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NestEstimatorCard } from '../../src/components/NestEstimatorCard';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Mock Leaflet components to avoid DOM manipulation issues in tests
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
}));

// Mock Leaflet itself
vi.mock('leaflet', () => ({
  default: {
    icon: vi.fn(() => ({})),
    Marker: {
      prototype: {
        options: {},
      },
    },
  },
}));

describe('NestEstimatorCard', () => {
  const mockApiClient = vi.mocked(apiClient);

  beforeEach(() => {
    vi.clearAllMocks();
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

    it('does not fetch nest estimate', () => {
      render(<NestEstimatorCard siteId={null} latitude={null} longitude={null} />);

      expect(mockApiClient.get).not.toHaveBeenCalled();
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

    it('does not fetch nest estimate', () => {
      render(<NestEstimatorCard siteId="site-1" latitude={null} longitude={null} />);

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('when loading estimate', () => {
    it('shows skeleton loading state initially', async () => {
      // Make the API call hang indefinitely
      mockApiClient.get.mockImplementation(() => new Promise(() => {}));

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      // Should show skeleton while loading
      expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
    });
  });

  describe('when API returns an error', () => {
    it('renders error state with retry button', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading')).toBeInTheDocument();
      });

      expect(screen.getByText('Failed to load nest estimate')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('retries fetching when retry button is clicked', async () => {
      const user = userEvent.setup();
      mockApiClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: {
            data: {
              estimated_radius_m: 350,
              observation_count: 42,
              confidence: 'medium',
              avg_visit_interval_minutes: 12.5,
            },
          },
        });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('350m')).toBeInTheDocument();
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('when estimate is available (sufficient data)', () => {
    const mockEstimateResponse = {
      data: {
        data: {
          estimated_radius_m: 350,
          observation_count: 42,
          confidence: 'medium',
          avg_visit_interval_minutes: 12.5,
          calculation_method: 'visit_interval',
        },
      },
    };

    beforeEach(() => {
      mockApiClient.get.mockResolvedValue(mockEstimateResponse);
    });

    it('renders the map with site marker', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });

      expect(screen.getByTestId('map-marker')).toBeInTheDocument();
    });

    it('displays the estimated radius', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('350m')).toBeInTheDocument();
      });

      expect(screen.getByText('radius')).toBeInTheDocument();
      expect(screen.getByText('Nest likely within this area')).toBeInTheDocument();
    });

    it('displays the confidence badge', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('MEDIUM CONFIDENCE')).toBeInTheDocument();
      });
    });

    it('displays the observation count', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
      });

      expect(screen.getByText('Observations')).toBeInTheDocument();
    });

    it('displays the average interval', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('12.5 min')).toBeInTheDocument();
      });
    });

    it('renders the radius circle on the map', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        // There should be multiple circles (outer glow, main, inner reference)
        const circles = screen.getAllByTestId('map-circle');
        expect(circles.length).toBeGreaterThan(0);
      });
    });

    it('displays high confidence correctly', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            estimated_radius_m: 400,
            observation_count: 100,
            confidence: 'high',
            avg_visit_interval_minutes: 15,
          },
        },
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('HIGH CONFIDENCE')).toBeInTheDocument();
      });
    });

    it('displays low confidence correctly', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          data: {
            estimated_radius_m: 200,
            observation_count: 25,
            confidence: 'low',
            avg_visit_interval_minutes: 8,
          },
        },
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('LOW CONFIDENCE')).toBeInTheDocument();
      });
    });
  });

  describe('when insufficient data (progress state)', () => {
    const mockInsufficientResponse = {
      data: {
        data: {
          estimated_radius_m: null,
          observation_count: 12,
          confidence: null,
          min_observations_required: 20,
          message: 'Need more observations to estimate nest location',
        },
      },
    };

    beforeEach(() => {
      mockApiClient.get.mockResolvedValue(mockInsufficientResponse);
    });

    it('displays the progress message', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('Need more observations to estimate nest location')).toBeInTheDocument();
      });
    });

    it('displays the progress bar', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(document.querySelector('.ant-progress')).toBeInTheDocument();
      });
    });

    it('displays current vs required observation count', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('12 / 20')).toBeInTheDocument();
      });
    });

    it('displays how many more observations needed', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('Need 8 more observations')).toBeInTheDocument();
      });
    });

    it('still shows the map', async () => {
      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
    });
  });

  describe('refresh functionality', () => {
    it('has a refresh button', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            estimated_radius_m: 350,
            observation_count: 42,
            confidence: 'medium',
          },
        },
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('350m')).toBeInTheDocument();
      });

      // Find the reload button by its icon
      const reloadButton = document.querySelector('.anticon-reload')?.closest('button');
      expect(reloadButton).toBeInTheDocument();
    });

    it('fetches new data when refresh is clicked', async () => {
      const user = userEvent.setup();
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            estimated_radius_m: 350,
            observation_count: 42,
            confidence: 'medium',
          },
        },
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(screen.getByText('350m')).toBeInTheDocument();
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(1);

      const reloadButton = document.querySelector('.anticon-reload')?.closest('button');
      if (reloadButton) {
        await user.click(reloadButton);
      }

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('API integration', () => {
    it('calls the correct API endpoint with site ID', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            estimated_radius_m: null,
            observation_count: 5,
            min_observations_required: 20,
          },
        },
      });

      render(<NestEstimatorCard siteId="my-site-123" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledWith('/sites/my-site-123/nest-estimate');
      });
    });

    it('refetches when siteId changes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            estimated_radius_m: null,
            observation_count: 5,
            min_observations_required: 20,
          },
        },
      });

      const { rerender } = render(
        <NestEstimatorCard siteId="site-1" latitude={50.0} longitude={10.0} />
      );

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledWith('/sites/site-1/nest-estimate');
      });

      rerender(<NestEstimatorCard siteId="site-2" latitude={50.0} longitude={10.0} />);

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledWith('/sites/site-2/nest-estimate');
      });
    });
  });

  describe('accessibility', () => {
    it('has accessible popup content', async () => {
      mockApiClient.get.mockResolvedValue({
        data: {
          data: {
            estimated_radius_m: 350,
            observation_count: 42,
            confidence: 'medium',
          },
        },
      });

      render(<NestEstimatorCard siteId="site-1" latitude={50.12345} longitude={10.67890} />);

      await waitFor(() => {
        expect(screen.getByTestId('map-popup')).toBeInTheDocument();
      });

      // Check that popup has accessible structure
      const popup = screen.getByTestId('map-popup');
      expect(popup.querySelector('[role="region"]')).toBeInTheDocument();
      expect(popup.querySelector('h3')).toHaveTextContent('Your Site');
    });
  });
});
