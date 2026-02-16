/**
 * Offline Tasks Service
 *
 * Manages offline task caching, creation, completion, and retrieval using IndexedDB.
 * Works with the sync queue to track pending operations for later sync.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
 *
 * @module services/offlineTasks
 */
import { db, type CachedTask, type PendingTask, type SyncQueueItem } from './db';

// ============================================================================
// Types
// ============================================================================

/**
 * Server task data structure (matches API response)
 */
export interface ServerTask {
  id: string;
  hive_id: string;
  template_id?: string;
  template_name?: string;
  custom_title?: string;
  title?: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  status: 'pending' | 'completed';
  source: 'manual' | 'beebrain';
  auto_effects?: object;
  completion_data?: Record<string, unknown>;
  completed_at?: string;
  created_at: string;
}

/**
 * Input data for creating an offline task
 */
export interface OfflineTaskInput {
  template_id?: string;
  template_name?: string;
  custom_title?: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  auto_effects?: object;
}

// Re-export types from db.ts for convenience
export type { CachedTask, PendingTask } from './db';

// ============================================================================
// Local ID Generation
// ============================================================================

/**
 * Generate a unique local ID for offline tasks
 * Format: local_<uuid>
 *
 * @returns Unique local identifier
 */
export function generateLocalTaskId(): string {
  return `local_${crypto.randomUUID()}`;
}

// ============================================================================
// Task Caching Operations
// ============================================================================

/**
 * Cache tasks from server response to IndexedDB
 *
 * Called after fetching tasks from the API to store them for offline access.
 * Preserves template details for display when offline.
 *
 * @param hiveId - The hive ID these tasks belong to
 * @param tenantId - The tenant ID (user's organization)
 * @param tasks - Array of tasks from server response
 *
 * @example
 * ```ts
 * const response = await apiClient.get(`/hives/${hiveId}/tasks`);
 * await cacheTasksFromServer(hiveId, tenantId, response.data.data);
 * ```
 */
export async function cacheTasksFromServer(
  hiveId: string,
  tenantId: string,
  tasks: ServerTask[]
): Promise<void> {
  const now = new Date();

  const cachedTasks: CachedTask[] = tasks.map((task) => ({
    id: task.id,
    tenant_id: tenantId,
    hive_id: hiveId,
    template_id: task.template_id,
    template_name: task.template_name,
    custom_title: task.custom_title,
    title: task.template_name || task.custom_title || task.title || '',
    description: task.description,
    priority: task.priority,
    due_date: task.due_date,
    status: task.status,
    source: task.source,
    auto_effects: task.auto_effects ? JSON.stringify(task.auto_effects) : undefined,
    completion_data: task.completion_data ? JSON.stringify(task.completion_data) : undefined,
    completed_at: task.completed_at,
    created_at: task.created_at,
    synced_at: now,
    accessed_at: now,
    pending_sync: false,
    sync_error: null,
  }));

  // Use bulkPut to upsert all tasks
  await db.tasks.bulkPut(cachedTasks);
}

/**
 * Get cached tasks for a hive from IndexedDB
 *
 * Retrieves all tasks for a specific hive, including both synced
 * and pending offline tasks.
 *
 * @param hiveId - The hive ID to get tasks for
 * @returns Array of cached tasks
 */
export async function getCachedTasks(hiveId: string): Promise<CachedTask[]> {
  // Update accessed_at for cache management
  const now = new Date();

  const tasks = await db.tasks.where('hive_id').equals(hiveId).toArray();

  // Update accessed_at timestamps
  await db.tasks.bulkPut(
    tasks.map((task) => ({ ...task, accessed_at: now }))
  );

  return tasks;
}

/**
 * Get the cache timestamp for tasks of a hive
 *
 * Used to determine if the cache is stale and needs refreshing.
 *
 * @param hiveId - The hive ID to check
 * @returns The synced_at timestamp of the most recently synced task, or null if no cache
 */
export async function getTasksCacheTimestamp(hiveId: string): Promise<Date | null> {
  const tasks = await db.tasks
    .where('hive_id')
    .equals(hiveId)
    .filter((t) => !t.pending_sync) // Only consider synced tasks
    .toArray();

  if (tasks.length === 0) return null;

  // Return the most recent synced_at
  return tasks.reduce((latest, task) => {
    return task.synced_at > latest ? task.synced_at : latest;
  }, tasks[0].synced_at);
}

// ============================================================================
// Offline Task Operations
// ============================================================================

/**
 * Save a task to IndexedDB while offline
 *
 * Creates the task with a temporary local ID and marks it as pending sync.
 * Also adds an entry to the sync queue for later synchronization.
 *
 * @param hiveId - The hive ID this task belongs to
 * @param tenantId - The tenant ID (user's organization)
 * @param data - The task data from the form
 * @returns The created pending task with local ID
 *
 * @example
 * ```ts
 * const task = await saveOfflineTask('hive-123', 'tenant-456', {
 *   custom_title: 'Add super',
 *   priority: 'medium',
 * });
 * console.log(task.local_id); // 'local_abc123...'
 * ```
 */
