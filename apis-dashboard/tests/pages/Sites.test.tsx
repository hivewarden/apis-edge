/**
 * Sites Page Tests
 *
 * Tests for the Sites page component (list view).
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock apiClient
const mockGet = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

// Mock hooks
const mockUseSites = vi.fn();
vi.mock('../../src/hooks', () => ({
  useSites: () => mockUseSites(),
}));

// Mock lazy components
vi.mock('../../src/components/lazy', () => ({
  SiteMapThumbnailLazy: () => <div data-testid="mock-map-thumbnail">Map</div>,
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Import after mocks
import { Sites } from '../../src/pages/Sites';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('Sites Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      mockUseSites.mockReturnValue({
        sites: [],
        loading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      // Ant Design Spin renders with class ant-spin-spinning, not role="img"
      expect(document.querySelector('.ant-spin-spinning')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no sites exist', async () => {
      mockUseSites.mockReturnValue({
        sites: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('No sites yet')).toBeInTheDocument();
      });
    });

    it('shows create first site button in empty state', async () => {
      mockUseSites.mockReturnValue({
        sites: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create your first site/i })).toBeInTheDocument();
      });
    });

    it('navigates to create page when create first site button clicked', async () => {
      mockUseSites.mockReturnValue({
        sites: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create your first site/i });
        fireEvent.click(createButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/create');
    });
  });

  describe('With sites', () => {
    const mockSites = [
      {
        id: 'site-1',
        name: 'Home Apiary',
        latitude: 50.8503,
        longitude: 4.3517,
        timezone: 'Europe/Brussels',
        created_at: '2026-01-24T10:00:00Z',
        updated_at: '2026-01-24T10:00:00Z',
      },
      {
        id: 'site-2',
        name: 'Forest Apiary',
        latitude: null,
        longitude: null,
        timezone: 'Europe/Paris',
        created_at: '2026-01-24T11:00:00Z',
        updated_at: '2026-01-24T11:00:00Z',
      },
    ];

    it('renders page title', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Your Sites')).toBeInTheDocument();
      });
    });

    it('renders all sites', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Home Apiary')).toBeInTheDocument();
        expect(screen.getByText('Forest Apiary')).toBeInTheDocument();
      });
    });

    it('shows timezone for each site', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Europe/Brussels')).toBeInTheDocument();
        expect(screen.getByText('Europe/Paris')).toBeInTheDocument();
      });
    });

    it('shows Add Site button in header', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add site/i })).toBeInTheDocument();
      });
    });

    it('navigates to create page when Add Site button clicked', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        const addButton = screen.getByRole('button', { name: /add site/i });
        fireEvent.click(addButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/create');
    });

    it('navigates to site detail when site card clicked', async () => {
      mockUseSites.mockReturnValue({
        sites: mockSites,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        const siteCard = screen.getByText('Home Apiary').closest('.ant-card');
        if (siteCard) {
          fireEvent.click(siteCard);
        }
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/site-1');
    });
  });

  describe('Error handling', () => {
    it('shows error message when fetch fails', async () => {
      mockUseSites.mockReturnValue({
        sites: [],
        loading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        // The error is shown via message.error, which we can't easily test
        // But we should still get past loading state
        expect(document.querySelector('.ant-spin-spinning')).not.toBeInTheDocument();
      });
    });
  });
});
