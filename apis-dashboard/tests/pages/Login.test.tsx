/**
 * Tests for Login Page
 *
 * Comprehensive tests for the dual-mode Login page supporting:
 * - Local mode: Email/password form (LoginForm)
 * - Keycloak mode: SSO button (OIDCLoginButton)
 * - Setup redirect when setup_required
 * - Form validation and error handling
 * - Successful login redirect
 *
 * Part of Story 13-6: Retrofit Login Page
 * Updated for Epic 15, Story 15.6: Login Page & Callback Integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';

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

// Import after mocks
import { Login } from '../../src/pages/Login';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { OIDCLoginButton } from '../../src/components/auth/OIDCLoginButton';

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
          <Route path="/setup" element={<div>Setup Page</div>} />
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/hives" element={<div>Hives Page</div>} />
        </Routes>
      </ConfigProvider>
    </MemoryRouter>
  );
};

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching auth config', async () => {
      // Mock a pending promise
      mockFetchAuthConfig.mockImplementation(() => new Promise(() => {}));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
    });
  });

  describe('Local Mode', () => {
    beforeEach(() => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: false,
      });
    });

    it('shows email/password form when mode is local', async () => {
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

    it('shows Sign In button', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      });
    });

    it('shows "Secure local authentication" footer', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Secure local authentication')).toBeInTheDocument();
      });
    });

    it('does not show SSO button in local mode', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.queryByText('Sign in with SSO')).not.toBeInTheDocument();
      });
    });
  });

  describe('Keycloak (SaaS) Mode', () => {
    beforeEach(() => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'keycloak',
        keycloak_authority: 'https://keycloak.example.com/realms/honeybee',
        client_id: 'test-client-id',
      });
    });

    it('shows SSO button when mode is keycloak', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });
    });

    it('shows authentication attribution footer', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Secure authentication via your identity provider.')).toBeInTheDocument();
      });
    });

    it('does not show email/password form in Keycloak mode', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
      });
    });

    it('calls loginWithReturnTo when SSO button is clicked', async () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith(undefined);
    });

    it('passes returnTo from URL to loginWithReturnTo', async () => {
      mockLoginWithReturnTo.mockResolvedValue(undefined);

      await act(async () => {
        renderWithProviders(<Login />, { initialEntries: ['/login?returnTo=%2Fhives'] });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      expect(mockLoginWithReturnTo).toHaveBeenCalledWith('/hives');
    });

    it('shows error when SSO login fails', async () => {
      mockLoginWithReturnTo.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });

      const button = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Setup Redirect', () => {
    it('redirects to /setup when setup_required is true', async () => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: true,
      });

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Setup Page')).toBeInTheDocument();
      });
    });
  });

  describe('Config Error Handling', () => {
    it('shows error message when config fetch fails', async () => {
      mockFetchAuthConfig.mockRejectedValue(new Error('Failed to fetch'));

      await act(async () => {
        renderWithProviders(<Login />);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
        expect(screen.getByText('Please check your connection and try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Page Branding', () => {
    beforeEach(() => {
      mockFetchAuthConfig.mockResolvedValue({
        mode: 'local',
        setup_required: false,
      });
    });

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

    it('renders the bee emoji', async () => {
      await act(async () => {
        renderWithProviders(<Login />);
      });

      expect(screen.getByRole('img', { name: 'Bee' })).toBeInTheDocument();
    });
  });
});

describe('LoginForm Component', () => {
  const mockOnSuccess = vi.fn();

  const renderLoginForm = () => {
    return render(
      <ConfigProvider theme={apisTheme}>
        <LoginForm onSuccess={mockOnSuccess} />
      </ConfigProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
      mockLogin.mockImplementation((params, options) => {
        options?.onSuccess?.({ success: true });
      });

      renderLoginForm();

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

  describe('Error Messages', () => {
    it('shows "Invalid email or password" for 401 error', async () => {
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
    });

    it('shows rate limit error for 429 error', async () => {
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
        expect(screen.getByText('Too many attempts. Please wait and try again later.')).toBeInTheDocument();
      });
    });

    it('shows network error for connection failures', async () => {
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

    it('allows dismissing error alert', async () => {
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

      // Type in the email field to trigger error clearing via onValuesChange
      await user.type(emailInput, 'x');

      await waitFor(() => {
        expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument();
      });
    });
  });
});

describe('DEV_MODE Behavior', () => {
  it('test covered by separate DEV_MODE test module', () => {
    // DEV_MODE behavior is tested in a separate file where we can properly
    // reset the module with different config values.
    // The Login component auto-redirects when DEV_MODE=true, which requires
    // module re-initialization with mocked DEV_MODE=true.
    expect(true).toBe(true);
  });
});

describe('OIDCLoginButton Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderOIDCButton = (returnTo?: string) => {
    return render(
      <ConfigProvider theme={apisTheme}>
        <OIDCLoginButton returnTo={returnTo} />
      </ConfigProvider>
    );
  };

  it('renders the SSO login button', () => {
    renderOIDCButton();
    expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
  });

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

  it('shows error when login fails', async () => {
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
});
