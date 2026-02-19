/**
 * Database Service Tests
 *
 * Tests for the Dexie IndexedDB database schema and operations.
 * Uses fake-indexeddb for testing in Node.js environment.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db, type CachedSite, type CachedHive, type CachedInspection } from '../../src/services/db';

describe('ApisDatabase', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await Promise.all([
      db.sites.clear(),
      db.hives.clear(),
      db.inspections.clear(),
      db.detections.clear(),
      db.units.clear(),
      db.metadata.clear(),
      db.sync_queue.clear(),
      db.tasks.clear(),
    ]);
  });

  afterEach(async () => {
    // Clean up after each test
    await Promise.all([
      db.sites.clear(),
      db.hives.clear(),
      db.inspections.clear(),
      db.detections.clear(),
      db.units.clear(),
      db.metadata.clear(),
      db.sync_queue.clear(),
      db.tasks.clear(),
    ]);
  });

  describe('Database Initialization', () => {
    it('creates database with correct name', () => {
      expect(db.name).toBe('ApisOfflineDB');
    });

    it('has all required tables', () => {
      expect(db.sites).toBeDefined();
      expect(db.hives).toBeDefined();
      expect(db.inspections).toBeDefined();
      expect(db.detections).toBeDefined();
      expect(db.units).toBeDefined();
      expect(db.metadata).toBeDefined();
      expect(db.sync_queue).toBeDefined();
    });

    it('has correct table count', () => {
      // 8 tables: sites, hives, inspections, detections, units, metadata, sync_queue, tasks
      expect(db.tables.length).toBe(8);
    });
  });

  describe('Sites Table', () => {
    const testSite: CachedSite = {
      id: 'site-1',
      tenant_id: 'tenant-1',
      name: 'Test Apiary',
      gps_lat: 50.8503,
      gps_lng: 4.3517,
      timezone: 'Europe/Brussels',
      created_at: '2024-01-01T00:00:00Z',
      synced_at: new Date(),
      accessed_at: new Date(),
    };

    it('can add and retrieve a site', async () => {
      await db.sites.add(testSite);
      const retrieved = await db.sites.get('site-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Apiary');
      expect(retrieved?.tenant_id).toBe('tenant-1');
    });

    it('can update a site', async () => {
      await db.sites.add(testSite);
      await db.sites.update('site-1', { name: 'Updated Apiary' });

      const retrieved = await db.sites.get('site-1');
      expect(retrieved?.name).toBe('Updated Apiary');
    });

    it('can query sites by tenant_id', async () => {
      await db.sites.add(testSite);
      await db.sites.add({
        ...testSite,
        id: 'site-2',
        name: 'Another Apiary',
        tenant_id: 'tenant-2',
      });

      const tenant1Sites = await db.sites.where('tenant_id').equals('tenant-1').toArray();
      expect(tenant1Sites.length).toBe(1);
      expect(tenant1Sites[0].id).toBe('site-1');
    });

    it('can delete a site', async () => {
      await db.sites.add(testSite);
      await db.sites.delete('site-1');

      const retrieved = await db.sites.get('site-1');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Hives Table', () => {
    const testHive: CachedHive = {
      id: 'hive-1',
      tenant_id: 'tenant-1',
      site_id: 'site-1',
      name: 'Queen Bee Colony',
      queen_introduced_at: '2024-03-01',
      queen_source: 'Local breeder',
      brood_boxes: 2,
      honey_supers: 1,
      notes: 'Healthy colony',
      created_at: '2024-01-01T00:00:00Z',
      synced_at: new Date(),
      accessed_at: new Date(),
    };

    it('can add and retrieve a hive', async () => {
      await db.hives.add(testHive);
      const retrieved = await db.hives.get('hive-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Queen Bee Colony');
      expect(retrieved?.brood_boxes).toBe(2);
    });

    it('can query hives by site_id', async () => {
      await db.hives.add(testHive);
      await db.hives.add({
        ...testHive,
        id: 'hive-2',
        name: 'Worker Colony',
        site_id: 'site-2',
      });

      const site1Hives = await db.hives.where('site_id').equals('site-1').toArray();
      expect(site1Hives.length).toBe(1);
      expect(site1Hives[0].id).toBe('hive-1');
    });

    it('supports bulk operations', async () => {
      const hives = [
        { ...testHive },
        { ...testHive, id: 'hive-2', name: 'Colony 2' },
        { ...testHive, id: 'hive-3', name: 'Colony 3' },
      ];

      await db.hives.bulkAdd(hives);
      const count = await db.hives.count();
      expect(count).toBe(3);
    });
  });

  describe('Inspections Table', () => {
    const testInspection: CachedInspection = {
      id: 'insp-1',
      tenant_id: 'tenant-1',
      hive_id: 'hive-1',
      date: '2024-06-15',
      queen_seen: true,
      eggs_seen: true,
      queen_cells: 0,
      brood_frames: 6,
      brood_pattern: 'solid',
      honey_stores: 'moderate',
      pollen_stores: 'good',
      space_assessment: 'adequate',
      needs_super: false,
      varroa_estimate: 2,
      temperament: 'calm',
      issues: null,
      actions: 'Added entrance reducer',
      notes: 'Healthy colony',
      version: 1,
      created_at: '2024-06-15T10:00:00Z',
      updated_at: '2024-06-15T10:00:00Z',
      synced_at: new Date(),
      accessed_at: new Date(),
    };

    it('can add and retrieve an inspection', async () => {
      await db.inspections.add(testInspection);
      const retrieved = await db.inspections.get('insp-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.queen_seen).toBe(true);
      expect(retrieved?.brood_frames).toBe(6);
    });

    it('can query inspections by hive_id', async () => {
      await db.inspections.add(testInspection);
      await db.inspections.add({
        ...testInspection,
        id: 'insp-2',
        hive_id: 'hive-2',
        date: '2024-06-16',
      });

      const hive1Inspections = await db.inspections.where('hive_id').equals('hive-1').toArray();
      expect(hive1Inspections.length).toBe(1);
    });

    it('can query inspections by date', async () => {
      await db.inspections.add(testInspection);
      await db.inspections.add({
        ...testInspection,
        id: 'insp-2',
        date: '2024-06-20',
      });

      const inspections = await db.inspections.where('date').above('2024-06-17').toArray();
      expect(inspections.length).toBe(1);
      expect(inspections[0].id).toBe('insp-2');
    });
  });

  describe('Metadata Table', () => {
    it('can store and retrieve sync timestamps', async () => {
      const syncTime = new Date();
      await db.metadata.put({ key: 'lastSync_sites', value: syncTime });

      const retrieved = await db.metadata.get('lastSync_sites');
      expect(retrieved?.value).toEqual(syncTime);
    });

    it('can update metadata values', async () => {
      await db.metadata.put({ key: 'lastSync_sites', value: new Date('2024-01-01') });
      const newDate = new Date('2024-06-01');
      await db.metadata.put({ key: 'lastSync_sites', value: newDate });

      const retrieved = await db.metadata.get('lastSync_sites');
      expect(retrieved?.value).toEqual(newDate);
    });
  });

  describe('Index Queries', () => {
    it('can order by synced_at', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 10000);
      const later = new Date(now.getTime() + 10000);

      await db.sites.bulkAdd([
        {
          id: 'site-1',
          tenant_id: 'tenant-1',
          name: 'Site 1',
          gps_lat: null,
          gps_lng: null,
          timezone: 'UTC',
          created_at: '',
          synced_at: now,
          accessed_at: now,
        },
        {
          id: 'site-2',
          tenant_id: 'tenant-1',
          name: 'Site 2',
          gps_lat: null,
          gps_lng: null,
          timezone: 'UTC',
          created_at: '',
          synced_at: earlier,
          accessed_at: earlier,
        },
        {
          id: 'site-3',
          tenant_id: 'tenant-1',
          name: 'Site 3',
          gps_lat: null,
          gps_lng: null,
          timezone: 'UTC',
          created_at: '',
          synced_at: later,
          accessed_at: later,
        },
      ]);

      const ordered = await db.sites.orderBy('synced_at').toArray();
      expect(ordered[0].id).toBe('site-2'); // earliest
      expect(ordered[2].id).toBe('site-3'); // latest
    });

    it('can order by accessed_at for LRU-like queries', async () => {
      const now = new Date();

      await db.hives.bulkAdd([
        {
          id: 'hive-1',
          tenant_id: 'tenant-1',
          site_id: 'site-1',
          name: 'Recently accessed',
          queen_introduced_at: null,
          queen_source: null,
          brood_boxes: 1,
          honey_supers: 0,
          notes: null,
          created_at: '',
          synced_at: now,
          accessed_at: new Date(now.getTime() + 10000),
        },
        {
          id: 'hive-2',
          tenant_id: 'tenant-1',
          site_id: 'site-1',
          name: 'Old access',
          queen_introduced_at: null,
          queen_source: null,
          brood_boxes: 1,
          honey_supers: 0,
          notes: null,
          created_at: '',
          synced_at: now,
          accessed_at: new Date(now.getTime() - 10000),
        },
      ]);

      const oldest = await db.hives.orderBy('accessed_at').limit(1).toArray();
      expect(oldest[0].id).toBe('hive-2');
    });
  });
});
