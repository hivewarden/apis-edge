/**
 * Hives Page Tests
 *
 * Tests for the Hives list page component.
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
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

// Mutable hook return values
const hookReturns = {
  useSites: {
    sites: [] as Array<{ id: string; name: string }>,
    loading: false,
    error: null,
    refetch: vi.fn(),
  },
  useHivesList: {
    hives: [] as Array<Record<string, unknown>>,
    total: 0,
    loading: false,
    error: null,
    refetch: vi.fn(),
  },
};

// Mock hooks - use getters that reference mutable state
vi.mock('../../src/hooks', () => ({
  useQRScanner: () => ({
    isSupported: false,
    isOpen: false,
    openScanner: vi.fn(),
    closeScanner: vi.fn(),
  }),
  useSites: () => hookReturns.useSites,
  useHivesList: () => hookReturns.useHivesList,
}));

// Import after mocks
import { Hives } from '../../src/pages/Hives';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('Hives Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturns.useSites = {
      sites: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    hookReturns.useHivesList = {
      hives: [],
      total: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      hookReturns.useSites.loading = true;
      hookReturns.useHivesList.loading = true;

      renderWithProviders(<Hives />);

      // Ant Design Spin renders as div with aria-busy, not role="img"
      const spinner = document.querySelector('.ant-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no hives exist', async () => {
      hookReturns.useSites.sites = [{ id: 'site-1', name: 'Home Apiary' }];

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByText(/no hives found/i)).toBeInTheDocument();
      });
    });

    it('shows Go to Sites button when sites exist but no hives', async () => {
      hookReturns.useSites.sites = [{ id: 'site-1', name: 'Home Apiary' }];

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go to sites/i })).toBeInTheDocument();
      });
    });
  });

  describe('With hives', () => {
    const sampleSites = [{ id: 'site-1', name: 'Home Apiary' }];
    const sampleHives = [
      {
        id: 'hive-1',
        site_id: 'site-1',
        name: 'Sunny Hive',
        queen_introduced_at: '2025-06-01',
        queen_source: 'breeder',
        queen_age_display: '8 months',
        brood_boxes: 2,
        honey_supers: 1,
        last_inspection_at: '2026-02-10',
        last_inspection_issues: [],
        status: 'healthy',
        hive_status: 'active',
        lost_at: null,
        created_at: '2025-06-01T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
      },
      {
        id: 'hive-2',
        site_id: 'site-1',
        name: 'Shadowy Hive',
        queen_introduced_at: '2025-05-01',
        queen_source: 'swarm',
        queen_age_display: '9 months',
        brood_boxes: 1,
        honey_supers: 0,
        last_inspection_at: null,
        last_inspection_issues: null,
        status: 'needs_inspection',
        hive_status: 'active',
        lost_at: null,
        created_at: '2025-05-01T00:00:00Z',
        updated_at: '2025-05-01T00:00:00Z',
      },
    ];

    it('renders hive names', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByText('Sunny Hive')).toBeInTheDocument();
        expect(screen.getByText('Shadowy Hive')).toBeInTheDocument();
      });
    });

    it('renders queen info when available', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByText(/Queen: 8 months/)).toBeInTheDocument();
        expect(screen.getByText(/Queen: 9 months/)).toBeInTheDocument();
      });
    });

    it('renders box configuration (brood/super)', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByText('2B / 1S')).toBeInTheDocument();
        expect(screen.getByText('1B / 0S')).toBeInTheDocument();
      });
    });

    it('navigates to hive detail when hive card clicked', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        const hiveCard = screen.getByText('Sunny Hive').closest('.ant-card');
        if (hiveCard) {
          fireEvent.click(hiveCard);
        }
      });

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('shows Add Hive button', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add hive/i })).toBeInTheDocument();
      });
    });

    it('renders status filter tabs', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        // Match filter tab labels including count to avoid collision with HiveStatusBadge text
        expect(screen.getByText(/All Hives \(/)).toBeInTheDocument();
        expect(screen.getByText(/Healthy \(/)).toBeInTheDocument();
        expect(screen.getByText(/Needs Attention \(/)).toBeInTheDocument();
        expect(screen.getByText(/Critical \(/)).toBeInTheDocument();
      });
    });

    it('shows show lost hives toggle', async () => {
      hookReturns.useSites.sites = sampleSites;
      hookReturns.useHivesList.hives = sampleHives;
      hookReturns.useHivesList.total = 2;

      renderWithProviders(<Hives />);

      await waitFor(() => {
        expect(screen.getByText(/show lost hives/i)).toBeInTheDocument();
      });
    });
  });
});