export async function saveOfflineTask(
  hiveId: string,
  tenantId: string,
  data: OfflineTaskInput
): Promise<PendingTask> {
  const localId = generateLocalTaskId();
  const now = new Date();
  const nowISO = now.toISOString();

  // Build the task record
  const task: PendingTask = {
    id: localId,
    local_id: localId,
    tenant_id: tenantId,
    hive_id: hiveId,
    template_id: data.template_id,
    template_name: data.template_name,
    custom_title: data.custom_title,
    title: data.template_name || data.custom_title || '',
    description: data.description,
    priority: data.priority,
    due_date: data.due_date,
    status: 'pending',
    source: 'manual',
    auto_effects: data.auto_effects ? JSON.stringify(data.auto_effects) : undefined,
    created_at: nowISO,
    synced_at: now,
    accessed_at: now,
    pending_sync: true,
    sync_error: null,
  };

  // Add to sync queue
  const syncEntry: SyncQueueItem = {
    table: 'tasks',
    action: 'create',
    payload: JSON.stringify({
      local_id: localId,
      hive_id: hiveId,
      data: {
        hive_id: hiveId,
        template_id: data.template_id,
        custom_title: data.custom_title,
        priority: data.priority,
        due_date: data.due_date,
        description: data.description,
      },
    }),
    created_at: now,
    status: 'pending',
  };

  // Use transaction to ensure atomicity
  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.put(task);
    await db.sync_queue.add(syncEntry);
  });

  return task;
}

/**
 * Complete a task offline
 *
 * Marks the task as completed in IndexedDB and adds a sync queue entry
 * for later synchronization with the server.
 *
 * @param taskId - The task ID to complete
 * @param completionData - Optional completion data from prompts
 *
 * @example
 * ```ts
 * // Complete without data
 * await completeOfflineTask('task-123');
 *
 * // Complete with prompt data
 * await completeOfflineTask('task-123', { amount_kg: 2.5 });
 * ```
 */
export async function completeOfflineTask(
  taskId: string,
  completionData?: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  const nowISO = now.toISOString();

  const existing = await db.tasks.get(taskId);
  if (!existing) {
    throw new Error(`Task ${taskId} not found in cache`);
  }

  // Update the task
  const updates: Partial<CachedTask> = {
    status: 'completed',
    completed_at: nowISO,
    pending_sync: true,
    accessed_at: now,
  };

  if (completionData) {
    updates.completion_data = JSON.stringify(completionData);
  }

  // Add to sync queue
  const syncEntry: SyncQueueItem = {
    table: 'tasks',
    action: 'complete',
    payload: JSON.stringify({
      task_id: taskId,
      completion_data: completionData,
    }),
    created_at: now,
    status: 'pending',
  };

  // Use transaction for atomicity
  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.update(taskId, updates);
    await db.sync_queue.add(syncEntry);
  });
}

/**
 * Delete a pending offline task
 *
 * Removes an offline-created task that hasn't been synced yet.
 * Only works for tasks with pending_sync=true and a local_id.
 *
 * @param localId - The local ID of the task to delete
 * @returns true if deleted, false if not found or not deletable
 */
export async function deleteOfflineTask(localId: string): Promise<boolean> {
  const existing = await db.tasks
    .where('local_id')
    .equals(localId)
    .first();

  if (!existing || !existing.pending_sync || !existing.local_id) {
    return false;
  }

  // Delete the task and any sync queue entries
  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.delete(existing.id);

    // Remove from sync queue
    // SECURITY (S6-H1): Wrap JSON.parse in try/catch to handle corrupted records
    const syncEntries = await db.sync_queue
      .where('table')
      .equals('tasks')
      .filter((entry) => {
        try {
          const payload = JSON.parse(entry.payload);
          return payload.local_id === localId;
        } catch {
          console.warn('[offlineTasks] Skipping corrupted sync queue entry:', entry.id);
          return false;
        }
      })
      .toArray();

    for (const entry of syncEntries) {
      await db.sync_queue.delete(entry.id!);
    }
  });

  return true;
}

// ============================================================================
// Sync Queue Operations
// ============================================================================

/**
 * Get all pending task sync queue items
 *
 * Returns all items in the sync queue for tasks with status 'pending'.
 *
 * @returns Array of pending sync queue items for tasks
 */
export async function getPendingTaskSyncItems(): Promise<SyncQueueItem[]> {
  return db.sync_queue
    .where('status')
    .equals('pending')
    .filter((item) => item.table === 'tasks')
    .toArray();
}

