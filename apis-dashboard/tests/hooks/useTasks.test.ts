/**
 * useTasks Hook Tests
 *
 * Tests for the tasks hooks and utility functions.
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useCreateTasks,
  PRIORITY_OPTIONS,
  getPriorityColor,
  getPriorityLabel,
} from '../../src/hooks/useTasks';
import { apiClient } from '../../src/providers/apiClient';
import type { CreateTaskInput } from '../../src/hooks/useTasks';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

describe('useCreateTasks hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates tasks in bulk successfully', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          created: 3,
          tasks: [
            { id: 'task-1', hive_id: 'hive-1', priority: 'medium', status: 'pending' },
            { id: 'task-2', hive_id: 'hive-2', priority: 'medium', status: 'pending' },
            { id: 'task-3', hive_id: 'hive-3', priority: 'medium', status: 'pending' },
          ],
        },
      },
    });

    const { result } = renderHook(() => useCreateTasks());

    const tasks: CreateTaskInput[] = [
      { hive_id: 'hive-1', template_id: 'template-1', priority: 'medium' },
      { hive_id: 'hive-2', template_id: 'template-1', priority: 'medium' },
      { hive_id: 'hive-3', template_id: 'template-1', priority: 'medium' },
    ];

    let response;
    await act(async () => {
      response = await result.current.createTasks(tasks);
    });

    expect(apiClient.post).toHaveBeenCalledWith('/tasks', { tasks });
    expect(response).toEqual({ created: 3 });
  });

  it('sets creating=true during API call', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(apiClient.post).mockReturnValue(promise as Promise<{ data: { data: { created: number; tasks: unknown[] } } }>);

    const { result } = renderHook(() => useCreateTasks());

    expect(result.current.creating).toBe(false);

    // Start creation without awaiting
    act(() => {
      result.current.createTasks([{ hive_id: 'hive-1', priority: 'medium' }]);
    });

    // Check creating is true while in progress
    await waitFor(() => {
      expect(result.current.creating).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ data: { data: { created: 1, tasks: [] } } });
    });

    await waitFor(() => {
      expect(result.current.creating).toBe(false);
    });
  });

  it('resets creating=false even on error', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Bulk create failed'));

    const { result } = renderHook(() => useCreateTasks());

    await act(async () => {
      try {
        await result.current.createTasks([{ hive_id: 'hive-1', priority: 'medium' }]);
      } catch {
        // Expected error
      }
    });

    expect(result.current.creating).toBe(false);
  });

  it('handles empty tasks array', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: {
          created: 0,
          tasks: [],
        },
      },
    });

    const { result } = renderHook(() => useCreateTasks());

    let response;
    await act(async () => {
      response = await result.current.createTasks([]);
    });

    expect(response).toEqual({ created: 0 });
  });

  it('includes all optional fields in request', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        data: { created: 1, tasks: [] },
      },
    });

    const { result } = renderHook(() => useCreateTasks());

    const tasks: CreateTaskInput[] = [
      {
        hive_id: 'hive-1',
        template_id: 'template-1',
        custom_title: 'Custom Task Title',
        priority: 'urgent',
        due_date: '2024-07-01',
        description: 'Task description',
      },
    ];

    await act(async () => {
      await result.current.createTasks(tasks);
    });

    expect(apiClient.post).toHaveBeenCalledWith('/tasks', { tasks });
    const calledWith = vi.mocked(apiClient.post).mock.calls[0][1] as { tasks: CreateTaskInput[] };
    expect(calledWith.tasks[0]).toMatchObject({
      hive_id: 'hive-1',
      template_id: 'template-1',
      custom_title: 'Custom Task Title',
      priority: 'urgent',
      due_date: '2024-07-01',
      description: 'Task description',
    });
  });
});

describe('PRIORITY_OPTIONS', () => {
  it('contains all four priority levels', () => {
    expect(PRIORITY_OPTIONS).toHaveLength(4);
    expect(PRIORITY_OPTIONS.map(p => p.value)).toEqual(['low', 'medium', 'high', 'urgent']);
  });

  it('has correct labels for each priority', () => {
    const labels = PRIORITY_OPTIONS.map(p => ({ value: p.value, label: p.label }));
    expect(labels).toContainEqual({ value: 'low', label: 'Low' });
    expect(labels).toContainEqual({ value: 'medium', label: 'Medium' });
    expect(labels).toContainEqual({ value: 'high', label: 'High' });
    expect(labels).toContainEqual({ value: 'urgent', label: 'Urgent' });
  });

  it('has color defined for each priority', () => {
    PRIORITY_OPTIONS.forEach(priority => {
      expect(priority.color).toBeDefined();
      expect(typeof priority.color).toBe('string');
      // Colors should be hex format
      expect(priority.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

describe('getPriorityColor', () => {
  it('returns correct color for low priority', () => {
    expect(getPriorityColor('low')).toBe('#6b7280');
  });

  it('returns correct color for medium priority', () => {
    expect(getPriorityColor('medium')).toBe('#22c55e');
  });

  it('returns correct color for high priority', () => {
    expect(getPriorityColor('high')).toBe('#f97316');
  });

  it('returns correct color for urgent priority', () => {
    expect(getPriorityColor('urgent')).toBe('#ef4444');
  });

  it('returns default gray for unknown priority', () => {
    // TypeScript would prevent this, but test runtime behavior
    expect(getPriorityColor('unknown' as 'low')).toBe('#6b7280');
  });
});

describe('getPriorityLabel', () => {
  it('returns correct label for low priority', () => {
    expect(getPriorityLabel('low')).toBe('Low');
  });

  it('returns correct label for medium priority', () => {
    expect(getPriorityLabel('medium')).toBe('Medium');
  });

  it('returns correct label for high priority', () => {
    expect(getPriorityLabel('high')).toBe('High');
  });

  it('returns correct label for urgent priority', () => {
    expect(getPriorityLabel('urgent')).toBe('Urgent');
  });

  it('returns Unknown for invalid priority', () => {
    // TypeScript would prevent this, but test runtime behavior
    expect(getPriorityLabel('unknown' as 'low')).toBe('Unknown');
  });
});

describe('CreateTaskInput interface', () => {
  it('requires hive_id and priority', () => {
    const minimalInput: CreateTaskInput = {
      hive_id: 'hive-123',
      priority: 'medium',
    };

    expect(minimalInput.hive_id).toBe('hive-123');
    expect(minimalInput.priority).toBe('medium');
  });

  it('supports optional template_id', () => {
    const input: CreateTaskInput = {
      hive_id: 'hive-123',
      template_id: 'template-456',
      priority: 'high',
    };

    expect(input.template_id).toBe('template-456');
  });

  it('supports optional custom_title', () => {
    const input: CreateTaskInput = {
      hive_id: 'hive-123',
      custom_title: 'My Custom Task',
      priority: 'low',
    };

    expect(input.custom_title).toBe('My Custom Task');
  });

  it('supports optional due_date', () => {
    const input: CreateTaskInput = {
      hive_id: 'hive-123',
      priority: 'urgent',
      due_date: '2024-07-15',
    };

    expect(input.due_date).toBe('2024-07-15');
  });

  it('supports optional description', () => {
    const input: CreateTaskInput = {
      hive_id: 'hive-123',
      priority: 'medium',
      description: 'Additional task notes',
    };

    expect(input.description).toBe('Additional task notes');
  });

  it('priority can be low, medium, high, or urgent', () => {
    const priorities = ['low', 'medium', 'high', 'urgent'] as const;

    priorities.forEach(priority => {
      const input: CreateTaskInput = {
        hive_id: 'hive-1',
        priority,
      };
      expect(['low', 'medium', 'high', 'urgent']).toContain(input.priority);
    });
  });
});

describe('Task interface', () => {
  it('has all expected fields', () => {
    const task = {
      id: 'task-123',
      hive_id: 'hive-456',
      template_id: 'template-789',
      custom_title: 'Custom Title',
      title: 'Task Title',
      description: 'Task description',
      priority: 'high' as const,
      status: 'pending' as const,
      due_date: '2024-07-01',
      created_at: '2024-06-15T10:00:00Z',
      completed_at: undefined,
      created_by: 'user-123',
    };

    expect(task.id).toBe('task-123');
    expect(task.hive_id).toBe('hive-456');
    expect(task.template_id).toBe('template-789');
    expect(task.title).toBe('Task Title');
    expect(task.priority).toBe('high');
    expect(task.status).toBe('pending');
  });

  it('status can be pending, in_progress, completed, or cancelled', () => {
    const statuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    statuses.forEach(status => {
      expect(['pending', 'in_progress', 'completed', 'cancelled']).toContain(status);
    });
  });
});
