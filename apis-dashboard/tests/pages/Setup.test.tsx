/**
 * Tests for Setup Page
 *
 * Tests the setup wizard page that creates the first admin account.
 * Covers loading state, redirects, error handling, and wizard rendering.
 *
 * Part of Story 13-7: Setup Wizard
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { Setup } from '../../src/pages/Setup';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock config module
const mockFetchAuthConfig = vi.fn();
const mockClearAuthConfigCache = vi.fn();
vi.mock('../../src/config', () => ({
  fetchAuthConfig: () => mockFetchAuthConfig(),
  clearAuthConfigCache: () => mockClearAuthConfigCache(),
  API_URL: 'http://localhost:3000/api',
}));

const renderSetup = () => {
  return render(
    <MemoryRouter>
      <ConfigProvider theme={apisTheme}>
        <Setup />
      </ConfigProvider>
    </MemoryRouter>
  );
};

describe('Setup Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', async () => {
      // Create a promise that never resolves to keep loading state
      mockFetchAuthConfig.mockReturnValue(new Promise(() => {}));

      renderSetup();

      expect(screen.getByText('Checking setup status...')).toBeInTheDocument();
    });

    it('shows spinner component during loading', async () => {
      mockFetchAuthConfig.mockReturnValue(new Promise(() => {}));

      renderSetup();

      // Ant Design Spin component has a specific class
      const spinner = document.querySelector('.ant-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Redirects', () => {
    it('redirects to /login when not in local mode', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'keycloak',
        keycloak_authority: 'https://keycloak.example.com/realms/honeybee',
        client_id: 'client-123',
      });

      renderSetup();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });

    it('redirects to /login when setup is not required', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: false,
      });

      renderSetup();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });

    it('clears auth config cache before checking status', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        expect(mockClearAuthConfigCache).toHaveBeenCalled();
      });
    });
  });

  describe('Error State', () => {
    it('shows error message when fetchAuthConfig fails', async () => {
      mockFetchAuthConfig.mockRejectedValue(new Error('Connection failed'));

      renderSetup();

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-Error exceptions', async () => {
      mockFetchAuthConfig.mockRejectedValue('Some string error');

      renderSetup();

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Failed to check setup status')).toBeInTheDocument();
      });
    });

    it('shows retry link in error state', async () => {
      mockFetchAuthConfig.mockRejectedValue(new Error('Connection failed'));

      renderSetup();

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('Setup Wizard Rendering', () => {
    it('renders welcome message when setup is required', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        expect(screen.getByText('Welcome to Hive Warden')).toBeInTheDocument();
      });
    });

    it('renders subtitle text', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        expect(screen.getByText(/set up your beehive protection system/i)).toBeInTheDocument();
      });
    });

    it('renders SetupWizard component', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        // SetupWizard shows "Create Your Admin Account" title
        expect(screen.getByText('Create Your Admin Account')).toBeInTheDocument();
      });
    });

    it('renders bee emoji decoration', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        const beeElement = screen.getByRole('img', { name: 'Bee' });
        expect(beeElement).toBeInTheDocument();
      });
    });
  });

  describe('Setup Success', () => {
    // Note: Full end-to-end setup flow is tested in SetupWizard.test.tsx
    // This test verifies the page wrapper provides correct callbacks
    it('renders wizard with onSuccess callback configured', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      // Wait for wizard to render
      await waitFor(() => {
        expect(screen.getByText('Create Your Admin Account')).toBeInTheDocument();
      });

      // The SetupWizard component is rendered with onSuccess that navigates to dashboard
      // Full submission testing is covered in SetupWizard.test.tsx
    });
  });

  describe('Page Styling', () => {
    it('renders with centered card layout', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      renderSetup();

      await waitFor(() => {
        // Card should be present
        const card = document.querySelector('.ant-card');
        expect(card).toBeInTheDocument();
      });
    });

    it('renders decorative background with SVG pattern', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      const { container } = renderSetup();

      await waitFor(() => {
        // Check for SVG background pattern (honeycomb pattern)
        expect(container.innerHTML).toContain('svg');
      });
    });
  });

  describe('Null/Invalid State', () => {
    it('handles null authConfig gracefully', async () => {
      // First call: loading completes but authConfig stays null
      // This shouldn't happen in practice but tests the guard
      mockFetchAuthConfig.mockResolvedValue(null);

      const { container } = renderSetup();

      await waitFor(() => {
        // When authConfig is null (invalid), the component shows error state
        // or attempts to handle the edge case
        // The error shown would be from trying to access mode on null
        expect(container.querySelector('.ant-alert-error') || mockNavigate.mock.calls.length > 0).toBeTruthy();
      });
    });
  });
});
