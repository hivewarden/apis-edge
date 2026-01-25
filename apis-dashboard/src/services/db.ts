/**
 * IndexedDB Database Service
 *
 * Dexie.js wrapper providing offline storage for the APIS dashboard.
 * Mirrors the server database tables with additional offline metadata fields.
 *
 * @module services/db
 */
import Dexie, { type Table } from 'dexie';

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
  /** Type of operation */
  action: 'create' | 'update' | 'delete';
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
export type CacheableTable = 'sites' | 'hives' | 'inspections' | 'detections' | 'units' | 'sync_queue';

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

export default db;
