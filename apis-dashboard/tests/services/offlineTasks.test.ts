/**
 * Offline Tasks Service Tests
 *
 * Tests for IndexedDB task caching, offline creation, and completion.
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type CachedTask } from '../../src/services/db';
import {
  generateLocalTaskId,
  cacheTasksFromServer,
  getCachedTasks,
  saveOfflineTask,
  completeOfflineTask,
  deleteOfflineTask,
  getPendingTaskSyncItems,
  markTaskAsSynced,
  markTaskSyncError,
  markTaskCompletionSynced,
  removeOrphanedTask,
} from '../../src/services/offlineTasks';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'mock-uuid-12345',
});

describe('offlineTasks service', () => {
  const mockTenantId = 'tenant-123';
  const mockHiveId = 'hive-456';

  beforeEach(async () => {
    // Clear all tables before each test
    await db.tasks.clear();
    await db.sync_queue.clear();
  });

  afterEach(async () => {
    await db.tasks.clear();
    await db.sync_queue.clear();
  });

  describe('generateLocalTaskId', () => {
    it('should generate an ID with local_ prefix', () => {
      const id = generateLocalTaskId();
      expect(id).toMatch(/^local_/);
    });

    it('should use crypto.randomUUID for the UUID portion', () => {
      const id = generateLocalTaskId();
      expect(id).toBe('local_mock-uuid-12345');
    });
  });

  describe('cacheTasksFromServer', () => {
    it('should cache tasks from server response', async () => {
      const serverTasks = [
        {
          id: 'task-1',
          hive_id: mockHiveId,
          title: 'Check queen',
          priority: 'high' as const,
          status: 'pending' as const,
          source: 'manual' as const,
          created_at: '2026-01-15T10:00:00Z',
        },
        {
          id: 'task-2',
          hive_id: mockHiveId,
          title: 'Add super',
          priority: 'medium' as const,
          status: 'pending' as const,
          source: 'beebrain' as const,
          created_at: '2026-01-16T10:00:00Z',
        },
      ];

      await cacheTasksFromServer(mockHiveId, mockTenantId, serverTasks);

      const cached = await db.tasks.where('hive_id').equals(mockHiveId).toArray();
      expect(cached).toHaveLength(2);
      expect(cached[0].pending_sync).toBe(false);
      expect(cached[0].synced_at).toBeInstanceOf(Date);
    });

    it('should preserve template name and auto_effects', async () => {
      const serverTasks = [
        {
          id: 'task-1',
          hive_id: mockHiveId,
          title: 'Feed bees',
          template_id: 'template-1',
          template_name: 'Feeding',
          auto_effects: { updates: [{ field: 'last_fed', value: 'today' }] },
          priority: 'medium' as const,
          status: 'pending' as const,
          source: 'manual' as const,
          created_at: '2026-01-15T10:00:00Z',
        },
      ];

      await cacheTasksFromServer(mockHiveId, mockTenantId, serverTasks);

      const cached = await db.tasks.get('task-1');
      expect(cached?.template_name).toBe('Feeding');
      expect(cached?.auto_effects).toBe(JSON.stringify({ updates: [{ field: 'last_fed', value: 'today' }] }));
    });
  });

  describe('getCachedTasks', () => {
    it('should return cached tasks for a hive', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Check queen',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      const tasks = await getCachedTasks(mockHiveId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('should not return tasks for other hives', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: 'other-hive',
        title: 'Check queen',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      const tasks = await getCachedTasks(mockHiveId);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('saveOfflineTask', () => {
    it('should create a task with local ID', async () => {
      const task = await saveOfflineTask(mockHiveId, mockTenantId, {
        custom_title: 'Add a super',
        priority: 'medium',
      });

      expect(task.id).toBe('local_mock-uuid-12345');
      expect(task.local_id).toBe('local_mock-uuid-12345');
      expect(task.pending_sync).toBe(true);
      expect(task.status).toBe('pending');
    });

    it('should add to sync queue', async () => {
      await saveOfflineTask(mockHiveId, mockTenantId, {
        custom_title: 'Check ventilation',
        priority: 'low',
      });

      const syncItems = await db.sync_queue.where('table').equals('tasks').toArray();
      expect(syncItems).toHaveLength(1);
      expect(syncItems[0].action).toBe('create');
      expect(syncItems[0].status).toBe('pending');
    });

    it('should support template-based tasks', async () => {
      const task = await saveOfflineTask(mockHiveId, mockTenantId, {
        template_id: 'template-1',
        template_name: 'Feed bees',
        priority: 'high',
        auto_effects: { prompts: [] },
      });

      expect(task.template_id).toBe('template-1');
      expect(task.template_name).toBe('Feed bees');
      expect(task.title).toBe('Feed bees');
    });
  });

  describe('completeOfflineTask', () => {
    it('should throw error when task not found', async () => {
      await expect(completeOfflineTask('non-existent-task')).rejects.toThrow(
        'Task non-existent-task not found in cache'
      );
    });

    it('should mark task as completed', async () => {
      // Create a task first
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Check queen',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      await completeOfflineTask('task-1');

      const task = await db.tasks.get('task-1');
      expect(task?.status).toBe('completed');
      expect(task?.completed_at).toBeDefined();
      expect(task?.pending_sync).toBe(true);
    });

    it('should store completion data', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Feed bees',
        priority: 'medium',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      await completeOfflineTask('task-1', { amount_kg: 2.5 });

      const task = await db.tasks.get('task-1');
      expect(task?.completion_data).toBe(JSON.stringify({ amount_kg: 2.5 }));
    });

    it('should add to sync queue with complete action', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Check queen',
        priority: 'high',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      await completeOfflineTask('task-1');

      const syncItems = await db.sync_queue.where('action').equals('complete').toArray();
      expect(syncItems).toHaveLength(1);
      expect(syncItems[0].table).toBe('tasks');
    });
  });

  describe('deleteOfflineTask', () => {
    it('should delete a pending offline task', async () => {
      await db.tasks.put({
        id: 'local_test-id',
        local_id: 'local_test-id',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Test task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      const result = await deleteOfflineTask('local_test-id');

      expect(result).toBe(true);
      const task = await db.tasks.get('local_test-id');
      expect(task).toBeUndefined();
    });

    it('should not delete a synced task', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Synced task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: false,
      });

      const result = await deleteOfflineTask('task-1');

      expect(result).toBe(false);
      const task = await db.tasks.get('task-1');
      expect(task).toBeDefined();
    });
  });

  describe('getPendingTaskSyncItems', () => {
    it('should return pending task sync items', async () => {
      await db.sync_queue.add({
        table: 'tasks',
        action: 'create',
        payload: JSON.stringify({ local_id: 'local_1' }),
        created_at: new Date(),
        status: 'pending',
      });
      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-1' }),
        created_at: new Date(),
        status: 'pending',
      });
      // Add a non-task item that should be excluded
      await db.sync_queue.add({
        table: 'inspections',
        action: 'create',
        payload: JSON.stringify({ local_id: 'local_insp' }),
        created_at: new Date(),
        status: 'pending',
      });

      const items = await getPendingTaskSyncItems();

      expect(items).toHaveLength(2);
      expect(items.every(i => i.table === 'tasks')).toBe(true);
    });
  });

  describe('markTaskAsSynced', () => {
    it('should update local ID with server ID', async () => {
      await db.tasks.put({
        id: 'local_test-id',
        local_id: 'local_test-id',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Test task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await markTaskAsSynced('local_test-id', 'server-task-id');

      // Old record should be gone
      const oldTask = await db.tasks.get('local_test-id');
      expect(oldTask).toBeUndefined();

      // New record with server ID should exist
      const newTask = await db.tasks.get('server-task-id');
      expect(newTask).toBeDefined();
      expect(newTask?.pending_sync).toBe(false);
      expect(newTask?.local_id).toBeNull();
    });
  });

  describe('markTaskSyncError', () => {
    it('should set sync error on task', async () => {
      await db.tasks.put({
        id: 'local_test-id',
        local_id: 'local_test-id',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Test task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });

      await markTaskSyncError('local_test-id', 'Network error');

      const task = await db.tasks.get('local_test-id');
      expect(task?.sync_error).toBe('Network error');
    });
  });

  describe('markTaskCompletionSynced', () => {
    it('should clear pending_sync for completed task', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Completed task',
        priority: 'medium',
        status: 'completed',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        completed_at: '2026-01-20T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });
      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-1' }),
        created_at: new Date(),
        status: 'pending',
      });

      await markTaskCompletionSynced('task-1');

      const task = await db.tasks.get('task-1');
      expect(task?.pending_sync).toBe(false);

      const syncItems = await db.sync_queue.where('table').equals('tasks').toArray();
      expect(syncItems).toHaveLength(0);
    });
  });

  describe('removeOrphanedTask', () => {
    it('should remove task and sync queue entries', async () => {
      await db.tasks.put({
        id: 'task-1',
        tenant_id: mockTenantId,
        hive_id: mockHiveId,
        title: 'Orphaned task',
        priority: 'low',
        status: 'pending',
        source: 'manual',
        created_at: '2026-01-15T10:00:00Z',
        synced_at: new Date(),
        accessed_at: new Date(),
        pending_sync: true,
      });
      await db.sync_queue.add({
        table: 'tasks',
        action: 'complete',
        payload: JSON.stringify({ task_id: 'task-1' }),
        created_at: new Date(),
        status: 'pending',
      });

      await removeOrphanedTask('task-1');

      const task = await db.tasks.get('task-1');
      expect(task).toBeUndefined();

      const syncItems = await db.sync_queue.toArray();
      expect(syncItems).toHaveLength(0);
    });
  });
});
