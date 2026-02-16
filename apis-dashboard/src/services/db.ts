/**
 * IndexedDB Database Service
 *
 * Dexie.js wrapper providing offline storage for the APIS dashboard.
 * Mirrors the server database tables with additional offline metadata fields.
 *
 * SECURITY (PWA-001-1): Data Sensitivity Classification
 *
 * This database stores offline data to enable PWA functionality. Data is
 * classified by sensitivity level:
 *
 * LOW SENSITIVITY (safe to cache):
 * - sites: Location names, coordinates (already public via maps)
 * - hives: Hive configurations (non-personal)
 * - units: Device metadata (serial numbers, firmware versions)
 * - detections: Event timestamps and counts (aggregated data)
 * - tasks: Maintenance tasks and reminders
 *
 * MEDIUM SENSITIVITY (cache with caution):
 * - inspections: Contains user notes which may have personal observations
 *
 * NOT CACHED (sensitive data):
 * - Authentication tokens (stored in-memory only, AUTH-001-1-DASH)
 * - User passwords (never stored client-side)
 * - API keys (never stored in browser)
 *
 * SECURITY CONSIDERATIONS:
 * 1. IndexedDB is accessible to any JavaScript in the same origin
 * 2. Data is NOT encrypted at rest (browser limitation)
 * 3. Data is cleared on logout (PWA-001-5-INFRA)
 * 4. Tenant isolation is maintained via tenant_id in all records
 * 5. Service worker does NOT cache auth responses (PWA-001-3)
 *
 * For higher security requirements, consider:
 * - Using Web Crypto API to encrypt sensitive fields before storage
 * - Reducing offline data retention period
 * - Adding data expiration timestamps
 *
 * @module services/db
 */
import Dexie, { type Table } from 'dexie';

// ============================================================================
// Cache Version Management (PWA-001-4-INFRA)
// ============================================================================

/**
 * Cache version for forced invalidation.
 *
 * SECURITY (PWA-001-4-INFRA): Increment this when you need to force all clients
 * to clear their cached data. This is useful when:
 * - Schema changes require data migration
 * - Security patches require clearing potentially compromised data
 * - Data format changes that are incompatible with old cached data
 *
 * The version is stored in metadata and checked on app startup.
 * If the stored version is older, all cached data is cleared.
 */
export const CACHE_VERSION = 1;

/**
 * Metadata key for storing cache version
 */
const CACHE_VERSION_KEY = 'cache_version';

// ============================================================================
// Cached Entity Interfaces
// ============================================================================

/**
 * Cached site data with offline metadata
 */
export interface CachedSite {
  id: string;
  tenant_id: string;
  name: string;
  gps_lat: number | null;
  gps_lng: number | null;
  timezone: string;
  created_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
}

/**
 * Cached hive data with offline metadata
 */
export interface CachedHive {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  brood_boxes: number;
  honey_supers: number;
  notes: string | null;
  created_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
}

/**
 * Cached inspection data with offline metadata
 */
export interface CachedInspection {
  id: string;
  tenant_id: string;
  hive_id: string;
  date: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: number;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_stores: string | null;
  pollen_stores: string | null;
  space_assessment: string | null;
  needs_super: boolean;
  varroa_estimate: number | null;
  temperament: string | null;
  issues: string | null;
  actions: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
  /** True if created offline and not yet synced to server */
  pending_sync?: boolean;
  /** Temporary local ID for offline-created inspections (format: local_<uuid>) */
  local_id?: string | null;
  /** Error message if sync to server failed */
  sync_error?: string | null;
}

/**
 * Pending inspection - an offline inspection awaiting sync
 * Extends CachedInspection with required pending_sync flag
 */
export interface PendingInspection extends CachedInspection {
  /** Always true for pending inspections */
  pending_sync: true;
  /** Required local ID for offline-created inspections */
  local_id: string;
}

/**
 * Cached inspection frame data
 */
export interface CachedInspectionFrame {
  id: string;
  inspection_id: string;
  box_position: number;
  box_type: string;
  total_frames: number;
  drawn_frames: number;
  brood_frames: number;
  honey_frames: number;
  pollen_frames: number;
}

