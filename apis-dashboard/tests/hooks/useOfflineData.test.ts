/**
 * useOfflineData Hook Tests
 *
 * Tests for the offline-aware data fetching hook.
 * Note: These tests use real timers due to IndexedDB async operations
 * not being compatible with fake timers in vitest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useOfflineData } from '../../src/hooks/useOfflineData';
import { db } from '../../src/services/db';
import { clearAllCache, cacheApiResponse } from '../../src/services/offlineCache';

describe('useOfflineData', () => {
  let originalOnLine: boolean;

  beforeEach(async () => {
    // Store original navigator.onLine
    originalOnLine = navigator.onLine;

    // Set online by default
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    // Clear cache
    await clearAllCache();

    // NOTE: Not using fake timers - IndexedDB operations don't work well with them
  });

  afterEach(async () => {
    // Restore navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });

    // Clear cache
    await clearAllCache();

    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('returns undefined data initially', async () => {
      const fetchFn = vi.fn().mockResolvedValue([]);

      const { result, unmount } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          enabled: false, // Disable auto-fetch
        })
      );

      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);

      // Wait for any pending state updates to flush
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });
      unmount();
    });

    it('returns cached data if available', async () => {
      // Pre-populate cache
      await cacheApiResponse('sites', [
        { id: 's1', tenant_id: 't1', name: 'Cached Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      const fetchFn = vi.fn().mockResolvedValue([]);

      const { result, unmount } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          enabled: false,
        })
      );

      // Wait for useLiveQuery to resolve
      await waitFor(() => {
        expect(result.current.data).toBeDefined();
        expect(result.current.data?.length).toBe(1);
      });

      unmount();
    });
  });

  describe('Online Behavior', () => {
    it('fetches data when online and enabled', async () => {
      const mockData = [
        { id: 's1', tenant_id: 't1', name: 'Fetched Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ];
      const fetchFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          staleTime: 0, // Always stale
        })
      );

      // Wait for the fetch to be triggered (uses real timers)
      await waitFor(() => {
        expect(fetchFn).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('caches fetched data', async () => {
      const mockData = [
        { id: 's1', tenant_id: 't1', name: 'New Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ];
      const fetchFn = vi.fn().mockResolvedValue(mockData);

      renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          staleTime: 0,
        })
      );

      await waitFor(async () => {
        const cached = await db.sites.toArray();
        expect(cached.length).toBe(1);
        expect(cached[0].name).toBe('New Site');
      }, { timeout: 2000 });
    });

    it('updates lastSynced after fetch', async () => {
      const fetchFn = vi.fn().mockResolvedValue([
        { id: 's1', tenant_id: 't1', name: 'Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          staleTime: 0,
        })
      );

      await waitFor(() => {
        expect(result.current.lastSynced).toBeInstanceOf(Date);
      }, { timeout: 2000 });
    });

    it('sets error on fetch failure', async () => {
      const error = new Error('Network error');
      const fetchFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          staleTime: 0,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
        expect(result.current.error?.message).toBe('Network error');
      }, { timeout: 2000 });
    });
  });

  describe('Offline Behavior', () => {
    it('returns cached data when offline', async () => {
      // Pre-populate cache
      await cacheApiResponse('sites', [
        { id: 's1', tenant_id: 't1', name: 'Cached Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      // Go offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      const fetchFn = vi.fn().mockResolvedValue([]);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
        })
      );

      await waitFor(() => {
        expect(result.current.data?.length).toBe(1);
        expect(result.current.isOffline).toBe(true);
      });

      // Should NOT have called fetchFn since we're offline
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('reports isOffline correctly', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      const { result, unmount } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn: vi.fn().mockResolvedValue([]),
          enabled: false,
        })
      );

      expect(result.current.isOffline).toBe(true);

      // Wait for any pending state updates to flush
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });
      unmount();
    });
  });

  describe('Filtering', () => {
    it('filters cached data by provided filter', async () => {
      // Pre-populate cache with multiple items
      await cacheApiResponse('hives', [
        { id: 'h1', tenant_id: 't1', site_id: 's1', name: 'Hive 1', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' },
        { id: 'h2', tenant_id: 't1', site_id: 's2', name: 'Hive 2', queen_introduced_at: null, queen_source: null, brood_boxes: 2, honey_supers: 1, notes: null, created_at: '' },
        { id: 'h3', tenant_id: 't1', site_id: 's1', name: 'Hive 3', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 2, notes: null, created_at: '' },
      ]);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'hives',
          fetchFn: vi.fn().mockResolvedValue([]),
          filter: { site_id: 's1' },
          enabled: false,
        })
      );

      await waitFor(() => {
        expect(result.current.data?.length).toBe(2);
      });
    });
  });

  describe('Refetch', () => {
    it('refetch function triggers new API call', async () => {
      const fetchFn = vi.fn().mockResolvedValue([
        { id: 's1', tenant_id: 't1', name: 'Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      // Pre-populate cache so initial fetch doesn't happen
      await cacheApiResponse('sites', [
        { id: 's0', tenant_id: 't0', name: 'Old Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          staleTime: 60 * 60 * 1000, // 1 hour - prevents auto-fetch
        })
      );

      // Wait for hook to stabilize
      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      // Reset the mock
      fetchFn.mockClear();

      // Manually trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(fetchFn).toHaveBeenCalled();
    });

    it('refetch does not call API when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      const fetchFn = vi.fn().mockResolvedValue([]);

      const { result } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          enabled: false,
        })
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('Stale Data Detection', () => {
    it('reports isStale correctly when never synced', async () => {
      const { result, unmount } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn: vi.fn().mockResolvedValue([]),
          enabled: false,
        })
      );

      expect(result.current.isStale).toBe(true);

      // Wait for any pending state updates to flush
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });
      unmount();
    });
  });

  describe('Enabled Flag', () => {
    it('does not fetch when disabled', async () => {
      const fetchFn = vi.fn().mockResolvedValue([]);

      const { unmount } = renderHook(() =>
        useOfflineData({
          table: 'sites',
          fetchFn,
          enabled: false,
        })
      );

      // Wait a bit to ensure no fetch is triggered
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      expect(fetchFn).not.toHaveBeenCalled();
      unmount();
    });
  });
});
