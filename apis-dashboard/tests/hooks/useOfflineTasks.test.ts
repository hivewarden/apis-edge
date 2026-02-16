/**
 * useOfflineTasks Hook Tests
 *
 * Tests for the offline tasks hook including cache-first strategy,
 * offline state detection, and pending sync count tracking.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useOfflineTasks } from '../../src/hooks/useOfflineTasks';
import { db } from '../../src/services/db';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock navigator.onLine
const mockOnLine = vi.fn();
Object.defineProperty(navigator, 'onLine', {
  get: mockOnLine,
  configurable: true,
});

import { apiClient } from '../../src/providers/apiClient';

describe('useOfflineTasks hook', () => {
  const mockHiveId = 'hive-123';
  const mockTenantId = 'tenant-456';

  const mockServerTasks = [
    {
      id: 'task-1',
      hive_id: mockHiveId,
      title: 'Check queen',
      priority: 'high',
      status: 'pending',
      source: 'manual',
      created_at: '2026-01-15T10:00:00Z',
    },
    {
      id: 'task-2',
      hive_id: mockHiveId,
      title: 'Add super',
      priority: 'medium',
      status: 'pending',
      source: 'beebrain',
      created_at: '2026-01-16T10:00:00Z',
    },
  ];

  beforeEach(async () => {
    // Clear all tables before each test
    await db.tasks.clear();
    await db.sync_queue.clear();

    // Default to online
    mockOnLine.mockReturnValue(true);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.tasks.clear();
    await db.sync_queue.clear();
  });

  describe('online behavior', () => {
    it('should fetch from API when online and no cache', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { data: mockServerTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      // Initial loading state
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tasks).toHaveLength(2);
      expect(result.current.isOffline).toBe(false);
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining(`/hives/${mockHiveId}/tasks`));
    });

    it('should cache tasks from API response', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { data: mockServerTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Check IndexedDB
      const cachedTasks = await db.tasks.where('hive_id').equals(mockHiveId).toArray();
      expect(cachedTasks).toHaveLength(2);
    });

    it('should use cache when not stale (< 5 min)', async () => {
      // Pre-populate cache with recent data
      const now = new Date();
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Cached task',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: now,
        accessed_at: now,
        pending_sync: false,
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have used cache, not API
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].title).toBe('Cached task');
      // API should NOT have been called because cache is fresh
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should refetch from API when cache is stale (> 5 min)', async () => {
      // Pre-populate cache with old data
      const oldTime = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
      await db.tasks.put({
        id: 'task-old',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Old cached task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-14T10:00:00Z',
        synced_at: oldTime,
        accessed_at: oldTime,
        pending_sync: false,
      });

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { data: mockServerTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have fetched from API
      expect(apiClient.get).toHaveBeenCalled();
      expect(result.current.tasks).toHaveLength(2);
    });
  });

  describe('offline behavior', () => {
    it('should return cached tasks when offline', async () => {
      mockOnLine.mockReturnValue(false);

      // Pre-populate cache
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Cached task',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isOffline).toBe(true);
      expect(result.current.tasks).toHaveLength(1);
      // API should NOT have been called
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should track isOffline state', async () => {
      mockOnLine.mockReturnValue(false);

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isOffline).toBe(true);
    });
  });

  describe('pending sync count', () => {
    it('should count pending sync items', async () => {
      mockOnLine.mockReturnValue(false);

      // Pre-populate with pending tasks
      await db.tasks.put({
        id: 'local_task-1',
        local_id: 'local_task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Pending task',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.sync_queue.add({
        table: 'tasks',
        action: 'create',
        payload: JSON.stringify({ local_id: 'local_task-1' }),
        created_at: new Date(),
        status: 'pending',
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.pendingSyncCount).toBe(1);
    });
  });

  describe('merging offline tasks', () => {
    it('should merge pending offline tasks with cached tasks', async () => {
      mockOnLine.mockReturnValue(false);

      // Add a synced task
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Synced task',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      // Add an offline-created task
      await db.tasks.put({
        id: 'local_task-1',
        local_id: 'local_task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Offline task',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-16T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have both tasks
      expect(result.current.tasks).toHaveLength(2);
    });
  });

  describe('refetch function', () => {
    it('should provide refetch function', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: mockServerTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');

      // Initial fetch should have been called
      expect(apiClient.get).toHaveBeenCalledTimes(1);

      // Clear cache to force refetch from API
      await db.tasks.clear();

      // Call refetch
      await act(async () => {
        await result.current.refetch();
      });

      // API should have been called again since cache was cleared
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useOfflineTasks(mockHiveId, mockTenantId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('Network error');
    });
  });
});
