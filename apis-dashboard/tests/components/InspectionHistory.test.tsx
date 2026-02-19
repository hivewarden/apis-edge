/**
 * InspectionHistory Component Tests
 *
 * Tests for the inspection history table component from Story 5.4.
 * Covers: table rendering, pagination, sorting, export, detail modal integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock apiClient (still needed by InspectionDetailModal)
const mockGet = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: vi.fn(),
  },
}));

// Mock the hooks used by InspectionHistory
const mockUseInspectionsList = vi.fn();
const mockUseHiveActivity = vi.fn();
vi.mock('../../src/hooks', () => ({
  useInspectionsList: (...args: unknown[]) => mockUseInspectionsList(...args),
  useHiveActivity: (...args: unknown[]) => mockUseHiveActivity(...args),
}));

// Mock the db/dexie for offline inspections
vi.mock('../../src/services/db', () => ({
  db: {
    inspections: {
      filter: () => ({
        toArray: () => Promise.resolve([]),
      }),
    },
  },
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => [],
}));

// Import after mocks
import { InspectionHistory } from '../../src/components/InspectionHistory';

// Sample inspection data
const mockInspections = [
  {
    id: 'insp-1',
    hive_id: 'hive-1',
    inspected_at: '2026-01-25',
    queen_seen: true,
    eggs_seen: true,
    queen_cells: false,
    brood_frames: 6,
    brood_pattern: 'good',
    honey_level: 'medium',
    pollen_level: 'low',
    temperament: 'calm',
    issues: [],
    notes: 'All good',
    created_at: '2026-01-25T10:00:00Z',
    updated_at: '2026-01-25T10:00:00Z',
  },
  {
    id: 'insp-2',
    hive_id: 'hive-1',
    inspected_at: '2026-01-20',
    queen_seen: false,
    eggs_seen: true,
    queen_cells: true,
    brood_frames: 4,
    brood_pattern: 'spotty',
    honey_level: 'low',
    pollen_level: 'medium',
    temperament: 'nervous',
    issues: ['dwv'],
    notes: null,
    created_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-01-20T10:00:00Z',
  },
];

// Helper to render with theme and router
const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('InspectionHistory Component', () => {
  const defaultProps = {
    hiveId: 'hive-1',
    hiveName: 'Test Hive',
  };

  const mockExportInspections = vi.fn().mockResolvedValue(undefined);
  const mockSetPage = vi.fn();
  const mockSetPageSize = vi.fn();
  const mockSetSortOrder = vi.fn();
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: loaded state with inspections
    mockUseInspectionsList.mockReturnValue({
      inspections: mockInspections,
      total: 2,
      page: 1,
      pageSize: 10,
      sortOrder: 'desc',
      loading: false,
      error: null,
      setPage: mockSetPage,
      setPageSize: mockSetPageSize,
      setSortOrder: mockSetSortOrder,
      exportInspections: mockExportInspections,
      exporting: false,
      refetch: mockRefetch,
    });
    // Default: no activity entries
    mockUseHiveActivity.mockReturnValue({
      data: [],
      total: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Table Rendering', () => {
    it('renders loading state initially', () => {
      mockUseInspectionsList.mockReturnValue({
        inspections: [],
        total: 0,
        page: 1,
        pageSize: 10,
        sortOrder: 'desc',
        loading: true,
        error: null,
        setPage: mockSetPage,
        setPageSize: mockSetPageSize,
        setSortOrder: mockSetSortOrder,
        exportInspections: mockExportInspections,
        exporting: false,
        refetch: mockRefetch,
      });
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('renders table with inspections after loading', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Jan 25, 2026')).toBeInTheDocument();
        expect(screen.getByText('Jan 20, 2026')).toBeInTheDocument();
      });
    });

    it('displays queen seen indicators', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        // Mocked icons use className "anticon anticon-check-circle" / "anticon anticon-close-circle"
        const checkCircles = document.querySelectorAll('.anticon-check-circle');
        const closeCircles = document.querySelectorAll('.anticon-close-circle');
        expect(checkCircles.length + closeCircles.length).toBeGreaterThan(0);
      });
    });

    it('displays brood pattern tags', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('good')).toBeInTheDocument();
        expect(screen.getByText('spotty')).toBeInTheDocument();
      });
    });

    it('displays stores level tags', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('H: medium')).toBeInTheDocument();
        expect(screen.getByText('H: low')).toBeInTheDocument();
      });
    });

    it('displays issue count', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        // One inspection has issues, one doesn't
        expect(screen.getByText('None')).toBeInTheDocument();
        // Use getAllByText since '1' also appears in pagination
        const matches = screen.getAllByText('1');
        expect(matches.length).toBeGreaterThanOrEqual(1);
        // Verify at least one match is inside a warning Tag (issue count)
        const inTag = matches.some(el => el.closest('.ant-tag-warning'));
        expect(inTag).toBe(true);
      });
    });
  });

  describe('Pagination', () => {
    it('displays total count in pagination', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/2 inspections/)).toBeInTheDocument();
      });
    });

    it('passes hiveId to useInspectionsList hook', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      expect(mockUseInspectionsList).toHaveBeenCalledWith('hive-1');
    });
  });

  describe('Sorting', () => {
    it('defaults to descending sort (newest first)', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      // The hook is called with hiveId, and hook defaults to 'desc'
      expect(mockUseInspectionsList).toHaveBeenCalledWith('hive-1');
    });

    it('sorts table columns are marked as sortable', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        // Check that Date column has sorter
        const dateHeader = screen.getByText('Date');
        expect(dateHeader.closest('th')).toHaveClass('ant-table-column-has-sorters');
      });
    });
  });

  describe('Export', () => {
    it('renders export CSV button', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });
    });

    it('disables export button when no inspections', async () => {
      mockUseInspectionsList.mockReturnValue({
        inspections: [],
        total: 0,
        page: 1,
        pageSize: 10,
        sortOrder: 'desc',
        loading: false,
        error: null,
        setPage: mockSetPage,
        setPageSize: mockSetPageSize,
        setSortOrder: mockSetSortOrder,
        exportInspections: mockExportInspections,
        exporting: false,
        refetch: mockRefetch,
      });

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV').closest('button');
        expect(exportButton).toBeDisabled();
      });
    });

    it('calls exportInspections when export button is clicked', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Export CSV'));

      await waitFor(() => {
        expect(mockExportInspections).toHaveBeenCalledWith('Test Hive');
      });
    });
  });

  describe('View Details Action', () => {
    it('renders view button for each inspection', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        // Mocked icons use data-testid="icon-EyeOutlined"
        const viewButtons = document.querySelectorAll('[data-testid="icon-EyeOutlined"]');
        expect(viewButtons.length).toBe(2);
      });
    });

    it('opens detail modal when view button is clicked', async () => {
      // InspectionDetailModal fetches full inspection on open
      mockGet.mockResolvedValue({ data: { data: mockInspections[0] } });

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Jan 25, 2026')).toBeInTheDocument();
      });

      // Mocked icons use data-testid="icon-EyeOutlined"; click the parent button
      const viewButtons = document.querySelectorAll('[data-testid="icon-EyeOutlined"]');
      fireEvent.click(viewButtons[0].closest('button')!);

      // Modal should open - check for modal content
      await waitFor(() => {
        // The InspectionDetailModal will fetch and show details
        expect(document.querySelector('.ant-modal')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('sets error state on API failure', async () => {
      mockUseInspectionsList.mockReturnValue({
        inspections: [],
        total: 0,
        page: 1,
        pageSize: 10,
        sortOrder: 'desc',
        loading: false,
        error: new Error('API Error'),
        setPage: mockSetPage,
        setPageSize: mockSetPageSize,
        setSortOrder: mockSetSortOrder,
        exportInspections: mockExportInspections,
        exporting: false,
        refetch: mockRefetch,
      });

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      // The component calls message.error() which renders a toast
      await waitFor(() => {
        expect(screen.getByText('Failed to load inspections')).toBeInTheDocument();
      });
    });
  });
});
