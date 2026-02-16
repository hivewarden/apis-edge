/**
 * InspectionEdit Page Tests
 *
 * Tests for the InspectionEdit page component from Story 5.4.
 * Covers: loading inspection data, form display, 24-hour edit window, form submission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { apisTheme } from '../../src/theme/apisTheme';
import dayjs from 'dayjs';

// Mock apiClient
const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
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

// Mock hooks
vi.mock('../../src/hooks', () => ({
  useOnlineStatus: () => true,
}));

// Mock db for offline inspections
vi.mock('../../src/services/db', () => ({
  db: {
    inspections: {
      where: () => ({
        equals: () => ({
          first: () => Promise.resolve(undefined),
        }),
      }),
    },
  },
}));

// Mock offline inspection service
vi.mock('../../src/services/offlineInspection', () => ({
  updateOfflineInspection: vi.fn(),
}));

// Import after mocks
import { InspectionEdit } from '../../src/pages/InspectionEdit';

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
  issues: ['dwv'],
  notes: 'Test notes',
  created_at: dayjs().subtract(1, 'hour').toISOString(), // Created 1 hour ago (editable)
  updated_at: dayjs().subtract(1, 'hour').toISOString(),
  ...overrides,
});

// Helper to render with router and providers
const renderWithRouter = (
  ui: React.ReactElement,
  initialEntries = ['/inspections/insp-1/edit']
) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/inspections/:id/edit" element={ui} />
        </Routes>
      </MemoryRouter>
    </ConfigProvider>
  );
};

describe('InspectionEdit Page', () => {
  const mockInspection = createMockInspection();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: { data: mockInspection },
    });
    mockPut.mockResolvedValue({
      data: { data: mockInspection },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Loading', () => {
    it('renders loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves
      renderWithRouter(<InspectionEdit />);

      expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('fetches inspection data on mount', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/inspections/insp-1');
      });
    });

    it('renders page title after loading', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Edit Inspection')).toBeInTheDocument();
      });
    });

    it('displays inspection date', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('January 25, 2026')).toBeInTheDocument();
      });
    });

    it('navigates back on 404 error', async () => {
      mockGet.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404 },
      });

      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(-1);
      });
    });
  });

  describe('Form Pre-population', () => {
    it('pre-populates queen observations', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        // Check that the "Yes" radio for queen_seen is checked
        const queenSeenSection = screen.getByText('Queen Seen?').closest('.ant-form-item');
        const yesRadio = queenSeenSection?.querySelector('input[value="true"]');
        expect(yesRadio).toBeChecked();
      });
    });

    it('pre-populates brood assessment', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        // Check brood frames input has value
        const broodFramesInput = screen.getByRole('spinbutton');
        expect(broodFramesInput).toHaveValue('6');
      });
    });

    it('pre-populates issues checkboxes', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        const dwvCheckbox = screen.getByLabelText('DWV (Deformed Wing Virus)');
        expect(dwvCheckbox).toBeChecked();
      });
    });

    it('pre-populates notes', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        const notesTextarea = screen.getByRole('textbox', { name: /notes/i });
        expect(notesTextarea).toHaveValue('Test notes');
      });
    });
  });

  describe('24-Hour Edit Window', () => {
    it('allows editing when within 24-hour window', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        // Form should not be disabled
        const saveButton = screen.getByRole('button', { name: /Save Changes/i });
        expect(saveButton).not.toBeDisabled();
      });
    });

    it('shows warning when edit window is closing soon', async () => {
      const soonExpiring = createMockInspection({
        created_at: dayjs().subtract(20, 'hours').toISOString(),
      });
      mockGet.mockResolvedValue({ data: { data: soonExpiring } });

      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText(/Edit window closing in/)).toBeInTheDocument();
      });
    });

    it('shows expired alert when outside 24-hour window', async () => {
      const expiredInspection = createMockInspection({
        created_at: dayjs().subtract(25, 'hours').toISOString(),
      });
      mockGet.mockResolvedValue({ data: { data: expiredInspection } });

      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Edit window expired')).toBeInTheDocument();
      });
    });

    it('disables form when outside 24-hour window', async () => {
      const expiredInspection = createMockInspection({
        created_at: dayjs().subtract(25, 'hours').toISOString(),
      });
      mockGet.mockResolvedValue({ data: { data: expiredInspection } });

      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Changes/i });
        expect(saveButton).toBeDisabled();
      });
    });
  });

  describe('Form Submission', () => {
    it('submits updated data to API', async () => {
      const user = userEvent.setup();
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Edit Inspection')).toBeInTheDocument();
      });

      // Click Save Changes
      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith(
          '/inspections/insp-1',
          expect.objectContaining({
            queen_seen: true,
            eggs_seen: true,
            brood_frames: 6,
            brood_pattern: 'good',
          })
        );
      });
    });

    it('navigates to hive page on successful save', async () => {
      const user = userEvent.setup();
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Edit Inspection')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
      });
    });

    it('shows error message when API returns 403', async () => {
      mockPut.mockRejectedValue({
        isAxiosError: true,
        response: { status: 403 },
      });

      const user = userEvent.setup();
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Edit Inspection')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Edit window has expired (24 hours)')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('renders back button', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Back to Hive')).toBeInTheDocument();
      });
    });

    it('navigates to hive on back button click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Back to Hive')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Back to Hive'));

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });

    it('navigates to hive on cancel button click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-1');
    });
  });

  describe('Form Sections', () => {
    it('renders Queen Observations section', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Queen Observations')).toBeInTheDocument();
      });
    });

    it('renders Brood Assessment section', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Brood Assessment')).toBeInTheDocument();
      });
    });

    it('renders Stores Assessment section', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Stores Assessment')).toBeInTheDocument();
      });
    });

    it('renders Issues section', async () => {
      renderWithRouter(<InspectionEdit />);

      await waitFor(() => {
        expect(screen.getByText('Issues')).toBeInTheDocument();
      });
    });
  });
});
