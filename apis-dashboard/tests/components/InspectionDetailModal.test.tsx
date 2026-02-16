/**
 * InspectionDetailModal Component Tests
 *
 * Tests for the inspection detail modal component from Story 5.4.
 * Covers: modal rendering, data display, edit/delete buttons, 24-hour edit window.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { apisTheme } from '../../src/theme/apisTheme';
import dayjs from 'dayjs';

// Mock apiClient
const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
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
import { InspectionDetailModal } from '../../src/components/InspectionDetailModal';

// Helper to create inspection data
const createMockInspection = (overrides = {}) => ({
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
  issues: ['dwv', 'wax_moth'],
  notes: 'Test notes here',
  frames: [],
  created_at: dayjs().subtract(1, 'hour').toISOString(), // Created 1 hour ago (editable)
  updated_at: dayjs().subtract(1, 'hour').toISOString(),
  ...overrides,
});

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

describe('InspectionDetailModal Component', () => {
  const mockInspection = createMockInspection();

  const defaultProps = {
    inspection: mockInspection,
    open: true,
    onClose: vi.fn(),
    onDeleted: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for fetching full inspection data
    mockGet.mockResolvedValue({
      data: {
        data: mockInspection,
      },
    });
    mockDelete.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Modal Rendering', () => {
    it('renders when open is true', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Inspection:/)).toBeInTheDocument();
      });
    });

    it('does not render when inspection is null', () => {
      renderWithProviders(
        <InspectionDetailModal {...defaultProps} inspection={null} />
      );

      expect(screen.queryByText(/Inspection:/)).not.toBeInTheDocument();
    });

    it('shows loading spinner while fetching full data', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      expect(screen.getByText('Loading inspection details...')).toBeInTheDocument();
    });

    it('calls onClose when modal is cancelled', async () => {
      const onClose = vi.fn();
      renderWithProviders(
        <InspectionDetailModal {...defaultProps} onClose={onClose} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inspection:/)).toBeInTheDocument();
      });

      // Click the X button to close
      const closeButton = document.querySelector('.ant-modal-close');
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });

  describe('Data Display', () => {
    it('displays inspection date in title', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Inspection: January 25, 2026')).toBeInTheDocument();
      });
    });

    it('displays queen observations', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Queen Seen')).toBeInTheDocument();
        expect(screen.getByText('Eggs Seen')).toBeInTheDocument();
        expect(screen.getByText('Queen Cells')).toBeInTheDocument();
      });
    });

    it('displays brood assessment', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Brood Frames')).toBeInTheDocument();
        expect(screen.getByText('6')).toBeInTheDocument();
        expect(screen.getByText('Brood Pattern')).toBeInTheDocument();
        expect(screen.getByText('good')).toBeInTheDocument();
      });
    });

    it('displays stores levels', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Honey Level')).toBeInTheDocument();
        expect(screen.getByText('medium')).toBeInTheDocument();
        expect(screen.getByText('Pollen Level')).toBeInTheDocument();
        expect(screen.getByText('low')).toBeInTheDocument();
      });
    });

    it('displays temperament', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Temperament')).toBeInTheDocument();
        expect(screen.getByText('calm')).toBeInTheDocument();
      });
    });

    it('displays issues with human-readable labels', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Issues')).toBeInTheDocument();
        expect(screen.getByText('DWV (Deformed Wing Virus)')).toBeInTheDocument();
        expect(screen.getByText('Wax Moth')).toBeInTheDocument();
      });
    });

    it('displays notes', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Notes')).toBeInTheDocument();
        expect(screen.getByText('Test notes here')).toBeInTheDocument();
      });
    });

    it('displays "None" when no issues', async () => {
      const noIssuesInspection = createMockInspection({ issues: [] });
      mockGet.mockResolvedValue({ data: { data: noIssuesInspection } });

      renderWithProviders(
        <InspectionDetailModal {...defaultProps} inspection={noIssuesInspection} />
      );

      await waitFor(() => {
        const issuesRow = screen.getByText('Issues').closest('tr');
        expect(issuesRow).toContainHTML('None');
      });
    });
  });

  describe('Edit Button and 24-Hour Window', () => {
    it('shows Edit button when within 24-hour window', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit/i });
        expect(editButton).not.toBeDisabled();
        expect(editButton).toHaveTextContent('Edit');
      });
    });

    it('shows disabled Edit button when outside 24-hour window', async () => {
      const expiredInspection = createMockInspection({
        created_at: dayjs().subtract(25, 'hours').toISOString(),
      });
      mockGet.mockResolvedValue({ data: { data: expiredInspection } });

      renderWithProviders(
        <InspectionDetailModal {...defaultProps} inspection={expiredInspection} />
      );

      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit \(expired\)/i });
        expect(editButton).toBeDisabled();
      });
    });

    it('shows edit window expired note when outside 24-hour window', async () => {
      const expiredInspection = createMockInspection({
        created_at: dayjs().subtract(25, 'hours').toISOString(),
      });
      mockGet.mockResolvedValue({ data: { data: expiredInspection } });

      renderWithProviders(
        <InspectionDetailModal {...defaultProps} inspection={expiredInspection} />
      );

      await waitFor(() => {
        expect(screen.getByText(/created more than 24 hours ago/)).toBeInTheDocument();
      });
    });

    it('navigates to edit page when Edit is clicked', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/inspections/insp-1/edit');
    });
  });

  describe('Delete Functionality', () => {
    it('renders delete button', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });
    });

    it('shows confirmation popover when delete is clicked', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByText('Delete this inspection?')).toBeInTheDocument();
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });
    });

    it('deletes inspection and calls callbacks on confirm', async () => {
      const onClose = vi.fn();
      const onDeleted = vi.fn();

      renderWithProviders(
        <InspectionDetailModal
          {...defaultProps}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
      });

      // Click delete button to show popconfirm
      fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

      await waitFor(() => {
        expect(screen.getByText('Delete this inspection?')).toBeInTheDocument();
      });

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('/inspections/insp-1');
        expect(onClose).toHaveBeenCalled();
        expect(onDeleted).toHaveBeenCalled();
      });
    });
  });

  describe('Frame Data (Advanced Mode)', () => {
    it('displays frame data section when frames are present', async () => {
      const inspectionWithFrames = createMockInspection({
        frames: [
          {
            box_position: 1,
            box_type: 'brood',
            total_frames: 10,
            drawn_frames: 8,
            brood_frames: 6,
            honey_frames: 2,
            pollen_frames: 1,
          },
        ],
      });
      mockGet.mockResolvedValue({ data: { data: inspectionWithFrames } });

      renderWithProviders(
        <InspectionDetailModal {...defaultProps} inspection={inspectionWithFrames} />
      );

      await waitFor(() => {
        expect(screen.getByText('Frame-Level Data')).toBeInTheDocument();
        expect(screen.getByText('(1 boxes)')).toBeInTheDocument();
      });
    });

    it('does not display frame section when no frames', async () => {
      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Inspection:/)).toBeInTheDocument();
      });

      expect(screen.queryByText('Frame-Level Data')).not.toBeInTheDocument();
    });
  });

  describe('API Error Handling', () => {
    it('falls back to list data when fetch fails', async () => {
      mockGet.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<InspectionDetailModal {...defaultProps} />);

      // Should still render with the inspection data passed as prop
      await waitFor(() => {
        expect(screen.getByText('Inspection: January 25, 2026')).toBeInTheDocument();
      });
    });
  });
});
