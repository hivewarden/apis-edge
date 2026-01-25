/**
 * usePendingSync Hook Tests
 *
 * Tests for the pending sync hook that tracks offline items
 * awaiting synchronization with the server.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../../src/services/db';
import { usePendingSync } from '../../src/hooks/usePendingSync';
import { saveOfflineInspection } from '../../src/services/offlineInspection';
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
  issues: [],
  notes: 'Test inspection',
};

describe('usePendingSync Hook', () => {
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

  it('should return initial empty state', async () => {
    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.pendingInspections).toBe(0);
    expect(result.current.pendingItems).toHaveLength(0);
    expect(result.current.pendingGroups).toHaveLength(0);
    expect(result.current.hasErrors).toBe(false);
  });

  it('should track pending inspections', async () => {
    // Add some offline inspections first
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
    await saveOfflineInspection('hive-2', 'tenant-456', mockInspectionInput);

    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    });

    expect(result.current.pendingInspections).toBe(2);
    expect(result.current.pendingItems).toHaveLength(2);
  });

  it('should group pending items correctly', async () => {
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);

    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.pendingGroups).toHaveLength(1);
    });

    const group = result.current.pendingGroups[0];
    expect(group.type).toBe('inspections');
    expect(group.count).toBe(3);
    expect(group.label).toBe('3 inspections');
  });

  it('should use singular label for one item', async () => {
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);

    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.pendingGroups).toHaveLength(1);
    });

    expect(result.current.pendingGroups[0].label).toBe('1 inspection');
  });

  it('should track sync errors', async () => {
    const inspection = await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);

    // Manually set a sync error
    await db.inspections.update(inspection.id, { sync_error: 'Network error' });

    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.hasErrors).toBe(true);
    });

    expect(result.current.errorItems).toHaveLength(1);
    expect(result.current.errorItems[0].sync_error).toBe('Network error');
  });

  it('should provide sync queue items', async () => {
    await saveOfflineInspection('hive-1', 'tenant-456', mockInspectionInput);

    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.syncQueueItems).toHaveLength(1);
    });

    expect(result.current.syncQueueItems[0].table).toBe('inspections');
    expect(result.current.syncQueueItems[0].action).toBe('create');
  });

  it('should have a refetch function', async () => {
    const { result } = renderHook(() => usePendingSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // refetch should not throw
    expect(() => result.current.refetch()).not.toThrow();
  });
});