/**
 * Mark a task as synced after successful server sync
 *
 * Updates the local task with the server-assigned ID and clears
 * the pending_sync flag. Also removes the corresponding sync queue entry.
 *
 * @param localId - The local ID of the task
 * @param serverId - The server-assigned ID after sync
 *
 * @example
 * ```ts
 * // After successful POST to server
 * await markTaskAsSynced('local_abc123', 'server-uuid-456');
 * ```
 */
export async function markTaskAsSynced(localId: string, serverId: string): Promise<void> {
  const existing = await db.tasks
    .where('local_id')
    .equals(localId)
    .first();

  if (!existing) {
    return;
  }

  const now = new Date();

  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    // Remove the old local_id keyed record
    await db.tasks.delete(existing.id);

    // Add the new record with server ID
    await db.tasks.put({
      ...existing,
      id: serverId,
      pending_sync: false,
      local_id: null,
      sync_error: null,
      synced_at: now,
      accessed_at: now,
    });

    // Remove from sync queue
    // SECURITY (S6-H1): Wrap JSON.parse in try/catch to handle corrupted records
    const syncEntries = await db.sync_queue
      .where('table')
      .equals('tasks')
      .filter((entry) => {
        try {
          const payload = JSON.parse(entry.payload);
          return payload.local_id === localId;
        } catch {
          console.warn('[offlineTasks] Skipping corrupted sync queue entry:', entry.id);
          return false;
        }
      })
      .toArray();

    for (const entry of syncEntries) {
      await db.sync_queue.delete(entry.id!);
    }
  });
}

/**
 * Mark a task sync as failed
 *
 * Updates the sync_error field and marks the sync queue entry as error.
 *
 * @param localId - The local ID of the task
 * @param error - The error message
 */
export async function markTaskSyncError(localId: string, error: string): Promise<void> {
  // Find task by local_id or id
  let existing = await db.tasks.where('local_id').equals(localId).first();
  if (!existing) {
    existing = await db.tasks.get(localId);
  }

  if (existing) {
    await db.tasks.update(existing.id, { sync_error: error });
  }

  // Update sync queue entries
  // SECURITY (S6-H1): Wrap JSON.parse in try/catch to handle corrupted records
  const syncEntries = await db.sync_queue
    .where('table')
    .equals('tasks')
    .filter((entry) => {
      try {
        const payload = JSON.parse(entry.payload);
        return payload.local_id === localId || payload.task_id === localId;
      } catch {
        console.warn('[offlineTasks] Skipping corrupted sync queue entry:', entry.id);
        return false;
      }
    })
    .toArray();

  for (const entry of syncEntries) {
    await db.sync_queue.update(entry.id!, { status: 'error', error });
  }
}

/**
 * Mark a task completion as synced
 *
 * Clears the pending_sync flag for a completed task and removes
 * the sync queue entry.
 *
 * @param taskId - The task ID that was completed
 */
export async function markTaskCompletionSynced(taskId: string): Promise<void> {
  const now = new Date();

  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.update(taskId, {
      pending_sync: false,
      sync_error: null,
      synced_at: now,
    });

    // Remove completion sync queue entries
    // SECURITY (S6-H1): Wrap JSON.parse in try/catch to handle corrupted records
    const syncEntries = await db.sync_queue
      .where('table')
      .equals('tasks')
      .filter((entry) => {
        if (entry.action !== 'complete') return false;
        try {
          const payload = JSON.parse(entry.payload);
          return payload.task_id === taskId;
        } catch {
          console.warn('[offlineTasks] Skipping corrupted sync queue entry:', entry.id);
          return false;
        }
      })
      .toArray();

    for (const entry of syncEntries) {
      await db.sync_queue.delete(entry.id!);
    }
  });
}

/**
 * Remove an orphaned task (task deleted on server)
 *
 * Removes a task from IndexedDB that no longer exists on the server.
 * Also cleans up any related sync queue entries.
 *
 * @param taskId - The task ID to remove
 */
export async function removeOrphanedTask(taskId: string): Promise<void> {
  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.delete(taskId);

    // Remove any sync queue entries for this task
    // SECURITY (S6-H1): Wrap JSON.parse in try/catch to handle corrupted records
    const syncEntries = await db.sync_queue
      .where('table')
      .equals('tasks')
      .filter((entry) => {
        try {
          const payload = JSON.parse(entry.payload);
          return payload.task_id === taskId || payload.local_id === taskId;
        } catch {
          console.warn('[offlineTasks] Skipping corrupted sync queue entry:', entry.id);
          return false;
        }
      })
      .toArray();

    for (const entry of syncEntries) {
      await db.sync_queue.delete(entry.id!);
    }
  });
}

/**
 * Get count of tasks pending sync
 *
 * @returns Number of pending task sync items
 */
export async function getPendingTaskCount(): Promise<number> {
  return db.tasks.filter((t) => t.pending_sync === true).count();
}
