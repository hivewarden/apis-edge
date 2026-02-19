/**
 * Inspections Tests
 *
 * Tests for the inspection list hook (useInspectionsList)
 * and the InspectionCreate page form behavior.
 * Part of Epic 5, Story 5.3: Quick-Entry Inspection Form
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConfigProvider } from 'antd';

// Mock apiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
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

// Mock useSettings - both import paths need to be mocked
// InspectionCreate imports from '../../src/context'
// VoiceInputButton imports from '../../src/context/SettingsContext'
const mockSettings = {
  advancedMode: false,
  voiceInputMethod: 'auto' as const,
  voiceLanguage: 'en',
  setAdvancedMode: vi.fn(),
  setVoiceInputMethod: vi.fn(),
  setVoiceLanguage: vi.fn(),
};
vi.mock('../../src/context', () => ({
  useSettings: () => mockSettings,
}));
vi.mock('../../src/context/SettingsContext', () => ({
  useSettings: () => mockSettings,
}));

// Mutable hook return for useHiveDetail
const hiveDetailReturn = {
  hive: null as Record<string, unknown> | null,
  site: null,
  siteHives: [],
  loading: false,
  error: null,
  deleteHive: vi.fn(),
  deleting: false,
  replaceQueen: vi.fn(),
  replacingQueen: false,
  refetch: vi.fn(),
};

// Mock hooks
vi.mock('../../src/hooks', () => ({
  useOnlineStatus: () => true,
  useAuth: () => ({ user: { id: 'test-user' } }),
  useHiveDetail: () => hiveDetailReturn,
}));

// Mock offline inspection service
vi.mock('../../src/services/offlineInspection', () => ({
  saveOfflineInspection: vi.fn(),
}));

// Import hooks and pages after mocks
import { useInspectionsList } from '../../src/hooks/useInspectionsList';
import { InspectionCreate } from '../../src/pages/InspectionCreate';

const renderWithRouter = (ui: React.ReactElement, initialEntries = ['/hives/hive-1/inspections/new']) => {
  return render(
    <ConfigProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/hives/:hiveId/inspections/new" element={ui} />
        </Routes>
      </MemoryRouter>
    </ConfigProvider>
  );
};

describe('useInspectionsList Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches inspections for a hive', async () => {
    const mockInspections = [
      {
        id: 'insp-1',
        hive_id: 'hive-1',
        inspected_at: '2026-02-10',
        queen_seen: true,
        eggs_seen: true,
        queen_cells: false,
        brood_frames: 5,
        brood_pattern: 'good',
        honey_level: 'medium',
        pollen_level: 'high',
        temperament: 'calm',
        issues: [],
        notes: 'Colony looking strong',
        created_at: '2026-02-10T10:00:00Z',
        updated_at: '2026-02-10T10:00:00Z',
      },
    ];

    mockGet.mockResolvedValue({
      data: { data: mockInspections, meta: { total: 1 } },
    });

    const { result } = renderHook(() => useInspectionsList('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.inspections).toEqual(mockInspections);
    expect(result.current.total).toBe(1);
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('/hives/hive-1/inspections')
    );
  });

  it('returns empty list when hiveId is null', async () => {
    const { result } = renderHook(() => useInspectionsList(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.inspections).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('handles pagination', async () => {
    mockGet.mockResolvedValue({
      data: { data: [], meta: { total: 25 } },
    });

    const { result } = renderHook(() => useInspectionsList('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);

    // Change page
    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);
  });

  it('handles sort order change', async () => {
    mockGet.mockResolvedValue({
      data: { data: [], meta: { total: 0 } },
    });

    const { result } = renderHook(() => useInspectionsList('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sortOrder).toBe('desc');

    act(() => {
      result.current.setSortOrder('asc');
    });

    expect(result.current.sortOrder).toBe('asc');
    // Page should reset to 1 on sort change
    expect(result.current.page).toBe(1);
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useInspectionsList('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.inspections).toEqual([]);
  });
});

describe('InspectionCreate Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hiveDetailReturn.hive = {
      id: 'hive-1',
      name: 'Test Hive',
      site_id: 'site-1',
      brood_boxes: 2,
      honey_supers: 1,
    };
    hiveDetailReturn.loading = false;
    hiveDetailReturn.error = null;
    mockPost.mockResolvedValue({ data: { data: { id: 'new-inspection' } } });
  });

  it('shows brood pattern selection on Brood step', async () => {
    const user = userEvent.setup();
    renderWithRouter(<InspectionCreate />);

    await waitFor(() => {
      expect(screen.getByText('Queen Observations')).toBeInTheDocument();
    });

    // Navigate to Brood step
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Brood Pattern')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^good$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^spotty$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^poor$/i })).toBeInTheDocument();
  });

  it('shows temperament selection on Brood step', async () => {
    const user = userEvent.setup();
    renderWithRouter(<InspectionCreate />);

    await waitFor(() => {
      expect(screen.getByText('Queen Observations')).toBeInTheDocument();
    });

    // Navigate to Brood step
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/temperament/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^calm$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^nervous$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^aggressive$/i })).toBeInTheDocument();
  });

  it('submits inspection with brood pattern and temperament data', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    renderWithRouter(<InspectionCreate />);

    await waitFor(() => {
      expect(screen.getByText('Queen Observations')).toBeInTheDocument();
    });

    // Select queen seen = Yes
    const yesButtons = screen.getAllByRole('button', { name: /^yes$/i });
    await user.click(yesButtons[0]); // Queen seen

    // Navigate to Brood step
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Select brood pattern
    await user.click(screen.getByRole('button', { name: /^good$/i }));

    // Select temperament
    await user.click(screen.getByRole('button', { name: /^calm$/i }));

    // Navigate through remaining steps to Review
    await user.click(screen.getByRole('button', { name: /next/i })); // to Stores
    await user.click(screen.getByRole('button', { name: /next/i })); // to Issues
    await user.click(screen.getByRole('button', { name: /next/i })); // to Notes
    await user.click(screen.getByRole('button', { name: /next/i })); // to Review

    // Save
    await user.click(screen.getByRole('button', { name: /save inspection/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/hives/hive-1/inspections',
        expect.objectContaining({
          queen_seen: true,
          brood_pattern: 'good',
          temperament: 'calm',
        })
      );
    });
  });

  it('shows all step indicators', async () => {
    renderWithRouter(<InspectionCreate />);

    await waitFor(() => {
      expect(screen.getByText('Queen')).toBeInTheDocument();
      expect(screen.getByText('Brood')).toBeInTheDocument();
      expect(screen.getByText('Stores')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
    });
  });

  it('renders brood frames counter starting at 0', async () => {
    const user = userEvent.setup();
    renderWithRouter(<InspectionCreate />);

    await waitFor(() => {
      expect(screen.getByText('Queen Observations')).toBeInTheDocument();
    });

    // Navigate to Brood step
    await user.click(screen.getByRole('button', { name: /next/i }));

    // The stepper starts at 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
