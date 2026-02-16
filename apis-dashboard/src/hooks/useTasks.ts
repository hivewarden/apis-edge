/**
 * useTasks Hook
 *
 * Provides operations for creating and managing hive tasks.
 * Supports bulk creation, listing, completion, and deletion of tasks.
 *
 * Part of Epic 14, Stories 14.4 and 14.5
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Task priority levels.
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Task status values.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Auto-effects prompt for task completion.
 */
export interface Prompt {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  required?: boolean;
}

/**
 * Auto-effects update definition.
 */
export interface AutoEffectUpdate {
  target: string;
  action: 'set' | 'increment' | 'decrement';
  value?: string | number;
  value_from?: string;
}

/**
 * Auto-effects schema for tasks with side effects on completion.
 */
export interface AutoEffects {
  prompts?: Prompt[];
  updates?: AutoEffectUpdate[];
  creates?: Record<string, unknown>[];
}

/**
 * Task source - how the task was created.
 */
export type TaskSource = 'manual' | 'beebrain';

/**
 * Task data returned by the API.
 */
export interface Task {
  id: string;
  hive_id: string;
  hive_name?: string;
  template_id?: string;
  /** Template name for display (cached from template) */
  template_name?: string;
  custom_title?: string;
  title: string;
  description?: string;
  notes?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string;
  created_at: string;
  completed_at?: string;
  created_by?: string;
  source?: TaskSource;
  auto_effects?: AutoEffects;
  /** Completion data submitted when task was completed (Story 14.16) */
  completion_data?: Record<string, unknown>;
}

/**
 * Filter state for task list queries.
 */
export interface TaskFiltersState {
  site_id?: string;
  priority?: TaskPriority;
  status?: 'pending' | 'completed' | 'all';
  search?: string;
}

/**
 * Completion data sent when completing a task with prompts.
 */
export interface TaskCompletionData {
  [key: string]: string | number | boolean;
}

/**
 * Input for creating a single task.
 */
export interface CreateTaskInput {
  hive_id: string;
  template_id?: string;
  custom_title?: string;
  priority: TaskPriority;
  due_date?: string;
  description?: string;
}

/**
 * Response from bulk task creation.
 */
export interface BulkCreateResponse {
  data: {
    created: number;
    tasks: Task[];
  };
}

interface UseCreateTasksResult {
  createTasks: (tasks: CreateTaskInput[]) => Promise<{ created: number }>;
  creating: boolean;
}

/**
 * Hook for bulk creating tasks.
 *
 * Supports creating up to 500 tasks in a single request.
 *
 * @example
 * function TaskAssignment() {
 *   const { createTasks, creating } = useCreateTasks();
 *
 *   const handleAssign = async () => {
 *     const tasks = selectedHives.map(hiveId => ({
 *       hive_id: hiveId,
 *       template_id: selectedTemplate,
 *       priority: 'medium',
 *     }));
 *
 *     const result = await createTasks(tasks);
 *     message.success(`Created ${result.created} tasks`);
 *   };
 * }
 */
export function useCreateTasks(): UseCreateTasksResult {
  const [creating, setCreating] = useState(false);

  const createTasks = useCallback(async (tasks: CreateTaskInput[]): Promise<{ created: number }> => {
    setCreating(true);
    try {
      const response = await apiClient.post<BulkCreateResponse>('/tasks', { tasks });
      return { created: response.data.data.created };
    } finally {
      setCreating(false);
    }
  }, []);

  return {
    createTasks,
    creating,
  };
}

/**
 * Priority display configuration.
 * Maps priority values to display labels and colors.
 */
export const PRIORITY_OPTIONS = [
  { value: 'low' as const, label: 'Low', color: '#6b7280' },
  { value: 'medium' as const, label: 'Medium', color: '#22c55e' },
  { value: 'high' as const, label: 'High', color: '#f97316' },
  { value: 'urgent' as const, label: 'Urgent', color: '#ef4444' },
] as const;

