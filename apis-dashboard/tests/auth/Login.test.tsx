/**
 * Tests for Login page component (Basic Tests)
 *
 * These are basic smoke tests for the Login page.
 * Comprehensive tests for dual-mode auth are in tests/pages/Login.test.tsx.
 *
 * The Login page now supports dual-mode authentication:
 * - Local mode: Email/password form
 * - Keycloak mode: SSO button
 *
 * Updated for Epic 15, Story 15.6: Login Page & Callback Integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock fetchAuthConfig to return Keycloak mode by default
const mockFetchAuthConfig = vi.fn();
vi.mock('../../src/config', () => ({
  DEV_MODE: false,
  fetchAuthConfig: () => mockFetchAuthConfig(),
  API_URL: 'http://localhost:3000/api',
}));

// Mock the loginWithReturnTo function from providers
const mockLoginWithReturnTo = vi.fn();
vi.mock('../../src/providers', () => ({
  loginWithReturnTo: (returnTo?: string) => mockLoginWithReturnTo(returnTo),
}));

// Mock Refine's useLogin hook for local mode tests
const mockLogin = vi.fn();
vi.mock('@refinedev/core', () => ({
  useLogin: () => ({
    mutate: mockLogin,
    isLoading: false,
  }),
}));

// Import after mocks
import { Login } from '../../src/pages/Login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (
  ui: React.ReactElement,
  { initialEntries = ['/login'] } = {}
) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConfigProvider theme={apisTheme}>
          {ui}
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to Keycloak mode
    mockFetchAuthConfig.mockResolvedValue({
      mode: 'keycloak',
      keycloak_authority: 'https://keycloak.example.com/realms/honeybee',
      client_id: 'apis-dashboard',
    });
  });

  it('renders the Hive Warden brand name', async () => {
    await act(async () => {
      renderWithProviders(<Login />);
    });
    expect(screen.getByText('Hive Warden')).toBeInTheDocument();
  });

  it('renders the login button in Keycloak mode', async () => {
    await act(async () => {
      renderWithProviders(<Login />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
    });
  });

  it('renders the subtitle', async () => {
    await act(async () => {
      renderWithProviders(<Login />);
    });
    expect(screen.getByText('Secure authentication via your identity provider.')).toBeInTheDocument();
  });

  it('renders the SSO title', async () => {
    await act(async () => {
      renderWithProviders(<Login />);
    });
    expect(screen.getByText('Sign in to Hive Warden')).toBeInTheDocument();
  });

  it('renders local mode subtitle in local mode', async () => {
    mockFetchAuthConfig.mockResolvedValue({
      mode: 'local',
      setup_required: false,
    });

    await act(async () => {
      renderWithProviders(<Login />);
    });

    await waitFor(() => {
      expect(screen.getByText('Log in to manage your apiary locally.')).toBeInTheDocument();
    });
  });
});
