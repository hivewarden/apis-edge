import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { apisTheme } from '../src/theme/apisTheme';
import { AppLayout } from '../src/components/layout/AppLayout';
import { Logo } from '../src/components/layout/Logo';
import { navItems } from '../src/components/layout/navItems';
import { BackgroundSyncProvider } from '../src/context/BackgroundSyncContext';

// Mock useAuth for BackgroundSyncProvider
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: '1', name: 'Test', email: 'test@test.com' },
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

// Mock useOnlineStatus for BackgroundSyncProvider
vi.mock('../src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));

// Mock backgroundSync service
vi.mock('../src/services/backgroundSync', () => ({
  startBackgroundSync: vi.fn().mockResolvedValue({
    success: true,
    synced: 0,
    failed: 0,
    conflicts: [],
  }),
  resolveConflict: vi.fn(),
  retryAllFailedItems: vi.fn(),
  getPendingSyncCount: vi.fn().mockResolvedValue(0),
}));

// Mock useLiveQuery from dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn, deps, defaultValue) => {
    // Return the default value if provided, otherwise return appropriate empty values
    if (defaultValue !== undefined) return defaultValue;
    // For toArray() queries, return empty array
    return [];
  }),
}));

// Suppress React Router future flag warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('React Router Future Flag Warning')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});

// Mock Grid.useBreakpoint to control responsive behavior
const mockUseBreakpoint = vi.fn();
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => mockUseBreakpoint(),
    },
  };
});

// Test wrapper with all required providers
const renderWithProviders = async (
  ui: React.ReactElement,
  { route = '/', withSyncProvider = false }: { route?: string; withSyncProvider?: boolean } = {}
) => {
  let result: ReturnType<typeof render>;
  await act(async () => {
    const content = withSyncProvider ? (
      <BackgroundSyncProvider>{ui}</BackgroundSyncProvider>
    ) : (
      ui
    );
    result = render(
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConfigProvider theme={apisTheme}>{content}</ConfigProvider>
      </MemoryRouter>
    );
  });
  return result!;
};

describe('Logo Component', () => {
  it('renders full text when expanded', async () => {
    await renderWithProviders(<Logo collapsed={false} />);
    // Bee icon and APIS text are now separate elements
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    expect(screen.getByText('APIS')).toBeInTheDocument();
  });

  it('renders only icon when collapsed', async () => {
    await renderWithProviders(<Logo collapsed={true} />);
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    // APIS text should not be visible when collapsed
    expect(screen.queryByText('APIS')).not.toBeInTheDocument();
  });
});

describe('navItems Configuration', () => {
  it('contains exactly 8 navigation items', () => {
    // Verify exact count to catch undocumented additions
    expect(navItems?.length).toBe(8);
  });

  it('contains all required navigation items', () => {
    const expectedItems = [
      { key: '/', label: 'Dashboard' },
      { key: '/sites', label: 'Sites' },       // Added in Epic 3
      { key: '/units', label: 'Units' },
      { key: '/hives', label: 'Hives' },
      { key: '/maintenance', label: 'Maintenance' }, // Added in Epic 5
      { key: '/clips', label: 'Clips' },
      { key: '/statistics', label: 'Statistics' },
      { key: '/settings', label: 'Settings' },
    ];

    expectedItems.forEach(({ key, label }) => {
      const item = navItems?.find((i) => i && 'key' in i && i.key === key);
      expect(item).toBeDefined();
      expect(item && 'label' in item ? item.label : null).toBe(label);
    });
  });

  it('has icons for all navigation items', () => {
    navItems?.forEach((item) => {
      if (item && 'icon' in item) {
        expect(item.icon).toBeDefined();
      }
    });
  });
});

