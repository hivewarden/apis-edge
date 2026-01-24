/**
 * Tests for Callback page component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { Callback } from '../../src/pages/Callback';

// Mock userManager
const mockSigninRedirectCallback = vi.fn();
vi.mock('../../src/providers', () => ({
  userManager: {
    signinRedirectCallback: () => mockSigninRedirectCallback(),
  },
}));

const renderWithProviders = (
  initialEntries = ['/callback']
) => {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ConfigProvider theme={apisTheme}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </ConfigProvider>
    </MemoryRouter>
  );
};

describe('Callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while processing', async () => {
    // Make callback hang
    mockSigninRedirectCallback.mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByText(/completing sign in/i)).toBeInTheDocument();
  });

  it('redirects to dashboard on successful callback', async () => {
    mockSigninRedirectCallback.mockResolvedValue({
      profile: { sub: 'user123' },
    });

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('shows error message on callback failure', async () => {
    mockSigninRedirectCallback.mockRejectedValue(new Error('Authentication failed'));

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    });
  });
});
