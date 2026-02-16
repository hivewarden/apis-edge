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
vi.mock('../../src/hooks', async () => {
  const actual = await vi.importActual('../../src/hooks');
  return {
    ...actual,
    useHarvestsBySite: () => ({
      createHarvest: vi.fn(),
      creating: false,
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
  };
});

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
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(<SiteDetail />);

      expect(screen.getByRole('img', { name: /loading/i })).toBeInTheDocument();
    });
  });

  describe('Site not found', () => {
    it('shows not found message when site does not exist', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });

      renderWithProviders(<SiteDetail />);

      // Should navigate back to sites list
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/sites');
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
      mockGet.mockImplementation((url: string) => {
        if (url === '/sites/site-1') {
          return Promise.resolve({ data: { data: mockSite } });
        }
        if (url === '/sites/site-1/hives') {
          return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
    });

    it('renders site name', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        expect(screen.getByText('Home Apiary')).toBeInTheDocument();
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
      mockGet.mockImplementation((url: string) => {
        if (url === '/sites/site-1') {
          return Promise.resolve({ data: { data: mockSiteNoCoords } });
        }
        if (url === '/sites/site-1/hives') {
          return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
        }
        return Promise.reject(new Error('Unknown URL'));
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
      mockGet.mockImplementation((url: string) => {
        if (url === '/sites/site-1') {
          return Promise.resolve({ data: { data: mockSite } });
        }
        if (url === '/sites/site-1/hives') {
          return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
    });

    it('shows confirmation modal when Delete button clicked', async () => {
      renderWithProviders(<SiteDetail />);

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Delete Site')).toBeInTheDocument();
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });
    });
  });
});