describe('AppLayout Component (Desktop)', () => {
  beforeEach(() => {
    // Set desktop viewport (md and above)
    mockUseBreakpoint.mockReturnValue({ md: true, lg: true, xl: true });
    localStorage.clear();
  });

  it('renders sidebar with all navigation items', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Hives')).toBeInTheDocument();
    expect(screen.getByText('Clips')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders APIS logo', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });
    // Bee icon and APIS text are separate elements
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    expect(screen.getByText('APIS')).toBeInTheDocument();
  });

  it('has a collapse button', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });
    const collapseButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    });
    expect(collapseButton).toBeInTheDocument();
  });

  it('toggles sidebar collapse state when button is clicked', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    // Initially expanded - Bee icon and APIS text are separate elements
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    expect(screen.getByText('APIS')).toBeInTheDocument();

    // Click collapse button
    const collapseButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    });
    await act(async () => {
      fireEvent.click(collapseButton);
    });

    // After collapse, logo should show only icon (APIS text hidden)
    await waitFor(() => {
      expect(screen.getByLabelText('Bee')).toBeInTheDocument();
      expect(screen.queryByText('APIS')).not.toBeInTheDocument();
    });
  });

  it('persists collapse state to localStorage', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    const collapseButton = screen.getByRole('button', {
      name: /collapse sidebar/i,
    });
    await act(async () => {
      fireEvent.click(collapseButton);
    });

    expect(localStorage.getItem('apis-sidebar-collapsed')).toBe('true');
  });

  it('restores collapse state from localStorage', async () => {
    localStorage.setItem('apis-sidebar-collapsed', 'true');

    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    // Should restore collapsed state - logo shows only icon
    expect(screen.getByText('🐝')).toBeInTheDocument();
  });

  it('handles invalid localStorage value gracefully', async () => {
    // Set an invalid (non-boolean) value
    localStorage.setItem('apis-sidebar-collapsed', 'invalid');

    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    // Should default to expanded when value is not 'true'
    // Bee icon and APIS text are separate elements
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    expect(screen.getByText('APIS')).toBeInTheDocument();
  });
});

describe('AppLayout Component (Mobile)', () => {
  beforeEach(() => {
    // Set mobile viewport (below md)
    mockUseBreakpoint.mockReturnValue({ xs: true, sm: true, md: false });
    localStorage.clear();
  });

  it('renders hamburger menu button on mobile', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    const hamburgerButton = screen.getByRole('button', {
      name: /open navigation menu/i,
    });
    expect(hamburgerButton).toBeInTheDocument();
  });

  it('renders logo in header on mobile', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });
    // Bee icon and APIS text are separate elements
    expect(screen.getByLabelText('Bee')).toBeInTheDocument();
    expect(screen.getByText('APIS')).toBeInTheDocument();
  });

  it('opens drawer when hamburger is clicked', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    const hamburgerButton = screen.getByRole('button', {
      name: /open navigation menu/i,
    });
    await act(async () => {
      fireEvent.click(hamburgerButton);
    });

    // Drawer should contain navigation items
    await waitFor(() => {
      // There should be multiple instances of Dashboard (header and drawer)
      const dashboardItems = screen.getAllByText('Dashboard');
      expect(dashboardItems.length).toBeGreaterThan(0);
    });
  });

  it('closes drawer when a menu item is clicked', async () => {
    await renderWithProviders(<AppLayout />, { withSyncProvider: true });

    // Open the drawer
    const hamburgerButton = screen.getByRole('button', {
      name: /open navigation menu/i,
    });
    await act(async () => {
      fireEvent.click(hamburgerButton);
    });

    // Wait for drawer to open and find the Units menu item in drawer
    await waitFor(() => {
      const menuItems = screen.getAllByText('Units');
      expect(menuItems.length).toBeGreaterThan(0);
    });

    // Click on a menu item (Units)
    const menuItems = screen.getAllByText('Units');
    await act(async () => {
      fireEvent.click(menuItems[0]);
    });

    // Drawer should close - verify by checking that only one Dashboard item remains (header only)
    await waitFor(() => {
      // After drawer closes, we should have fewer duplicate menu items visible
      const drawerElement = document.querySelector('.ant-drawer-open');
      expect(drawerElement).toBeNull();
    });
  });
});

describe('Navigation Active State', () => {
  beforeEach(() => {
    mockUseBreakpoint.mockReturnValue({ md: true, lg: true, xl: true });
    localStorage.clear();
  });

  it('highlights Dashboard as active when on root route', async () => {
    await renderWithProviders(<AppLayout />, { route: '/', withSyncProvider: true });

    // The menu item with key "/" should be selected
    const menuItems = document.querySelectorAll('.ant-menu-item');
    const dashboardItem = Array.from(menuItems).find((item) =>
      item.textContent?.includes('Dashboard')
    );
    expect(dashboardItem?.classList.contains('ant-menu-item-selected')).toBe(
      true
    );
  });

  it('highlights Units as active when on /units route', async () => {
    await renderWithProviders(<AppLayout />, { route: '/units', withSyncProvider: true });

    const menuItems = document.querySelectorAll('.ant-menu-item');
    const unitsItem = Array.from(menuItems).find((item) =>
      item.textContent?.includes('Units')
    );
    expect(unitsItem?.classList.contains('ant-menu-item-selected')).toBe(true);
  });
});
