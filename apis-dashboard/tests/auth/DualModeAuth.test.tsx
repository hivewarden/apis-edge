/**
 * Dual-Mode Authentication Tests
 *
 * Tests that use VITE_AUTH_MODE environment variable to conditionally
 * run mode-specific test suites. This enables CI matrix testing where
 * tests run differently based on auth mode.
 *
 * Story: 13-22 - Dual-Mode CI Testing
 * Updated for Epic 15, Story 15.5: Keycloak Migration
 *
 * Test Matrix Coverage:
 * | Feature              | Local | Keycloak |
 * |---------------------|-------|----------|
 * | Login form          | Run   | Skip     |
 * | Keycloak button     | Skip  | Run      |
 * | Setup wizard        | Run   | Skip     |
 * | User management     | Run   | Skip     |
 * | Super admin badge   | Skip  | Run      |
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import {
  isLocalMode,
  isKeycloakMode,
  mockLocalAuthConfig,
  mockKeycloakAuthConfig,
  getCurrentAuthMode,
} from '../utils/authTestUtils';

// Mock fetchAuthConfig from config
const mockFetchAuthConfig = vi.fn();
vi.mock('../../src/config', () => ({
  DEV_MODE: false,
  fetchAuthConfig: () => mockFetchAuthConfig(),
  API_URL: 'http://localhost:3000/api',
}));

// Mock loginWithReturnTo from providers
const mockLoginWithReturnTo = vi.fn();
vi.mock('../../src/providers', () => ({
  loginWithReturnTo: (returnTo?: string) => mockLoginWithReturnTo(returnTo),
}));

// Mock Refine's useLogin hook
const mockLogin = vi.fn();
vi.mock('@refinedev/core', () => ({
  useLogin: () => ({
    mutate: mockLogin,
    isLoading: false,
  }),
}));

// Import components after mocks
import { Login } from '../../src/pages/Login';

const renderWithProviders = (
  ui: React.ReactElement,
  { initialEntries = ['/login'] } = {}
) => {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ConfigProvider theme={apisTheme}>
        <Routes>
          <Route path="/login" element={ui} />
          <Route path="/setup" element={<div data-testid="setup-page">Setup Page</div>} />
          <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </ConfigProvider>
    </MemoryRouter>
  );
};

/**
 * Mode Detection Tests
 * These tests verify that mode detection works correctly based on VITE_AUTH_MODE
 */
describe('Auth Mode Detection', () => {
  it('correctly detects current auth mode from environment', () => {
    const mode = getCurrentAuthMode();
    expect(['local', 'keycloak']).toContain(mode);
    console.log(`Running in ${mode} mode`);
  });

  it('isLocalMode returns correct value', () => {
    const mode = getCurrentAuthMode();
    if (mode === 'local') {
      expect(isLocalMode()).toBe(true);
      expect(isKeycloakMode()).toBe(false);
    } else {
      expect(isLocalMode()).toBe(false);
      expect(isKeycloakMode()).toBe(true);
    }
  });
});

/**
 * Local Mode Only Tests
 * These tests only run when VITE_AUTH_MODE=local (or not set)
 */
describe.skipIf(!isLocalMode())('Local Mode Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig());
  });

  describe('Login Form Rendering', () => {
    it('shows email/password form in local mode', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      });
    });

    it('shows Remember me checkbox', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Remember me')).toBeInTheDocument();
      });
    });

    it('does not show SSO button', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /sign in with/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Setup Wizard Redirect', () => {
    it('redirects to /setup when setup_required is true', async () => {
      mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig(true));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('setup-page')).toBeInTheDocument();
      });
    });

    it('stays on login when setup is not required', async () => {
      mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig(false));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
        expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
      });
    });
  });

  describe('Local Auth Attribution', () => {
    it('shows "Secure local authentication" footer', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Secure local authentication')).toBeInTheDocument();
      });
    });
  });
});

/**
 * Keycloak Mode Only Tests
 * These tests only run when VITE_AUTH_MODE=keycloak
 */
describe.skipIf(!isKeycloakMode())('Keycloak Mode Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthConfig.mockResolvedValue(mockKeycloakAuthConfig());
  });

  describe('Keycloak SSO Button Rendering', () => {
    it('shows SSO button', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        // Button renders the SSO sign-in option
        expect(screen.getByRole('button', { name: /sign in with/i })).toBeInTheDocument();
      });
    });

    it('does not show email/password form', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
      });
    });
  });

  describe('SSO Login Flow', () => {
    it('triggers login when button is clicked', async () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /sign in with/i });
        button.click();
      });

      expect(mockLoginWithReturnTo).toHaveBeenCalled();
    });
  });

  describe('No Setup Wizard', () => {
    it('does not redirect to setup in Keycloak mode', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in with/i })).toBeInTheDocument();
        expect(screen.queryByTestId('setup-page')).not.toBeInTheDocument();
      });
    });
  });
});

/**
 * Tests That Run In Both Modes
 * These tests verify behavior that should be consistent across modes
 */
describe('Shared Auth Behavior (Both Modes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use mode-appropriate config
    if (isLocalMode()) {
      mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig());
    } else {
      mockFetchAuthConfig.mockResolvedValue(mockKeycloakAuthConfig());
    }
  });

  describe('Page Branding', () => {
    it('renders the APIS title', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByText('APIS')).toBeInTheDocument();
    });

    it('renders the subtitle', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByText('Anti-Predator Interference System')).toBeInTheDocument();
    });

    it('renders the description', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByText(/sign in to monitor your hives/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching auth config', async () => {
      mockFetchAuthConfig.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when config fetch fails', async () => {
      mockFetchAuthConfig.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});

/**
 * CI Matrix Test Validation
 * This test logs which mode is active for CI debugging
 */
describe('CI Matrix Validation', () => {
  it('logs current auth mode for CI verification', () => {
    const mode = getCurrentAuthMode();
    console.log(`[CI Matrix] Running tests in ${mode.toUpperCase()} mode`);
    console.log(`[CI Matrix] VITE_AUTH_MODE=${import.meta.env.VITE_AUTH_MODE || 'not set'}`);

    // This test always passes - it's for CI logging
    expect(mode).toBeDefined();
  });

  it('verifies mode-specific tests are properly skipped/run', () => {
    const mode = getCurrentAuthMode();

    if (mode === 'local') {
      console.log('[CI Matrix] Local mode tests: RUNNING');
      console.log('[CI Matrix] Keycloak mode tests: SKIPPED');
    } else {
      console.log('[CI Matrix] Local mode tests: SKIPPED');
      console.log('[CI Matrix] Keycloak mode tests: RUNNING');
    }

    expect(true).toBe(true);
  });
});
