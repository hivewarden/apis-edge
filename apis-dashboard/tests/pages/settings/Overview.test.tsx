/**
 * Tests for Settings Overview Tab
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Overview } from '../../../src/pages/settings/Overview';

// Mock the useTenantSettings hook while preserving utility functions
vi.mock('../../../src/hooks/useTenantSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/hooks/useTenantSettings')>();
  return {
    ...actual,
    useTenantSettings: vi.fn(),
  };
});

import { useTenantSettings } from '../../../src/hooks/useTenantSettings';

const mockSettings = {
  tenant: {
    id: 'tenant-123',
    name: 'Test Apiary',
    plan: 'professional',
    created_at: '2024-01-15T10:00:00Z',
  },
  usage: {
    hive_count: 8,
    unit_count: 2,
    user_count: 3,
    storage_bytes: 512 * 1024 * 1024,
  },
  limits: {
    max_hives: 10,
    max_units: 5,
    max_users: 5,
    max_storage_bytes: 1024 * 1024 * 1024,
  },
  percentages: {
    hives_percent: 80,
    units_percent: 40,
    users_percent: 60,
    storage_percent: 50,
  },
};

describe('Settings Overview Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading skeleton while fetching', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    // Skeleton should be visible
    expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
  });

  it('displays error message on fetch failure', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: null,
      loading: false,
      error: new Error('Failed to fetch'),
      refresh: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('Failed to Load Settings')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('displays tenant information', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: mockSettings,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('Test Apiary')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('displays resource usage section', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: mockSettings,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('Resource Usage')).toBeInTheDocument();
    expect(screen.getByText('Hives')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('shows warning when resources approach limits', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: mockSettings, // hives_percent is 80
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    expect(screen.getByText('Approaching Limits')).toBeInTheDocument();
  });

  it('does not show warning when all usage is below 80%', () => {
    const lowUsageSettings = {
      ...mockSettings,
      percentages: {
        hives_percent: 50,
        units_percent: 40,
        users_percent: 30,
        storage_percent: 20,
      },
    };

    vi.mocked(useTenantSettings).mockReturnValue({
      settings: lowUsageSettings,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    expect(screen.queryByText('Approaching Limits')).not.toBeInTheDocument();
  });

  it('displays plan with correct color coding', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: mockSettings,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    // The plan tag should be rendered
    const planTag = screen.getByText('Professional');
    expect(planTag.closest('.ant-tag')).toBeInTheDocument();
  });

  it('formats creation date correctly', () => {
    vi.mocked(useTenantSettings).mockReturnValue({
      settings: mockSettings,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<Overview />);

    // The date should be formatted (exact format depends on locale)
    // Check for year at minimum
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });
});
