/**
 * Pending Sync Hook
 *
 * React hook for tracking items pending synchronization with the server.
 * Uses Dexie's useLiveQuery for reactive updates when IndexedDB changes.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 *
 * @module hooks/usePendingSync
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { PendingInspection, SyncQueueItem } from '../services/db';

// ============================================================================
// Types
// ============================================================================

/**
 * Pending item grouped by type
 */
export interface PendingItemGroup {
  /** Type of pending item (e.g., 'inspections') */
  type: 'inspections' | 'other';
  /** Display label for the group */
  label: string;
  /** Number of items in this group */
  count: number;
  /** The pending items */
  items: PendingInspection[];
}

/**
 * Return type for the usePendingSync hook
 */
export interface UsePendingSyncResult {
  /** Total count of all pending items */
  pendingCount: number;
  /** Count of pending inspections specifically */
  pendingInspections: number;
  /** Array of all pending inspection items */
  pendingItems: PendingInspection[];
  /** Pending items grouped by type */
  pendingGroups: PendingItemGroup[];
  /** True while loading from IndexedDB */
  isLoading: boolean;
  /** Refetch function (though useLiveQuery auto-updates) */
  refetch: () => void;
  /** Raw sync queue items */
  syncQueueItems: SyncQueueItem[];
  /** True if there are any sync errors */
  hasErrors: boolean;
  /** Items that failed to sync */
  errorItems: PendingInspection[];
  /** Count of items currently syncing */
  syncingCount: number;
  /** Error if IndexedDB operations fail */
  dbError: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to track items pending synchronization
 *
 * Uses Dexie's useLiveQuery for reactive updates - automatically
 * re-renders when IndexedDB changes.
 *
 * @returns Object with pending counts, items, and loading state
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const { pendingCount, isLoading } = usePendingSync();
 *
 *   if (isLoading) return <Spin />;
 *
 *   return (
 *     <Badge count={pendingCount}>
 *       <SyncOutlined />
 *     </Badge>
 *   );
 * }
 * ```
 */
export function usePendingSync(): UsePendingSyncResult {
  // Track IndexedDB errors
  const [dbError, setDbError] = useState<Error | null>(null);

  // Query pending inspections reactively with error handling
  // Dexie stores booleans as 1/0 in indexed columns
  const pendingInspections = useLiveQuery(
    async () => {
      try {
        const result = await db.inspections.filter(i => i.pending_sync === true).toArray();
        // Clear any previous error on successful query
        setDbError(null);
        return result;
      } catch (e) {
        const error = e instanceof Error ? e : new Error('Failed to query pending inspections');
        console.error('[usePendingSync] Error querying pending inspections:', error);
        setDbError(error);
        return [];
      }
    },
    []
  );

  // Query sync queue items with error handling
  const syncQueueItems = useLiveQuery(
    async () => {
      try {
        return await db.sync_queue.toArray();
      } catch (e) {
        console.error('[usePendingSync] Error querying sync queue:', e);
        return [];
      }
    },
    []
  );

  // Query items currently syncing with error handling
  const syncingItems = useLiveQuery(
    async () => {
      try {
        return await db.sync_queue.where('status').equals('syncing').count();
      } catch (e) {
        console.error('[usePendingSync] Error querying syncing items:', e);
        return 0;
      }
    },
    [],
    0
  );

  // Calculate loading state
  const isLoading = pendingInspections === undefined || syncQueueItems === undefined;

  // Calculate counts
  const inspectionCount = pendingInspections?.length ?? 0;
  const totalCount = inspectionCount; // Add other types here in future

  // Find items with errors
  const errorItems = (pendingInspections ?? []).filter(
    i => i.sync_error !== null && i.sync_error !== undefined
  );
  const hasErrors = errorItems.length > 0;

  // Group pending items by type
  const pendingGroups: PendingItemGroup[] = [];

  if (inspectionCount > 0) {
    pendingGroups.push({
      type: 'inspections',
      label: inspectionCount === 1 ? '1 inspection' : `${inspectionCount} inspections`,
      count: inspectionCount,
      items: (pendingInspections ?? []) as PendingInspection[],
    });
  }

  // Refetch is a no-op since useLiveQuery auto-updates
  // But we expose it for API consistency
  const refetch = () => {
    // useLiveQuery automatically updates, so nothing to do
    console.log('[usePendingSync] Manual refetch triggered (no-op with live queries)');
  };

  return {
    pendingCount: totalCount,
    pendingInspections: inspectionCount,
    pendingItems: (pendingInspections ?? []) as PendingInspection[],
    pendingGroups,
    isLoading,
    refetch,
    syncQueueItems: syncQueueItems ?? [],
    hasErrors,
    errorItems: errorItems as PendingInspection[],
    syncingCount: syncingItems ?? 0,
    dbError,
  };
}

export default usePendingSync;
