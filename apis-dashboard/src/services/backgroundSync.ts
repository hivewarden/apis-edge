/**
 * Background Sync Service
 *
 * Core service for synchronizing offline data with the server.
 * Implements exponential backoff retry logic, conflict detection,
 * and progress tracking for the sync process.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 *
 * @module services/backgroundSync
 */
import { db, type SyncQueueItem } from './db';
import { markAsSynced, markSyncError } from './offlineInspection';
import { syncPendingTasks } from './taskSync';

// ============================================================================
// Types
// ============================================================================

/**
 * Progress information during sync operation
 */
export interface SyncProgress {
  /** Total items to sync */
  total: number;
  /** Successfully synced items */
  completed: number;
  /** Failed items */
  failed: number;
  /** Currently syncing item identifier */
  currentItem?: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** True if all items synced successfully */
  success: boolean;
  /** Number of items synced */
  synced: number;
  /** Number of items that failed */
  failed: number;
  /** Items with conflicts that need resolution */
  conflicts: ConflictItem[];
}

/**
 * Represents a sync conflict between local and server data
 */
export interface ConflictItem {
  /** Local ID of the conflicting record */
  localId: string;
  /** Local version of the data */
  localData: Record<string, unknown>;
  /** Server version of the data */
  serverData: Record<string, unknown>;
  /** Type of the record (e.g., 'inspections') */
  recordType: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Exponential backoff delays in milliseconds: 1s, 2s, 4s, 8s, max 60s */
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 60000];

/**
 * SECURITY (S6-M3): Maximum number of retries before an item is marked as
 * permanently failed. Prevents permanently-errored items from accumulating
 * in the sync queue and being retried indefinitely.
 */
const MAX_RETRY_COUNT = 5;

/**
 * SECURITY (S6-H3): Global sync mutex to prevent concurrent sync operations.
 * Both registerSW.ts (sync-on-reconnect) and useBackgroundSync hook can trigger
 * sync simultaneously when connectivity is restored. This mutex ensures only
 * one sync runs at a time; subsequent triggers are dropped.
 */
let _syncMutexPromise: Promise<void> | null = null;

/**
 * Check if a sync operation is currently running.
 */
export function isSyncRunning(): boolean {
  return _syncMutexPromise !== null;
}

/**
 * Acquire the sync mutex. Returns true if acquired, false if already locked.
 * The caller must call releaseSyncMutex() when done.
 */
function acquireSyncMutex(): boolean {
  if (_syncMutexPromise !== null) {
    return false;
  }
  // Create a promise that will be resolved when sync completes
  let resolve: () => void;
  _syncMutexPromise = new Promise<void>((r) => { resolve = r; });
  // Store the resolve function for releaseSyncMutex
  (_syncMutexPromise as Promise<void> & { _resolve?: () => void })._resolve = resolve!;
  return true;
}

/**
 * Release the sync mutex.
 */
function releaseSyncMutex(): void {
  if (_syncMutexPromise) {
    const p = _syncMutexPromise as Promise<void> & { _resolve?: () => void };
    if (p._resolve) {
      p._resolve();
    }
    _syncMutexPromise = null;
  }
}

/**
 * Base URL for API calls - uses Vite env variable or defaults to localhost for dev.
 *
 * TODO (S6-L5): Refactor backgroundSync.ts to use apiClient (Axios instance) instead
 * of raw fetch(). This would ensure consistent behavior with taskSync.ts, including:
 * - Auth token/cookie attachment via interceptors
 * - CSRF token inclusion for state-changing requests
 * - Centralized error handling and base URL configuration
 * Currently, this manual URL construction and Bearer token approach won't work
 * correctly in local auth mode where cookies handle authentication.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic using exponential backoff
 *
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @param delays - Array of retry delays in ms
 * @param attempt - Current attempt number (internal)
 * @returns Fetch response
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  delays: number[],
  attempt = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
    if (response.status >= 400 && response.status < 500) {
      if (response.status !== 408 && response.status !== 429) {
        return response;
      }
    }

    // Retry on server errors (5xx)
    if (response.status >= 500 && attempt < delays.length) {
      await sleep(delays[attempt]);
      return fetchWithRetry(url, options, delays, attempt + 1);
    }

    return response;
  } catch (error) {
    // Network error - retry if attempts remain
    if (attempt < delays.length) {
      await sleep(delays[attempt]);
      return fetchWithRetry(url, options, delays, attempt + 1);
    }
    throw error;
  }
}

// ============================================================================
// Sync Item Processing
// ============================================================================

/**
 * Result of syncing a single item
 */