/**
 * Cached task data with offline metadata
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
export interface CachedTask {
  /** Server ID or local_<uuid> for offline-created tasks */
  id: string;
  /** local_<uuid> for offline-created tasks, null for server tasks */
  local_id?: string | null;
  tenant_id: string;
  hive_id: string;
  /** Template ID if task was created from a template */
  template_id?: string;
  /** Cached template name for display */
  template_name?: string;
  /** Custom title for manual tasks */
  custom_title?: string;
  /** Task title (template_name || custom_title) */
  title: string;
  /** Task description */
  description?: string;
  /** Task priority */
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** Optional due date */
  due_date?: string;
  /** Task status */
  status: 'pending' | 'completed';
  /** Task source */
  source: 'manual' | 'beebrain';
  /** Auto-effects from template (JSON stringified) */
  auto_effects?: string;
  /** Completion data (JSON stringified) */
  completion_data?: string;
  /** When the task was completed */
  completed_at?: string;
  /** When the task was created */
  created_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
  /** True if created/completed offline and not yet synced to server */
  pending_sync: boolean;
  /** Error message if sync to server failed */
  sync_error?: string | null;
}

/**
 * Pending task - an offline task awaiting sync
 * Extends CachedTask with required pending_sync flag
 */
export interface PendingTask extends CachedTask {
  /** Always true for pending tasks */
  pending_sync: true;
  /** Required local ID for offline-created tasks */
  local_id: string;
}

/**
 * Cached detection event data with offline metadata
 */
export interface CachedDetection {
  id: string;
  tenant_id: string;
  unit_id: string;
  timestamp: string;
  clip_path: string | null;
  confidence: number | null;
  created_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
}

/**
 * Cached unit data with offline metadata
 */
export interface CachedUnit {
  id: string;
  tenant_id: string;
  site_id: string | null;
  serial: string;
  name: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  last_seen: string | null;
  status: string;
  created_at: string;
  /** Timestamp when this record was last synced from the server */
  synced_at: Date;
  /** Timestamp when this record was last accessed locally */
  accessed_at: Date;
}

/**
 * Cache metadata for tracking sync timestamps and storage info
 */
export interface CacheMetadata {
  /** Unique key for the metadata entry (e.g., 'lastSync_sites') */
  key: string;
  /** Value - can be a string, number, or Date */
  value: string | number | Date;
}

/**
 * Sync queue item for tracking offline operations to sync
 */
export interface SyncQueueItem {
  /** Auto-incremented ID */
  id?: number;
  /** Table the operation applies to */
  table: CacheableTable | 'sync_queue';
  /** Type of operation - includes 'complete' for task completion */
  action: 'create' | 'update' | 'delete' | 'complete';
  /** JSON stringified payload data */
  payload: string;
  /** When the operation was queued */
  created_at: Date;
  /** Current sync status */
  status: 'pending' | 'syncing' | 'error';
  /** Error message if sync failed */
  error?: string;
}

// ============================================================================
// Database Class
// ============================================================================

/**
 * APIS Offline Database
 *
 * Extends Dexie to provide typed access to IndexedDB tables.
 * Schema mirrors the server database with additional offline metadata.
 */
class ApisDatabase extends Dexie {
  /** Sites table */
  sites!: Table<CachedSite, string>;
  /** Hives table */
  hives!: Table<CachedHive, string>;
  /** Inspections table */
  inspections!: Table<CachedInspection, string>;
  /** Detection events table */
  detections!: Table<CachedDetection, string>;
  /** APIS units table */
  units!: Table<CachedUnit, string>;
  /** Metadata table for sync timestamps and storage info */
  metadata!: Table<CacheMetadata, string>;
  /** Sync queue for offline operations pending sync */
  sync_queue!: Table<SyncQueueItem, number>;
  /** Tasks table for offline task support (Story 14.16) */
  tasks!: Table<CachedTask, string>;

  constructor() {
    super('ApisOfflineDB');

    // Define schema version 1
    // Format: 'primaryKey, index1, index2, ...'
    this.version(1).stores({
      sites: 'id, tenant_id, synced_at, accessed_at',
      hives: 'id, tenant_id, site_id, synced_at, accessed_at',
      inspections: 'id, tenant_id, hive_id, date, synced_at, accessed_at',
      detections: 'id, tenant_id, unit_id, timestamp, synced_at, accessed_at',
      units: 'id, tenant_id, site_id, synced_at, accessed_at',
      metadata: 'key',
    });

    // Schema version 2: Add offline inspection support
    // - Add pending_sync and local_id indexes to inspections
    // - Add sync_queue table for tracking offline operations
    this.version(2).stores({
      sites: 'id, tenant_id, synced_at, accessed_at',
      hives: 'id, tenant_id, site_id, synced_at, accessed_at',
      inspections: 'id, tenant_id, hive_id, date, synced_at, accessed_at, pending_sync, local_id',
      detections: 'id, tenant_id, unit_id, timestamp, synced_at, accessed_at',
      units: 'id, tenant_id, site_id, synced_at, accessed_at',
      metadata: 'key',
      sync_queue: '++id, table, action, status, created_at',
    });

    // Schema version 3: Add offline task support (Story 14.16)
    // - Add tasks table with indexes for hive_id, status, pending_sync, local_id
    this.version(3).stores({
      sites: 'id, tenant_id, synced_at, accessed_at',
      hives: 'id, tenant_id, site_id, synced_at, accessed_at',
      inspections: 'id, tenant_id, hive_id, date, synced_at, accessed_at, pending_sync, local_id',
      detections: 'id, tenant_id, unit_id, timestamp, synced_at, accessed_at',
      units: 'id, tenant_id, site_id, synced_at, accessed_at',
      metadata: 'key',
      sync_queue: '++id, table, action, status, created_at',
      tasks: 'id, hive_id, status, synced_at, accessed_at, pending_sync, local_id',
    });
  }
}

