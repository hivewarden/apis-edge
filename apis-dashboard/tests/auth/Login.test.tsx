/**
 * Tests for Login page component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { Login } from '../../src/pages/Login';

// Mock the loginWithReturnTo function from providers
const mockLoginWithReturnTo = vi.fn();
vi.mock('../../src/providers', () => ({
  loginWithReturnTo: (returnTo?: string) => mockLoginWithReturnTo(returnTo),
}));

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
        {ui}
      </ConfigProvider>
    </MemoryRouter>
  );
};

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the APIS title', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('APIS')).toBeInTheDocument();
  });

  it('renders the login button', () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole('button', { name: /sign in with zitadel/i })).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('Anti-Predator Interference System')).toBeInTheDocument();
  });

  it('renders description text', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText(/sign in to monitor your hives/i)).toBeInTheDocument();
  });

  it('renders Zitadel attribution', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText(/secure authentication powered by zitadel/i)).toBeInTheDocument();
  });

  it('calls loginWithReturnTo when button is clicked', async () => {
    mockLoginWithReturnTo.mockResolvedValue(undefined);
    renderWithProviders(<Login />);

    const loginButton = screen.getByRole('button', { name: /sign in with zitadel/i });
    fireEvent.click(loginButton);

    // Login should be called (without returnTo when not in query params)
    expect(mockLoginWithReturnTo).toHaveBeenCalledWith(undefined);
  });

  it('passes returnTo from query params to loginWithReturnTo', async () => {
    mockLoginWithReturnTo.mockResolvedValue(undefined);
    renderWithProviders(<Login />, { initialEntries: ['/login?returnTo=%2Fhives'] });

    const loginButton = screen.getByRole('button', { name: /sign in with zitadel/i });
    fireEvent.click(loginButton);

    // Login should be called with the decoded returnTo
    expect(mockLoginWithReturnTo).toHaveBeenCalledWith('/hives');
  });

  it('shows error alert when login fails', async () => {
    mockLoginWithReturnTo.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<Login />);

    const loginButton = screen.getByRole('button', { name: /sign in with zitadel/i });
    fireEvent.click(loginButton);

    // Wait for error to be displayed
    await screen.findByText('Connection Error');
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows generic error message for non-Error exceptions', async () => {
    mockLoginWithReturnTo.mockRejectedValue('Unknown error');
    renderWithProviders(<Login />);

    const loginButton = screen.getByRole('button', { name: /sign in with zitadel/i });
    fireEvent.click(loginButton);

    // Wait for error to be displayed
    await screen.findByText('Connection Error');
    expect(screen.getByText('Failed to connect to authentication service')).toBeInTheDocument();
  });
});
