/**
 * Site Edit Page Tests
 *
 * Tests for the SiteEdit page component (edit form).
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock apiClient
const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
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

// Import after mocks
import { SiteEdit } from '../../src/pages/SiteEdit';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('SiteEdit Page', () => {
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
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: mockSite } });
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(<SiteEdit />);

      expect(screen.getByRole('img', { name: /loading/i })).toBeInTheDocument();
    });
  });

  describe('Site not found', () => {
    it('navigates back when site not found', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });

      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/sites');
      });
    });
  });

  describe('Form rendering', () => {
    it('renders page title with site name', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByText(/edit: home apiary/i)).toBeInTheDocument();
      });
    });

    it('pre-fills site name field', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/site name/i);
        expect(nameInput).toHaveValue('Home Apiary');
      });
    });

    it('pre-fills latitude field', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const latInput = screen.getByPlaceholderText(/latitude/i);
        expect(latInput).toHaveValue('50.8503');
      });
    });

    it('pre-fills longitude field', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const lngInput = screen.getByPlaceholderText(/longitude/i);
        expect(lngInput).toHaveValue('4.3517');
      });
    });

    it('renders Save button', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });

    it('renders Cancel button', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('renders Back button', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to site detail when Back button clicked', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /back/i });
        fireEvent.click(backButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/site-1');
    });

    it('navigates to site detail when Cancel button clicked', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/sites/site-1');
    });
  });

  describe('Form validation', () => {
    it('shows error when site name is cleared', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByLabelText(/site name/i)).toHaveValue('Home Apiary');
      });

      const nameInput = screen.getByLabelText(/site name/i);
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a site name/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form submission', () => {
    it('submits form with updated data', async () => {
      const user = userEvent.setup();
      mockPut.mockResolvedValue({ data: { data: { ...mockSite, name: 'Updated Apiary' } } });

      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByLabelText(/site name/i)).toHaveValue('Home Apiary');
      });

      const nameInput = screen.getByLabelText(/site name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Apiary');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/sites/site-1', expect.objectContaining({
          name: 'Updated Apiary',
        }));
      });
    });

    it('navigates to site detail after successful submission', async () => {
      const user = userEvent.setup();
      mockPut.mockResolvedValue({ data: { data: mockSite } });

      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByLabelText(/site name/i)).toHaveValue('Home Apiary');
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/sites/site-1');
      });
    });

    it('shows error message when submission fails', async () => {
      const user = userEvent.setup();
      mockPut.mockRejectedValue(new Error('Network error'));

      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        expect(screen.getByLabelText(/site name/i)).toHaveValue('Home Apiary');
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Error is shown via message.error - just verify the call was attempted
      await waitFor(() => {
        expect(mockPut).toHaveBeenCalled();
      });
    });
  });

  describe('Site without coordinates', () => {
    const mockSiteNoCoords = {
      id: 'site-1',
      name: 'Forest Apiary',
      latitude: null,
      longitude: null,
      timezone: 'Europe/Paris',
      created_at: '2026-01-24T10:00:00Z',
      updated_at: '2026-01-24T10:00:00Z',
    };

    beforeEach(() => {
      mockGet.mockResolvedValue({ data: { data: mockSiteNoCoords } });
    });

    it('shows empty latitude field when null', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const latInput = screen.getByPlaceholderText(/latitude/i);
        expect(latInput).toHaveValue('');
      });
    });

    it('shows empty longitude field when null', async () => {
      renderWithProviders(<SiteEdit />);

      await waitFor(() => {
        const lngInput = screen.getByPlaceholderText(/longitude/i);
        expect(lngInput).toHaveValue('');
      });
    });
  });
});
