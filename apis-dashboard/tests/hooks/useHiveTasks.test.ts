/**
 * Unit tests for useHiveTasks hook
 *
 * Part of Epic 14, Story 14.9: Mobile Tasks Section View
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHiveTasks } from '../../src/hooks/useHiveTasks';
import { apiClient } from '../../src/providers/apiClient';
import { Task } from '../../src/hooks/useTasks';
import dayjs from 'dayjs';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Helper to create mock tasks
const createTask = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  hive_id: 'hive-1',
  title: 'Test Task',
  priority: 'medium',
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z',
  ...overrides,
});

describe('useHiveTasks', () => {
  const mockApiClient = apiClient as { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('returns loading true initially', async () => {
      // Create a promise that we control
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockApiClient.get.mockReturnValue(pendingPromise);

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.tasks).toEqual([]);

      // Clean up
      resolvePromise!({ data: { data: [], meta: { total: 0 } } });
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('sets loading false after fetch completes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Returns Tasks from API', () => {
    it('returns tasks from API', async () => {
      const mockTasks = [
        createTask({ id: 'task-1', title: 'Task 1' }),
        createTask({ id: 'task-2', title: 'Task 2' }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.tasks).toHaveLength(2);
      expect(result.current.tasks[0].title).toBe('Task 1');
      expect(result.current.tasks[1].title).toBe('Task 2');
    });

    it('fetches from correct endpoint', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      renderHook(() => useHiveTasks('hive-123'));

      await waitFor(() =>
        expect(mockApiClient.get).toHaveBeenCalledWith('/hives/hive-123/tasks?status=pending')
      );
    });

    it('passes status filter to API', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      renderHook(() => useHiveTasks('hive-1', 'completed'));

      await waitFor(() =>
        expect(mockApiClient.get).toHaveBeenCalledWith('/hives/hive-1/tasks?status=completed')
      );
    });

    it('does not pass status filter when status is all', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      renderHook(() => useHiveTasks('hive-1', 'all'));

      await waitFor(() =>
        expect(mockApiClient.get).toHaveBeenCalledWith('/hives/hive-1/tasks')
      );
    });
  });

  describe('Separates Overdue from Pending', () => {
    it('separates overdue from pending correctly', async () => {
      const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

      const mockTasks = [
        createTask({ id: 'overdue-1', title: 'Overdue Task', due_date: yesterday }),
        createTask({ id: 'pending-1', title: 'Pending Task', due_date: tomorrow }),
        createTask({ id: 'pending-2', title: 'No Due Date Task' }), // No due_date
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 3 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.overdueTasks).toHaveLength(1);
      expect(result.current.overdueTasks[0].id).toBe('overdue-1');

      expect(result.current.pendingTasks).toHaveLength(2);
      expect(result.current.pendingTasks.map((t) => t.id)).toContain('pending-1');
      expect(result.current.pendingTasks.map((t) => t.id)).toContain('pending-2');
    });

    it('treats tasks with due_date today as not overdue', async () => {
      const today = dayjs().format('YYYY-MM-DD');

      const mockTasks = [
        createTask({ id: 'today-task', title: 'Due Today', due_date: today }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 1 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.overdueTasks).toHaveLength(0);
      expect(result.current.pendingTasks).toHaveLength(1);
    });
  });

  describe('Sorts Overdue by Priority', () => {
    it('sorts overdue by priority', async () => {
      const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

      const mockTasks = [
        createTask({ id: 'low', priority: 'low', due_date: yesterday }),
        createTask({ id: 'urgent', priority: 'urgent', due_date: yesterday }),
        createTask({ id: 'medium', priority: 'medium', due_date: yesterday }),
        createTask({ id: 'high', priority: 'high', due_date: yesterday }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 4 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const priorities = result.current.overdueTasks.map((t) => t.priority);
      expect(priorities).toEqual(['urgent', 'high', 'medium', 'low']);
    });
  });

  describe('Sorts Pending by Priority then Due Date', () => {
    it('sorts pending by priority, then due_date', async () => {
      const day1 = dayjs().add(1, 'day').format('YYYY-MM-DD');
      const day2 = dayjs().add(2, 'day').format('YYYY-MM-DD');

      const mockTasks = [
        createTask({ id: 'high-day2', priority: 'high', due_date: day2 }),
        createTask({ id: 'high-day1', priority: 'high', due_date: day1 }),
        createTask({ id: 'low-day1', priority: 'low', due_date: day1 }),
        createTask({ id: 'urgent-day1', priority: 'urgent', due_date: day1 }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 4 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const ids = result.current.pendingTasks.map((t) => t.id);
      expect(ids).toEqual(['urgent-day1', 'high-day1', 'high-day2', 'low-day1']);
    });

    it('sorts pending with nulls last for due_date', async () => {
      const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

      const mockTasks = [
        createTask({ id: 'no-date', priority: 'high', due_date: undefined }),
        createTask({ id: 'has-date', priority: 'high', due_date: tomorrow }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTasks, meta: { total: 2 } },
      });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const ids = result.current.pendingTasks.map((t) => t.id);
      expect(ids).toEqual(['has-date', 'no-date']);
    });
  });

  describe('Handles API Error', () => {
    it('handles API error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Network error');
      expect(result.current.tasks).toEqual([]);
      expect(result.current.overdueTasks).toEqual([]);
      expect(result.current.pendingTasks).toEqual([]);
    });

    it('clears error on successful refetch', async () => {
      mockApiClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { data: [createTask({ id: 'task-1' })], meta: { total: 1 } },
        });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.error).toBe('Network error'));

      await result.current.refetch();

      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.tasks).toHaveLength(1);
    });
  });

  describe('Refetch', () => {
    it('refetch reloads tasks from API', async () => {
      const initialTasks = [createTask({ id: 'task-1', title: 'Initial' })];
      const updatedTasks = [
        createTask({ id: 'task-1', title: 'Updated' }),
        createTask({ id: 'task-2', title: 'New Task' }),
      ];

      mockApiClient.get
        .mockResolvedValueOnce({ data: { data: initialTasks, meta: { total: 1 } } })
        .mockResolvedValueOnce({ data: { data: updatedTasks, meta: { total: 2 } } });

      const { result } = renderHook(() => useHiveTasks('hive-1'));

      await waitFor(() => expect(result.current.tasks).toHaveLength(1));

      await result.current.refetch();

      await waitFor(() => expect(result.current.tasks).toHaveLength(2));
      expect(result.current.tasks[1].title).toBe('New Task');
    });
  });

  describe('Empty Hive ID', () => {
    it('does not fetch when hiveId is empty', async () => {
      const { result } = renderHook(() => useHiveTasks(''));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
      expect(result.current.tasks).toEqual([]);
    });
  });
});
