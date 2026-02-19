/**
 * Site Detail Page Tests
 *
 * Tests for the SiteDetail page component.
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock apiClient
const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Mock navigate and params
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'site-1' }),
  };
});

// Mock hooks from src/hooks
const mockUseSiteDetail = vi.fn();
vi.mock('../../src/hooks', () => ({
  useSiteDetail: (...args: unknown[]) => mockUseSiteDetail(...args),
  useHarvestsBySite: () => ({
    harvests: [],
    createHarvest: vi.fn(),
    updateHarvest: vi.fn(),
    deleteHarvest: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
    seasonTotalKg: 0,
    seasonHarvestCount: 0,
    loading: false,
    error: null,
  }),
  useHarvestAnalytics: () => ({
    analytics: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMilestoneFlags: () => ({
    flags: null,
    markMilestoneSeen: vi.fn(),
  }),
}));

// Mock lazy component
vi.mock('../../src/components/lazy', () => ({
  SiteMapViewLazy: () => <div data-testid="mock-site-map">Map</div>,
}));

// Mock components - avoid importActual which loads ALL barrel exports and their dependencies
vi.mock('../../src/components', () => ({
  ActivityFeedCard: () => <div data-testid="mock-activity-feed">Activity Feed</div>,
  HarvestAnalyticsCard: () => <div data-testid="mock-harvest-analytics">Harvest Analytics</div>,
  HarvestFormModal: () => null,
  FirstHarvestModal: () => null,
  showFirstHiveCelebration: vi.fn(),
  HiveStatusBadge: () => null,
  MiniHiveVisualization: () => null,
  OverdueBadge: () => null,
}));

// Mock useActivityFeed used by ActivityFeedCard (direct import)
vi.mock('../../src/hooks/useActivityFeed', () => ({
  useActivityFeed: () => ({
    items: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock getLastInspectionText utility
vi.mock('../../src/utils', () => ({
  getLastInspectionText: () => 'No inspections yet',
}));

// Import after mocks
import { SiteDetail } from '../../src/pages/SiteDetail';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('SiteDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteDetail.mockReturnValue({
      site: null,
      hives: [],
      loading: true,
      hivesLoading: false,
      deleteSite: vi.fn(),
      deleting: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      renderWithProviders(<SiteDetail />);

      // Ant Design Spin renders with class ant-spin-spinning, not role="img"
      expect(document.querySelector('.ant-spin-spinning')).toBeInTheDocument();
    });
  });

  describe('Site not found', () => {
    it('shows not found message when site does not exist', async () => {
      mockUseSiteDetail.mockReturnValue({
        site: null,
        hives: [],
        loading: false,
        hivesLoading: false,
        deleteSite: vi.fn(),
        deleting: false,
        error: new Error('Not found'),
        refetch: vi.fn(),
      });

      renderWithProviders(<SiteDetail />);

      // Should show "Site not found" Empty state with a Back to Sites button
      await waitFor(() => {
        expect(screen.getByText('Site not found')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /back to sites/i })).toBeInTheDocument();
      });
    });
  });

  describe('With site data', () => {
    const mockSite = {
      id: 'site-1',
      name: 'Home Apiary',
      latitude: 50.8503,
      longitude: 4.3517,
      timezone: 'Europe/Brussels',
      created_at: '2026-01-24T10:00:00Z',
      updated_at: '2026-01-24T10:00:00Z',
    };

    beforeEach(() => {
      mockUseSiteDetail.mockReturnValue({
        site: mockSite,
        hives: [],
        loading: false,
        hivesLoading: false,
        deleteSite: vi.fn(),
        deleting: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('renders site name', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        // Site name may appear in both header and breadcrumb
        expect(screen.getAllByText('Home Apiary').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders site information card', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Site Information')).toBeInTheDocument();
      });
    });

    it('shows timezone in site information', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Europe/Brussels')).toBeInTheDocument();
      });
    });

    it('shows coordinates in site information', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('50.850300, 4.351700')).toBeInTheDocument();
      });
    });

    it('shows Location Map card when coordinates exist', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Location Map')).toBeInTheDocument();
      });
    });

    it('shows Back button', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });

    it('navigates back when Back button clicked', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /back/i });
        fireEvent.click(backButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites');
    });

    it('shows Edit button', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('navigates to edit page when Edit button clicked', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /edit/i });
        fireEvent.click(editButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/site-1/edit');
    });

    it('shows Delete button', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });
    });

    it('shows Hives section', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Hives at this Site')).toBeInTheDocument();
      });
    });

    it('shows Units section', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Units at this Site')).toBeInTheDocument();
      });
    });
  });

  describe('Site without coordinates', () => {
    const mockSiteNoCoords = {
      id: 'site-2',
      name: 'Forest Apiary',
      latitude: null,
      longitude: null,
      timezone: 'Europe/Paris',
      created_at: '2026-01-24T10:00:00Z',
      updated_at: '2026-01-24T10:00:00Z',
    };

    beforeEach(() => {
      mockUseSiteDetail.mockReturnValue({
        site: mockSiteNoCoords,
        hives: [],
        loading: false,
        hivesLoading: false,
        deleteSite: vi.fn(),
        deleting: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('shows "No location set" when coordinates are null', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('No location set')).toBeInTheDocument();
      });
    });

    it('does not show Location Map card when coordinates are null', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.queryByText('Location Map')).not.toBeInTheDocument();
      });
    });
  });

  describe('Delete confirmation', () => {
    const mockSite = {
      id: 'site-1',
      name: 'Home Apiary',
      latitude: 50.8503,
      longitude: 4.3517,
      timezone: 'Europe/Brussels',
      created_at: '2026-01-24T10:00:00Z',
      updated_at: '2026-01-24T10:00:00Z',
    };

    beforeEach(() => {
      mockUseSiteDetail.mockReturnValue({
        site: mockSite,
        hives: [],
        loading: false,
        hivesLoading: false,
        deleteSite: vi.fn(),
        deleting: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('shows confirmation modal when Delete button clicked', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        // "Delete Site" appears in both the button and modal title
        expect(screen.getAllByText('Delete Site').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });
    });
  });
});
