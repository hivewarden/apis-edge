/**
 * BeeBrain Configuration Page Tests
 *
 * Tests for the BeeBrain BYOK configuration page.
 * Part of Epic 13, Story 13-18: BeeBrain BYOK
 *
 * Covers:
 * - Mode selection (system/custom/rules_only)
 * - Provider configuration for custom mode
 * - Admin access requirement for modifications
 * - View-only mode for non-admin users
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, notification } from 'antd';

// Mock the hooks
const mockUseBeeBrainSettings = vi.fn();
const mockUseUpdateBeeBrainSettings = vi.fn();

vi.mock('../../src/hooks/useBeeBrainSettings', async () => {
  const actual = await vi.importActual('../../src/hooks/useBeeBrainSettings');
  return {
    ...actual,
    useBeeBrainSettings: () => mockUseBeeBrainSettings(),
    useUpdateBeeBrainSettings: () => mockUseUpdateBeeBrainSettings(),
  };
});

// Mock config
vi.mock('../../src/config', () => ({
  DEV_MODE: false,
  API_URL: 'http://localhost:3000/api',
  KEYCLOAK_AUTHORITY: 'http://localhost:8081/realms/honeybee',
  KEYCLOAK_CLIENT_ID: '',
  fetchAuthConfig: vi.fn(),
  getAuthConfigSync: vi.fn().mockReturnValue({ mode: 'local' }),
  clearAuthConfigCache: vi.fn(),
}));

// Mock fetch for /api/auth/me
global.fetch = vi.fn();

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
import { BeeBrainConfig } from '../../src/pages/settings/BeeBrainConfig';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('BeeBrainConfig Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns for hooks
    mockUseBeeBrainSettings.mockReturnValue({
      settings: {
        mode: 'system',
        effective_backend: 'rules',
        effective_provider: null,
        effective_model: null,
        custom_config_status: 'not_configured',
        system_available: true,
        updated_at: '2025-01-01T00:00:00Z',
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mockUseUpdateBeeBrainSettings.mockReturnValue({
      updateSettings: vi.fn().mockResolvedValue({}),
      updating: false,
    });

    // Mock fetch for admin role check
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: {
          id: 'user-1',
          email: 'admin@test.com',
          name: 'Admin User',
          role: 'admin',
        },
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Rendering', () => {
    it('renders the page title', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('BeeBrain Configuration')).toBeInTheDocument();
      });
    });

    it('renders the info card with description', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText(/BeeBrain uses AI to analyze/)).toBeInTheDocument();
      });
    });

    it('shows current mode tag', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        // The mode tag should appear with green color
        const tags = screen.getAllByText(/Use System Default/);
        expect(tags.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Mode Selection', () => {
    it('renders all three mode options', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        // Check for the radio options - there will be multiple mentions
        expect(screen.getAllByText(/Use System Default/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Bring Your Own Key/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Rules Only \(No AI\)/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows mode descriptions', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        // Check for description text
        expect(screen.getAllByText(/system administrator/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/rule-based analysis/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('disables system mode when not available', async () => {
      mockUseBeeBrainSettings.mockReturnValue({
        settings: {
          mode: 'rules_only',
          effective_backend: 'rules',
          custom_config_status: 'not_configured',
          system_available: false,
          updated_at: '2025-01-01T00:00:00Z',
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText(/Not Available/)).toBeInTheDocument();
      });
    });
  });

  describe('Custom Provider Configuration', () => {
    it('shows provider options when custom mode selected', async () => {
      mockUseBeeBrainSettings.mockReturnValue({
        settings: {
          mode: 'custom',
          effective_backend: 'external',
          effective_provider: 'openai',
          custom_config_status: 'configured',
          system_available: true,
          updated_at: '2025-01-01T00:00:00Z',
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument();
        expect(screen.getByText('AI Provider')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching settings', async () => {
      mockUseBeeBrainSettings.mockReturnValue({
        settings: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('Loading BeeBrain settings...')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error notification when settings fail to load', async () => {
      const error = new Error('Network error');
      mockUseBeeBrainSettings.mockReturnValue({
        settings: null,
        loading: false,
        error,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(notification.error).toHaveBeenCalledWith({
          message: 'Failed to Load Settings',
          description: 'Network error',
        });
      });
    });
  });

  describe('View-Only Mode for Non-Admin', () => {
    it('shows view-only alert for non-admin users', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          user: {
            id: 'user-2',
            email: 'member@test.com',
            name: 'Member User',
            role: 'member',
          },
        }),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('View Only')).toBeInTheDocument();
        expect(screen.getByText(/Administrator privileges are required/)).toBeInTheDocument();
      });
    });
  });

  describe('Save Button', () => {
    it('shows save button for admin users', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('Save Configuration')).toBeInTheDocument();
      });
    });

    it('save button is disabled when no changes', async () => {
      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        const saveButton = screen.getByText('Save Configuration').closest('button');
        expect(saveButton).toBeDisabled();
      });
    });
  });

  describe('Rules Only Info', () => {
    it('shows rules info when rules_only mode is selected', async () => {
      mockUseBeeBrainSettings.mockReturnValue({
        settings: {
          mode: 'rules_only',
          effective_backend: 'rules',
          custom_config_status: 'not_configured',
          system_available: true,
          updated_at: '2025-01-01T00:00:00Z',
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('Rule-Based Analysis')).toBeInTheDocument();
      });
    });
  });

  describe('System Mode Info', () => {
    it('shows system info when system mode is selected', async () => {
      mockUseBeeBrainSettings.mockReturnValue({
        settings: {
          mode: 'system',
          effective_backend: 'external',
          effective_provider: 'openai',
          custom_config_status: 'not_configured',
          system_available: true,
          updated_at: '2025-01-01T00:00:00Z',
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      renderWithProviders(<BeeBrainConfig />);

      await waitFor(() => {
        expect(screen.getByText('System Configuration')).toBeInTheDocument();
      });
    });
  });
});
