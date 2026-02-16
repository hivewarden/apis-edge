/**
 * Tests for Settings Profile Tab
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 *
 * Covers:
 * - Profile info display
 * - Name editing in local mode
 * - Password change form (local mode only)
 * - SaaS mode restrictions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from '../../../src/pages/settings/Profile';

// Mock useAuth hook
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock useTenantSettings hook
vi.mock('../../../src/hooks/useTenantSettings', () => ({
  useUpdateProfile: vi.fn(),
}));

// Mock apiClient
vi.mock('../../../src/providers/apiClient', () => ({
  apiClient: {
    put: vi.fn(),
  },
}));

// Mock theme
vi.mock('../../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#f5a623',
    error: '#ff4d4f',
    warning: '#faad14',
    success: '#52c41a',
  },
}));

// Mock notification
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    notification: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

import { useAuth } from '../../../src/hooks/useAuth';
import { useUpdateProfile } from '../../../src/hooks/useTenantSettings';
import { apiClient } from '../../../src/providers/apiClient';
import { notification } from 'antd';

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
};

describe('Settings Profile Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
      authConfig: { mode: 'local', requiresSetup: false },
    });

    vi.mocked(useUpdateProfile).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue({ ...mockUser }),
      updating: false,
    });
  });

  describe('Loading State', () => {
    it('displays loading spinner while fetching user', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
        authConfig: null,
      });

      render(<Profile isLocalMode={true} />);

      expect(screen.getByText('Loading profile...')).toBeInTheDocument();
    });
  });

  describe('Not Signed In State', () => {
    it('displays sign in message when no user', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
        authConfig: null,
      });

      render(<Profile isLocalMode={true} />);

      expect(screen.getByText('Not Signed In')).toBeInTheDocument();
      expect(screen.getByText('Please sign in to view your profile.')).toBeInTheDocument();
    });
  });

  describe('Profile Display', () => {
    it('displays user name and email', () => {
      render(<Profile isLocalMode={true} />);

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('displays Profile Information heading', () => {
      render(<Profile isLocalMode={true} />);

      expect(screen.getByText('Profile Information')).toBeInTheDocument();
    });
  });

  describe('Local Mode Features', () => {
    it('shows Edit button for name in local mode', () => {
      render(<Profile isLocalMode={true} />);

      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('shows password change section in local mode', () => {
      render(<Profile isLocalMode={true} />);

      // Check for the Change Password heading (there's also a button with the same text)
      const headings = screen.getAllByText('Change Password');
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });

    it('allows editing display name', async () => {
      const mockUpdateProfile = vi.fn().mockResolvedValue({ ...mockUser, name: 'New Name' });
      vi.mocked(useUpdateProfile).mockReturnValue({
        updateProfile: mockUpdateProfile,
        updating: false,
      });

      render(<Profile isLocalMode={true} />);

      // Click Edit button
      fireEvent.click(screen.getByText('Edit'));

      // Should show form
      expect(screen.getByPlaceholderText('Enter your display name')).toBeInTheDocument();

      // Enter new name
      const input = screen.getByPlaceholderText('Enter your display name');
      await userEvent.clear(input);
      await userEvent.type(input, 'New Name');

      // Click Save
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'New Name' });
      });
    });

    it('can cancel name editing', async () => {
      render(<Profile isLocalMode={true} />);

      // Click Edit button
      fireEvent.click(screen.getByText('Edit'));

      // Should show form
      expect(screen.getByPlaceholderText('Enter your display name')).toBeInTheDocument();

      // Click Cancel
      fireEvent.click(screen.getByText('Cancel'));

      // Should no longer show form
      expect(screen.queryByPlaceholderText('Enter your display name')).not.toBeInTheDocument();
    });

    it('renders password change form fields', () => {
      render(<Profile isLocalMode={true} />);

      expect(screen.getByPlaceholderText('Enter current password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter new password')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm new password')).toBeInTheDocument();
    });

    it('submits password change successfully', async () => {
      vi.mocked(apiClient.put).mockResolvedValue({ data: {} });

      render(<Profile isLocalMode={true} />);

      // Fill in password fields
      await userEvent.type(screen.getByPlaceholderText('Enter current password'), 'oldpass123');
      await userEvent.type(screen.getByPlaceholderText('Enter new password'), 'newpass456');
      await userEvent.type(screen.getByPlaceholderText('Confirm new password'), 'newpass456');

      // Click Change Password button
      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/auth/change-password', {
          current_password: 'oldpass123',
          new_password: 'newpass456',
        });
      });

      await waitFor(() => {
        expect(notification.success).toHaveBeenCalledWith({
          message: 'Password Changed',
          description: 'Your password has been updated successfully.',
        });
      });
    });
  });

  describe('SaaS Mode Features', () => {
    it('does not show Edit button in SaaS mode', () => {
      render(<Profile isLocalMode={false} />);

      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });

    it('does not show password change section in SaaS mode', () => {
      render(<Profile isLocalMode={false} />);

      expect(screen.queryByText('Change Password')).not.toBeInTheDocument();
    });

    it('shows identity provider message in SaaS mode', () => {
      render(<Profile isLocalMode={false} />);

      expect(screen.getByText('Profile information is managed by your identity provider.')).toBeInTheDocument();
    });

    it('shows password management notice in SaaS mode', () => {
      render(<Profile isLocalMode={false} />);

      expect(screen.getByText('Password Management')).toBeInTheDocument();
      expect(
        screen.getByText(/Password changes and account security are managed by your identity provider/)
      ).toBeInTheDocument();
    });
  });
});
