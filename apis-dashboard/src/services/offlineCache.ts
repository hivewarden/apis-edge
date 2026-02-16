/**
 * Offline Cache Service
 *
 * Provides functions for managing cached data in IndexedDB.
 * Handles caching API responses, retrieving cached data, storage management,
 * and automatic pruning when storage exceeds limits.
 *
 * @module services/offlineCache
 */
import { db, type CacheableTable } from './db';

// ============================================================================
// Constants
// ============================================================================

/** Maximum storage size in MB before pruning is triggered */
export const MAX_STORAGE_MB = 50;

/** Target storage size after pruning (80% of max) */
export const TARGET_STORAGE_MB = MAX_STORAGE_MB * 0.8;

/** Minimum days of inspections to keep during pruning */
export const MIN_INSPECTION_DAYS = 30;

/** Approximate byte sizes per record type (for storage estimation) */
const RECORD_SIZES: Record<CacheableTable, number> = {
  sites: 500,
  hives: 800,
  inspections: 2000,
  detections: 300,
  units: 400,
  sync_queue: 500,
  tasks: 800,
};

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Cache API response data to IndexedDB
 *
 * Adds offline metadata (synced_at, accessed_at) to each record
 * and stores in the appropriate table.
 *
 * @param table - The table to store data in
 * @param data - Single record or array of records to cache
 *
 * @example
 * ```ts
 * // Cache a list of hives from API response
 * const hives = await fetchHives();
 * await cacheApiResponse('hives', hives);
 * ```
 */
export async function cacheApiResponse<T extends { id: string }>(
  table: CacheableTable,
  data: T | T[]
): Promise<void> {
  const now = new Date();
  const items = Array.isArray(data) ? data : [data];

  if (items.length === 0) return;

  const enrichedItems = items.map((item) => ({
    ...item,
    synced_at: now,
    accessed_at: now,
  }));

  // Use bulkPut to upsert records (update if exists, insert if not)
  await db.table(table).bulkPut(enrichedItems);

  // Update last sync timestamp for the table
  await db.metadata.put({ key: `lastSync_${table}`, value: now });
}

/**
 * Get cached data from IndexedDB
 *
 * Retrieves records from the specified table, optionally filtered.
 * Updates accessed_at timestamp for retrieved records.
 *
 * @param table - The table to retrieve from
 * @param filter - Optional key-value pairs to filter results
 * @returns Array of matching records
 *
 * @example
 * ```ts
 * // Get all hives for a site
 * const hives = await getCachedData<CachedHive>('hives', { site_id: 'site-123' });
 * ```
 */
export async function getCachedData<T>(
  table: CacheableTable,
  filter?: Record<string, unknown>
): Promise<T[]> {
  let collection = db.table(table).toCollection();

  if (filter) {
    // Apply filters using filter() for flexibility
    for (const [key, value] of Object.entries(filter)) {
      collection = collection.filter(
        (item) => (item as Record<string, unknown>)[key] === value
      );
    }
  }

  const results = await collection.toArray();

  // Update access time for retrieved records
  if (results.length > 0) {
    const now = new Date();
    await Promise.all(
      results.map((item) =>
        db.table(table).update((item as { id: string }).id, { accessed_at: now })
      )
    );
  }

  return results as T[];
}

/**
 * Get cached data by ID
 *
 * Retrieves a single record by its ID and updates accessed_at.
 *
 * @param table - The table to retrieve from
 * @param id - The record ID
 * @returns The record or undefined if not found
 */
export async function getCachedById<T>(
  table: CacheableTable,
  id: string
): Promise<T | undefined> {
  const record = await db.table(table).get(id);

  if (record) {
    await db.table(table).update(id, { accessed_at: new Date() });
  }

  return record as T | undefined;
}

// ============================================================================
// Sync Timestamps
// ============================================================================

/**
 * Get the last sync time for a table or overall
 *
 * @param table - Optional table name. If omitted, returns most recent sync across all tables.
 * @returns The last sync Date, or null if never synced
 *
 * @example
 * ```ts
 * // Get last sync for hives
 * const lastHiveSync = await getLastSyncTime('hives');
 *
 * // Get most recent sync overall
 * const lastSync = await getLastSyncTime();
 * ```
 */
