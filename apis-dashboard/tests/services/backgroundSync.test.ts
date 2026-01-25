/**
 * Background Sync Service Tests
 *
 * Tests for the background sync service including sync queue processing,
 * exponential backoff retry logic, and conflict detection.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../src/services/db';
import type { SyncQueueItem } from '../../src/services/db';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the offlineInspection module
vi.mock('../../src/services/offlineInspection', () => ({
  markAsSynced: vi.fn(),
  markSyncError: vi.fn(),
}));

// Import after mocks
import {
  startBackgroundSync,
  resolveConflict,
  getPendingSyncCount,
  retrySyncItem,
  retryAllFailedItems,
  type SyncProgress,
} from '../../src/services/backgroundSync';
import { markAsSynced, markSyncError } from '../../src/services/offlineInspection';

describe('backgroundSync', () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.sync_queue.clear();
    await db.inspections.clear();

    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startBackgroundSync', () => {
    it('should process empty queue without errors', async () => {
      const onProgress = vi.fn();

      const result = await startBackgroundSync(onProgress, 'test-token');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should sync pending inspection and call markAsSynced on success', async () => {
      // Add a pending item to the queue
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_123',
          hive_id: 'hive_456',
          data: { queen_seen: true, notes: 'test' },
        }),
        created_at: new Date(),
        status: 'pending',
      });

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { id: 'server_789' } }),
      });

      const onProgress = vi.fn();
      const result = await startBackgroundSync(onProgress, 'test-token');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
      expect(markAsSynced).toHaveBeenCalledWith('local_123', 'server_789');

      // Queue should be empty after successful sync
      const remaining = await db.sync_queue.count();
      expect(remaining).toBe(0);
    });

    it('should report progress during sync', async () => {
      // Add multiple items
      await db.sync_queue.bulkAdd([
        {
          table: 'inspections',
          action: 'create',
          payload: JSON.stringify({
            local_id: 'local_1',
            hive_id: 'hive_1',
            data: {},
          }),
          created_at: new Date(),
          status: 'pending',
        },
        {
          table: 'inspections',
          action: 'create',
          payload: JSON.stringify({
            local_id: 'local_2',
            hive_id: 'hive_2',
            data: {},
          }),
          created_at: new Date(),
          status: 'pending',
        },
      ]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { id: 'server_id' } }),
      });

      const progressUpdates: SyncProgress[] = [];
      const onProgress = (progress: SyncProgress) => {
        progressUpdates.push({ ...progress });
      };

      await startBackgroundSync(onProgress, 'test-token');

      // Should have received multiple progress updates
      expect(progressUpdates.length).toBeGreaterThan(1);

      // First update should show total
      expect(progressUpdates[0].total).toBe(2);

      // Final update should show all completed
      const finalProgress = progressUpdates[progressUpdates.length - 1];
      expect(finalProgress.completed).toBe(2);
      expect(finalProgress.failed).toBe(0);
    });

    it('should handle 409 conflict response', async () => {
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_conflict',
          hive_id: 'hive_1',
          data: { queen_seen: true },
        }),
        created_at: new Date(),
        status: 'pending',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            data: { id: 'server_id', queen_seen: false },
            error: 'conflict',
          }),
      });

      const onProgress = vi.fn();
      const result = await startBackgroundSync(onProgress, 'test-token');

      expect(result.success).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].localId).toBe('local_conflict');
      expect(result.conflicts[0].localData.queen_seen).toBe(true);
    });

    it('should handle 401 auth error', async () => {
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_auth',
          hive_id: 'hive_1',
          data: {},
        }),
        created_at: new Date(),
        status: 'pending',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const onProgress = vi.fn();
      const result = await startBackgroundSync(onProgress, 'bad-token');

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);

      // Should mark sync error
      expect(markSyncError).toHaveBeenCalledWith(
        'local_auth',
        'Authentication expired'
      );
    });

    it('should handle network errors and mark as error', async () => {
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_network',
          hive_id: 'hive_1',
          data: {},
        }),
        created_at: new Date(),
        status: 'pending',
      });

      // Mock network failure (all retries)
      mockFetch.mockRejectedValue(new Error('Network error'));

      const onProgress = vi.fn();

      // Use fake timers to speed through exponential backoff delays
      vi.useFakeTimers();

      const syncPromise = startBackgroundSync(onProgress, 'test-token');

      // Fast-forward through all retry delays (1s + 2s + 4s + 8s + 60s = 75s)
      await vi.advanceTimersByTimeAsync(80000);

      const result = await syncPromise;

      vi.useRealTimers();

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(markSyncError).toHaveBeenCalledWith('local_network', 'Network error');
    });
  });

  describe('resolveConflict', () => {
    it('should force push local version when choice is "local"', async () => {
      // Add conflicting item to queue
      const id = await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_resolve',
          hive_id: 'hive_1',
          data: { queen_seen: true },
        }),
        created_at: new Date(),
        status: 'error',
        error: 'Conflict - awaiting resolution',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { id: 'server_new' } }),
      });

      const success = await resolveConflict('local_resolve', 'local', 'test-token');

      expect(success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?force=true'),
        expect.objectContaining({ method: 'POST' })
      );

      // Queue should be cleared
      const item = await db.sync_queue.get(id);
      expect(item).toBeUndefined();
    });

    it('should delete local version when choice is "server"', async () => {
      // Add local inspection
      await db.inspections.put({
        id: 'local_delete',
        local_id: 'local_delete',
        tenant_id: 'tenant_1',
        hive_id: 'hive_1',
        date: '2026-01-25',
        queen_seen: true,
        eggs_seen: false,
        queen_cells: 0,
        brood_frames: null,
        brood_pattern: null,
        honey_stores: null,
        pollen_stores: null,
        space_assessment: null,
        needs_super: false,
        varroa_estimate: null,
        temperament: null,
        issues: null,
        actions: null,
        notes: null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      // Add to sync queue
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_delete',
          hive_id: 'hive_1',
          data: { queen_seen: true },
        }),
        created_at: new Date(),
        status: 'error',
      });

      const success = await resolveConflict('local_delete', 'server', 'test-token');

      expect(success).toBe(true);

      // Local inspection should be deleted
      const inspection = await db.inspections.get('local_delete');
      expect(inspection).toBeUndefined();
    });
  });

  describe('getPendingSyncCount', () => {
    it('should return count of pending items', async () => {
      await db.sync_queue.bulkAdd([
        {
          table: 'inspections',
          action: 'create',
          payload: '{}',
          created_at: new Date(),
          status: 'pending',
        },
        {
          table: 'inspections',
          action: 'create',
          payload: '{}',
          created_at: new Date(),
          status: 'pending',
        },
        {
          table: 'inspections',
          action: 'create',
          payload: '{}',
          created_at: new Date(),
          status: 'error', // Not pending
        },
      ]);

      const count = await getPendingSyncCount();
      expect(count).toBe(2);
    });
  });

  describe('retrySyncItem', () => {
    it('should reset item status to pending', async () => {
      const id = await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({ local_id: 'local_retry' }),
        created_at: new Date(),
        status: 'error',
        error: 'Previous error',
      });

      await retrySyncItem(id);

      const item = await db.sync_queue.get(id);
      expect(item?.status).toBe('pending');
      expect(item?.error).toBeUndefined();
    });
  });

  describe('retryAllFailedItems', () => {
    it('should reset all error items to pending', async () => {
      await db.sync_queue.bulkAdd([
        {
          table: 'inspections',
          action: 'create',
          payload: JSON.stringify({ local_id: 'local_1' }),
          created_at: new Date(),
          status: 'error',
          error: 'Error 1',
        },
        {
          table: 'inspections',
          action: 'create',
          payload: JSON.stringify({ local_id: 'local_2' }),
          created_at: new Date(),
          status: 'error',
          error: 'Error 2',
        },
        {
          table: 'inspections',
          action: 'create',
          payload: JSON.stringify({ local_id: 'local_3' }),
          created_at: new Date(),
          status: 'pending', // Already pending
        },
      ]);

      const count = await retryAllFailedItems();
      expect(count).toBe(2);

      const pendingItems = await db.sync_queue
        .where('status')
        .equals('pending')
        .count();
      expect(pendingItems).toBe(3);
    });
  });

  describe('exponential backoff', () => {
    it('should retry on 500 server error with delays', async () => {
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_retry_500',
          hive_id: 'hive_1',
          data: {},
        }),
        created_at: new Date(),
        status: 'pending',
      });

      // First call fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { id: 'server_id' } }),
        });

      const onProgress = vi.fn();

      // Use fake timers
      vi.useFakeTimers();

      const syncPromise = startBackgroundSync(onProgress, 'test-token');

      // Fast-forward past the first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      const result = await syncPromise;

      vi.useRealTimers();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
