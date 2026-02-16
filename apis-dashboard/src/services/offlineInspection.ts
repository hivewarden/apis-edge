/**
 * Offline Inspection Service
 *
 * Manages offline inspection creation, updates, and retrieval using IndexedDB.
 * Works with the sync queue to track pending operations for later sync.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 *
 * @module services/offlineInspection
 */
import { db, type CachedInspection, type PendingInspection, type SyncQueueItem } from './db';

// ============================================================================
// Types
// ============================================================================

/**
 * Input data for creating an offline inspection
 * Matches the API payload structure from InspectionCreate.tsx
 */
export interface OfflineInspectionInput {
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string | null;
  frames?: Array<{
    box_position: number;
    box_type: string;
    total_frames: number;
    drawn_frames: number;
    brood_frames: number;
    honey_frames: number;
    pollen_frames: number;
  }>;
}

// Re-export CachedInspectionFrame from db.ts for convenience
export type { CachedInspectionFrame } from './db';

// ============================================================================
// Local ID Generation
// ============================================================================

/**
 * Generate a unique local ID for offline inspections
 * Format: local_<uuid>
 *
 * @returns Unique local identifier
 */
export function generateLocalId(): string {
  return `local_${crypto.randomUUID()}`;
}

// ============================================================================
// Offline Inspection Operations
// ============================================================================

/**
 * Save an inspection to IndexedDB while offline
 *
 * Creates the inspection with a temporary local ID and marks it as pending sync.
 * Also adds an entry to the sync queue for later synchronization.
 *
 * @param hiveId - The hive ID this inspection belongs to
 * @param tenantId - The tenant ID (user's organization)
 * @param data - The inspection data from the form
 * @returns The created pending inspection with local ID
 *
 * @example
 * ```ts
 * const inspection = await saveOfflineInspection('hive-123', 'tenant-456', {
 *   inspected_at: '2026-01-25',
 *   queen_seen: true,
 *   // ... other fields
 * });
 * console.log(inspection.local_id); // 'local_abc123...'
 * ```
 */
export async function saveOfflineInspection(
  hiveId: string,
  tenantId: string,
  data: OfflineInspectionInput
): Promise<PendingInspection> {
  const localId = generateLocalId();
  const now = new Date();
  const nowISO = now.toISOString();

  // Build the inspection record
  const inspection: PendingInspection = {
    id: localId, // Use local ID as the primary key temporarily
    local_id: localId,
    tenant_id: tenantId,
    hive_id: hiveId,
    date: data.inspected_at,
    queen_seen: data.queen_seen,
    eggs_seen: data.eggs_seen,
    // queen_cells: CachedInspection stores as number (0/1) per db.ts schema line 62
    // Input is boolean | null; null -> 0 (treated as "not checked"), true -> 1, false -> 0
    // Reverse conversion in InspectionHistory.tsx:117 uses queen_cells > 0
    queen_cells: data.queen_cells === true ? 1 : 0,
    brood_frames: data.brood_frames,
    brood_pattern: data.brood_pattern,
    honey_stores: data.honey_level,
    pollen_stores: data.pollen_level,
    space_assessment: null,
    needs_super: false,
    varroa_estimate: null,
    temperament: data.temperament,
    issues: data.issues.length > 0 ? JSON.stringify(data.issues) : null,
    actions: null,
    notes: data.notes,
    version: 1,
    created_at: nowISO,
    updated_at: nowISO,
    // TODO (S6-L3): synced_at is misleading for offline-created inspections --
    // it's set to creation time but the record hasn't actually been synced.
    // Consider using new Date(0) as a sentinel, or always check pending_sync
    // flag in pruning queries (see offlineCache.ts pruneOldData).
    synced_at: now,
    accessed_at: now,
    pending_sync: true,
    sync_error: null,
  };

  // Add to sync queue
  const syncEntry: SyncQueueItem = {
    table: 'inspections',
    action: 'create',
    payload: JSON.stringify({
      local_id: localId,
      hive_id: hiveId,
      data: data,
    }),
    created_at: now,
    status: 'pending',
  };

  // Use transaction to ensure atomicity - both operations succeed or both fail
  await db.transaction('rw', [db.inspections, db.sync_queue], async () => {
    await db.inspections.put(inspection);
    await db.sync_queue.add(syncEntry);
  });

  return inspection;
}

/**
 * Update a pending offline inspection
 *
 * Updates an inspection that hasn't been synced yet. Only works for
 * inspections with pending_sync=true.
 *
 * @param localId - The local ID of the inspection to update
 * @param data - The updated inspection data
 * @returns The updated inspection, or null if not found or not editable
 *
 * @example
 * ```ts
 * const updated = await updateOfflineInspection('local_abc123', {
 *   queen_seen: false,
 *   // ... other fields
 * });
 * ```
 */
