/**
 * Tests for LoginForm Component
 *
 * Tests the email/password login form for local authentication mode.
 * Covers form validation, submission, error handling, and accessibility.
 *
 * Part of Story 13-6: Retrofit Login Page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../../src/theme/apisTheme';

// Mock Refine's useLogin hook
const mockLogin = vi.fn();
vi.mock('@refinedev/core', () => ({
  useLogin: () => ({
    mutate: mockLogin,
    isLoading: false,
  }),
}));

// Import after mocks
import { LoginForm } from '../../../src/components/auth/LoginForm';

const renderLoginForm = (onSuccess = vi.fn()) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      <LoginForm onSuccess={onSuccess} />
    </ConfigProvider>
  );
};

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders email input', () => {
      renderLoginForm();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    });

    it('renders password input', () => {
      renderLoginForm();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });

    it('renders Remember me checkbox', () => {
      renderLoginForm();
      expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
    });

    it('renders Sign In button', () => {
      renderLoginForm();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('email input has autoFocus', () => {
      renderLoginForm();
      const emailInput = screen.getByPlaceholderText('Email');
      expect(emailInput).toHaveFocus();
    });

    it('has proper aria-labels for accessibility', () => {
      renderLoginForm();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows error when email is empty', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter your email')).toBeInTheDocument();
      });
    });

    it('shows error when email format is invalid', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
      });
    });

    it('shows error when password is empty', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter your password')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('calls login with email, password, and rememberMe', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({ success: true });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');
      const rememberMeCheckbox = screen.getByRole('checkbox', { name: /remember me/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(rememberMeCheckbox);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          {
            email: 'test@example.com',
            password: 'password123',
            rememberMe: true,
          },
          expect.any(Object)
        );
      });
    });

    it('calls onSuccess callback on successful login', async () => {
      const user = userEvent.setup();
      const mockOnSuccess = vi.fn();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({ success: true });
      });

      renderLoginForm(mockOnSuccess);

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows "Invalid email or password" for InvalidCredentials error', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({
          success: false,
          error: { name: 'InvalidCredentials', message: 'Invalid credentials' },
        });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });
    });

    it('shows rate limit error for RateLimited error', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({
          success: false,
          error: { name: 'RateLimited', message: 'Too many attempts' },
        });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
      });
    });

    it('shows network error for NetworkError', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({
          success: false,
          error: { name: 'NetworkError', message: 'Network error' },
        });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Unable to connect to server')).toBeInTheDocument();
      });
    });

    it('shows network error when onError is called', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onError?.(new Error('Connection failed'));
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Unable to connect to server')).toBeInTheDocument();
      });
    });

    it('allows dismissing error alert via close button', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({
          success: false,
          error: { name: 'InvalidCredentials', message: 'Invalid email or password' },
        });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });

      // Click the close button on the alert
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument();
      });
    });

    it('clears error when user starts typing', async () => {
      const user = userEvent.setup();
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({
          success: false,
          error: { name: 'InvalidCredentials', message: 'Invalid email or password' },
        });
      });

      renderLoginForm();

      const emailInput = screen.getByPlaceholderText('Email');
      const passwordInput = screen.getByPlaceholderText('Password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });

      // Type in the email field to trigger error clearing
      await user.type(emailInput, 'x');

      await waitFor(() => {
        expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument();
      });
    });
  });
});
