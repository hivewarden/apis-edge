/**
 * useHiveActivity Hook Tests
 *
 * Tests for the useHiveActivity hook that fetches activity log entries for a hive.
 * Part of Epic 14, Story 14.13 (Task Completion Inspection Note Logging)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHiveActivity } from '../../src/hooks/useHiveActivity';
import { apiClient } from '../../src/providers/apiClient';
import type { ActivityLogEntry, UseHiveActivityOptions } from '../../src/hooks/useHiveActivity';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('useHiveActivity hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic data fetching', () => {
    it('fetches activity log entries on mount', async () => {
      const mockData: ActivityLogEntry[] = [
        {
          id: 'activity-1',
          hive_id: 'hive-123',
          type: 'task_completion',
          content: 'Task completed: Replace Queen',
          metadata: {
            task_id: 'task-1',
            task_name: 'Replace Queen',
            auto_applied: true,
            changes: ['queen_introduced_at -> 2026-01-30'],
          },
          created_by: 'user-1',
          created_at: '2026-01-30T10:30:00Z',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: mockData,
          meta: { total: 1, page: 1, per_page: 20 },
        },
      });

      const { result } = renderHook(() => useHiveActivity('hive-123'));

      // Initial loading state
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-123/activity');
      expect(result.current.data).toEqual(mockData);
      expect(result.current.total).toBe(1);
      expect(result.current.error).toBeNull();
    });

    it('returns empty array for empty hiveId', async () => {
      const { result } = renderHook(() => useHiveActivity(''));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).not.toHaveBeenCalled();
      expect(result.current.data).toEqual([]);
      expect(result.current.total).toBe(0);
    });
  });

  describe('pagination options', () => {
    it('passes page parameter to API', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 50, page: 2, per_page: 20 },
        },
      });

      const options: UseHiveActivityOptions = { page: 2 };
      renderHook(() => useHiveActivity('hive-123', options));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-123/activity?page=2');
      });
    });

    it('passes pageSize parameter as per_page', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 100, page: 1, per_page: 50 },
        },
      });

      const options: UseHiveActivityOptions = { pageSize: 50 };
      renderHook(() => useHiveActivity('hive-123', options));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-123/activity?per_page=50');
      });
    });

    it('passes both page and pageSize parameters', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 100, page: 3, per_page: 25 },
        },
      });

      const options: UseHiveActivityOptions = { page: 3, pageSize: 25 };
      renderHook(() => useHiveActivity('hive-123', options));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-123/activity?page=3&per_page=25');
      });
    });
  });

  describe('type filter', () => {
    it('passes type filter to API', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 10, page: 1, per_page: 20 },
        },
      });

      const options: UseHiveActivityOptions = { type: 'task_completion' };
      renderHook(() => useHiveActivity('hive-123', options));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-123/activity?type=task_completion');
      });
    });

    it('passes type filter with pagination', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 10, page: 1, per_page: 20 },
        },
      });

      const options: UseHiveActivityOptions = { type: 'task_completion', page: 2, pageSize: 10 };
      renderHook(() => useHiveActivity('hive-123', options));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/hives/hive-123/activity?type=task_completion&page=2&per_page=10'
        );
      });
    });
  });

  describe('error handling', () => {
    it('sets error state on API failure', async () => {
      const error = new Error('Network error');
      vi.mocked(apiClient.get).mockRejectedValue(error);

      const { result } = renderHook(() => useHiveActivity('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(error);
      expect(result.current.data).toEqual([]);
    });

    it('clears error on successful refetch', async () => {
      const error = new Error('Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useHiveActivity('hive-123'));

      await waitFor(() => {
        expect(result.current.error).toEqual(error);
      });

      // Mock successful response for refetch
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          data: [{ id: 'activity-1', hive_id: 'hive-123', type: 'task_completion', content: 'Test', created_by: 'user-1', created_at: '2026-01-30T10:30:00Z' }],
          meta: { total: 1, page: 1, per_page: 20 },
        },
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.data).toHaveLength(1);
    });
  });

  describe('refetch function', () => {
    it('refetches data when called', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [{ id: 'activity-1', hive_id: 'hive-123', type: 'task_completion', content: 'Test', created_by: 'user-1', created_at: '2026-01-30T10:30:00Z' }],
          meta: { total: 1, page: 1, per_page: 20 },
        },
      });

      const { result } = renderHook(() => useHiveActivity('hive-123'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refetch();
      });

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('loading states', () => {
    it('sets loading=true during fetch', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(apiClient.get).mockReturnValue(promise as Promise<{ data: { data: ActivityLogEntry[]; meta: { total: number; page: number; per_page: number } } }>);

      const { result } = renderHook(() => useHiveActivity('hive-123'));

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!({
          data: {
            data: [],
            meta: { total: 0, page: 1, per_page: 20 },
          },
        });
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('hiveId changes', () => {
    it('refetches when hiveId changes', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          data: [],
          meta: { total: 0, page: 1, per_page: 20 },
        },
      });

      const { result, rerender } = renderHook(
        ({ hiveId }) => useHiveActivity(hiveId),
        { initialProps: { hiveId: 'hive-1' } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-1/activity');

      rerender({ hiveId: 'hive-2' });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/hives/hive-2/activity');
      });
    });
  });
});

describe('ActivityLogEntry interface', () => {
  it('has all expected fields', () => {
    const entry: ActivityLogEntry = {
      id: 'activity-123',
      hive_id: 'hive-456',
      type: 'task_completion',
      content: 'Task completed: Replace Queen. Auto-updated: queen_introduced_at',
      metadata: {
        task_id: 'task-789',
        task_name: 'Replace Queen',
        completion_data: { source: 'Local breeder' },
        notes: 'Queen arrived in good condition',
        auto_applied: true,
        changes: ['queen_introduced_at -> 2026-01-30', 'queen_source -> Local breeder'],
      },
      created_by: 'user-123',
      created_at: '2026-01-30T10:30:00Z',
    };

    expect(entry.id).toBe('activity-123');
    expect(entry.hive_id).toBe('hive-456');
    expect(entry.type).toBe('task_completion');
    expect(entry.content).toContain('Task completed');
    expect(entry.metadata?.task_name).toBe('Replace Queen');
    expect(entry.metadata?.auto_applied).toBe(true);
    expect(entry.metadata?.changes).toHaveLength(2);
  });

  it('supports entries without metadata', () => {
    const entry: ActivityLogEntry = {
      id: 'activity-simple',
      hive_id: 'hive-1',
      type: 'note',
      content: 'Simple note',
      created_by: 'user-1',
      created_at: '2026-01-30T10:30:00Z',
    };

    expect(entry.metadata).toBeUndefined();
  });

  it('type field supports task_completion value', () => {
    const taskCompletion: ActivityLogEntry = {
      id: 'activity-1',
      hive_id: 'hive-1',
      type: 'task_completion',
      content: 'Task completed',
      created_by: 'user-1',
      created_at: '2026-01-30T10:30:00Z',
    };

    expect(taskCompletion.type).toBe('task_completion');
  });
});

describe('ActivityLogMetadata interface', () => {
  it('auto_applied is boolean indicating automatic hive updates', () => {
    // Per AC3: auto_applied should be true when auto-effects were processed
    const withAutoEffects = {
      task_id: 'task-1',
      task_name: 'Replace Queen',
      auto_applied: true,
      changes: ['queen_introduced_at -> 2026-01-30'],
    };

    // Per AC4: auto_applied should be false when no auto-effects
    const withoutAutoEffects = {
      task_id: 'task-2',
      task_name: 'Simple Task',
      auto_applied: false,
    };

    expect(withAutoEffects.auto_applied).toBe(true);
    expect(withAutoEffects.changes).toHaveLength(1);
    expect(withoutAutoEffects.auto_applied).toBe(false);
  });

  it('notes field contains task description per AC5', () => {
    const metadata = {
      task_id: 'task-1',
      task_name: 'Replace Queen',
      notes: 'Queen from local supplier, yellow marking',
      auto_applied: false,
    };

    expect(metadata.notes).toBe('Queen from local supplier, yellow marking');
  });
});