interface SyncItemResult {
  /** True if sync succeeded */
  success: boolean;
  /** Conflict data if 409 response */
  conflict?: ConflictItem;
  /** Error message if sync failed */
  error?: string;
}

/**
 * Sync a single inspection creation
 */
async function syncInspectionCreate(
  payload: { local_id: string; hive_id: string; data: Record<string, unknown> },
  authToken: string
): Promise<SyncItemResult> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/hives/${payload.hive_id}/inspections`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload.data),
    },
    RETRY_DELAYS
  );

  if (response.status === 409) {
    // Conflict - server has newer data or duplicate
    try {
      const serverResponse = await response.json();
      return {
        success: false,
        conflict: {
          localId: payload.local_id,
          localData: payload.data,
          serverData: serverResponse.data || serverResponse,
          recordType: 'inspections',
        },
      };
    } catch {
      return {
        success: false,
        error: 'Conflict detected but could not parse server response',
      };
    }
  }

  if (response.status === 401 || response.status === 403) {
    // Auth error - needs token refresh or re-login
    return {
      success: false,
      error: response.status === 401 ? 'Authentication expired' : 'Permission denied',
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error: `Server error: ${response.status} ${response.statusText}`,
    };
  }

  // Success - extract server ID
  try {
    const result = await response.json();
    const serverId = result.data?.id || result.id;
    if (serverId) {
      await markAsSynced(payload.local_id, serverId);
    }
    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Could not parse successful response',
    };
  }
}

/**
 * Sync a single item from the queue
 */
async function syncItem(
  item: SyncQueueItem,
  authToken: string
): Promise<SyncItemResult> {
  let payload: { local_id: string; hive_id: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(item.payload);
  } catch (parseError) {
    return {
      success: false,
      error: `Invalid sync queue item: failed to parse payload JSON (item id: ${item.id})`,
    };
  }

  if (item.table === 'inspections' && item.action === 'create') {
    return syncInspectionCreate(payload, authToken);
  }

  // SECURITY (S6-H2): Route task sync items to the task sync service
  // instead of silently failing as unsupported.
  if (item.table === 'tasks') {
    // Task items are handled by syncPendingTasks() which is called
    // separately. Skip them here to avoid double-processing.
    // Mark as pending so task sync service picks them up.
    return {
      success: true, // Don't count as failure - will be handled by task sync
    };
  }

  // Unsupported sync operation - log warning
  console.warn(`[backgroundSync] Unsupported sync operation: ${item.table}.${item.action}`);
  return {
    success: false,
    error: `Unsupported sync operation: ${item.table}.${item.action}`,
  };
}

/**
 * SECURITY (S6-M3): Extract retry count from error string.
 * Retry count is stored as a prefix "[retryN]" in the error field
 * to avoid schema migration. Returns 0 if no count found.
 */
function getRetryCount(errorStr?: string): number {
  if (!errorStr) return 0;
  const match = errorStr.match(/^\[retry(\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * SECURITY (S6-M3): Format error string with retry count prefix.
 */
function formatErrorWithRetryCount(error: string, count: number): string {
  return `[retry${count}] ${error}`;
}

/**
 * Handle sync error for an item
 */
async function handleSyncError(item: SyncQueueItem, error: string): Promise<void> {
  let payload: { local_id?: string };
  try {
    payload = JSON.parse(item.payload);
  } catch {
    // If payload is corrupted, we can't extract local_id but still update queue status (XSS-001-4)
    payload = {};
    console.warn('[backgroundSync] Could not parse sync queue item payload');
  }

  // SECURITY (S6-M3): Track retry count in error string
  const currentRetries = getRetryCount(item.error);
  const newRetryCount = currentRetries + 1;
  const errorWithRetry = formatErrorWithRetryCount(error, newRetryCount);

  // Update sync queue item status
  if (item.id !== undefined) {
    if (newRetryCount >= MAX_RETRY_COUNT) {
      // Permanently failed - won't be retried by retryAllFailedItems
      console.warn(`[backgroundSync] Item ${item.id} exceeded max retries (${MAX_RETRY_COUNT}), marking as permanently failed`);
      await db.sync_queue.update(item.id, {
        status: 'error',
        error: `[permanently_failed] ${error} (after ${newRetryCount} attempts)`,
      });
    } else {
      await db.sync_queue.update(item.id, {
        status: 'error',
        error: errorWithRetry,
      });
    }
  }

  // Mark the underlying record as having sync error
  if (item.table === 'inspections' && payload.local_id) {
    await markSyncError(payload.local_id, error);
  }
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Start the background sync process
 *
 * Processes all pending items in the sync queue, retrying failures
 * with exponential backoff. Reports progress via callback.
 *
 * @param onProgress - Callback invoked with progress updates
 * @param authToken - Authentication token for API calls
 * @returns Sync result with counts and any conflicts
 *
 * @example
 * ```ts
 * const result = await startBackgroundSync(
 *   (progress) => console.log(`${progress.completed}/${progress.total}`),
 *   'bearer-token-here'
 * );
 *
 * if (result.conflicts.length > 0) {
 *   // Handle conflicts
 * }
 * ```
 */
export async function startBackgroundSync(
  onProgress: (progress: SyncProgress) => void,
  authToken: string
): Promise<SyncResult> {
  // SECURITY (S6-H3): Acquire sync mutex to prevent concurrent sync operations
  if (!acquireSyncMutex()) {
    // Another sync is already running - skip
    return { success: true, synced: 0, failed: 0, conflicts: [] };
  }

  try {
    return await _doSync(onProgress, authToken);
  } finally {
    releaseSyncMutex();
  }
}

/**
 * Internal sync implementation (called within mutex).
 */
async function _doSync(
  onProgress: (progress: SyncProgress) => void,
  authToken: string
): Promise<SyncResult> {
  // Get all pending items from sync queue
  const pendingItems = await db.sync_queue
    .where('status')
    .equals('pending')
    .toArray();

  const progress: SyncProgress = {
    total: pendingItems.length,
    completed: 0,
    failed: 0,
  };

  const conflicts: ConflictItem[] = [];

  // Report initial progress
  onProgress(progress);

  // Process each item
  for (const item of pendingItems) {
    progress.currentItem = item.id?.toString();
    onProgress(progress);

    // Mark as syncing
    if (item.id !== undefined) {
      await db.sync_queue.update(item.id, { status: 'syncing' });
    }

    try {
      const result = await syncItem(item, authToken);

      if (result.success) {
        // Success - remove from queue
        if (item.id !== undefined) {
          await db.sync_queue.delete(item.id);
        }
        progress.completed++;
      } else if (result.conflict) {
        // Conflict - add to conflicts list for user resolution
        conflicts.push(result.conflict);
        // Mark queue item as error (will be retried after resolution)
        if (item.id !== undefined) {
          await db.sync_queue.update(item.id, {
            status: 'error',
            error: 'Conflict - awaiting resolution',
          });
        }
        progress.failed++;
      } else {
        // Other error
        await handleSyncError(item, result.error || 'Unknown error');
        progress.failed++;
      }
    } catch (error) {
      // Unexpected error
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      await handleSyncError(item, errorMessage);
      progress.failed++;
    }

    onProgress(progress);
  }

  // SECURITY (S6-H2): Process task sync items via the dedicated task sync service.
  // This ensures task creates/completions are handled properly with correct ordering.
  try {
    const taskResult = await syncPendingTasks();
    progress.completed += taskResult.synced;
    progress.failed += taskResult.errors;
  } catch (taskError) {
    console.error('[backgroundSync] Task sync failed:', taskError);
  }

  // Clear current item indicator
  progress.currentItem = undefined;
  onProgress(progress);

  return {
    success: progress.failed === 0,
    synced: progress.completed,
    failed: progress.failed,
    conflicts,
  };
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve a sync conflict by choosing local or server version
 *
 * @param localId - Local ID of the conflicting record
 * @param choice - Which version to keep: 'local' or 'server'
 * @param authToken - Authentication token for API calls
 * @returns True if resolution succeeded
 *
 * @example
 * ```ts
 * // User chose to keep their local version
 * await resolveConflict('local_abc123', 'local', token);
 *
 * // User chose to accept server version
 * await resolveConflict('local_abc123', 'server', token);
 * ```
 */
export async function resolveConflict(
  localId: string,
  choice: 'local' | 'server',
  authToken: string
): Promise<boolean> {
  // Find the sync queue entry for this local ID
  const syncEntries = await db.sync_queue
    .where('table')
    .equals('inspections')
    .filter(entry => {
      try {
        const payload = JSON.parse(entry.payload);
        return payload.local_id === localId;
      } catch {
        // Skip entries with corrupted JSON (XSS-001-4)
        return false;
      }
    })
    .toArray();

  if (syncEntries.length === 0) {
    console.error('[backgroundSync] No sync entry found for localId:', localId);
    return false;
  }

  const entry = syncEntries[0];
  let payload: { local_id: string; hive_id: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(entry.payload);
  } catch {
    console.error('[backgroundSync] Failed to parse sync entry payload for localId:', localId);
    return false;
  }

  if (choice === 'local') {
    // Force push local version to server
    const response = await fetchWithRetry(
      `${API_BASE_URL}/api/hives/${payload.hive_id}/inspections?force=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload.data),
      },
      RETRY_DELAYS
    );

    if (!response.ok) {
      console.error('[backgroundSync] Force push failed:', response.status);
      return false;
    }

    // Success - mark as synced and remove from queue
    try {
      const result = await response.json();
      const serverId = result.data?.id || result.id;
      if (serverId) {
        await markAsSynced(localId, serverId);
      }
    } catch {
      // Response may not have body, that's ok
    }

    if (entry.id !== undefined) {
      await db.sync_queue.delete(entry.id);
    }

    return true;
  } else {
    // choice === 'server': delete local version and accept server
    // Delete local inspection
    const localInspection = await db.inspections
      .where('local_id')
      .equals(localId)
      .first();

    if (localInspection) {
      await db.inspections.delete(localInspection.id);
    }

    // Remove from sync queue
    if (entry.id !== undefined) {
      await db.sync_queue.delete(entry.id);
    }

    return true;
  }
}

