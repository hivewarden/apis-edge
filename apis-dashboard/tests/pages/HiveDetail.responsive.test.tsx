/**
 * HiveDetail Responsive Layout Tests
 *
 * Tests for the responsive behavior of the HiveDetail page:
 * - Mobile viewport (< 768px) renders HiveDetailMobile
 * - Desktop viewport (>= 768px) renders HiveDetailDesktop
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HiveDetail } from '../../src/pages/HiveDetail';

// Mock the API client
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the hooks
vi.mock('../../src/hooks', () => ({
  useTreatments: () => ({
    treatments: [],
    loading: false,
    error: null,
    createTreatment: vi.fn(),
    updateTreatment: vi.fn(),
    deleteTreatment: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
  }),
  useFeedings: () => ({
    feedings: [],
    seasonTotals: { sugar_syrup_liters: 0, pollen_patty_grams: 0 },
    loading: false,
    error: null,
    createFeeding: vi.fn(),
    updateFeeding: vi.fn(),
    deleteFeeding: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
  }),
  useHarvestsByHive: () => ({
    harvests: [],
    loading: false,
    error: null,
    createHarvest: vi.fn(),
    updateHarvest: vi.fn(),
    deleteHarvest: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
    seasonTotalKg: 0,
    seasonHarvestCount: 0,
  }),
  useEquipment: () => ({
    equipmentLogs: [],
    currentlyInstalled: [],
    equipmentHistory: [],
    loading: false,
    error: null,
    createEquipmentLog: vi.fn(),
    updateEquipmentLog: vi.fn(),
    deleteEquipmentLog: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
  }),
  useHarvestAnalytics: () => ({
    analytics: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMilestoneFlags: () => ({
    flags: {},
    markMilestoneSeen: vi.fn(),
  }),
  useHiveLoss: () => ({
    hiveLoss: null,
    createHiveLoss: vi.fn(),
    creating: false,
  }),
}));

// Mock the context
vi.mock('../../src/context', () => ({
  useSettings: () => ({
    advancedMode: false,
  }),
}));

// Mock child components that make API calls
vi.mock('../../src/components', async () => {
  const actual = await vi.importActual('../../src/components');
  return {
    ...actual,
    HiveDetailMobile: ({ hive }: { hive: { name: string } }) => (
      <div data-testid="hive-detail-mobile">
        HiveDetailMobile: {hive.name}
      </div>
    ),
    HiveDetailDesktop: ({ hive }: { hive: { name: string } }) => (
      <div data-testid="hive-detail-desktop">
        HiveDetailDesktop: {hive.name}
      </div>
    ),
    TreatmentFormModal: () => null,
    TreatmentFollowupModal: () => null,
    FeedingFormModal: () => null,
    HarvestFormModal: () => null,
    FirstHarvestModal: () => null,
    EquipmentFormModal: () => null,
    HiveLossWizard: () => null,
    QRGeneratorModal: () => null,
    showFirstHiveCelebration: vi.fn(),
  };
});

import { apiClient } from '../../src/providers/apiClient';

const mockHive = {
  id: 'hive-1',
  site_id: 'site-1',
  name: 'Test Hive',
  queen_introduced_at: '2024-01-15',
  queen_source: 'breeder',
  brood_boxes: 2,
  honey_supers: 1,
  notes: 'Test notes',
  queen_history: [],
  box_changes: [],
  hive_status: 'active' as const,
  lost_at: null,
  task_summary: { open: 3, overdue: 1 },
  created_at: '2024-01-01',
  updated_at: '2024-01-20',
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/hives/hive-1']}>
      <Routes>
        <Route path="/hives/:id" element={<HiveDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HiveDetail Responsive Layout', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    vi.clearAllMocks();

    // Mock successful hive fetch
    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/hives/hive-1') && !url.includes('/hives/')) {
        return Promise.resolve({ data: { data: mockHive } });
      }
      if (url.includes('/sites/site-1/hives')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes('/sites/site-1')) {
        return Promise.resolve({ data: { data: { name: 'Test Site' } } });
      }
      return Promise.resolve({ data: { data: mockHive } });
    });
  });

  afterEach(() => {
    // Restore original window width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
    window.dispatchEvent(new Event('resize'));
  }

  describe('mobile viewport (< 768px)', () => {
    it('renders HiveDetailMobile when viewport is 767px', async () => {
      setViewportWidth(767);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('hive-detail-desktop')).not.toBeInTheDocument();
    });

    it('renders HiveDetailMobile when viewport is 320px (small mobile)', async () => {
      setViewportWidth(320);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });
    });

    it('renders HiveDetailMobile when viewport is 375px (iPhone)', async () => {
      setViewportWidth(375);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });
    });
  });

  describe('desktop viewport (>= 768px)', () => {
    it('renders HiveDetailDesktop when viewport is exactly 768px', async () => {
      setViewportWidth(768);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('hive-detail-mobile')).not.toBeInTheDocument();
    });

    it('renders HiveDetailDesktop when viewport is 1024px (tablet landscape)', async () => {
      setViewportWidth(1024);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });
    });

    it('renders HiveDetailDesktop when viewport is 1440px (desktop)', async () => {
      setViewportWidth(1440);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });
    });
  });

  describe('breakpoint behavior', () => {
    it('breakpoint is exactly at 768px', async () => {
      // At 767px - should be mobile
      setViewportWidth(767);
      const { unmount: unmount1 } = renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });

      unmount1();

      // At 768px - should be desktop
      setViewportWidth(768);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });
    });
  });

  describe('live viewport resize', () => {
    it('switches from desktop to mobile when viewport is resized below 768px', async () => {
      // Start with desktop viewport
      setViewportWidth(900);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });

      // Resize to mobile viewport (wrap in act to handle state updates)
      await act(async () => {
        setViewportWidth(600);
      });

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('hive-detail-desktop')).not.toBeInTheDocument();
    });

    it('switches from mobile to desktop when viewport is resized to 768px or above', async () => {
      // Start with mobile viewport
      setViewportWidth(500);
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });

      // Resize to desktop viewport (wrap in act to handle state updates)
      await act(async () => {
        setViewportWidth(800);
      });

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-desktop')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('hive-detail-mobile')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching hive data', async () => {
      // Delay the API response
      (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve({ data: { data: mockHive } }), 100))
      );

      setViewportWidth(768);
      const { container } = renderWithRouter();

      // Should show Ant Design spinner initially (look for the spin class)
      const spinner = container.querySelector('.ant-spin');
      expect(spinner).toBeInTheDocument();
    });
  });
});
