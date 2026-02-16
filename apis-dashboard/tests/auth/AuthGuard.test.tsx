/**
 * Tests for AuthGuard component
 *
 * AuthGuard now uses Refine's useIsAuthenticated hook for mode-agnostic auth checks.
 * Tests mock the Refine hook to control authentication state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { AuthGuard } from '../../src/components/auth/AuthGuard';

// Mock Refine's useIsAuthenticated hook
const mockUseIsAuthenticated = vi.fn();
vi.mock('@refinedev/core', () => ({
  useIsAuthenticated: () => mockUseIsAuthenticated(),
}));

// Mock config for DEV_MODE (default to false)
vi.mock('../../src/config', () => ({
  DEV_MODE: false,
}));

const renderWithProviders = (
  ui: React.ReactElement,
  { initialEntries = ['/protected'] } = {}
) => {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ConfigProvider theme={apisTheme}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/protected"
            element={
              <AuthGuard>
                <div>Protected Content</div>
              </AuthGuard>
            }
          />
        </Routes>
      </ConfigProvider>
    </MemoryRouter>
  );
};

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while checking authentication', async () => {
    // Simulate loading state
    mockUseIsAuthenticated.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    await act(async () => {
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );
    });

    expect(screen.getByText(/checking authentication/i)).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    mockUseIsAuthenticated.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
    });

    await act(async () => {
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('redirects to login when authentication check fails', async () => {
    mockUseIsAuthenticated.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
    });

    await act(async () => {
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('renders children when authenticated', async () => {
    mockUseIsAuthenticated.mockReturnValue({
      data: { authenticated: true },
      isLoading: false,
    });

    await act(async () => {
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to login with returnTo parameter', async () => {
    mockUseIsAuthenticated.mockReturnValue({
      data: { authenticated: false },
      isLoading: false,
    });

    await act(async () => {
      renderWithProviders(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>,
        { initialEntries: ['/protected?foo=bar'] }
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });
});
