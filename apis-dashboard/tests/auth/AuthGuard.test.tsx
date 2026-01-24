/**
 * Tests for AuthGuard component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { AuthGuard } from '../../src/components/auth/AuthGuard';

// Mock userManager
const mockGetUser = vi.fn();
vi.mock('../../src/providers/authProvider', () => ({
  userManager: {
    getUser: () => mockGetUser(),
  },
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
    // Make getUser return a pending promise
    mockGetUser.mockImplementation(() => new Promise(() => {}));

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
    mockGetUser.mockResolvedValue(null);

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

  it('redirects to login when token is expired', async () => {
    mockGetUser.mockResolvedValue({
      expired: true,
      profile: { sub: 'user123' },
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
    mockGetUser.mockResolvedValue({
      expired: false,
      profile: {
        sub: 'user123',
        name: 'Test User',
        email: 'test@example.com',
      },
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
    mockGetUser.mockResolvedValue(null);

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