export async function getLastSyncTime(table?: CacheableTable): Promise<Date | null> {
  if (table) {
    const meta = await db.metadata.get(`lastSync_${table}`);
    if (!meta) return null;

    // Handle both Date objects and ISO strings
    const value = meta.value;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  // SECURITY (S6-M5): Include tasks table in last sync time calculation
  const tables: CacheableTable[] = ['sites', 'hives', 'inspections', 'detections', 'units', 'tasks'];
  const times = await Promise.all(tables.map((t) => getLastSyncTime(t)));

  const validTimes = times.filter((t): t is Date => t !== null);
  if (validTimes.length === 0) return null;

  return new Date(Math.max(...validTimes.map((t) => t.getTime())));
}

/**
 * Update the access time for a specific record
 *
 * @param table - The table containing the record
 * @param id - The record ID
 */
export async function updateAccessTime(table: CacheableTable, id: string): Promise<void> {
  await db.table(table).update(id, { accessed_at: new Date() });
}

// ============================================================================
// Storage Management
// ============================================================================

/**
 * Calculate approximate storage size in MB
 *
 * Estimates total IndexedDB usage based on record counts and
 * average record sizes. This is an approximation since IndexedDB
 * doesn't provide direct size queries.
 *
 * @returns Estimated storage size in megabytes
 */
export async function calculateStorageSize(): Promise<number> {
  // SECURITY (S6-M1): Include tasks table in storage estimation
  const counts = await Promise.all([
    db.sites.count(),
    db.hives.count(),
    db.inspections.count(),
    db.detections.count(),
    db.units.count(),
    db.tasks.count(),
  ]);

  const tables: CacheableTable[] = ['sites', 'hives', 'inspections', 'detections', 'units', 'tasks'];
  const totalBytes = counts.reduce(
    (sum, count, i) => sum + count * RECORD_SIZES[tables[i]],
    0
  );

  return totalBytes / (1024 * 1024);
}

/**
 * Prune old data when storage exceeds limit
 *
 * Pruning strategy (preserves most valuable data):
 * 1. Remove oldest detections first (largest data, least critical for offline)
 * 2. Remove old inspections (keep last 30 days minimum)
 * 3. Keep all sites and hives (small data, critical for navigation)
 *
 * @param maxSizeMB - Maximum storage size before pruning (default: 50MB)
 * @returns Number of records pruned
 */
export async function pruneOldData(maxSizeMB: number = MAX_STORAGE_MB): Promise<number> {
  const currentSize = await calculateStorageSize();
  if (currentSize <= maxSizeMB) return 0;

  let prunedCount = 0;
  const targetSize = maxSizeMB * 0.8; // Prune to 80% of max

  console.log(
    `[OfflineCache] Storage ${currentSize.toFixed(1)}MB exceeds ${maxSizeMB}MB. Pruning to ${targetSize.toFixed(1)}MB...`
  );

  // Phase 1: Prune detections (largest and least critical for offline viewing)
  while ((await calculateStorageSize()) > targetSize) {
    const oldestDetections = await db.detections
      .orderBy('accessed_at')
      .limit(100)
      .toArray();

    if (oldestDetections.length === 0) break;

    await db.detections.bulkDelete(oldestDetections.map((d) => d.id));
    prunedCount += oldestDetections.length;
  }

  // Phase 2: Prune old inspections (keep at least 30 days)
  // SECURITY (S6-M4): Never prune inspections that haven't been synced to server
  if ((await calculateStorageSize()) > targetSize) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MIN_INSPECTION_DAYS);

    while ((await calculateStorageSize()) > targetSize) {
      const oldInspections = await db.inspections
        .where('synced_at')
        .below(cutoffDate)
        .filter(i => !i.pending_sync) // Never prune unsynced inspections
        .limit(50)
        .toArray();

      if (oldInspections.length === 0) break;

      await db.inspections.bulkDelete(oldInspections.map((i) => i.id));
      prunedCount += oldInspections.length;
    }
  }

  const finalSize = await calculateStorageSize();
  console.log(
    `[OfflineCache] Pruned ${prunedCount} records. Storage now ${finalSize.toFixed(1)}MB`
  );

  return prunedCount;
}

/**
 * Check storage and prune if necessary
 *
 * Call this on app startup to ensure storage stays within limits.
 *
 * @returns Object with current size and prune count
 */
export async function checkAndPruneStorage(): Promise<{
  sizeMB: number;
  prunedCount: number;
}> {
  const sizeMB = await calculateStorageSize();

  if (sizeMB > MAX_STORAGE_MB) {
    const prunedCount = await pruneOldData();
    const newSize = await calculateStorageSize();
    return { sizeMB: newSize, prunedCount };
  }

  return { sizeMB, prunedCount: 0 };
}

// ============================================================================
// Cache Clearing
// ============================================================================

/**
 * Clear all cached data
 *
 * Use for logout or manual cache reset.
 * Clears all tables and metadata.
 */
export async function clearAllCache(): Promise<void> {
  await Promise.all([
    db.sites.clear(),
    db.hives.clear(),
    db.inspections.clear(),
    db.detections.clear(),
    db.units.clear(),
    db.tasks.clear(),
    db.sync_queue.clear(),
    db.metadata.clear(),
  ]);

  console.log('[OfflineCache] All cached data cleared');
}

/**
 * Clear cached data for a specific table
 *
 * @param table - The table to clear
 */
export async function clearTableCache(table: CacheableTable): Promise<void> {
  await db.table(table).clear();
  await db.metadata.delete(`lastSync_${table}`);

  console.log(`[OfflineCache] Cleared ${table} cache`);
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics for display
 *
 * @returns Object with counts per table and total storage
 */
export async function getCacheStats(): Promise<{
  sites: number;
  hives: number;
  inspections: number;
  detections: number;
  units: number;
  tasks: number;
  totalRecords: number;
  storageMB: number;
  lastSync: Date | null;
}> {
  // SECURITY (S6-M2): Include tasks table in cache stats
  const [sites, hives, inspections, detections, units, tasks, storageMB, lastSync] =
    await Promise.all([
      db.sites.count(),
      db.hives.count(),
      db.inspections.count(),
      db.detections.count(),
      db.units.count(),
      db.tasks.count(),
      calculateStorageSize(),
      getLastSyncTime(),
    ]);

  return {
    sites,
    hives,
    inspections,
    detections,
    units,
    tasks,
    totalRecords: sites + hives + inspections + detections + units + tasks,
    storageMB,
    lastSync,
  };
}
