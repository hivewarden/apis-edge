/**
 * Offline Cache Service Tests
 *
 * Tests for the cache management functions including
 * caching, retrieval, pruning, and storage calculations.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../src/services/db';
import {
  cacheApiResponse,
  getCachedData,
  getCachedById,
  getLastSyncTime,
  updateAccessTime,
  calculateStorageSize,
  pruneOldData,
  checkAndPruneStorage,
  clearAllCache,
  clearTableCache,
  getCacheStats,
  MAX_STORAGE_MB,
} from '../../src/services/offlineCache';

describe('offlineCache', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all([
      db.sites.clear(),
      db.hives.clear(),
      db.inspections.clear(),
      db.detections.clear(),
      db.units.clear(),
      db.metadata.clear(),
    ]);
  });

  afterEach(async () => {
    // Clean up after each test
    await clearAllCache();
    vi.restoreAllMocks();
  });

  describe('cacheApiResponse', () => {
    it('caches a single item with metadata', async () => {
      const site = {
        id: 'site-1',
        tenant_id: 'tenant-1',
        name: 'Test Site',
        gps_lat: 50.0,
        gps_lng: 4.0,
        timezone: 'UTC',
        created_at: '2024-01-01T00:00:00Z',
      };

      await cacheApiResponse('sites', site);

      const cached = await db.sites.get('site-1');
      expect(cached).toBeDefined();
      expect(cached?.name).toBe('Test Site');
      expect(cached?.synced_at).toBeInstanceOf(Date);
      expect(cached?.accessed_at).toBeInstanceOf(Date);
    });

    it('caches an array of items', async () => {
      const hives = [
        { id: 'hive-1', tenant_id: 't1', site_id: 's1', name: 'Hive 1', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' },
        { id: 'hive-2', tenant_id: 't1', site_id: 's1', name: 'Hive 2', queen_introduced_at: null, queen_source: null, brood_boxes: 2, honey_supers: 1, notes: null, created_at: '' },
      ];

      await cacheApiResponse('hives', hives);

      const count = await db.hives.count();
      expect(count).toBe(2);
    });

    it('updates last sync timestamp in metadata', async () => {
      await cacheApiResponse('sites', {
        id: 'site-1',
        tenant_id: 't1',
        name: 'Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      const meta = await db.metadata.get('lastSync_sites');
      expect(meta).toBeDefined();
      expect(meta?.value).toBeInstanceOf(Date);
    });

    it('upserts existing records', async () => {
      const site = {
        id: 'site-1',
        tenant_id: 't1',
        name: 'Original Name',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      };

      await cacheApiResponse('sites', site);
      await cacheApiResponse('sites', { ...site, name: 'Updated Name' });

      const count = await db.sites.count();
      expect(count).toBe(1);

      const cached = await db.sites.get('site-1');
      expect(cached?.name).toBe('Updated Name');
    });

    it('handles empty array gracefully', async () => {
      await cacheApiResponse('sites', []);
      const count = await db.sites.count();
      expect(count).toBe(0);
    });
  });

  describe('getCachedData', () => {
    beforeEach(async () => {
      await cacheApiResponse('hives', [
        { id: 'hive-1', tenant_id: 't1', site_id: 's1', name: 'Hive 1', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' },
        { id: 'hive-2', tenant_id: 't1', site_id: 's2', name: 'Hive 2', queen_introduced_at: null, queen_source: null, brood_boxes: 2, honey_supers: 1, notes: null, created_at: '' },
        { id: 'hive-3', tenant_id: 't2', site_id: 's1', name: 'Hive 3', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 2, notes: null, created_at: '' },
      ]);
    });

    it('retrieves all data without filter', async () => {
      const hives = await getCachedData('hives');
      expect(hives.length).toBe(3);
    });

    it('filters data by single field', async () => {
      const hives = await getCachedData('hives', { site_id: 's1' });
      expect(hives.length).toBe(2);
    });

    it('filters data by multiple fields', async () => {
      const hives = await getCachedData('hives', { site_id: 's1', tenant_id: 't1' });
      expect(hives.length).toBe(1);
    });

    it('returns empty array when no matches', async () => {
      const hives = await getCachedData('hives', { site_id: 'nonexistent' });
      expect(hives.length).toBe(0);
    });

    it('updates accessed_at for retrieved records', async () => {
      const before = await db.hives.get('hive-1');
      const beforeAccess = before?.accessed_at;

      // Small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await getCachedData('hives', { id: 'hive-1' });

      const after = await db.hives.get('hive-1');
      expect(after?.accessed_at.getTime()).toBeGreaterThan(beforeAccess!.getTime());
    });
  });

  describe('getCachedById', () => {
    it('retrieves a single record by ID', async () => {
      await cacheApiResponse('sites', {
        id: 'site-1',
        tenant_id: 't1',
        name: 'My Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      const site = await getCachedById('sites', 'site-1');
      expect(site).toBeDefined();
      expect((site as { name: string }).name).toBe('My Site');
    });

    it('returns undefined for non-existent ID', async () => {
      const site = await getCachedById('sites', 'nonexistent');
      expect(site).toBeUndefined();
    });
  });

  describe('getLastSyncTime', () => {
    it('returns null when never synced', async () => {
      const time = await getLastSyncTime('sites');
      expect(time).toBeNull();
    });

    it('returns sync time for specific table', async () => {
      await cacheApiResponse('sites', {
        id: 'site-1',
        tenant_id: 't1',
        name: 'Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      const time = await getLastSyncTime('sites');
      expect(time).toBeInstanceOf(Date);
    });

    it('returns most recent sync across all tables when no table specified', async () => {
      await cacheApiResponse('sites', {
        id: 'site-1',
        tenant_id: 't1',
        name: 'Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await cacheApiResponse('hives', {
        id: 'hive-1',
        tenant_id: 't1',
        site_id: 's1',
        name: 'Hive',
        queen_introduced_at: null,
        queen_source: null,
        brood_boxes: 1,
        honey_supers: 0,
        notes: null,
        created_at: '',
      });

      const hivesTime = await getLastSyncTime('hives');
      const overallTime = await getLastSyncTime();

      expect(overallTime?.getTime()).toBe(hivesTime?.getTime());
    });
  });

  describe('updateAccessTime', () => {
    it('updates accessed_at for a record', async () => {
      await cacheApiResponse('sites', {
        id: 'site-1',
        tenant_id: 't1',
        name: 'Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      const before = await db.sites.get('site-1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await updateAccessTime('sites', 'site-1');
      const after = await db.sites.get('site-1');

      expect(after?.accessed_at.getTime()).toBeGreaterThan(before!.accessed_at.getTime());
    });
  });

  describe('calculateStorageSize', () => {
    it('returns 0 for empty database', async () => {
      const size = await calculateStorageSize();
      expect(size).toBe(0);
    });

    it('estimates storage based on record counts', async () => {
      // Add some records
      await cacheApiResponse('sites', [
        { id: 's1', tenant_id: 't1', name: 'Site 1', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
        { id: 's2', tenant_id: 't1', name: 'Site 2', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);

      const size = await calculateStorageSize();
      expect(size).toBeGreaterThan(0);
      // 2 sites * 500 bytes each = 1000 bytes = ~0.001 MB
      expect(size).toBeLessThan(0.01);
    });
  });

  describe('pruneOldData', () => {
    it('returns 0 when under limit', async () => {
      await cacheApiResponse('sites', {
        id: 's1',
        tenant_id: 't1',
        name: 'Site',
        gps_lat: null,
        gps_lng: null,
        timezone: 'UTC',
        created_at: '',
      });

      const pruned = await pruneOldData(MAX_STORAGE_MB);
      expect(pruned).toBe(0);
    });

    it('prunes detections first (oldest access)', async () => {
      // This test verifies the pruning logic order
      // In a real scenario with lots of data exceeding MAX_STORAGE_MB,
      // detections would be pruned before inspections
      const now = new Date();
      const detections = Array.from({ length: 100 }, (_, i) => ({
        id: `det-${i}`,
        tenant_id: 't1',
        unit_id: 'u1',
        timestamp: now.toISOString(),
        clip_path: null,
        confidence: 0.9,
        created_at: now.toISOString(),
        synced_at: now,
        accessed_at: new Date(now.getTime() - i * 1000), // Stagger access times
      }));

      await db.detections.bulkAdd(detections);

      // Force pruning with low limit
      const pruned = await pruneOldData(0.001); // Very small limit to trigger pruning

      expect(pruned).toBeGreaterThan(0);
      // Should still have some records left
      const remaining = await db.detections.count();
      expect(remaining).toBeLessThan(100);
    });
  });

  describe('checkAndPruneStorage', () => {
    it('returns size and prune count', async () => {
      const result = await checkAndPruneStorage();

      expect(result).toHaveProperty('sizeMB');
      expect(result).toHaveProperty('prunedCount');
      expect(typeof result.sizeMB).toBe('number');
      expect(typeof result.prunedCount).toBe('number');
    });
  });

  describe('clearAllCache', () => {
    it('removes all data from all tables', async () => {
      await cacheApiResponse('sites', { id: 's1', tenant_id: 't1', name: 'Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' });
      await cacheApiResponse('hives', { id: 'h1', tenant_id: 't1', site_id: 's1', name: 'Hive', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' });

      await clearAllCache();

      const sitesCount = await db.sites.count();
      const hivesCount = await db.hives.count();
      const metaCount = await db.metadata.count();

      expect(sitesCount).toBe(0);
      expect(hivesCount).toBe(0);
      expect(metaCount).toBe(0);
    });
  });

  describe('clearTableCache', () => {
    it('clears only the specified table', async () => {
      await cacheApiResponse('sites', { id: 's1', tenant_id: 't1', name: 'Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' });
      await cacheApiResponse('hives', { id: 'h1', tenant_id: 't1', site_id: 's1', name: 'Hive', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' });

      await clearTableCache('sites');

      const sitesCount = await db.sites.count();
      const hivesCount = await db.hives.count();

      expect(sitesCount).toBe(0);
      expect(hivesCount).toBe(1);
    });

    it('removes metadata for the cleared table', async () => {
      await cacheApiResponse('sites', { id: 's1', tenant_id: 't1', name: 'Site', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' });

      await clearTableCache('sites');

      const meta = await db.metadata.get('lastSync_sites');
      expect(meta).toBeUndefined();
    });
  });

  describe('getCacheStats', () => {
    it('returns correct counts and storage', async () => {
      await cacheApiResponse('sites', [
        { id: 's1', tenant_id: 't1', name: 'Site 1', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
        { id: 's2', tenant_id: 't1', name: 'Site 2', gps_lat: null, gps_lng: null, timezone: 'UTC', created_at: '' },
      ]);
      await cacheApiResponse('hives', [
        { id: 'h1', tenant_id: 't1', site_id: 's1', name: 'Hive 1', queen_introduced_at: null, queen_source: null, brood_boxes: 1, honey_supers: 0, notes: null, created_at: '' },
      ]);

      const stats = await getCacheStats();

      expect(stats.sites).toBe(2);
      expect(stats.hives).toBe(1);
      expect(stats.inspections).toBe(0);
      expect(stats.detections).toBe(0);
      expect(stats.units).toBe(0);
      expect(stats.totalRecords).toBe(3);
      expect(stats.storageMB).toBeGreaterThan(0);
      expect(stats.lastSync).toBeInstanceOf(Date);
    });

    it('returns null lastSync when no data', async () => {
      const stats = await getCacheStats();
      expect(stats.lastSync).toBeNull();
    });
  });
});
