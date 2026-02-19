/**
 * HiveDetail Page Tests
 *
 * Tests for the HiveDetail page component: loading, not found, and hive info display.
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HiveDetail } from '../../src/pages/HiveDetail';

// Mock the API client
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
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

// Mock useSettings context
vi.mock('../../src/context', () => ({
  useSettings: () => ({ advancedMode: false }),
}));

// Mutable return value for useHiveDetail
const hiveDetailReturn = {
  hive: null as Record<string, unknown> | null,
  site: null as Record<string, unknown> | null,
  siteHives: [] as Array<{ id: string; name: string }>,
  loading: true,
  error: null,
  deleteHive: vi.fn(),
  deleting: false,
  replaceQueen: vi.fn(),
  replacingQueen: false,
  refetch: vi.fn(),
};

// Mock hooks
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
    seasonTotals: [],
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
  useHarvestAnalytics: () => ({
    analytics: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
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
  useMilestoneFlags: () => ({
    flags: null,
    markMilestoneSeen: vi.fn(),
  }),
  useHiveLoss: () => ({
    hiveLoss: null,
    createHiveLoss: vi.fn(),
    creating: false,
  }),
  useHiveDetail: () => hiveDetailReturn,
}));

// Mock child components to avoid deep rendering
vi.mock('../../src/components', async () => {
  const actual = await vi.importActual('../../src/components');
  return {
    ...actual,
    HiveDetailMobile: ({ hive }: { hive: { name: string } }) => (
      <div data-testid="hive-detail-mobile">
        HiveDetailMobile: {hive.name}
      </div>
    ),
    HiveDetailDesktop: ({ hive }: { hive: { name: string; queen_source?: string; brood_boxes?: number; honey_supers?: number } }) => (
      <div data-testid="hive-detail-desktop">
        <span>{hive.name}</span>
        {hive.queen_source && <span>{hive.queen_source}</span>}
        {hive.brood_boxes !== undefined && <span>Brood: {hive.brood_boxes}</span>}
        {hive.honey_supers !== undefined && <span>Supers: {hive.honey_supers}</span>}
      </div>
    ),
    TreatmentFormModal: () => null,
    TreatmentFollowupModal: () => null,
    FeedingFormModal: () => null,
    HarvestFormModal: () => null,
    FirstHarvestModal: () => null,
    EquipmentFormModal: () => null,
    HiveLossWizard: () => null,
    showFirstHiveCelebration: vi.fn(),
  };
});

const sampleHive = {
  id: 'hive-1',
  site_id: 'site-1',
  name: 'Test Hive Alpha',
  queen_introduced_at: '2025-06-15',
  queen_source: 'breeder',
  brood_boxes: 2,
  honey_supers: 1,
  notes: 'Strong colony',
  queen_history: [
    {
      id: 'qh-1',
      introduced_at: '2025-06-15',
      source: 'breeder',
      replaced_at: null,
      replacement_reason: null,
    },
  ],
  box_changes: [],
  hive_status: 'active',
  lost_at: null,
  task_summary: { open: 2, overdue: 0 },
  created_at: '2025-06-01T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
};

const sampleSite = {
  id: 'site-1',
  name: 'Home Apiary',
};

const renderWithRouter = (initialEntries = ['/hives/hive-1']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/hives/:id" element={<HiveDetail />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('HiveDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hiveDetailReturn.hive = null;
    hiveDetailReturn.site = null;
    hiveDetailReturn.siteHives = [];
    hiveDetailReturn.loading = true;
    hiveDetailReturn.error = null;
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      hiveDetailReturn.loading = true;
      hiveDetailReturn.hive = null;

      renderWithRouter();

      // Ant Design Spin renders as div with aria-busy, not role="img"
      const spinner = document.querySelector('.ant-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Not found state', () => {
    it('shows empty state when hive not found', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = null;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Hive not found')).toBeInTheDocument();
      });
    });

    it('shows Back button when hive not found', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = null;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });
  });

  describe('Hive info display', () => {
    it('renders hive name in desktop layout', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = sampleHive;
      hiveDetailReturn.site = sampleSite;

      // Ensure desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      window.dispatchEvent(new Event('resize'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Test Hive Alpha')).toBeInTheDocument();
      });
    });

    it('renders queen source in desktop layout', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = sampleHive;
      hiveDetailReturn.site = sampleSite;

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      window.dispatchEvent(new Event('resize'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('breeder')).toBeInTheDocument();
      });
    });

    it('renders box configuration in desktop layout', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = sampleHive;
      hiveDetailReturn.site = sampleSite;

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      window.dispatchEvent(new Event('resize'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Brood: 2')).toBeInTheDocument();
        expect(screen.getByText('Supers: 1')).toBeInTheDocument();
      });
    });

    it('renders mobile layout on small viewport', async () => {
      hiveDetailReturn.loading = false;
      hiveDetailReturn.hive = sampleHive;
      hiveDetailReturn.site = sampleSite;

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      window.dispatchEvent(new Event('resize'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('hive-detail-mobile')).toBeInTheDocument();
      });
    });
  });
});
