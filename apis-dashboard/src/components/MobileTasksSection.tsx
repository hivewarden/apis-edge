/**
 * MobileTasksSection Component
 *
 * Displays tasks for a hive in a mobile-optimized layout with three subsections:
 * - BEEBRAIN SUGGESTIONS: AI-suggested tasks (new in Story 14.15)
 * - OVERDUE: Tasks past their due date (red background tint)
 * - PENDING: Tasks not yet overdue
 *
 * Uses accordion behavior (only one task card expanded at a time).
 * Handles task completion (with auto-effect prompts) and deletion.
 * Supports offline mode with IndexedDB caching (Story 14.16).
 *
 * Part of Epic 14, Stories 14.9, 14.10, 14.15, and 14.16
 * Updated to match v2 mockups (apis_mobile_tasks_section)
 */
import { CSSProperties, useState, useCallback } from 'react';
import { Typography, Spin, Alert, message, Button } from 'antd';
import { WarningOutlined, RobotOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { useHiveTasks } from '../hooks/useHiveTasks';
import { useCompleteTask, useDeleteTask, Task, TaskCompletionData } from '../hooks/useTasks';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import { useTaskSuggestions, TaskSuggestion } from '../hooks/useTaskSuggestions';
import { useAuth } from '../hooks/useAuth';
// MobileTaskCard is available but using inline custom cards for v2 mockup
// import { MobileTaskCard } from './MobileTaskCard';
import { TaskEmptyState } from './TaskEmptyState';
import { MobileTaskCompletionSheet } from './MobileTaskCompletionSheet';
import { DeleteTaskConfirmation } from './DeleteTaskConfirmation';
import { MobileAddTaskForm } from './MobileAddTaskForm';
import { BeeBrainSuggestionsSection } from './BeeBrainSuggestionsSection';
import { OfflineTasksBanner } from './OfflineTasksBanner';
import { completeOfflineTask, deleteOfflineTask } from '../services/offlineTasks';

const { Text, Title } = Typography;

/**
 * Priority colors for the dot indicator
 */
const priorityColors: Record<string, string> = {
  urgent: '#ef4444',
  high: '#ef4444',
  medium: '#f7a42d',
  low: '#7c9082',
};

// CSS keyframes for slide-in animation (injected once)
const slideInKeyframes = `
@keyframes slideInFromTop {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

// Inject keyframes into document head (idempotent)
if (typeof document !== 'undefined') {
  const styleId = 'mobile-tasks-section-animations';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = slideInKeyframes;
    document.head.appendChild(style);
  }
}

export interface MobileTasksSectionProps {
  /** The ID of the hive to display tasks for */
  hiveId: string;
  /** Optional style overrides */
  style?: CSSProperties;
}

/**
 * Mobile-optimized tasks section with overdue and pending subsections.
 *
 * Features:
 * - Overdue subsection with red background when overdue tasks exist
 * - Pending subsection for non-overdue tasks
 * - Accordion behavior (only one card expanded at a time)
 * - Loading and error states
 * - Empty state when no tasks
 *
 * @example
 * <MobileTasksSection hiveId={hive.id} />
 */
/**
 * Check if a task has auto-effect prompts that require user input.
 */
const hasAutoEffectPrompts = (task: Task): boolean => {
  return !!(task.auto_effects?.prompts && task.auto_effects.prompts.length > 0);
};

export function MobileTasksSection({ hiveId, style }: MobileTasksSectionProps) {
  // Get tenantId from auth context for offline support (Story 14.16)
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const { overdueTasks, pendingTasks, loading, error, refetch, isOffline, pendingSyncCount } = useHiveTasks(hiveId, 'pending', tenantId);
  const { templates, loading: templatesLoading } = useTaskTemplates();
  const {
    suggestions,
    loading: suggestionsLoading,
    refetch: refetchSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    accepting: suggestionsAccepting,
    dismissing: suggestionsDismissing,
  } = useTaskSuggestions(hiveId);

  // Track which task card is expanded (accordion behavior) - reserved for future use
  const [_expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Task completion state
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [showCompletionSheet, setShowCompletionSheet] = useState(false);
  const { completeTask, completing } = useCompleteTask();

  // Task deletion state
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { deleteTask, deleting } = useDeleteTask();

  // Track tasks being removed for animation
  const [removingTaskIds, setRemovingTaskIds] = useState<Set<string>>(new Set());

  // Track newly created task for slide-in animation
  const [newTaskId, setNewTaskId] = useState<string | null>(null);

  // Track suggestions being removed for fade animation
  const [removingSuggestionIds, setRemovingSuggestionIds] = useState<Set<string>>(new Set());

  // Handle suggestion accept - creates task and removes suggestion
  const handleAcceptSuggestion = useCallback(async (suggestion: TaskSuggestion) => {
    try {
      const createdTask = await acceptSuggestion(suggestion.id);

      // Start fade animation for suggestion
      setRemovingSuggestionIds((prev) => new Set(prev).add(suggestion.id));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success(`Task added: ${suggestion.suggested_title}`);

      // Set new task ID for slide-in animation
      setNewTaskId(createdTask.id);

      // Refetch both suggestions and tasks
      await Promise.all([refetchSuggestions(), refetch()]);

      // Clean up animation states
      setRemovingSuggestionIds((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.id);
        return next;
      });

      setTimeout(() => {
        setNewTaskId(null);
      }, 300);
    } catch (err) {
      message.error('Failed to accept suggestion');
    }
  }, [acceptSuggestion, refetchSuggestions, refetch]);

  // Handle suggestion dismiss - removes suggestion without creating task
  const handleDismissSuggestion = useCallback(async (suggestion: TaskSuggestion) => {
    try {
      await dismissSuggestion(suggestion.id);

      // Start fade animation for suggestion
      setRemovingSuggestionIds((prev) => new Set(prev).add(suggestion.id));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Refetch suggestions only
      await refetchSuggestions();

      // Clean up animation state
      setRemovingSuggestionIds((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.id);
        return next;
      });
    } catch (err) {
      message.error('Failed to dismiss suggestion');
    }
  }, [dismissSuggestion, refetchSuggestions]);

  // Handle task added - triggers refetch and animation
  const handleTaskAdded = useCallback(async (createdTaskId?: string) => {
    // Set the new task ID for animation
    if (createdTaskId) {
      setNewTaskId(createdTaskId);
    }

    // Refetch tasks
    await refetch();

    // Clear animation state after animation completes
    if (createdTaskId) {
      setTimeout(() => {
        setNewTaskId(null);
      }, 300);
    }
  }, [refetch]);

  // Toggle task expansion (accordion - only one at a time)
  const handleToggle = useCallback((taskId: string) => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId));
  }, []);

  // Complete a task immediately (no prompts)
  const completeTaskImmediately = useCallback(async (task: Task) => {
    try {
      if (isOffline) {
        // Offline path - store in IndexedDB
        await completeOfflineTask(task.id);

        // Start fade-out animation
        setRemovingTaskIds((prev) => new Set(prev).add(task.id));

        // Wait for animation
        await new Promise((resolve) => setTimeout(resolve, 300));

        message.success('Task completed (will sync)');
      } else {
        // Online path - call API first, don't fade until success
        await completeTask(task.id);

        // API succeeded - now start fade-out animation
        setRemovingTaskIds((prev) => new Set(prev).add(task.id));

        // Wait for animation to complete
        await new Promise((resolve) => setTimeout(resolve, 300));

        message.success('Task completed');
      }

      // Collapse expanded card if it was the completed task
      setExpandedTaskId((current) => (current === task.id ? null : current));

      // Refetch tasks
      await refetch();

      // Clean up removing state after refetch
      setRemovingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    } catch (err) {
      // Failed - task never faded, so no visual inconsistency
      message.error('Failed to complete task');
    }
  }, [completeTask, refetch, isOffline]);

  // Handle Complete button tap
  const handleComplete = useCallback((task: Task) => {
    if (hasAutoEffectPrompts(task)) {
      // Task has prompts - show completion sheet
      setCompletingTask(task);
      setShowCompletionSheet(true);
    } else {
      // No prompts - complete immediately
      completeTaskImmediately(task);
    }
  }, [completeTaskImmediately]);

  // Complete a task with data from the completion sheet
  const handleCompleteWithData = useCallback(async (completionData: TaskCompletionData) => {
    if (!completingTask) return;

    try {
      // Close sheet first to indicate action in progress
      setShowCompletionSheet(false);

      if (isOffline) {
        // Offline path - store in IndexedDB with completion data
        await completeOfflineTask(completingTask.id, completionData);

        // Start fade-out animation
        setRemovingTaskIds((prev) => new Set(prev).add(completingTask.id));

        // Wait for animation
        await new Promise((resolve) => setTimeout(resolve, 300));

        message.success(`Task completed (will sync): ${completingTask.custom_title || completingTask.title}`);
      } else {
        // Online path - call API first, don't fade until success
        await completeTask(completingTask.id, completionData);

        // API succeeded - now start fade-out animation
        setRemovingTaskIds((prev) => new Set(prev).add(completingTask.id));

        // Wait for animation to complete
        await new Promise((resolve) => setTimeout(resolve, 300));

        message.success(`Task completed: ${completingTask.custom_title || completingTask.title}`);
      }

      // Collapse expanded card if it was the completed task
      setExpandedTaskId((current) => (current === completingTask.id ? null : current));

      // Refetch tasks
      await refetch();

      // Clean up removing state after refetch
      setRemovingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(completingTask.id);
        return next;
      });
    } catch (err) {
      // Failed - task never faded, reopen sheet for retry
      setShowCompletionSheet(true);
      message.error('Failed to complete task');
    } finally {
      setCompletingTask(null);
    }
  }, [completingTask, completeTask, refetch, isOffline]);

  // Confirm and execute deletion
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingTask) return;

    try {
      // Close confirmation first to indicate action in progress
      setShowDeleteConfirm(false);

      // Check if this is an offline-created task (has local_id prefix)
      const isOfflineCreatedTask = deletingTask.id.startsWith('local_');

      if (isOfflineCreatedTask) {
        // Offline path - delete from IndexedDB (Story 14.16)
        const deleted = await deleteOfflineTask(deletingTask.id);
        if (!deleted) {
          throw new Error('Could not delete offline task');
        }
      } else if (isOffline) {
        // Cannot delete server tasks while offline
        message.warning('Cannot delete synced tasks while offline');
        setDeletingTask(null);
        return;
      } else {
        // Online path - call API
        await deleteTask(deletingTask.id);
      }

      // Success - now start fade-out animation
      setRemovingTaskIds((prev) => new Set(prev).add(deletingTask.id));

      // Wait for animation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success(isOfflineCreatedTask ? 'Task deleted' : 'Task deleted');

      // Collapse expanded card if it was the deleted task
      setExpandedTaskId((current) => (current === deletingTask.id ? null : current));

      // Refetch tasks
      await refetch();

      // Clean up removing state after refetch
      setRemovingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingTask.id);
        return next;
      });
    } catch (err) {
      // Failed - task never faded, no visual inconsistency
      message.error('Failed to delete task');
    } finally {
      setDeletingTask(null);
    }
  }, [deletingTask, deleteTask, refetch, isOffline]);

  // Cancel deletion
  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
    setDeletingTask(null);
  }, []);

  // Close completion sheet
  const handleCompletionSheetClose = useCallback(() => {
    setShowCompletionSheet(false);
    setCompletingTask(null);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div
        data-testid="tasks-loading"
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 0',
          ...style,
        }}
      >
        <Spin size="default" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load tasks"
        description={error}
        showIcon
        style={style}
        data-testid="tasks-error"
      />
    );
  }

  // Empty state (no overdue and no pending tasks) - but still show add form
  if (overdueTasks.length === 0 && pendingTasks.length === 0) {
    return (
      <div style={style}>
        <TaskEmptyState />
        <MobileAddTaskForm
          hiveId={hiveId}
          onTaskAdded={handleTaskAdded}
          templates={templates}
          templatesLoading={templatesLoading}
          tenantId={tenantId}
          style={{ marginTop: 16 }}
        />
      </div>
    );
  }

  // Calculate counts for header
  const urgentCount = [...overdueTasks, ...pendingTasks].filter(t => t.priority === 'urgent' || t.priority === 'high').length;
  const totalPendingCount = overdueTasks.length + pendingTasks.length;

  return (
    <div
      data-testid="mobile-tasks-section"
      style={{
        padding: '0 0 24px',
        maxWidth: 480,
        margin: '0 auto',
        ...style,
      }}
    >
      {/* Page Header - v2 mockup style */}
      <div style={{ marginBottom: 24 }}>
        <Title
          level={2}
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            color: colors.brownBramble,
            letterSpacing: '-0.02em',
          }}
        >
          Today's Field Tasks
        </Title>
        <Text style={{ color: 'rgba(102, 38, 4, 0.8)', fontSize: 15 }}>
          {urgentCount} Urgent{' '}
          <span style={{ color: '#d4c6b5' }}>•</span>{' '}
          {totalPendingCount} Pending
        </Text>
      </div>

      {/* OFFLINE BANNER (Story 14.16) */}
      {isOffline && <OfflineTasksBanner pendingSyncCount={pendingSyncCount} />}

      {/* BEEBRAIN INSIGHT CARD - v2 mockup style */}
      {!suggestionsLoading && suggestions.length > 0 && (
        <div
          style={{
            backgroundColor: '#e3f2fd',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            border: '1px solid #bbdefb',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative circle */}
          <div
            style={{
              position: 'absolute',
              right: -24,
              top: -24,
              width: 96,
              height: 96,
              borderRadius: '50%',
              backgroundColor: '#64b5f6',
              opacity: 0.1,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                flexShrink: 0,
              }}
            >
              <RobotOutlined style={{ fontSize: 20, color: '#1976d2' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#1565c0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  BeeBrain Insight
                </Text>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#2196f3',
                    animation: 'pulse 2s infinite',
                  }}
                />
              </div>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#0d47a1',
                  lineHeight: 1.5,
                }}
              >
                {suggestions[0]?.reason || 'High mite counts predicted. Prioritize Varroa checks immediately.'}
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* Separate BeeBrain suggestions section for multiple suggestions */}
      {!suggestionsLoading && suggestions.length > 1 && (
        <BeeBrainSuggestionsSection
          suggestions={suggestions.slice(1).filter(s => !removingSuggestionIds.has(s.id))}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
          accepting={suggestionsAccepting}
          dismissing={suggestionsDismissing}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* OVERDUE SUBSECTION - v2 mockup style */}
      {overdueTasks.length > 0 && (
        <div
          data-testid="overdue-subsection"
          style={{ marginBottom: 24 }}
        >
          {/* Overdue header */}
          <Text
            style={{
              display: 'block',
              color: '#c4857a',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 12,
              paddingLeft: 4,
            }}
            data-testid="overdue-header"
          >
            Overdue
          </Text>

          {/* Overdue task cards - with rose background tint */}
          {overdueTasks.map((task) => {
            const isNew = task.id === newTaskId;
            const isRemoving = removingTaskIds.has(task.id);
            return (
              <div
                key={task.id}
                data-testid={isNew ? 'new-task-animation' : undefined}
                style={{
                  opacity: isRemoving ? 0 : 1,
                  transform: isNew ? 'translateY(0)' : undefined,
                  animation: isNew ? 'slideInFromTop 300ms ease-out' : undefined,
                  transition: 'opacity 300ms ease-out',
                  backgroundColor: 'rgba(196, 133, 122, 0.1)',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  border: '1px solid rgba(196, 133, 122, 0.3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <WarningOutlined style={{ color: '#c4857a', fontSize: 16 }} />
                      <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
                        {task.custom_title || task.title}
                      </Text>
                    </div>
                    <Text style={{ fontSize: 13, color: 'rgba(102, 38, 4, 0.7)' }}>
                      {task.hive_name || 'Hive'}
                    </Text>
                    <Text style={{ display: 'block', fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>
                      Due Yesterday
                    </Text>
                  </div>
                </div>
                <Button
                  type="primary"
                  block
                  onClick={() => handleComplete(task)}
                  icon={<span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>}
                  style={{
                    height: 64,
                    borderRadius: 9999,
                    backgroundColor: colors.seaBuckthorn,
                    borderColor: colors.seaBuckthorn,
                    color: '#ffffff',
                    fontSize: 17,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(247, 164, 45, 0.3)',
                  }}
                >
                  Complete Task
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* PENDING SUBSECTION - v2 mockup style */}
      {pendingTasks.length > 0 && (
        <div data-testid="pending-subsection">
          {/* Pending header with Sort link */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              paddingLeft: 4,
            }}
          >
            <Text
              style={{
                color: 'rgba(102, 38, 4, 0.7)',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
              data-testid="pending-header"
            >
              Pending
            </Text>
            <Text
              style={{
                color: colors.seaBuckthorn,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sort by Priority
            </Text>
          </div>

          {/* Pending task cards - v2 style with priority dot */}
          {pendingTasks.map((task) => {
            const isNew = task.id === newTaskId;
            const isRemoving = removingTaskIds.has(task.id);
            const priorityColor = priorityColors[task.priority] || colors.seaBuckthorn;

            return (
              <div
                key={task.id}
                data-testid={isNew ? 'new-task-animation' : undefined}
                style={{
                  opacity: isRemoving ? 0 : 1,
                  transform: isNew ? 'translateY(0)' : undefined,
                  animation: isNew ? 'slideInFromTop 300ms ease-out' : undefined,
                  transition: 'opacity 300ms ease-out',
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 16,
                  border: '1px solid rgba(102, 38, 4, 0.05)',
                  boxShadow: '0 8px 24px -6px rgba(102, 38, 4, 0.08), 0 4px 12px -4px rgba(102, 38, 4, 0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: priorityColor,
                          boxShadow: `0 0 0 3px ${priorityColor}20`,
                        }}
                      />
                      <Text strong style={{ fontSize: 17, color: colors.brownBramble }}>
                        {task.custom_title || task.title}
                      </Text>
                    </div>
                    <Text style={{ fontSize: 13, color: 'rgba(102, 38, 4, 0.7)' }}>
                      {task.hive_name || 'Hive'}
                    </Text>
                  </div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 9999,
                      backgroundColor: colors.coconutCream,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleToggle(task.id)}
                  >
                    <span className="material-symbols-outlined" style={{ color: 'rgba(102, 38, 4, 0.6)', fontSize: 20 }}>more_vert</span>
                  </div>
                </div>

                {/* Tags if any metadata */}
                {task.notes && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: 6,
                        backgroundColor: colors.coconutCream,
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'rgba(102, 38, 4, 0.8)',
                      }}
                    >
                      {task.notes}
                    </span>
                  </div>
                )}

                <Button
                  type="primary"
                  block
                  onClick={() => handleComplete(task)}
                  style={{
                    height: 64,
                    borderRadius: 9999,
                    backgroundColor: colors.seaBuckthorn,
                    borderColor: colors.seaBuckthorn,
                    color: '#ffffff',
                    fontSize: 17,
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(247, 164, 45, 0.3)',
                  }}
                >
                  Complete Task
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Form - appears at the bottom of the tasks section */}
      <MobileAddTaskForm
        hiveId={hiveId}
        onTaskAdded={handleTaskAdded}
        templates={templates}
        templatesLoading={templatesLoading}
        tenantId={tenantId}
        style={{ marginTop: 16 }}
      />

      {/* Task Completion Sheet Modal */}
      <MobileTaskCompletionSheet
        task={completingTask}
        visible={showCompletionSheet}
        onClose={handleCompletionSheetClose}
        onComplete={handleCompleteWithData}
        completing={completing}
      />

      {/* Delete Confirmation Modal */}
      <DeleteTaskConfirmation
        visible={showDeleteConfirm}
        taskName={deletingTask?.custom_title || deletingTask?.title || ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        deleting={deleting}
      />
    </div>
  );
}

export default MobileTasksSection;