/**
 * Priority emoji mapping for visual indicators.
 * Uses colored circle emojis for clear visual distinction.
 */
export const PRIORITY_EMOJI: Record<TaskPriority, string> = {
  urgent: '\uD83D\uDD34', // Red circle emoji
  high: '\uD83D\uDFE0',   // Orange circle emoji
  medium: '\uD83D\uDFE2', // Green circle emoji
  low: '\u26AA',          // White circle emoji
};

/**
 * Get display color for a priority level.
 */
export function getPriorityColor(priority: TaskPriority): string {
  const option = PRIORITY_OPTIONS.find(opt => opt.value === priority);
  return option?.color || '#6b7280';
}

/**
 * Get display label for a priority level.
 */
export function getPriorityLabel(priority: TaskPriority): string {
  const option = PRIORITY_OPTIONS.find(opt => opt.value === priority);
  return option?.label || 'Unknown';
}

/**
 * Response from fetching tasks list.
 */
interface TasksListResponse {
  data: Task[];
  meta: {
    total: number;
    page: number;
    per_page: number;
  };
}

/**
 * Response from completing a task.
 */
interface CompleteTaskResponse {
  data: {
    id: string;
    status: TaskStatus;
    completed_at: string;
    auto_applied_changes?: Record<string, unknown>;
  };
}

interface UseFetchTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  perPage: number;
  refetch: () => Promise<void>;
}

interface UseFetchTasksOptions {
  site_id?: string;
  priority?: TaskPriority;
  status?: 'pending' | 'completed' | 'all';
  search?: string;
  page?: number;
  per_page?: number;
}

/**
 * Hook for fetching tasks with filtering and pagination.
 *
 * @example
 * function TasksList() {
 *   const { tasks, loading, error, refetch } = useFetchTasks({
 *     status: 'pending',
 *     site_id: selectedSite,
 *   });
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message={error} type="error" />;
 *
 *   return <Table dataSource={tasks} />;
 * }
 */
export function useFetchTasks(options: UseFetchTasksOptions = {}): UseFetchTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(options.page || 1);
  const [perPage, setPerPage] = useState(options.per_page || 20);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.site_id) params.append('site_id', options.site_id);
      if (options.priority) params.append('priority', options.priority);
      if (options.status && options.status !== 'all') params.append('status', options.status);
      if (options.search) params.append('search', options.search);
      if (options.page) params.append('page', String(options.page));
      if (options.per_page) params.append('per_page', String(options.per_page));

      const queryString = params.toString();
      const url = `/tasks${queryString ? `?${queryString}` : ''}`;

      const response = await apiClient.get<TasksListResponse>(url);
      setTasks(response.data.data || []);
      setTotal(response.data.meta?.total || 0);
      setPage(response.data.meta?.page || 1);
      setPerPage(response.data.meta?.per_page || 20);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tasks';
      setError(message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [options.site_id, options.priority, options.status, options.search, options.page, options.per_page]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    total,
    page,
    perPage,
    refetch: fetchTasks,
  };
}

interface UseCompleteTaskResult {
  completeTask: (taskId: string, completionData?: TaskCompletionData) => Promise<CompleteTaskResponse['data']>;
  completing: boolean;
}

/**
 * Hook for completing a single task.
 *
 * @example
 * function TaskActions({ task }) {
 *   const { completeTask, completing } = useCompleteTask();
 *
 *   const handleComplete = async () => {
 *     await completeTask(task.id);
 *     message.success('Task completed');
 *   };
 * }
 */
export function useCompleteTask(): UseCompleteTaskResult {
  const [completing, setCompleting] = useState(false);

  const completeTask = useCallback(
    async (taskId: string, completionData: TaskCompletionData = {}): Promise<CompleteTaskResponse['data']> => {
      setCompleting(true);
      try {
        const response = await apiClient.post<CompleteTaskResponse>(`/tasks/${taskId}/complete`, {
          completion_data: completionData,
        });
        return response.data.data;
      } finally {
        setCompleting(false);
      }
    },
    []
  );

  return {
    completeTask,
    completing,
  };
}

