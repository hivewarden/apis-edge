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

// Mock apiClient
const mockGet = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: vi.fn(),
  },
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        data: mockInspections,
        meta: { total: 2 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Table Rendering', () => {
    it('renders loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves
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
        // CheckCircle for queen seen = true, CloseCircle for queen seen = false
        const checkCircles = document.querySelectorAll('[aria-label="check-circle"]');
        const closeCircles = document.querySelectorAll('[aria-label="close-circle"]');
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
        expect(screen.getByText('1')).toBeInTheDocument();
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

    it('calls API with correct pagination params', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith(
          expect.stringContaining('/hives/hive-1/inspections')
        );
        expect(mockGet).toHaveBeenCalledWith(
          expect.stringContaining('limit=10')
        );
        expect(mockGet).toHaveBeenCalledWith(
          expect.stringContaining('offset=0')
        );
      });
    });
  });

  describe('Sorting', () => {
    it('defaults to descending sort (newest first)', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith(
          expect.stringContaining('sort=desc')
        );
      });
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
      mockGet.mockResolvedValue({
        data: {
          data: [],
          meta: { total: 0 },
        },
      });

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV').closest('button');
        expect(exportButton).toBeDisabled();
      });
    });

    it('calls export endpoint when clicked', async () => {
      // Mock blob response for export
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/export')) {
          return Promise.resolve({ data: new Blob(['csv,data']) });
        }
        return Promise.resolve({
          data: {
            data: mockInspections,
            meta: { total: 2 },
          },
        });
      });

      // Mock URL.createObjectURL and related methods
      const createObjectURL = vi.fn(() => 'blob:test');
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Export CSV'));

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith(
          '/hives/hive-1/inspections/export',
          expect.any(Object)
        );
      });
    });
  });

  describe('View Details Action', () => {
    it('renders view button for each inspection', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        const viewButtons = document.querySelectorAll('[aria-label="eye"]');
        expect(viewButtons.length).toBe(2);
      });
    });

    it('opens detail modal when view button is clicked', async () => {
      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Jan 25, 2026')).toBeInTheDocument();
      });

      const viewButtons = document.querySelectorAll('[aria-label="eye"]');
      fireEvent.click(viewButtons[0]);

      // Modal should open - check for modal content
      await waitFor(() => {
        // The InspectionDetailModal will fetch and show details
        expect(document.querySelector('.ant-modal')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message on API failure', async () => {
      mockGet.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<InspectionHistory {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load inspections')).toBeInTheDocument();
      });
    });
  });
});
