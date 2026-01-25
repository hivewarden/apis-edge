/**
 * Offline Inspection Service Tests
 *
 * Tests for the offline inspection service that manages
 * IndexedDB storage for inspections created while offline.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../src/services/db';
import {
  saveOfflineInspection,
  updateOfflineInspection,
  getOfflineInspections,
  getPendingCount,
  markAsSynced,
  markSyncError,
  deleteOfflineInspection,
  generateLocalId,
} from '../../src/services/offlineInspection';
import type { OfflineInspectionInput } from '../../src/services/offlineInspection';

// Mock inspection input data
const mockInspectionInput: OfflineInspectionInput = {
  inspected_at: '2026-01-25',
  queen_seen: true,
  eggs_seen: true,
  queen_cells: false,
  brood_frames: 5,
  brood_pattern: 'good',
  honey_level: 'medium',
  pollen_level: 'high',
  temperament: 'calm',
  issues: ['dwv'],
  notes: 'Test inspection notes',
};

describe('Offline Inspection Service', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.inspections.clear();
    await db.sync_queue.clear();
  });

  afterEach(async () => {
    // Clean up after tests
    await db.inspections.clear();
    await db.sync_queue.clear();
  });

  describe('generateLocalId', () => {
    it('should generate a local ID with correct format', () => {
      const id = generateLocalId();
      expect(id).toMatch(/^local_[0-9a-f-]{36}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateLocalId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('saveOfflineInspection', () => {
    it('should save an inspection to IndexedDB', async () => {
      const result = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      expect(result).toBeDefined();
      expect(result.local_id).toMatch(/^local_/);
      expect(result.hive_id).toBe('hive-123');
      expect(result.tenant_id).toBe('tenant-456');
      expect(result.pending_sync).toBe(true);
      expect(result.date).toBe('2026-01-25');
    });

    it('should store the inspection in the database', async () => {
      const result = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      const stored = await db.inspections.get(result.id);
      expect(stored).toBeDefined();
      expect(stored?.local_id).toBe(result.local_id);
      expect(stored?.pending_sync).toBe(true);
    });

    it('should create a sync queue entry', async () => {
      const result = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      const queueItems = await db.sync_queue.toArray();
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].table).toBe('inspections');
      expect(queueItems[0].action).toBe('create');
      expect(queueItems[0].status).toBe('pending');

      const payload = JSON.parse(queueItems[0].payload);
      expect(payload.local_id).toBe(result.local_id);
      expect(payload.hive_id).toBe('hive-123');
    });

    it('should convert issues array to JSON string', async () => {
      const result = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      expect(result.issues).toBe(JSON.stringify(['dwv']));
    });

    it('should handle null issues', async () => {
      const input = { ...mockInspectionInput, issues: [] };
      const result = await saveOfflineInspection('hive-123', 'tenant-456', input);

      expect(result.issues).toBeNull();
    });
  });

  describe('updateOfflineInspection', () => {
    it('should update an existing offline inspection', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      const updated = await updateOfflineInspection(created.local_id, {
        queen_seen: false,
        brood_frames: 8,
      });

      expect(updated).toBeDefined();
      expect(updated?.queen_seen).toBe(false);
      expect(updated?.brood_frames).toBe(8);
      // Unchanged fields should remain
      expect(updated?.pending_sync).toBe(true);
    });

    it('should return null for non-existent inspection', async () => {
      const result = await updateOfflineInspection('local_nonexistent', {
        queen_seen: false,
      });

      expect(result).toBeNull();
    });

    it('should return null when updating a synced inspection', async () => {
      // Create and sync an inspection
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);
      await markAsSynced(created.local_id, 'server-uuid-789');

      // Try to update the synced inspection - should return null
      const result = await updateOfflineInspection(created.local_id, {
        queen_seen: false,
      });

      expect(result).toBeNull();
    });

    it('should update the sync queue payload', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await updateOfflineInspection(created.local_id, {
        notes: 'Updated notes',
      });

      const queueItems = await db.sync_queue.toArray();
      const payload = JSON.parse(queueItems[0].payload);
      expect(payload.data.notes).toBe('Updated notes');
    });
  });

  describe('getOfflineInspections', () => {
    it('should return all pending inspections when no hiveId provided', async () => {
      await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
      await saveOfflineInspection('hive-2', 'tenant-456', mockInspectionInput);

      const result = await getOfflineInspections();
      expect(result).toHaveLength(2);
    });

    it('should filter by hiveId when provided', async () => {
      await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
      await saveOfflineInspection('hive-2', 'tenant-456', mockInspectionInput);
      await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);

      const result = await getOfflineInspections('hive-1');
      expect(result).toHaveLength(2);
      expect(result.every(i => i.hive_id === 'hive-1')).toBe(true);
    });

    it('should return empty array when no pending inspections', async () => {
      const result = await getOfflineInspections();
      expect(result).toHaveLength(0);
    });
  });

  describe('getPendingCount', () => {
    it('should return correct count of pending inspections', async () => {
      await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
      await saveOfflineInspection('hive-2', 'tenant-456', mockInspectionInput);

      const count = await getPendingCount();
      expect(count).toBe(2);
    });

    it('should return 0 when no pending inspections', async () => {
      const count = await getPendingCount();
      expect(count).toBe(0);
    });
  });

  describe('markAsSynced', () => {
    it('should update inspection with server ID and clear pending_sync', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await markAsSynced(created.local_id, 'server-uuid-789');

      // Old record should be deleted
      const oldRecord = await db.inspections.get(created.id);
      expect(oldRecord).toBeUndefined();

      // New record should exist with server ID
      const newRecord = await db.inspections.get('server-uuid-789');
      expect(newRecord).toBeDefined();
      expect(newRecord?.pending_sync).toBe(false);
      expect(newRecord?.local_id).toBeNull();
    });

    it('should remove sync queue entry', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await markAsSynced(created.local_id, 'server-uuid-789');

      const queueItems = await db.sync_queue.toArray();
      expect(queueItems).toHaveLength(0);
    });

    it('should handle non-existent inspection gracefully', async () => {
      // Should not throw
      await expect(markAsSynced('local_nonexistent', 'server-uuid-789')).resolves.toBeUndefined();
    });
  });

  describe('markSyncError', () => {
    it('should set sync_error on inspection', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await markSyncError(created.local_id, 'Network timeout');

      const inspection = await db.inspections.get(created.id);
      expect(inspection?.sync_error).toBe('Network timeout');
    });

    it('should update sync queue status to error', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await markSyncError(created.local_id, 'Server error');

      const queueItems = await db.sync_queue.toArray();
      expect(queueItems[0].status).toBe('error');
      expect(queueItems[0].error).toBe('Server error');
    });
  });

  describe('deleteOfflineInspection', () => {
    it('should delete pending inspection', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      const result = await deleteOfflineInspection(created.local_id);

      expect(result).toBe(true);
      const inspection = await db.inspections.get(created.id);
      expect(inspection).toBeUndefined();
    });

    it('should remove sync queue entry', async () => {
      const created = await saveOfflineInspection('hive-123', 'tenant-456', mockInspectionInput);

      await deleteOfflineInspection(created.local_id);

      const queueItems = await db.sync_queue.toArray();
      expect(queueItems).toHaveLength(0);
    });

    it('should return false for non-existent inspection', async () => {
      const result = await deleteOfflineInspection('local_nonexistent');
      expect(result).toBe(false);
    });
  });
});
