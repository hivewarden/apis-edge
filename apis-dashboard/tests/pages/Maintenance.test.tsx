/**
 * Maintenance Page Tests
 *
 * Tests for the Maintenance page component.
 * Part of Epic 8, Story 8.5 (Maintenance Priority View)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock the hooks
const mockUseMaintenanceItems = vi.fn();
vi.mock('../../src/hooks', async () => {
  const actual = await vi.importActual('../../src/hooks');
  return {
    ...actual,
    useMaintenanceItems: () => mockUseMaintenanceItems(),
  };
});

// Mock apiClient for sites
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
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
import { Maintenance } from '../../src/pages/Maintenance';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('Maintenance Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading skeleton when loading', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      // Should show skeletons
      expect(screen.getAllByRole('generic').length).toBeGreaterThan(0);
    });
  });

  describe('Error state', () => {
    it('shows error message when error occurs', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Failed to load'),
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('Failed to Load Maintenance Items')).toBeInTheDocument();
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      const refetch = vi.fn();
      mockUseMaintenanceItems.mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Failed to load'),
        refetch,
      });

      renderWithProviders(<Maintenance />);

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(refetch).toHaveBeenCalled();
    });
  });

  describe('Empty state (all caught up)', () => {
    it('shows all caught up message when no items', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('All caught up!')).toBeInTheDocument();
      expect(screen.getByText('No maintenance needed. All your hives are in good shape.')).toBeInTheDocument();
    });

    it('shows view all hives button in empty state', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByRole('button', { name: /view all hives/i })).toBeInTheDocument();
    });

    it('navigates to hives page when view all hives clicked', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      const button = screen.getByRole('button', { name: /view all hives/i });
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/hives');
    });
  });

  describe('With maintenance items', () => {
    const mockData = {
      items: [
        {
          hive_id: 'hive-1',
          hive_name: 'Hive 1',
          site_id: 'site-1',
          site_name: 'Home Apiary',
          priority: 'Urgent' as const,
          priority_score: 130,
          summary: 'Treatment overdue',
          insights: [],
          quick_actions: [
            { label: 'Log Treatment', url: '/hives/hive-1', tab: 'treatments' },
          ],
        },
        {
          hive_id: 'hive-2',
          hive_name: 'Hive 2',
          site_id: 'site-1',
          site_name: 'Home Apiary',
          priority: 'Soon' as const,
          priority_score: 80,
          summary: 'Inspection overdue',
          insights: [],
          quick_actions: [
            { label: 'Log Inspection', url: '/hives/hive-2/inspections/new' },
          ],
        },
      ],
      recently_completed: [],
      total_count: 2,
      all_caught_up: false,
    };

    it('renders page title', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });

    it('renders all maintenance items', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('Hive 1')).toBeInTheDocument();
      expect(screen.getByText('Hive 2')).toBeInTheDocument();
    });

    it('shows item count alert', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText(/2 hives need attention/)).toBeInTheDocument();
    });

    it('shows select all checkbox', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('Select All')).toBeInTheDocument();
    });
  });

  describe('Batch selection', () => {
    const mockData = {
      items: [
        {
          hive_id: 'hive-1',
          hive_name: 'Hive 1',
          site_id: 'site-1',
          site_name: 'Home Apiary',
          priority: 'Urgent' as const,
          priority_score: 130,
          summary: 'Treatment overdue',
          insights: [],
          quick_actions: [],
        },
        {
          hive_id: 'hive-2',
          hive_name: 'Hive 2',
          site_id: 'site-1',
          site_name: 'Home Apiary',
          priority: 'Soon' as const,
          priority_score: 80,
          summary: 'Inspection overdue',
          insights: [],
          quick_actions: [],
        },
      ],
      recently_completed: [],
      total_count: 2,
      all_caught_up: false,
    };

    it('shows batch action toolbar when items selected', async () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      // Select an item by clicking the select all checkbox
      const selectAllCheckbox = screen.getByLabelText('Select All');
      fireEvent.click(selectAllCheckbox);

      await waitFor(() => {
        expect(screen.getByText('2 items selected')).toBeInTheDocument();
      });
    });

    it('shows batch treatment button when items selected', async () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      const selectAllCheckbox = screen.getByLabelText('Select All');
      fireEvent.click(selectAllCheckbox);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log treatment for selected/i })).toBeInTheDocument();
      });
    });

    it('shows clear selection button when items selected', async () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      const selectAllCheckbox = screen.getByLabelText('Select All');
      fireEvent.click(selectAllCheckbox);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
      });
    });

    it('clears selection when clear button clicked', async () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      const selectAllCheckbox = screen.getByLabelText('Select All');
      fireEvent.click(selectAllCheckbox);

      await waitFor(() => {
        expect(screen.getByText('2 items selected')).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.queryByText('2 items selected')).not.toBeInTheDocument();
      });
    });
  });

  describe('Recently completed section', () => {
    it('shows recently completed section when items exist', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [
            {
              hive_id: 'hive-1',
              hive_name: 'Hive 1',
              action: 'Treatment logged',
              completed_at: '2026-01-24T15:00:00Z',
            },
          ],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      expect(screen.getByText('Recently Completed (1)')).toBeInTheDocument();
    });

    it('shows completed item details', async () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [
            {
              hive_id: 'hive-1',
              hive_name: 'Hive 1',
              action: 'Treatment logged',
              completed_at: '2026-01-24T15:00:00Z',
            },
          ],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      // Click to expand the collapse panel
      const collapseHeader = screen.getByText('Recently Completed (1)');
      fireEvent.click(collapseHeader);

      await waitFor(() => {
        expect(screen.getByText(/Hive 1: Treatment logged/)).toBeInTheDocument();
      });
    });
  });

  describe('Site filter', () => {
    it('shows site filter dropdown', () => {
      mockUseMaintenanceItems.mockReturnValue({
        data: {
          items: [],
          recently_completed: [],
          total_count: 0,
          all_caught_up: true,
        },
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(<Maintenance />);

      // Should have a site filter select
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });
});

describe('Maintenance Page singular/plural text', () => {
  it('uses singular "hive needs" for 1 item', () => {
    mockUseMaintenanceItems.mockReturnValue({
      data: {
        items: [
          {
            hive_id: 'hive-1',
            hive_name: 'Hive 1',
            site_id: 'site-1',
            site_name: 'Home Apiary',
            priority: 'Urgent' as const,
            priority_score: 130,
            summary: 'Test',
            insights: [],
            quick_actions: [],
          },
        ],
        recently_completed: [],
        total_count: 1,
        all_caught_up: false,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProviders(<Maintenance />);

    expect(screen.getByText(/1 hive needs attention/)).toBeInTheDocument();
  });

  it('uses plural "hives need" for multiple items', () => {
    mockUseMaintenanceItems.mockReturnValue({
      data: {
        items: [
          {
            hive_id: 'hive-1',
            hive_name: 'Hive 1',
            site_id: 'site-1',
            site_name: 'Home Apiary',
            priority: 'Urgent' as const,
            priority_score: 130,
            summary: 'Test',
            insights: [],
            quick_actions: [],
          },
          {
            hive_id: 'hive-2',
            hive_name: 'Hive 2',
            site_id: 'site-1',
            site_name: 'Home Apiary',
            priority: 'Soon' as const,
            priority_score: 80,
            summary: 'Test 2',
            insights: [],
            quick_actions: [],
          },
        ],
        recently_completed: [],
        total_count: 2,
        all_caught_up: false,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProviders(<Maintenance />);

    expect(screen.getByText(/2 hives need attention/)).toBeInTheDocument();
  });
});
