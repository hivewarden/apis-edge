/**
 * Tests for useTenantSettings hook
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTenantSettings, useUpdateProfile, formatStorageSize, getUsageStatus, isWarningZone } from '../../src/hooks/useTenantSettings';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { apiClient } from '../../src/providers/apiClient';

const mockSettings = {
  tenant: {
    id: 'tenant-123',
    name: 'Test Tenant',
    plan: 'professional',
    created_at: '2024-01-15T10:00:00Z',
  },
  usage: {
    hive_count: 8,
    unit_count: 2,
    user_count: 3,
    storage_bytes: 512 * 1024 * 1024, // 512 MB
  },
  limits: {
    max_hives: 10,
    max_units: 5,
    max_users: 5,
    max_storage_bytes: 1024 * 1024 * 1024, // 1 GB
  },
  percentages: {
    hives_percent: 80,
    units_percent: 40,
    users_percent: 60,
    storage_percent: 50,
  },
};

describe('useTenantSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches tenant settings on mount', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: mockSettings },
    });

    const { result } = renderHook(() => useTenantSettings());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.error).toBeNull();
    expect(apiClient.get).toHaveBeenCalledWith('/settings/tenant');
  });

  it('handles fetch error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTenantSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
  });

  it('refresh function fetches fresh data', async () => {
    const initialSettings = { ...mockSettings };
    const updatedSettings = {
      ...mockSettings,
      usage: { ...mockSettings.usage, hive_count: 9 },
      percentages: { ...mockSettings.percentages, hives_percent: 90 },
    };

    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { data: initialSettings } })
      .mockResolvedValueOnce({ data: { data: updatedSettings } });

    const { result } = renderHook(() => useTenantSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings?.usage.hive_count).toBe(8);

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.settings?.usage.hive_count).toBe(9);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('useUpdateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates profile successfully', async () => {
    const mockProfile = {
      id: 'user-123',
      name: 'New Name',
      email: 'test@example.com',
      role: 'admin',
    };

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { data: mockProfile },
    });

    const { result } = renderHook(() => useUpdateProfile());

    expect(result.current.updating).toBe(false);

    let profile;
    await act(async () => {
      profile = await result.current.updateProfile({ name: 'New Name' });
    });

    expect(profile).toEqual(mockProfile);
    expect(apiClient.put).toHaveBeenCalledWith('/settings/profile', { name: 'New Name' });
  });

  it('sets updating state during request', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(apiClient.put).mockReturnValue(pendingPromise as Promise<{ data: { data: unknown } }>);

    const { result } = renderHook(() => useUpdateProfile());

    expect(result.current.updating).toBe(false);

    // Start the update but don't await it
    let updatePromise: Promise<unknown>;
    act(() => {
      updatePromise = result.current.updateProfile({ name: 'Test' });
    });

    // Check that updating is true during request
    expect(result.current.updating).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ data: { data: { id: '1', name: 'Test', email: 'test@test.com', role: 'admin' } } });
      await updatePromise;
    });

    expect(result.current.updating).toBe(false);
  });
});

describe('formatStorageSize', () => {
  it('formats bytes to MB when less than 1 GB', () => {
    expect(formatStorageSize(512 * 1024 * 1024)).toBe('512 MB');
    expect(formatStorageSize(100 * 1024 * 1024)).toBe('100 MB');
  });

  it('formats bytes to GB when 1 GB or more', () => {
    expect(formatStorageSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatStorageSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('handles small values', () => {
    expect(formatStorageSize(1024 * 1024)).toBe('1 MB');
    expect(formatStorageSize(0)).toBe('0 MB');
  });
});

describe('getUsageStatus', () => {
  it('returns success for low usage', () => {
    expect(getUsageStatus(0)).toBe('success');
    expect(getUsageStatus(50)).toBe('success');
    expect(getUsageStatus(79)).toBe('success');
  });

  it('returns normal for warning zone (80-94%)', () => {
    expect(getUsageStatus(80)).toBe('normal');
    expect(getUsageStatus(90)).toBe('normal');
    expect(getUsageStatus(94)).toBe('normal');
  });

  it('returns exception for critical zone (95%+)', () => {
    expect(getUsageStatus(95)).toBe('exception');
    expect(getUsageStatus(100)).toBe('exception');
  });
});

describe('isWarningZone', () => {
  it('returns false for low usage', () => {
    expect(isWarningZone(0)).toBe(false);
    expect(isWarningZone(50)).toBe(false);
    expect(isWarningZone(79)).toBe(false);
  });

  it('returns true for warning zone (80-94%)', () => {
    expect(isWarningZone(80)).toBe(true);
    expect(isWarningZone(90)).toBe(true);
    expect(isWarningZone(94)).toBe(true);
  });

  it('returns false for critical zone (95%+)', () => {
    expect(isWarningZone(95)).toBe(false);
    expect(isWarningZone(100)).toBe(false);
  });
});
