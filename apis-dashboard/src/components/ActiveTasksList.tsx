/**
 * ActiveTasksList Component
 *
 * Displays a filterable, sortable table of active tasks with selection
 * and bulk actions support. Includes task completion modal for tasks
 * with auto_effects prompts.
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 * Updated to match v2 mockups (apis_active_tasks_list)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  Button,
  Popconfirm,
  Typography,
  Empty,
  Spin,
  Alert,
  message,
  Avatar,
} from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  WarningOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { format, startOfDay, isToday, isTomorrow, isYesterday } from 'date-fns';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import {
  useFetchTasks,
  useCompleteTask,
  useDeleteTask,
  useBulkDeleteTasks,
  useBulkCompleteTasks,
  useSites,
} from '../hooks';
import type { Task, TaskFiltersState, TaskCompletionData } from '../hooks/useTasks';
import { TaskCompletionModal } from './TaskCompletionModal';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

/**
 * Priority colors matching the v2 mockup design
 */
const priorityColors: Record<string, string> = {
  urgent: '#ef4444', // red
  high: '#ef4444', // red
  medium: '#d4a574', // amber-task
  low: '#7c9082', // soft-sage/green
};

/**
 * Format a date string with contextual labels (Today, Tomorrow, Yesterday, or date)
 */
function formatDueDate(dateString?: string): { text: string; isOverdue: boolean } {
  if (!dateString) return { text: 'No due date', isOverdue: false };
  try {
    const date = new Date(dateString);
    const today = startOfDay(new Date());
    const dueDate = startOfDay(date);
    const isOverdue = dueDate < today;

    if (isToday(date)) return { text: 'Today', isOverdue: false };
    if (isTomorrow(date)) return { text: 'Tomorrow', isOverdue: false };
    if (isYesterday(date)) return { text: 'Yesterday', isOverdue: true };
    return { text: format(date, 'MMM d'), isOverdue };
  } catch {
    return { text: 'Invalid date', isOverdue: false };
  }
}

/**
 * Get priority label for display
 */
function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[priority] || priority;
}

/**
 * Check if a task is overdue
 * A task is overdue if today is AFTER the due date (not on the due date itself)
 */
function isTaskOverdue(task: Task): boolean {
  if (!task.due_date || task.status !== 'pending') return false;
  const dueDate = startOfDay(new Date(task.due_date));
  const today = startOfDay(new Date());
  return today > dueDate;
}

/**
 * Check if a task has auto_effects prompts
 */
function hasPrompts(task: Task): boolean {
  return Boolean(task.auto_effects?.prompts && task.auto_effects.prompts.length > 0);
}

/**
 * ActiveTasksList Component
 *
 * Displays the active tasks table with:
 * - Header showing open/overdue counts
 * - Filter row (site, priority, status, search)
 * - Sortable, selectable table
 * - Single and bulk complete/delete actions
 * - Completion modal for tasks with prompts
 */
export interface ActiveTasksListProps {
  /** Increment to trigger a refetch from parent */
  refreshTrigger?: number;
}

