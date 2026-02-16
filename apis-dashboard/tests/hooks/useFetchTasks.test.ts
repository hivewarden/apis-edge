/**
 * useFetchTasks Hook Tests
 *
 * Tests for the task fetching and management hooks including:
 * - useFetchTasks with filtering and pagination
 * - useCompleteTask for single task completion
 * - useDeleteTask for single task deletion
 * - useBulkDeleteTasks for bulk deletion
 * - useBulkCompleteTasks for bulk completion
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock apiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Import hooks after mocking
import {
  useFetchTasks,
  useCompleteTask,
  useDeleteTask,
  useBulkDeleteTasks,
  useBulkCompleteTasks,
} from '../../src/hooks/useTasks';
import type { Task } from '../../src/hooks/useTasks';

const mockTasks: Task[] = [
  {
    id: 'task-1',
    hive_id: 'hive-1',
    hive_name: 'Hive Alpha',
    title: 'Requeen Colony',
    priority: 'high',
    status: 'pending',
    created_at: '2026-01-29T10:00:00Z',
  },
  {
    id: 'task-2',
    hive_id: 'hive-2',
    hive_name: 'Hive Beta',
    title: 'Add Super',
    priority: 'medium',
    status: 'pending',
    created_at: '2026-01-28T10:00:00Z',
  },
];

const mockTaskWithPrompts: Task = {
  id: 'task-3',
  hive_id: 'hive-3',
  hive_name: 'Hive Gamma',
  title: 'Varroa Treatment',
  priority: 'urgent',
  status: 'pending',
  created_at: '2026-01-27T10:00:00Z',
  auto_effects: {
    prompts: [
      { key: 'type', label: 'Treatment Type', type: 'select', required: true },
    ],
  },
};

describe('useFetchTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        data: mockTasks,
        meta: { total: 2, page: 1, per_page: 20 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches tasks on mount', async () => {
    const { result } = renderHook(() => useFetchTasks());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toEqual(mockTasks);
    expect(result.current.total).toBe(2);
    expect(mockGet).toHaveBeenCalledWith('/tasks');
  });

  it('applies site_id filter', async () => {
    const { result } = renderHook(() => useFetchTasks({ site_id: 'site-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/tasks?site_id=site-1');
  });

  it('applies priority filter', async () => {
    const { result } = renderHook(() => useFetchTasks({ priority: 'high' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/tasks?priority=high');
  });

  it('applies status filter', async () => {
    const { result } = renderHook(() => useFetchTasks({ status: 'completed' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/tasks?status=completed');
  });

  it('does not apply status filter when set to "all"', async () => {
    const { result } = renderHook(() => useFetchTasks({ status: 'all' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/tasks');
  });

  it('applies search filter', async () => {
    const { result } = renderHook(() => useFetchTasks({ search: 'queen' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/tasks?search=queen');
  });

  it('applies multiple filters correctly', async () => {
    const { result } = renderHook(() =>
      useFetchTasks({
        site_id: 'site-1',
        priority: 'high',
        status: 'pending',
        search: 'queen',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/tasks?site_id=site-1&priority=high&status=pending&search=queen'
    );
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFetchTasks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.tasks).toEqual([]);
  });

  it('refetch function works', async () => {
    const { result } = renderHook(() => useFetchTasks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe('useCompleteTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: {
        data: {
          id: 'task-1',
          status: 'completed',
          completed_at: '2026-01-30T10:00:00Z',
        },
      },
    });
  });

  it('completes task without completion data', async () => {
    const { result } = renderHook(() => useCompleteTask());

    expect(result.current.completing).toBe(false);

    await act(async () => {
      await result.current.completeTask('task-1');
    });

    expect(mockPost).toHaveBeenCalledWith('/tasks/task-1/complete', {
      completion_data: {},
    });
    expect(result.current.completing).toBe(false);
  });

  it('completes task with completion data', async () => {
    const { result } = renderHook(() => useCompleteTask());

    await act(async () => {
      await result.current.completeTask('task-1', { color: 'yellow' });
    });

    expect(mockPost).toHaveBeenCalledWith('/tasks/task-1/complete', {
      completion_data: { color: 'yellow' },
    });
  });

  it('returns completion result', async () => {
    const { result } = renderHook(() => useCompleteTask());

    let response;
    await act(async () => {
      response = await result.current.completeTask('task-1');
    });

    expect(response).toEqual({
      id: 'task-1',
      status: 'completed',
      completed_at: '2026-01-30T10:00:00Z',
    });
  });
});

describe('useDeleteTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockResolvedValue({ data: {} });
  });

  it('deletes a task', async () => {
    const { result } = renderHook(() => useDeleteTask());

    expect(result.current.deleting).toBe(false);

    await act(async () => {
      await result.current.deleteTask('task-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/tasks/task-1');
    expect(result.current.deleting).toBe(false);
  });
});

describe('useBulkDeleteTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({
      data: { data: { deleted: 2 } },
    });
  });

  it('deletes multiple tasks', async () => {
    const { result } = renderHook(() => useBulkDeleteTasks());

    expect(result.current.deleting).toBe(false);

    let response;
    await act(async () => {
      response = await result.current.bulkDeleteTasks(['task-1', 'task-2']);
    });

    expect(mockPost).toHaveBeenCalledWith('/tasks/bulk-delete', {
      task_ids: ['task-1', 'task-2'],
    });
    expect(response).toEqual({ deleted: 2 });
    expect(result.current.deleting).toBe(false);
  });
});

describe('useBulkCompleteTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: {} });
  });

  it('completes tasks without prompts', async () => {
    const { result } = renderHook(() => useBulkCompleteTasks());

    let response;
    await act(async () => {
      response = await result.current.bulkCompleteTasks(mockTasks);
    });

    expect(mockPost).toHaveBeenCalledWith('/tasks/bulk-complete', {
      task_ids: ['task-1', 'task-2'],
    });
    expect(response).toEqual({
      completed: 2,
      skipped: 0,
      skippedIds: [],
    });
  });

  it('skips tasks with prompts', async () => {
    const { result } = renderHook(() => useBulkCompleteTasks());

    const tasksWithMixed = [...mockTasks, mockTaskWithPrompts];

    let response;
    await act(async () => {
      response = await result.current.bulkCompleteTasks(tasksWithMixed);
    });

    // Should only complete tasks without prompts
    expect(mockPost).toHaveBeenCalledWith('/tasks/bulk-complete', {
      task_ids: ['task-1', 'task-2'],
    });
    expect(response).toEqual({
      completed: 2,
      skipped: 1,
      skippedIds: ['task-3'],
    });
  });

  it('handles all tasks having prompts', async () => {
    const { result } = renderHook(() => useBulkCompleteTasks());

    let response;
    await act(async () => {
      response = await result.current.bulkCompleteTasks([mockTaskWithPrompts]);
    });

    // Should not call API since all tasks have prompts
    expect(mockPost).not.toHaveBeenCalled();
    expect(response).toEqual({
      completed: 0,
      skipped: 1,
      skippedIds: ['task-3'],
    });
  });
});
