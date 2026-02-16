/**
 * Task Sync Service Tests
 *
 * Tests for syncing offline task operations when connectivity is restored.
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../src/services/db';
import { syncPendingTasks, type SyncResult } from '../../src/services/taskSync';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// Mock message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { apiClient } from '../../src/providers/apiClient';
import { message } from 'antd';

describe('taskSync service', () => {
  const mockTenantId = 'tenant-123';
  const mockHiveId = 'hive-456';

  beforeEach(async () => {
    await db.tasks.clear();
    await db.sync_queue.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.tasks.clear();
    await db.sync_queue.clear();
  });

  describe('syncPendingTasks', () => {
    it('should return empty result when no pending items', async () => {
      const result = await syncPendingTasks();

      expect(result.synced).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should sync creates before completions (order preserved)', async () => {
      // Add a create sync item
      await db.sync_queue.add({
        table: 'tasks',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_task-1',
          hive_id: mockHiveId,
          data: { hive_id: mockHiveId, custom_title: 'New task', priority: 'medium' },
        }),
        created_at: new Date(),
        status: 'pending',
      });

      // Add a complete sync item (added after create)
      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-2', completion_data: {} }),
        created_at: new Date(),
        status: 'pending',
      });

      // Add the tasks to IndexedDB
      await db.tasks.put({
        id: 'local_task-1',
        local_id: 'local_task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'New task',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.tasks.put({
        id: 'task-2',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Task to complete',
        priority: 'low',
        status: 'completed',
        source: 'manual',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      // Track call order
      const callOrder: string[] = [];
      vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
        if (url === '/tasks') {
          callOrder.push('create');
          return { data: { data: { id: 'server-task-1' } } };
        }
        if (url.includes('/complete')) {
          callOrder.push('complete');
          return { data: { data: {} } };
        }
        return { data: {} };
      });

      await syncPendingTasks();

      // Verify create was called before complete
      expect(callOrder).toEqual(['create', 'complete']);
    });

    it('should handle successful create sync', async () => {
      await db.tasks.put({
        id: 'local_task-1',
        local_id: 'local_task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'New task',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.sync_queue.add({
        table: 'tasks',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_task-1',
          hive_id: mockHiveId,
          data: { hive_id: mockHiveId, custom_title: 'New task', priority: 'medium' },
        }),
        created_at: new Date(),
        status: 'pending',
      });

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { data: { id: 'server-task-1' } },
      });

      const result = await syncPendingTasks();

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);

      // Verify local ID was replaced with server ID
      const localTask = await db.tasks.get('local_task-1');
      expect(localTask).toBeUndefined();

      const serverTask = await db.tasks.get('server-task-1');
      expect(serverTask).toBeDefined();
      expect(serverTask?.pending_sync).toBe(false);
    });

    it('should handle 404 conflict (task deleted on server)', async () => {
      await db.tasks.put({
        id: 'task-deleted',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Deleted task',
        priority: 'low',
        status: 'completed',
        source: 'manual',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-deleted', completion_data: {} }),
        created_at: new Date(),
        status: 'pending',
      });

      // Mock 404 response
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        response: { status: 404 },
      });

      const result = await syncPendingTasks();

      // Should not count as error (conflict handled)
      expect(result.synced).toBe(0);
      expect(result.errors).toBe(0);

      // Task should be removed from IndexedDB
      const task = await db.tasks.get('task-deleted');
      expect(task).toBeUndefined();

      // Warning message should be shown
      expect(message.warning).toHaveBeenCalledWith('Task no longer exists');
    });

    it('should handle 409 conflict (already completed)', async () => {
      await db.tasks.put({
        id: 'task-already-done',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Already done task',
        priority: 'medium',
        status: 'completed',
        source: 'manual',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-already-done', completion_data: {} }),
        created_at: new Date(),
        status: 'pending',
      });

      // Mock 409 response
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        response: { status: 409 },
      });

      const result = await syncPendingTasks();

      // Should count as synced (idempotent)
      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);

      // Task should be marked as synced
      const task = await db.tasks.get('task-already-done');
      expect(task?.pending_sync).toBe(false);
    });

    it('should show success toast with count', async () => {
      await db.tasks.put({
        id: 'local_task-1',
        local_id: 'local_task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Task 1',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: new Date().toISOString(),
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await db.sync_queue.add({
        table: 'tasks',
        action: 'create',
        payload: JSON.stringify({
          local_id: 'local_task-1',
          hive_id: mockHiveId,
          data: { hive_id: mockHiveId, custom_title: 'Task 1', priority: 'medium' },
        }),
        created_at: new Date(),
        status: 'pending',
      });

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { data: { id: 'server-1' } },
      });

      await syncPendingTasks();

      expect(message.success).toHaveBeenCalledWith('Changes synced (1 task)');
    });
  });
});