export function ActiveTasksList({ refreshTrigger }: ActiveTasksListProps = {}) {
  // URL search params for filter persistence
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse initial filters from URL
  const initialFilters: TaskFiltersState = {
    site_id: searchParams.get('site_id') || undefined,
    priority: (searchParams.get('priority') as TaskFiltersState['priority']) || undefined,
    status: (searchParams.get('status') as TaskFiltersState['status']) || 'pending',
    search: searchParams.get('search') || undefined,
  };

  // Parse initial sort from URL
  const initialSortField = searchParams.get('sort') || 'due_date';
  const initialSortOrder = (searchParams.get('order') as 'ascend' | 'descend') || 'ascend';

  // State
  const [filters, _setFilters] = useState<TaskFiltersState>(initialFilters);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [completionModalTask, setCompletionModalTask] = useState<Task | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<string>(initialSortField);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>(initialSortOrder);

  // Use hook for sites (kept for potential future filter use)
  const { loading: sitesLoading } = useSites();
  void sitesLoading; // Suppress unused warning

  // Data fetching hooks - pass pagination params
  const { tasks, loading, error, total, refetch } = useFetchTasks({
    ...filters,
    page: currentPage,
    per_page: pageSize,
  });
  const { completeTask, completing: singleCompleting } = useCompleteTask();
  const { deleteTask, deleting: singleDeleting } = useDeleteTask();
  const { bulkDeleteTasks, deleting: bulkDeleting } = useBulkDeleteTasks();
  const { bulkCompleteTasks, completing: bulkCompleting } = useBulkCompleteTasks();

  // Update URL when filters or sort change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.site_id) params.set('site_id', filters.site_id);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.status && filters.status !== 'pending') params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    if (sortField && sortField !== 'due_date') params.set('sort', sortField);
    if (sortOrder && sortOrder !== 'ascend') params.set('order', sortOrder);
    setSearchParams(params, { replace: true });
  }, [filters, sortField, sortOrder, setSearchParams]);

  // Refetch when parent signals new tasks were created
  useEffect(() => {
    if (refreshTrigger) refetch();
  }, [refreshTrigger, refetch]);

  // Get selected tasks
  const selectedTasks = useMemo(() => {
    return tasks.filter(t => selectedRowKeys.includes(t.id));
  }, [tasks, selectedRowKeys]);

  // Handle pagination and sort changes
  const handleTableChange = useCallback(
    (
      pagination: { current?: number; pageSize?: number },
      _filters: unknown,
      sorter: SorterResult<Task> | SorterResult<Task>[]
    ) => {
      // Handle pagination
      if (pagination.current) setCurrentPage(pagination.current);
      if (pagination.pageSize && pagination.pageSize !== pageSize) {
        setPageSize(pagination.pageSize);
        setCurrentPage(1); // Reset to page 1 on page size change
      }

      // Handle sorting (single sorter only)
      const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
      if (singleSorter?.field) {
        setSortField(singleSorter.field as string);
        setSortOrder(singleSorter.order || 'ascend');
      }
    },
    [pageSize]
  );

  // Handle single task complete
  const handleComplete = useCallback(
    async (task: Task) => {
      if (hasPrompts(task)) {
        setCompletionModalTask(task);
      } else {
        try {
          await completeTask(task.id);
          message.success('Task completed');
          refetch();
          setSelectedRowKeys(keys => keys.filter(k => k !== task.id));
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to complete task';
          message.error(errorMessage);
        }
      }
    },
    [completeTask, refetch]
  );

  // Handle completion modal submit
  const handleCompletionSubmit = useCallback(
    async (completionData: TaskCompletionData) => {
      if (!completionModalTask) return;

      try {
        await completeTask(completionModalTask.id, completionData);
        message.success('Task completed');
        setCompletionModalTask(null);
        refetch();
        setSelectedRowKeys(keys => keys.filter(k => k !== completionModalTask.id));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to complete task';
        message.error(errorMessage);
      }
    },
    [completionModalTask, completeTask, refetch]
  );

  // Handle single task delete
  const handleDelete = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId);
        message.success('Task deleted');
        refetch();
        setSelectedRowKeys(keys => keys.filter(k => k !== taskId));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete task';
        message.error(errorMessage);
      }
    },
    [deleteTask, refetch]
  );

  // Handle bulk complete
  const handleBulkComplete = useCallback(async () => {
    if (selectedTasks.length === 0) return;

    try {
      const result = await bulkCompleteTasks(selectedTasks);

      if (result.completed > 0 && result.skipped === 0) {
        message.success(`${result.completed} task${result.completed !== 1 ? 's' : ''} completed`);
      } else if (result.completed > 0 && result.skipped > 0) {
        message.info(
          `${result.completed} task${result.completed !== 1 ? 's' : ''} completed, ` +
            `${result.skipped} skipped (require prompts)`
        );
      } else if (result.skipped > 0) {
        message.warning(
          `${result.skipped} task${result.skipped !== 1 ? 's' : ''} require prompts - complete individually`
        );
      }

      refetch();
      // Keep only skipped tasks selected
      setSelectedRowKeys(result.skippedIds);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete tasks';
      message.error(errorMessage);
    }
  }, [selectedTasks, bulkCompleteTasks, refetch]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedRowKeys.length === 0) return;

    try {
      const result = await bulkDeleteTasks(selectedRowKeys as string[]);
      message.success(`${result.deleted} task${result.deleted !== 1 ? 's' : ''} deleted`);
      refetch();
      setSelectedRowKeys([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete tasks';
      message.error(errorMessage);
    }
  }, [selectedRowKeys, bulkDeleteTasks, refetch]);

  // Check if any operation is in progress
  const isOperationInProgress = loading || singleDeleting || singleCompleting || bulkCompleting || bulkDeleting;

  // Table row selection config
  const rowSelection: TableProps<Task>['rowSelection'] = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    getCheckboxProps: (record: Task) => ({
      disabled: isOperationInProgress,
      name: record.id,
    }),
  };

  // Table columns - updated to match v2 mockup (apis_active_tasks_list)
  const columns: ColumnsType<Task> = [
    {
      title: 'Hive Name',
      dataIndex: 'hive_name',
      key: 'hive_name',
      render: (name: string, record: Task) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Link
            to={`/hives/${record.hive_id}`}
            style={{ fontWeight: 700, color: colors.brownBramble, fontSize: 15 }}
          >
            {name || 'Unknown Hive'}
          </Link>
          <Text style={{ fontSize: 12, color: '#9d7a48' }}>
            Apiary
          </Text>
        </div>
      ),
    },
    {
      title: 'Task Type',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => (
        <Text style={{ fontWeight: 500, color: colors.brownBramble, fontSize: 14 }}>
          {title}
        </Text>
      ),
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      sorter: (a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      },
      sortOrder: sortField === 'due_date' ? sortOrder : undefined,
      render: (dueDate: string) => {
        const { text, isOverdue } = formatDueDate(dueDate);
        return (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: isOverdue ? 700 : 500,
              color: isOverdue ? '#c4857a' : colors.brownBramble,
              fontSize: 14,
            }}
          >
            {isOverdue && <WarningOutlined style={{ fontSize: 16 }} />}
            {text}
          </span>
        );
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      sorter: (a, b) => {
        const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      },
      sortOrder: sortField === 'priority' ? sortOrder : undefined,
      render: (priority: Task['priority']) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: priorityColors[priority] || '#d4a574',
            }}
          />
          <Text style={{ fontSize: 14, fontWeight: 500, color: colors.brownBramble }}>
            {getPriorityLabel(priority)}
          </Text>
        </div>
      ),
    },
    {
      title: 'Assignee',
      key: 'assignee',
      render: (_: unknown, record: Task) => {
        // Use created_by as fallback for assignee display
        const assigneeName = record.created_by;
        return assigneeName ? (
          <Avatar
            size={36}
            style={{
              backgroundColor: '#e9dece',
              color: '#9d7a48',
              fontWeight: 700,
              fontSize: 12,
              border: '2px solid #ffffff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            {assigneeName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </Avatar>
        ) : (
          <Avatar
            size={36}
            style={{
              backgroundColor: '#e9dece',
              color: '#9d7a48',
              fontWeight: 700,
              fontSize: 12,
              border: '2px solid #ffffff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            --
          </Avatar>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Task) => (
        <Popconfirm
          title="Task Actions"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
              <Button
                type="text"
                icon={<CheckOutlined />}
                onClick={() => handleComplete(record)}
                disabled={record.status === 'completed' || isOperationInProgress}
                style={{ justifyContent: 'flex-start' }}
              >
                Complete
              </Button>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record.id)}
                disabled={isOperationInProgress}
                style={{ justifyContent: 'flex-start' }}
              >
                Delete
              </Button>
            </div>
          }
          showCancel={false}
          okButtonProps={{ style: { display: 'none' } }}
        >
          <Button
            type="default"
            shape="circle"
            icon={<MoreOutlined style={{ fontSize: 18 }} />}
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
      ),
    },
  ];

  // Loading state
  if (loading && tasks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: colors.textMuted }}>Loading tasks...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        message="Failed to Load Tasks"
        description={error}
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      {/* Tasks Table - v2 mockup styling */}
      <div style={{ overflow: 'hidden' }}>
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          onChange={(pagination, filters, sorter) => handleTableChange(pagination, filters, sorter)}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No tasks match your filters"
              />
            ),
          }}
          size="middle"
          rowClassName={(record) => {
            const taskOverdue = isTaskOverdue(record);
            return taskOverdue ? 'task-row-overdue' : '';
          }}
          style={{
            borderRadius: 0,
          }}
        />

        {/* Pagination footer - only show when there are tasks */}
        {tasks.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              backgroundColor: '#f8f7f5',
              borderTop: '1px solid #f4eee7',
            }}
          >
            <Text style={{ fontSize: 14, color: '#9d7a48' }}>
              Showing <strong style={{ color: colors.brownBramble }}>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong style={{ color: colors.brownBramble }}>{Math.min(currentPage * pageSize, total)}</strong> of{' '}
              <strong style={{ color: colors.brownBramble }}>{total}</strong> tasks
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #e9dece',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#9d7a48',
                }}
              >
                Previous
              </Button>
              <Button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage * pageSize >= total}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #e9dece',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#9d7a48',
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* View All Tasks link */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px',
            borderTop: '1px solid #f4eee7',
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#9d7a48',
              cursor: 'pointer',
            }}
          >
            View All Tasks
          </Text>
        </div>
      </div>

      {/* Bulk Actions Bar - fixed bottom when items selected */}
      {selectedRowKeys.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            backgroundColor: colors.brownBramble,
            color: '#fbf9e7',
            borderRadius: 16,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            boxShadow: '0 8px 24px rgba(102, 38, 4, 0.25)',
            maxWidth: 960,
            width: 'calc(100% - 32px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.seaBuckthorn,
                color: colors.brownBramble,
                fontWeight: 900,
                width: 28,
                height: 28,
                borderRadius: '50%',
                fontSize: 14,
              }}
            >
              {selectedRowKeys.length}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.02em' }}>
              Tasks Selected
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_clock</span>}
              style={{ color: '#fbf9e7', fontSize: 14, fontWeight: 500 }}
            >
              Reschedule
            </Button>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined style={{ fontSize: 18 }} />}
              onClick={handleBulkDelete}
              loading={bulkDeleting}
              style={{ color: '#c4857a', fontSize: 14, fontWeight: 500 }}
            >
              Delete
            </Button>
            <div style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 8px' }} />
            <Button
              type="primary"
              icon={<CheckOutlined style={{ fontSize: 18 }} />}
              onClick={handleBulkComplete}
              loading={bulkCompleting}
              style={{
                backgroundColor: colors.seaBuckthorn,
                borderColor: colors.seaBuckthorn,
                color: colors.brownBramble,
                fontWeight: 700,
                borderRadius: 12,
                padding: '8px 20px',
                height: 'auto',
              }}
            >
              Complete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Task Completion Modal */}
      <TaskCompletionModal
        open={!!completionModalTask}
        task={completionModalTask}
        onComplete={handleCompletionSubmit}
        onCancel={() => setCompletionModalTask(null)}
        completing={singleCompleting}
      />

      {/* TODO (S5-L4): Replace inline <style> with CSS modules or scoped styles.
          Global selectors like .ant-table-thead affect the entire application,
          not just this component. Style overrides persist in the DOM after unmount. */}
      <style>{`
        .task-row-overdue td:first-child {
          position: relative;
        }
        .task-row-overdue td:first-child::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background-color: #c4857a;
        }
        .ant-table-thead > tr > th {
          background-color: #f8f7f5 !important;
          color: #9d7a48 !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          border-bottom: 1px solid #e6e0d6 !important;
        }
        .ant-table-tbody > tr > td {
          padding: 20px 24px !important;
          border-bottom: 1px solid #f4eee7 !important;
        }
        .ant-table-tbody > tr:hover > td {
          background-color: rgba(251, 249, 231, 0.5) !important;
        }
      `}</style>
    </div>
  );
}

export default ActiveTasksList;
