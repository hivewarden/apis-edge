/**
 * Background Sync Hook
 *
 * React hook for managing automatic background synchronization of offline data.
 * Automatically triggers sync when device transitions from offline to online,
 * and provides manual sync controls.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 *
 * @module hooks/useBackgroundSync
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useOnlineStatus } from './useOnlineStatus';
import { useAuth } from './useAuth';
import { db } from '../services/db';
import {
  startBackgroundSync,
  resolveConflict as resolveConflictService,
  retryAllFailedItems,
  type SyncProgress,
  type SyncResult,
  type ConflictItem,
} from '../services/backgroundSync';

// ============================================================================
// Types
// ============================================================================

/**
 * Return type for the useBackgroundSync hook
 */
export interface UseBackgroundSyncResult {
  /** True when sync is in progress */
  isSyncing: boolean;
  /** Current sync progress, null when not syncing */
  progress: SyncProgress | null;
  /** Result of the last sync attempt */
  lastSyncResult: SyncResult | null;
  /** Manually trigger a sync */
  triggerSync: () => Promise<void>;
  /** List of conflicts awaiting resolution */
  conflicts: ConflictItem[];
  /** Resolve a specific conflict */
  resolveConflict: (localId: string, choice: 'local' | 'server') => Promise<boolean>;
  /** Clear all conflicts (after viewing) */
  clearConflicts: () => void;
  /** Retry all failed items */
  retryFailed: () => Promise<number>;
  /** Number of items pending sync */
  pendingCount: number;
  /** Number of items that failed to sync */
  failedCount: number;
  /** True if there was an auth error (token expired) */
  hasAuthError: boolean;
  /** Clear auth error state */
  clearAuthError: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to manage background synchronization of offline data
 *
 * Automatically syncs when:
 * - Device transitions from offline to online
 * - There are pending items in the sync queue
 *
 * @returns Object with sync state and controls
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const {
 *     isSyncing,
 *     progress,
 *     pendingCount,
 *     triggerSync,
 *   } = useBackgroundSync();
 *
 *   if (isSyncing && progress) {
 *     return <span>Syncing {progress.completed}/{progress.total}...</span>;
 *   }
 *
 *   if (pendingCount > 0) {
 *     return <Button onClick={triggerSync}>Sync {pendingCount} items</Button>;
 *   }
 *
 *   return <span>All synced</span>;
 * }
 * ```
 */
export function useBackgroundSync(): UseBackgroundSyncResult {
  // Track online/offline status
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(!isOnline);

  // Get auth functions
  const { isAuthenticated, getAccessToken } = useAuth();

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [hasAuthError, setHasAuthError] = useState(false);

  // Track sync in progress to prevent duplicate triggers
  const syncInProgress = useRef(false);

  // Watch sync queue for pending items (reactive)
  const pendingCount = useLiveQuery(
    () => db.sync_queue.where('status').equals('pending').count(),
    [],
    0
  );

  // Watch for failed items
  const failedCount = useLiveQuery(
    () => db.sync_queue.where('status').equals('error').count(),
    [],
    0
  );

  /**
   * Trigger sync manually or automatically
   */
  const triggerSync = useCallback(async () => {
    // Prevent concurrent syncs
    if (syncInProgress.current || !isOnline) {
      return;
    }

    // Need authentication to sync
    if (!isAuthenticated) {
      console.warn('[useBackgroundSync] Not authenticated, cannot sync');
      setHasAuthError(true);
      return;
    }

    // Get the access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[useBackgroundSync] No auth token available, cannot sync');
      setHasAuthError(true);
      return;
    }

    // Check if there are pending items
    const count = await db.sync_queue.where('status').equals('pending').count();
    if (count === 0) {
      return;
    }

    syncInProgress.current = true;
    setIsSyncing(true);
    setProgress({ total: count, completed: 0, failed: 0 });
    setHasAuthError(false);

    try {
      const result = await startBackgroundSync(
        (newProgress) => setProgress({ ...newProgress }),
        accessToken
      );

      setLastSyncResult(result);

      // Check for auth errors in the result
      if (result.failed > 0 && result.synced === 0) {
        // If all items failed, might be an auth issue
        const errorItems = await db.sync_queue.where('status').equals('error').toArray();
        const authErrors = errorItems.filter(
          item => item.error?.includes('Authentication') || item.error?.includes('Permission')
        );
        if (authErrors.length > 0) {
          setHasAuthError(true);
        }
      }

      // Add any new conflicts
      if (result.conflicts.length > 0) {
        setConflicts(prev => [...prev, ...result.conflicts]);
      }
    } catch (error) {
      console.error('[useBackgroundSync] Sync failed:', error);
      setLastSyncResult({
        success: false,
        synced: 0,
        failed: pendingCount ?? 0,
        conflicts: [],
      });
    } finally {
      setIsSyncing(false);
      setProgress(null);
      syncInProgress.current = false;
    }
  }, [isOnline, isAuthenticated, getAccessToken, pendingCount]);

  /**
   * Auto-sync when coming back online
   */
  useEffect(() => {
    // Check if we transitioned from offline to online
    const wentOnline = isOnline && wasOffline.current;
    wasOffline.current = !isOnline;

    if (wentOnline && pendingCount && pendingCount > 0 && !syncInProgress.current) {
      // Small delay to let network stabilize
      const timer = setTimeout(() => {
        triggerSync();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingCount, triggerSync]);

  /**
   * Resolve a conflict
   */
  const resolveConflict = useCallback(
    async (localId: string, choice: 'local' | 'server'): Promise<boolean> => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setHasAuthError(true);
        return false;
      }

      const success = await resolveConflictService(localId, choice, accessToken);

      if (success) {
        // Remove from conflicts list
        setConflicts(prev => prev.filter(c => c.localId !== localId));
      }

      return success;
    },
    [getAccessToken]
  );

  /**
   * Clear all conflicts (e.g., after user has viewed them)
   */
  const clearConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  /**
   * Retry all failed items
   */
  const retryFailed = useCallback(async (): Promise<number> => {
    const count = await retryAllFailedItems();
    // Trigger sync after resetting items to pending
    // Use 500ms delay to ensure IndexedDB operations complete and state updates propagate
    if (count > 0 && isOnline) {
      setTimeout(() => triggerSync(), 500);
    }
    return count;
  }, [isOnline, triggerSync]);

  /**
   * Clear auth error state
   */
  const clearAuthError = useCallback(() => {
    setHasAuthError(false);
  }, []);

  return {
    isSyncing,
    progress,
    lastSyncResult,
    triggerSync,
    conflicts,
    resolveConflict,
    clearConflicts,
    retryFailed,
    pendingCount: pendingCount ?? 0,
    failedCount: failedCount ?? 0,
    hasAuthError,
    clearAuthError,
  };
}

export default useBackgroundSync;
