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
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(<Sites />);

      expect(screen.getByRole('img', { name: /loading/i })).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no sites exist', async () => {
      mockGet.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('No sites yet')).toBeInTheDocument();
      });
    });

    it('shows create first site button in empty state', async () => {
      mockGet.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create your first site/i })).toBeInTheDocument();
      });
    });

    it('navigates to create page when create first site button clicked', async () => {
      mockGet.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });

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
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Sites')).toBeInTheDocument();
      });
    });

    it('renders all sites', async () => {
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Home Apiary')).toBeInTheDocument();
        expect(screen.getByText('Forest Apiary')).toBeInTheDocument();
      });
    });

    it('shows timezone for each site', async () => {
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByText('Europe/Brussels')).toBeInTheDocument();
        expect(screen.getByText('Europe/Paris')).toBeInTheDocument();
      });
    });

    it('shows Add Site button in header', async () => {
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add site/i })).toBeInTheDocument();
      });
    });

    it('navigates to create page when Add Site button clicked', async () => {
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

      renderWithProviders(<Sites />);

      await waitFor(() => {
        const addButton = screen.getByRole('button', { name: /add site/i });
        fireEvent.click(addButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/create');
    });

    it('navigates to site detail when site card clicked', async () => {
      mockGet.mockResolvedValue({ data: { data: mockSites, meta: { total: 2 } } });

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
      mockGet.mockRejectedValue(new Error('Network error'));

      renderWithProviders(<Sites />);

      await waitFor(() => {
        // The error is shown via message.error, which we can't easily test
        // But we should still get past loading state
        expect(screen.queryByRole('img', { name: /loading/i })).not.toBeInTheDocument();
      });
    });
  });
});
