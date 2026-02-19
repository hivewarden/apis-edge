/**
 * Tests for OIDCLoginButton Component
 *
 * Tests the single sign-on button for OIDC authentication.
 * Covers button rendering, click handling, error states, and retry capability.
 *
 * Part of Story 13-6: Retrofit Login Page
 * Updated for Epic 15, Story 15.6: Login Page & Callback Integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../../src/theme/apisTheme';

// Mock loginWithReturnTo from providers
const mockLoginWithReturnTo = vi.fn();
vi.mock('../../../src/providers', () => ({
  loginWithReturnTo: (returnTo?: string) => mockLoginWithReturnTo(returnTo),
}));

// Import after mocks
import { OIDCLoginButton } from '../../../src/components/auth/OIDCLoginButton';

const renderOIDCButton = (returnTo?: string) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      <OIDCLoginButton returnTo={returnTo} />
    </ConfigProvider>
  );
};

describe('OIDCLoginButton Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the SSO login button', () => {
      renderOIDCButton();
      expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
    });

    it('has proper aria-label for accessibility', () => {
      renderOIDCButton();
      expect(screen.getByLabelText('Sign in with SSO')).toBeInTheDocument();
    });

    it('does not show error alert initially', () => {
      renderOIDCButton();
      expect(screen.queryByText('Connection Error')).not.toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('calls loginWithReturnTo when clicked', async () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith(undefined);
    });

    it('passes returnTo to loginWithReturnTo', async () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);
      renderOIDCButton('/dashboard');

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith('/dashboard');
    });

    it('shows loading state when clicked', async () => {
      // Create a promise that won't resolve immediately
      let resolveLogin: () => void;
      const loginPromise = new Promise<void>((resolve) => {
        resolveLogin = resolve;
      });
      mockLoginWithReturnTo.mockReturnValue(loginPromise);

      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      // Button should show loading text
      expect(screen.getByText('Connecting...')).toBeInTheDocument();

      // Resolve the promise
      resolveLogin!();
      await waitFor(() => {
        expect(screen.getByText('Sign in with SSO')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error alert when login fails with Error', async () => {
      mockLoginWithReturnTo.mockRejectedValue(new Error('Authentication failed'));
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Authentication failed')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-Error exceptions', async () => {
      mockLoginWithReturnTo.mockRejectedValue('Unknown error');
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Failed to connect to authentication service')).toBeInTheDocument();
      });
    });

    it('shows retry button when error occurs', async () => {
      mockLoginWithReturnTo.mockRejectedValue(new Error('Network error'));
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('resets loading state after error', async () => {
      mockLoginWithReturnTo.mockRejectedValue(new Error('Network error'));
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Sign in with SSO')).toBeInTheDocument();
      });
    });
  });

  describe('Retry Functionality', () => {
    it('allows retry after error', async () => {
      mockLoginWithReturnTo.mockRejectedValueOnce(new Error('First attempt failed'));
      mockLoginWithReturnTo.mockResolvedValueOnce(undefined);

      renderOIDCButton();

      // First click fails
      const loginButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('First attempt failed')).toBeInTheDocument();
      });

      // Retry succeeds
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockLoginWithReturnTo).toHaveBeenCalledTimes(2);
    });

    it('clears error when retry is clicked', async () => {
      mockLoginWithReturnTo.mockRejectedValueOnce(new Error('First attempt failed'));
      mockLoginWithReturnTo.mockResolvedValueOnce(undefined);

      renderOIDCButton();

      // First click fails
      const loginButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('First attempt failed')).toBeInTheDocument();
      });

      // Click retry - error should clear
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      // Wait for the error to be cleared (it's cleared before the new request)
      await waitFor(() => {
        expect(screen.queryByText('First attempt failed')).not.toBeInTheDocument();
      });
    });

    it('can show new error after failed retry', async () => {
      mockLoginWithReturnTo.mockRejectedValueOnce(new Error('First error'));
      mockLoginWithReturnTo.mockRejectedValueOnce(new Error('Second error'));

      renderOIDCButton();

      // First click fails
      const loginButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      // Retry also fails with different error
      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Second error')).toBeInTheDocument();
      });
    });
  });

  describe('returnTo Parameter', () => {
    it('passes undefined when no returnTo provided', () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);
      renderOIDCButton();

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith(undefined);
    });

    it('passes returnTo path correctly', () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);
      renderOIDCButton('/hives/123');

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith('/hives/123');
    });
  });
});