export async function updateOfflineInspection(
  localId: string,
  data: Partial<OfflineInspectionInput>
): Promise<PendingInspection | null> {
  return db.transaction('rw', [db.inspections, db.sync_queue], async () => {
    // Find the existing inspection by local_id
    const existing = await db.inspections
      .where('local_id')
      .equals(localId)
      .first();

    if (!existing || !existing.pending_sync) {
      return null;
    }

    const now = new Date();
    const updates: Partial<CachedInspection> = {
      updated_at: now.toISOString(),
      accessed_at: now,
    };

    // Apply partial updates
    if (data.inspected_at !== undefined) updates.date = data.inspected_at;
    if (data.queen_seen !== undefined) updates.queen_seen = data.queen_seen;
    if (data.eggs_seen !== undefined) updates.eggs_seen = data.eggs_seen;
    // Same conversion as saveOfflineInspection - null/false -> 0, true -> 1
    if (data.queen_cells !== undefined) updates.queen_cells = data.queen_cells === true ? 1 : 0;
    if (data.brood_frames !== undefined) updates.brood_frames = data.brood_frames;
    if (data.brood_pattern !== undefined) updates.brood_pattern = data.brood_pattern;
    if (data.honey_level !== undefined) updates.honey_stores = data.honey_level;
    if (data.pollen_level !== undefined) updates.pollen_stores = data.pollen_level;
    if (data.temperament !== undefined) updates.temperament = data.temperament;
    if (data.issues !== undefined) updates.issues = data.issues.length > 0 ? JSON.stringify(data.issues) : null;
    if (data.notes !== undefined) updates.notes = data.notes;

    await db.inspections.update(existing.id, updates);

    // Update the sync queue entry payload
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

    if (syncEntries.length > 0) {
      const entry = syncEntries[0];
      try {
        const payload = JSON.parse(entry.payload);
        payload.data = { ...payload.data, ...data };
        await db.sync_queue.update(entry.id!, { payload: JSON.stringify(payload) });
      } catch {
        // Skip update if payload is corrupted (XSS-001-4)
        console.warn('[offlineInspection] Skipping sync queue update due to corrupted payload');
      }
    }

    return { ...existing, ...updates, pending_sync: true, local_id: localId } as PendingInspection;
  });
}

/**
 * Get offline inspections for a hive (pending sync only)
 *
 * Retrieves all inspections with pending_sync=true for a specific hive.
 * If no hiveId is provided, returns all pending inspections.
 *
 * @param hiveId - Optional hive ID to filter by
 * @returns Array of pending inspections
 */
export async function getOfflineInspections(hiveId?: string): Promise<PendingInspection[]> {
  // Filter for pending_sync = true (Dexie stores booleans as true/false, not 1/0)
  const allInspections = await db.inspections
    .filter(i => i.pending_sync === true)
    .toArray();

  if (hiveId) {
    return allInspections.filter(i => i.hive_id === hiveId) as PendingInspection[];
  }

  return allInspections as PendingInspection[];
}

/**
 * Get count of inspections pending sync
 *
 * @returns Number of pending inspections
 */
export async function getPendingCount(): Promise<number> {
  return db.inspections.filter(i => i.pending_sync === true).count();
}

/**
 * Mark an inspection as synced after successful server sync
 *
 * Updates the local inspection with the server-assigned ID and clears
 * the pending_sync flag. Also removes the corresponding sync queue entry.
 *
 * @param localId - The local ID of the inspection
 * @param serverId - The server-assigned ID after sync
 *
 * @example
 * ```ts
 * // After successful POST to server
 * await markAsSynced('local_abc123', 'server-uuid-456');
 * ```
 */
export async function markAsSynced(localId: string, serverId: string): Promise<void> {
  // Find the existing inspection
  const existing = await db.inspections
    .where('local_id')
    .equals(localId)
    .first();

  if (!existing) {
    return;
  }

  const now = new Date();

  // SECURITY (S6-C2): Use transaction for atomic delete-then-put to prevent
  // data loss if the operation is interrupted between delete and put.
  await db.transaction('rw', [db.inspections, db.sync_queue], async () => {
    // Update the inspection: change ID to server ID, clear pending flags
    await db.inspections.delete(existing.id); // Remove the local_id keyed record
    await db.inspections.put({
      ...existing,
      id: serverId,
      pending_sync: false,
      local_id: null,
      sync_error: null,
      synced_at: now,
      accessed_at: now,
    });

    // Remove from sync queue
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

    for (const entry of syncEntries) {
      await db.sync_queue.delete(entry.id!);
    }
  });
}

/**
 * Mark an inspection sync as failed
 *
 * Updates the sync_error field and marks the sync queue entry as error.
 *
 * @param localId - The local ID of the inspection
 * @param error - The error message
 */
export async function markSyncError(localId: string, error: string): Promise<void> {
  // Update the inspection
  const existing = await db.inspections
    .where('local_id')
    .equals(localId)
    .first();

  if (existing) {
    await db.inspections.update(existing.id, { sync_error: error });
  }

  // Update sync queue entry
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

  for (const entry of syncEntries) {
    await db.sync_queue.update(entry.id!, { status: 'error', error });
  }
}

/**
 * Get all pending sync queue items
 *
 * Returns all items in the sync queue with status 'pending'.
 *
 * @returns Array of pending sync queue items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return db.sync_queue.where('status').equals('pending').toArray();
}

/**
 * Delete a pending offline inspection
 *
 * Removes an inspection and its sync queue entry. Only works for
 * pending_sync inspections.
 *
 * @param localId - The local ID of the inspection to delete
 * @returns true if deleted, false if not found or not deletable
 */
export async function deleteOfflineInspection(localId: string): Promise<boolean> {
  const existing = await db.inspections
    .where('local_id')
    .equals(localId)
    .first();

  if (!existing || !existing.pending_sync) {
    return false;
  }

  // Delete the inspection
  await db.inspections.delete(existing.id);

  // Delete from sync queue
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

  for (const entry of syncEntries) {
    await db.sync_queue.delete(entry.id!);
  }

  return true;
}