/**
 * Singleton database instance
 *
 * Use this exported instance throughout the application.
 * Dexie handles connection management automatically.
 */
export const db = new ApisDatabase();

/**
 * Table name type for type-safe table access
 */
export type CacheableTable = 'sites' | 'hives' | 'inspections' | 'detections' | 'units' | 'sync_queue' | 'tasks';

/**
 * Get a typed reference to a cacheable table
 */
export function getTable<T>(tableName: CacheableTable): Table<T, string> {
  return db[tableName] as unknown as Table<T, string>;
}

/**
 * Get the sync queue table
 */
export function getSyncQueue(): Table<SyncQueueItem, number> {
  return db.sync_queue;
}

// ============================================================================
// Cache Version Management Functions (PWA-001-4-INFRA)
// ============================================================================

/**
 * Check if cache version is current and clear if outdated.
 *
 * SECURITY (PWA-001-4-INFRA): Call this on app startup to ensure cached data
 * is compatible with the current app version. This provides:
 * - Forced cache invalidation when needed for security patches
 * - Data migration path for schema changes
 * - Clean slate when data format changes
 *
 * @returns True if cache was cleared, false if cache is current
 *
 * @example
 * ```ts
 * // In app initialization
 * const wasCleared = await checkAndMigrateCache();
 * if (wasCleared) {
 *   console.log('Cache was outdated and has been cleared');
 * }
 * ```
 */
export async function checkAndMigrateCache(): Promise<boolean> {
  try {
    const storedVersion = await db.metadata.get(CACHE_VERSION_KEY);
    const currentVersion = storedVersion?.value;

    // If no version or version is older, clear cache
    if (typeof currentVersion !== 'number' || currentVersion < CACHE_VERSION) {
      console.log(`[DB] Cache version mismatch (stored: ${currentVersion ?? 'none'}, current: ${CACHE_VERSION}). Clearing cache...`);

      // Clear all data tables
      await Promise.all([
        db.sites.clear(),
        db.hives.clear(),
        db.inspections.clear(),
        db.detections.clear(),
        db.units.clear(),
        db.tasks.clear(),
        db.sync_queue.clear(),
      ]);

      // Update stored version
      await db.metadata.put({ key: CACHE_VERSION_KEY, value: CACHE_VERSION });

      console.log(`[DB] Cache cleared and version updated to ${CACHE_VERSION}`);
      return true;
    }

    // SECURITY (S6-L2): Recover sync queue items stuck in 'syncing' status.
    // If the app crashed or the tab was force-closed during sync, items can remain
    // in 'syncing' status forever. Reset them to 'pending' so they'll be retried.
    try {
      const stuckItems = await db.sync_queue
        .where('status')
        .equals('syncing')
        .toArray();
      if (stuckItems.length > 0) {
        console.log(`[DB] Recovering ${stuckItems.length} sync queue item(s) stuck in 'syncing' status`);
        for (const item of stuckItems) {
          if (item.id !== undefined) {
            await db.sync_queue.update(item.id, { status: 'pending' });
          }
        }
      }
    } catch (recoveryError) {
      console.warn('[DB] Error recovering stuck sync items:', recoveryError);
    }

    return false;
  } catch (error) {
    console.error('[DB] Error checking cache version:', error);
    return false;
  }
}

/**
 * Force clear all cached data and reset version.
 *
 * Use this for manual cache clearing (e.g., from settings page).
 */
export async function forceClearCache(): Promise<void> {
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

  // Set current version after clearing
  await db.metadata.put({ key: CACHE_VERSION_KEY, value: CACHE_VERSION });

  console.log('[DB] All cached data forcefully cleared');
}

export default db;
