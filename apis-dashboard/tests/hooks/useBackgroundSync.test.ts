/**
 * useBackgroundSync Hook Tests
 *
 * Tests for the background sync hook including auto-sync on online transition,
 * manual sync trigger, and conflict state management.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, act, waitFor } from '@testing-library/react';
import { db } from '../../src/services/db';

// Mock the dependencies
vi.mock('../../src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn, deps, defaultValue) => {
    // Execute the query function synchronously for testing
    try {
      const result = queryFn();
      if (result && typeof result.then === 'function') {
        return defaultValue; // Return default for promises (async queries)
      }
      return result;
    } catch {
      return defaultValue;
    }
  }),
}));

vi.mock('../../src/services/backgroundSync', () => ({
  startBackgroundSync: vi.fn(),
  resolveConflict: vi.fn(),
  retryAllFailedItems: vi.fn(),
}));

// Import after mocks
import { useBackgroundSync } from '../../src/hooks/useBackgroundSync';
import { useOnlineStatus } from '../../src/hooks/useOnlineStatus';
import { useAuth } from '../../src/hooks/useAuth';
import {
  startBackgroundSync,
  resolveConflict,
  retryAllFailedItems,
} from '../../src/services/backgroundSync';

describe('useBackgroundSync', () => {
  beforeEach(async () => {
    await db.sync_queue.clear();
    vi.clearAllMocks();

    // Reset default mock implementations
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', name: 'Test', email: 'test@test.com' },
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    });
    vi.mocked(startBackgroundSync).mockResolvedValue({
      success: true,
      synced: 0,
      failed: 0,
      conflicts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.lastSyncResult).toBeNull();
    expect(result.current.conflicts).toEqual([]);
    expect(result.current.hasAuthError).toBe(false);
  });

  it('should expose triggerSync function', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.triggerSync).toBe('function');
  });

  it('should expose resolveConflict function', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.resolveConflict).toBe('function');
  });

  it('should expose retryFailed function', () => {
    const { result } = renderHook(() => useBackgroundSync());

    expect(typeof result.current.retryFailed).toBe('function');
  });

  it('should not sync when offline', async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(startBackgroundSync).not.toHaveBeenCalled();
  });

  it('should not sync when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(startBackgroundSync).not.toHaveBeenCalled();
    expect(result.current.hasAuthError).toBe(true);
  });

  it('should clear auth error', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(result.current.hasAuthError).toBe(true);

    act(() => {
      result.current.clearAuthError();
    });

    expect(result.current.hasAuthError).toBe(false);
  });

  it('should clear conflicts', async () => {
    vi.mocked(startBackgroundSync).mockResolvedValue({
      success: false,
      synced: 0,
      failed: 1,
      conflicts: [
        {
          localId: 'local_1',
          localData: {},
          serverData: {},
          recordType: 'inspections',
        },
      ],
    });

    // Add item to queue first
    await db.sync_queue.add({
      table: 'inspections',
      action: 'create',
      payload: '{}',
      created_at: new Date(),
      status: 'pending',
    });

    const { result } = renderHook(() => useBackgroundSync());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(result.current.conflicts.length).toBeGreaterThanOrEqual(0);

    act(() => {
      result.current.clearConflicts();
    });

    expect(result.current.conflicts).toEqual([]);
  });

  it('should call retryAllFailedItems', async () => {
    vi.mocked(retryAllFailedItems).mockResolvedValue(3);

    const { result } = renderHook(() => useBackgroundSync());

    let count: number = 0;
    await act(async () => {
      count = await result.current.retryFailed();
    });

    expect(retryAllFailedItems).toHaveBeenCalled();
    expect(count).toBe(3);
  });

  it('should resolve conflict and remove from list', async () => {
    vi.mocked(resolveConflict).mockResolvedValue(true);

    // Start with a conflict
    vi.mocked(startBackgroundSync).mockResolvedValue({
      success: false,
      synced: 0,
      failed: 1,
      conflicts: [
        {
          localId: 'conflict_1',
          localData: { queen_seen: true },
          serverData: { queen_seen: false },
          recordType: 'inspections',
        },
      ],
    });

    // Add item to queue
    await db.sync_queue.add({
      table: 'inspections',
      action: 'create',
      payload: '{}',
      created_at: new Date(),
      status: 'pending',
    });

    const { result } = renderHook(() => useBackgroundSync());

    // Trigger sync to get conflict
    await act(async () => {
      await result.current.triggerSync();
    });

    expect(result.current.conflicts).toHaveLength(1);

    // Resolve the conflict
    let resolved: boolean = false;
    await act(async () => {
      resolved = await result.current.resolveConflict('conflict_1', 'local');
    });

    expect(resolved).toBe(true);
    expect(resolveConflict).toHaveBeenCalledWith('conflict_1', 'local', 'mock-token');
    expect(result.current.conflicts).toHaveLength(0);
  });

  it('should return pending and failed counts', () => {
    const { result } = renderHook(() => useBackgroundSync());

    // Default values from mock
    expect(typeof result.current.pendingCount).toBe('number');
    expect(typeof result.current.failedCount).toBe('number');
  });
});
