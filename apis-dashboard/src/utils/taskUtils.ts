/**
 * Task Utilities
 *
 * Shared utilities for task management across hooks.
 * Extracted from useHiveTasks and useOfflineTasks to eliminate duplication.
 *
 * Part of Dashboard Refactoring Pass 5
 */
import dayjs from 'dayjs';
import type { Task, TaskPriority } from '../hooks/useTasks';
import type { CachedTask } from '../services/offlineTasks';
import { CACHE_STALENESS_MINUTES } from '../constants';

/**
 * Priority order for sorting (lower number = higher priority)
 */
export const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Convert CachedTask to Task format
 */
export function cachedToTask(cached: CachedTask): Task {
  return {
    id: cached.id,
    hive_id: cached.hive_id,
    template_id: cached.template_id,
    template_name: cached.template_name,
    custom_title: cached.custom_title,
    title: cached.title,
    description: cached.description,
    priority: cached.priority,
    due_date: cached.due_date,
    status: cached.status,
    source: cached.source,
    auto_effects: cached.auto_effects ? JSON.parse(cached.auto_effects) : undefined,
    completion_data: cached.completion_data ? JSON.parse(cached.completion_data) : undefined,
    completed_at: cached.completed_at,
    created_at: cached.created_at,
  };
}

/**
 * Check if cache is stale (older than CACHE_STALENESS_MINUTES)
 */
export function isCacheStale(cacheTimestamp: Date | null): boolean {
  if (!cacheTimestamp) return true;
  const staleThreshold = Date.now() - CACHE_STALENESS_MINUTES * 60 * 1000;
  return cacheTimestamp.getTime() < staleThreshold;
}

/**
 * Check if a task is overdue.
 * A task is overdue if it has a due_date before today and status is 'pending'.
 */
export function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status !== 'pending') return false;
  return dayjs(task.due_date).isBefore(dayjs(), 'day');
}

/**
 * Sort tasks by priority (urgent > high > medium > low).
 */
export function sortByPriority(a: Task, b: Task): number {
  return priorityOrder[a.priority] - priorityOrder[b.priority];
}

/**
 * Sort tasks by priority first, then by due_date (nulls last).
 */
export function sortByPriorityThenDueDate(a: Task, b: Task): number {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // Sort by due_date, nulls last
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return dayjs(a.due_date).diff(dayjs(b.due_date));
}