interface UseDeleteTaskResult {
  deleteTask: (taskId: string) => Promise<void>;
  deleting: boolean;
}

/**
 * Hook for deleting a single task.
 *
 * @example
 * function TaskActions({ task }) {
 *   const { deleteTask, deleting } = useDeleteTask();
 *
 *   const handleDelete = async () => {
 *     await deleteTask(task.id);
 *     message.success('Task deleted');
 *   };
 * }
 */
export function useDeleteTask(): UseDeleteTaskResult {
  const [deleting, setDeleting] = useState(false);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/tasks/${taskId}`);
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    deleteTask,
    deleting,
  };
}

interface UseBulkDeleteTasksResult {
  bulkDeleteTasks: (taskIds: string[]) => Promise<{ deleted: number }>;
  deleting: boolean;
}

/**
 * Hook for bulk deleting tasks.
 *
 * @example
 * function BulkActions({ selectedIds }) {
 *   const { bulkDeleteTasks, deleting } = useBulkDeleteTasks();
 *
 *   const handleBulkDelete = async () => {
 *     const result = await bulkDeleteTasks(selectedIds);
 *     message.success(`Deleted ${result.deleted} tasks`);
 *   };
 * }
 */
export function useBulkDeleteTasks(): UseBulkDeleteTasksResult {
  const [deleting, setDeleting] = useState(false);

  const bulkDeleteTasks = useCallback(async (taskIds: string[]): Promise<{ deleted: number }> => {
    setDeleting(true);
    try {
      const response = await apiClient.post<{ data: { deleted: number } }>('/tasks/bulk-delete', {
        task_ids: taskIds,
      });
      return { deleted: response.data.data.deleted };
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    bulkDeleteTasks,
    deleting,
  };
}

interface BulkCompleteResult {
  completed: number;
  skipped: number;
  skippedIds: string[];
}

interface UseBulkCompleteTasksResult {
  bulkCompleteTasks: (tasks: Task[]) => Promise<BulkCompleteResult>;
  completing: boolean;
}

/**
 * Hook for bulk completing tasks.
 * Filters out tasks with auto_effects prompts (those require individual completion).
 *
 * @example
 * function BulkActions({ selectedTasks }) {
 *   const { bulkCompleteTasks, completing } = useBulkCompleteTasks();
 *
 *   const handleBulkComplete = async () => {
 *     const result = await bulkCompleteTasks(selectedTasks);
 *     message.success(`Completed ${result.completed} tasks, ${result.skipped} skipped`);
 *   };
 * }
 */
export function useBulkCompleteTasks(): UseBulkCompleteTasksResult {
  const [completing, setCompleting] = useState(false);

  const bulkCompleteTasks = useCallback(async (tasks: Task[]): Promise<BulkCompleteResult> => {
    setCompleting(true);
    try {
      // Separate tasks with prompts (require individual completion) from those without
      const tasksWithPrompts = tasks.filter(t => t.auto_effects?.prompts && t.auto_effects.prompts.length > 0);
      const tasksWithoutPrompts = tasks.filter(t => !t.auto_effects?.prompts || t.auto_effects.prompts.length === 0);

      // Only complete tasks without prompts
      if (tasksWithoutPrompts.length > 0) {
        const taskIds = tasksWithoutPrompts.map(t => t.id);
        await apiClient.post('/tasks/bulk-complete', { task_ids: taskIds });
      }

      return {
        completed: tasksWithoutPrompts.length,
        skipped: tasksWithPrompts.length,
        skippedIds: tasksWithPrompts.map(t => t.id),
      };
    } finally {
      setCompleting(false);
    }
  }, []);

  return {
    bulkCompleteTasks,
    completing,
  };
}

export default useCreateTasks;
