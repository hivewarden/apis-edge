/**
 * HiveDetailTasksSection Component
 *
 * Compact desktop task list for the hive detail page. Shows pending and
 * overdue tasks with inline complete/delete actions. Reuses useHiveTasks
 * and useCompleteTask/useDeleteTask hooks.
 *
 * Part of Epic 14 — Desktop Hive Detail inline task list
 */
import { useState, useCallback, CSSProperties } from 'react';
import {
  Card,
  List,
  Button,
  Popconfirm,
  Typography,
  Spin,
  Alert,
  Badge,
  message,
} from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  WarningOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { startOfDay, isToday, isTomorrow, isYesterday, format } from 'date-fns';
import { useHiveTasks } from '../hooks/useHiveTasks';
import { useCompleteTask, useDeleteTask } from '../hooks/useTasks';
import type { Task, TaskCompletionData } from '../hooks/useTasks';
import { TaskCompletionModal } from './TaskCompletionModal';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

const priorityColors: Record<string, string> = {
  urgent: '#ef4444',
  high: '#ef4444',
  medium: '#d4a574',
  low: '#7c9082',
};

function formatDueDate(dateString?: string): { text: string; isOverdue: boolean } {
  if (!dateString) return { text: 'No due date', isOverdue: false };
  try {
    const date = new Date(dateString);
    const today = startOfDay(new Date());
    const dueDate = startOfDay(date);
    const overdue = dueDate < today;

    if (isToday(date)) return { text: 'Today', isOverdue: false };
    if (isTomorrow(date)) return { text: 'Tomorrow', isOverdue: false };
    if (isYesterday(date)) return { text: 'Yesterday', isOverdue: true };
    return { text: format(date, 'MMM d'), isOverdue: overdue };
  } catch {
    return { text: 'Invalid date', isOverdue: false };
  }
}

function hasPrompts(task: Task): boolean {
  return Boolean(task.auto_effects?.prompts && task.auto_effects.prompts.length > 0);
}

export interface HiveDetailTasksSectionProps {
  hiveId: string;
  style?: CSSProperties;
}

export function HiveDetailTasksSection({ hiveId, style }: HiveDetailTasksSectionProps) {
  const { overdueTasks, pendingTasks, loading, error, refetch } = useHiveTasks(hiveId);
  const { completeTask, completing } = useCompleteTask();
  const { deleteTask, deleting } = useDeleteTask();
  const [completionModalTask, setCompletionModalTask] = useState<Task | null>(null);

  const allTasks = [...overdueTasks, ...pendingTasks];
  const totalCount = allTasks.length;

  const handleComplete = useCallback(
    async (task: Task) => {
      if (hasPrompts(task)) {
        setCompletionModalTask(task);
      } else {
        try {
          await completeTask(task.id);
          message.success('Task completed');
          refetch();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to complete task';
          message.error(msg);
        }
      }
    },
    [completeTask, refetch]
  );

  const handleCompletionSubmit = useCallback(
    async (completionData: TaskCompletionData) => {
      if (!completionModalTask) return;
      try {
        await completeTask(completionModalTask.id, completionData);
        message.success('Task completed');
        setCompletionModalTask(null);
        refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to complete task';
        message.error(msg);
      }
    },
    [completionModalTask, completeTask, refetch]
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId);
        message.success('Task deleted');
        refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete task';
        message.error(msg);
      }
    },
    [deleteTask, refetch]
  );

  if (loading) {
    return (
      <Card style={style}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={style}>
        <Alert message="Failed to load tasks" description={error} type="error" showIcon />
      </Card>
    );
  }

  const isOverdueTask = (task: Task) => overdueTasks.some(t => t.id === task.id);

  return (
    <>
      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Pending Tasks
            {totalCount > 0 && (
              <Badge
                count={totalCount}
                style={{
                  backgroundColor: overdueTasks.length > 0 ? '#c4857a' : colors.seaBuckthorn,
                  color: overdueTasks.length > 0 ? '#fff' : colors.brownBramble,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              />
            )}
          </span>
        }
        style={style}
      >
        {totalCount === 0 ? (
          <Text type="secondary">No pending tasks</Text>
        ) : (
          <List
            dataSource={allTasks}
            rowKey="id"
            split={false}
            renderItem={(task) => {
              const overdue = isOverdueTask(task);
              const { text: dueDateText, isOverdue: dueDateOverdue } = formatDueDate(task.due_date);

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: overdue ? 'rgba(196, 133, 122, 0.08)' : 'transparent',
                    marginBottom: 4,
                  }}
                >
                  {/* Priority dot */}
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: priorityColors[task.priority] || '#d4a574',
                      flexShrink: 0,
                    }}
                  />

                  {/* Task info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontWeight: 600,
                        color: colors.brownBramble,
                        fontSize: 14,
                        display: 'block',
                      }}
                      ellipsis
                    >
                      {task.title}
                    </Text>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: dueDateOverdue ? 600 : 400,
                        color: dueDateOverdue ? '#c4857a' : '#9d7a48',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {dueDateOverdue && <WarningOutlined style={{ fontSize: 12 }} />}
                      {dueDateText}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button
                      type="default"
                      shape="circle"
                      icon={<CheckOutlined style={{ fontSize: 16 }} />}
                      onClick={() => handleComplete(task)}
                      disabled={completing || deleting}
                      style={{
                        minWidth: 40,
                        width: 40,
                        height: 40,
                        color: colors.success,
                        borderColor: 'rgba(46, 125, 50, 0.45)',
                        backgroundColor: 'rgba(46, 125, 50, 0.1)',
                      }}
                    />
                    <Popconfirm
                      title="Delete this task?"
                      onConfirm={() => handleDelete(task.id)}
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        type="default"
                        shape="circle"
                        icon={<DeleteOutlined style={{ fontSize: 16 }} />}
                        disabled={completing || deleting}
                        style={{
                          minWidth: 40,
                          width: 40,
                          height: 40,
                          color: '#9d7a48',
                          borderColor: 'rgba(157, 122, 72, 0.45)',
                          backgroundColor: 'rgba(157, 122, 72, 0.1)',
                        }}
                      />
                    </Popconfirm>
                  </div>
                </div>
              );
            }}
          />
        )}

        {/* View All Tasks link */}
        <div style={{ textAlign: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <Link
            to={`/tasks?hive_id=${hiveId}`}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#9d7a48',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            View All Tasks <RightOutlined style={{ fontSize: 11 }} />
          </Link>
        </div>
      </Card>

      <TaskCompletionModal
        open={!!completionModalTask}
        task={completionModalTask}
        onComplete={handleCompletionSubmit}
        onCancel={() => setCompletionModalTask(null)}
        completing={completing}
      />
    </>
  );
}

export default HiveDetailTasksSection;
