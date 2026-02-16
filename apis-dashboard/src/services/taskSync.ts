/**
 * Task Sync Service
 *
 * Handles syncing offline task operations when connectivity is restored.
 * Processes creates before completions to maintain order.
 * Handles conflict resolution for deleted/already-completed tasks.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
 *
 * @module services/taskSync
 */
import { message } from 'antd';
import { apiClient } from '../providers/apiClient';
import { db } from './db';
import {
  markTaskAsSynced,
  markTaskSyncError,
  markTaskCompletionSynced,
  removeOrphanedTask,
} from './offlineTasks';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Number of successfully synced items */
  synced: number;
  /** Number of items that failed to sync */
  errors: number;
}

/**
 * Parsed create sync payload
 */
interface CreatePayload {
  local_id: string;
  hive_id: string;
  data: {
    hive_id: string;
    template_id?: string;
    custom_title?: string;
    priority: string;
    due_date?: string;
    description?: string;
  };
}

/**
 * Parsed complete sync payload
 */
interface CompletePayload {
  task_id: string;
  completion_data?: Record<string, unknown>;
}

/**
 * API error response with status
 */
interface ApiError {
  response?: {
    status: number;
  };
  message?: string;
}

// ============================================================================
// Sync Implementation
// ============================================================================

/**
 * Sync all pending task operations to the server.
 *
 * Processing order:
 * 1. Creates (POST /api/tasks) - so new tasks get server IDs
 * 2. Completions (POST /api/tasks/{id}/complete) - using server IDs
 *
 * Conflict handling:
 * - 404 on complete: Task deleted on server → remove local task
 * - 409 on complete: Already completed → mark as synced (idempotent)
 *
 * @returns SyncResult with counts of synced and errored items
 *
 * @example
 * ```ts
 * // Called when connectivity is restored
 * const result = await syncPendingTasks();
 * console.log(`Synced ${result.synced} tasks, ${result.errors} errors`);
 * ```
 */
export async function syncPendingTasks(): Promise<SyncResult> {
  const pendingItems = await db.sync_queue
    .where('status')
    .equals('pending')
    .filter((item) => item.table === 'tasks')
    .toArray();

  if (pendingItems.length === 0) {
    return { synced: 0, errors: 0 };
  }

  // Separate creates and completes
  const creates = pendingItems.filter((i) => i.action === 'create');
  const completes = pendingItems.filter((i) => i.action === 'complete');

  const results: SyncResult = { synced: 0, errors: 0 };

  // Process creates first
  for (const item of creates) {
    try {
      const payload = JSON.parse(item.payload) as CreatePayload;

      // POST to create task
      const response = await apiClient.post<{ data: { id: string } }>('/tasks', payload.data);
      const serverId = response.data.data.id;

      // Update local task with server ID
      await markTaskAsSynced(payload.local_id, serverId);

      results.synced++;
    } catch (err) {
      const payload = JSON.parse(item.payload) as CreatePayload;
      const errorMessage = (err as ApiError).message || 'Sync failed';
      await markTaskSyncError(payload.local_id, errorMessage);
      results.errors++;
    }
  }

  // Then process completions
  for (const item of completes) {
    try {
      const payload = JSON.parse(item.payload) as CompletePayload;

      // POST to complete task
      await apiClient.post(`/tasks/${payload.task_id}/complete`, {
        completion_data: payload.completion_data,
      });

      // Mark as synced
      await markTaskCompletionSynced(payload.task_id);

      results.synced++;
    } catch (err) {
      const apiError = err as ApiError;
      const payload = JSON.parse(item.payload) as CompletePayload;

      if (apiError.response?.status === 404) {
        // Task deleted on server - clean up local
        await removeOrphanedTask(payload.task_id);
        message.warning('Task no longer exists');
        // Not counted as error - conflict resolved
      } else if (apiError.response?.status === 409) {
        // Already completed - mark as synced (idempotent)
        await markTaskCompletionSynced(payload.task_id);
        results.synced++;
      } else {
        const errorMessage = apiError.message || 'Sync failed';
        await markTaskSyncError(payload.task_id, errorMessage);
        results.errors++;
      }
    }
  }

  // Show toast based on results
  if (results.synced > 0) {
    const taskWord = results.synced === 1 ? 'task' : 'tasks';
    message.success(`Changes synced (${results.synced} ${taskWord})`);
  }

  if (results.errors > 0) {
    message.error(`${results.errors} task(s) failed to sync`);
  }

  return results;
}

/**
 * Check if there are pending task sync items
 *
 * @returns true if there are pending items to sync
 */
export async function hasPendingTaskSync(): Promise<boolean> {
  const count = await db.sync_queue
    .where('status')
    .equals('pending')
    .filter((item) => item.table === 'tasks')
    .count();

  return count > 0;
}