/**
 * Get count of items currently pending sync
 */
export async function getPendingSyncCount(): Promise<number> {
  return db.sync_queue.where('status').equals('pending').count();
}

/**
 * Retry a failed sync item
 *
 * @param itemId - ID of the sync queue item to retry
 */
export async function retrySyncItem(itemId: number): Promise<void> {
  await db.sync_queue.update(itemId, {
    status: 'pending',
    error: undefined,
  });

  // Also clear the sync_error on the underlying record if it's an inspection
  const item = await db.sync_queue.get(itemId);
  if (item && item.table === 'inspections') {
    try {
      const payload = JSON.parse(item.payload);
      if (payload.local_id) {
        const inspection = await db.inspections
          .where('local_id')
          .equals(payload.local_id)
          .first();
        if (inspection) {
          await db.inspections.update(inspection.id, { sync_error: null });
        }
      }
    } catch {
      // Skip if payload is corrupted (XSS-001-4)
      console.warn('[backgroundSync] Could not parse payload in retrySyncItem');
    }
  }
}

/**
 * Retry all failed sync items.
 * SECURITY (S6-M3): Skips items marked as permanently failed (exceeded MAX_RETRY_COUNT).
 */
export async function retryAllFailedItems(): Promise<number> {
  const failedItems = await db.sync_queue
    .where('status')
    .equals('error')
    .filter(item => !(item.error?.startsWith('[permanently_failed]')))
    .toArray();

  for (const item of failedItems) {
    if (item.id !== undefined) {
      await retrySyncItem(item.id);
    }
  }

  return failedItems.length;
}

export default startBackgroundSync;
