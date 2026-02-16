/**
 * Settings Page Tests
 *
 * Tests for the Settings page component.
 * Part of Epic 7, Story 7.2: IndexedDB Offline Storage
 * Updated for Epic 13, Story 13.19: Tenant Settings UI (Tabbed Interface)
 *
 * Covers:
 * - Tabbed interface rendering
 * - Advanced mode toggle
 * - Offline storage management
 * - Prune notification display (Task 8.5)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, notification } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock offlineCache service
const mockGetCacheStats = vi.fn();
const mockCheckAndPruneStorage = vi.fn();
const mockClearAllCache = vi.fn();

vi.mock('../../src/services/offlineCache', () => ({
  getCacheStats: () => mockGetCacheStats(),
  checkAndPruneStorage: () => mockCheckAndPruneStorage(),
  clearAllCache: () => mockClearAllCache(),
  MAX_STORAGE_MB: 50,
}));

// Mock useSpeechRecognition
vi.mock('../../src/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: true,
    isListening: false,
    transcript: '',
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    resetTranscript: vi.fn(),
  }),
}));

// Mock useAuth - Required for the Settings page's auth-based conditional rendering
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', name: 'Test User', email: 'test@example.com', role: 'admin' },
    isLoading: false,
    isAuthenticated: true,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    authConfig: { mode: 'local', requiresSetup: false },
  }),
}));

// Mock useCalendar hook
vi.mock('../../src/hooks/useCalendar', () => ({
  useTreatmentIntervals: () => ({
    intervals: { oxalic_acid: 7, formic_acid: 14, thymol: 21, varroa_mite: 30 },
    loading: false,
    error: null,
    updateIntervals: vi.fn(),
  }),
  DEFAULT_TREATMENT_INTERVALS: {
    oxalic_acid: 7,
    formic_acid: 14,
    thymol: 21,
    varroa_mite: 30,
  },
  formatTreatmentType: (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

// Mock config with DEV_MODE enabled for simpler test rendering
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return {
    ...actual,
    getAuthConfigSync: () => ({ mode: 'local', requiresSetup: false }),
    fetchAuthConfig: vi.fn().mockResolvedValue({ mode: 'local', requiresSetup: false }),
    DEV_MODE: true,
  };
});

// Mock useSettings context
const mockSetAdvancedMode = vi.fn();
const mockSetVoiceInputMethod = vi.fn();
const mockSetVoiceLanguage = vi.fn();

vi.mock('../../src/context', () => ({
  useSettings: () => ({
    advancedMode: false,
    setAdvancedMode: mockSetAdvancedMode,
    voiceInputMethod: 'auto' as const,
    setVoiceInputMethod: mockSetVoiceInputMethod,
    voiceLanguage: 'en-US',
    setVoiceLanguage: mockSetVoiceLanguage,
  }),
}));

// Mock useTenantSettings hook
vi.mock('../../src/hooks/useTenantSettings', () => ({
  useTenantSettings: () => ({
    settings: {
      tenant: { id: 'tenant-123', name: 'Test Tenant', plan: 'free', created_at: '2024-01-01' },
      usage: { hive_count: 5, unit_count: 2, user_count: 3, storage_bytes: 100000000 },
      limits: { max_hives: 10, max_units: 5, max_users: 10, max_storage_bytes: 1000000000 },
      percentages: { hives_percent: 50, units_percent: 40, users_percent: 30, storage_percent: 10 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useUpdateProfile: () => ({
    updateProfile: vi.fn(),
    updating: false,
  }),
  formatStorageSize: (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`,
  isWarningZone: (percent: number) => percent >= 80 && percent < 95,
}));

// Mock notification
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    notification: {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

// Import after mocks
import { Settings } from '../../src/pages/Settings';

// Create a query client for tests
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>
      <ConfigProvider>
        <BrowserRouter>
          {ui}
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

// Helper to click on a tab
const clickTab = async (tabName: string) => {
  const tab = screen.getByRole('tab', { name: new RegExp(tabName, 'i') });
  fireEvent.click(tab);
  // Wait for tab content to render
  await waitFor(() => {});
};

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock returns
    mockGetCacheStats.mockResolvedValue({
      sites: 5,
      hives: 10,
      inspections: 20,
      detections: 100,
      units: 2,
      totalRecords: 137,
      storageMB: 2.5,
      lastSync: new Date(),
    });
    mockCheckAndPruneStorage.mockResolvedValue({
      currentSize: 2.5,
      prunedCount: 0,
    });
    mockClearAllCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tabbed Interface', () => {
    it('renders the Settings title', async () => {
      renderWithProviders(<Settings />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('renders tab navigation', async () => {
      renderWithProviders(<Settings />);

      // Check for tab labels
      expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Profile/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /BeeBrain/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Preferences/i })).toBeInTheDocument();
    });

    it('defaults to Overview tab', async () => {
      renderWithProviders(<Settings />);

      // The Overview tab should be selected (indicated by aria-selected)
      const overviewTab = screen.getByRole('tab', { name: /Overview/i });
      expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    });

    it('can switch to Preferences tab', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      // Preferences tab should now be selected
      const preferencesTab = screen.getByRole('tab', { name: /Preferences/i });
      expect(preferencesTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Preferences Tab - Page Rendering', () => {
    it('renders Inspection Preferences section in Preferences tab', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Inspection Preferences')).toBeInTheDocument();
    });

    it('renders Advanced Mode toggle in Preferences tab', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Advanced Mode')).toBeInTheDocument();
    });

    it('renders Voice Input section in Preferences tab', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Voice Input')).toBeInTheDocument();
    });

    it('renders Offline Storage section in Preferences tab', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Offline Storage')).toBeInTheDocument();
    });
  });

  describe('Preferences Tab - Advanced Mode', () => {
    it('calls setAdvancedMode when switch is toggled', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      const switchElement = screen.getByRole('switch');
      fireEvent.click(switchElement);

      // The switch calls setAdvancedMode with the new value
      expect(mockSetAdvancedMode).toHaveBeenCalled();
    });
  });

  describe('Preferences Tab - Cache Statistics', () => {
    it('displays cached data statistics', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      await waitFor(() => {
        expect(screen.getByText('137')).toBeInTheDocument(); // Total count
      });
    });

    it('displays individual table counts', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      await waitFor(() => {
        expect(screen.getByText('Sites')).toBeInTheDocument();
        // Hives appears in both Overview (usage stats) and Preferences (cached data)
        // Just check one of the labels in Cached Data section
        expect(screen.getByText('Inspections')).toBeInTheDocument();
      });
    });
  });

  describe('Preferences Tab - Storage Pruning (Task 8.5)', () => {
    it('shows notification when data is pruned', async () => {
      mockCheckAndPruneStorage.mockResolvedValue({
        currentSize: 40,
        prunedCount: 50,
      });

      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Cached Data')).toBeInTheDocument();
      });

      // Find and click the sync button in SyncStatus
      const syncButtons = screen.getAllByText('Sync now');
      fireEvent.click(syncButtons[0]);

      await waitFor(() => {
        expect(notification.info).toHaveBeenCalledWith({
          message: 'Storage Optimized',
          description: '50 old records were removed to free up space. Recent and frequently accessed data has been preserved.',
          placement: 'bottomRight',
          duration: 5,
        });
      });
    });

    it('does not show notification when no data pruned', async () => {
      mockCheckAndPruneStorage.mockResolvedValue({
        currentSize: 10,
        prunedCount: 0,
      });

      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Cached Data')).toBeInTheDocument();
      });

      // Find and click the sync button in SyncStatus
      const syncButtons = screen.getAllByText('Sync now');
      fireEvent.click(syncButtons[0]);

      await waitFor(() => {
        expect(mockCheckAndPruneStorage).toHaveBeenCalled();
      });

      // Notification should NOT be called for 0 pruned
      expect(notification.info).not.toHaveBeenCalled();
    });
  });

  describe('Preferences Tab - Clear Cache', () => {
    it('renders clear cache button', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      await waitFor(() => {
        expect(screen.getByText('Clear Offline Cache')).toBeInTheDocument();
      });
    });

    it('calls clearAllCache when button clicked', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      await waitFor(() => {
        expect(screen.getByText('Clear Offline Cache')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear Offline Cache');
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockClearAllCache).toHaveBeenCalled();
      });
    });

    it('disables clear button when no cached data', async () => {
      mockGetCacheStats.mockResolvedValue({
        sites: 0,
        hives: 0,
        inspections: 0,
        detections: 0,
        units: 0,
        totalRecords: 0,
        storageMB: 0,
        lastSync: null,
      });

      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      await waitFor(() => {
        const clearButton = screen.getByText('Clear Offline Cache');
        expect(clearButton.closest('button')).toBeDisabled();
      });
    });
  });

  describe('Preferences Tab - Voice Input Settings', () => {
    it('shows browser support status', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Browser Support')).toBeInTheDocument();
    });

    it('shows transcription method options', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Transcription Method')).toBeInTheDocument();
      expect(screen.getByText('Auto')).toBeInTheDocument();
      expect(screen.getByText('Native (Browser)')).toBeInTheDocument();
      expect(screen.getByText('Server (Whisper)')).toBeInTheDocument();
    });

    it('shows language selection', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Speech Recognition Language')).toBeInTheDocument();
    });

    it('shows test microphone button', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Test Microphone Access')).toBeInTheDocument();
    });
  });

  describe('Preferences Tab - Milestones Section', () => {
    it('renders milestones section', async () => {
      renderWithProviders(<Settings />);

      await clickTab('Preferences');

      expect(screen.getByText('Milestones')).toBeInTheDocument();
    });
  });
});
