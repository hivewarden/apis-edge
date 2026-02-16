/**
 * HiveTaskSummary Component
 *
 * Displays a summary of open and overdue tasks for a hive.
 * Used on the Hive Detail page to show task status at a glance.
 *
 * Part of Epic 14, Story 14.6: Portal Hive Detail Task Count Integration
 * Updated to match v2 mockups (apis_task_summary_status)
 */
import { Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

export interface HiveTaskSummaryProps {
  /** Number of open (pending) tasks */
  open: number;
  /** Number of overdue tasks (due_date < today AND status = 'pending') */
  overdue: number;
  /** Click handler for navigation to tasks page */
  onClick?: () => void;
}

/**
 * Displays task count summary for a hive in a card/chip style.
 * Matches v2 mockup design with orange accent and overdue highlight.
 *
 * Format: "Tasks: {open} open - {overdue} overdue"
 * Overdue count is displayed in muted-rose when > 0.
 *
 * @example
 * <HiveTaskSummary
 *   open={3}
 *   overdue={1}
 *   onClick={() => navigate(`/tasks?hive_id=${hiveId}`)}
 * />
 */
export function HiveTaskSummary({ open, overdue, onClick }: HiveTaskSummaryProps) {
  // If no open tasks and no overdue tasks, show a simple message
  if (open === 0 && overdue === 0) {
    return (
      <Text
        type="secondary"
        style={{
          cursor: onClick ? 'pointer' : 'default',
          fontSize: 13,
        }}
        onClick={onClick}
      >
        No tasks
      </Text>
    );
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={`Tasks: ${open} open, ${overdue} overdue`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        border: '1px solid rgba(247, 164, 45, 0.2)',
        boxShadow: '0 1px 3px rgba(102, 38, 4, 0.05)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Icon */}
      <CheckCircleOutlined
        style={{
          fontSize: 18,
          color: colors.seaBuckthorn,
        }}
      />

      {/* Text content */}
      <Text
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.brownBramble,
          textDecoration: onClick ? 'underline' : 'none',
          textDecorationColor: 'rgba(102, 38, 4, 0.3)',
        }}
      >
        Tasks: {open} open
        {overdue > 0 && (
          <>
            {' '}·{' '}
            <span style={{ color: '#c4857a', fontWeight: 700 }}>
              {overdue} overdue
            </span>
          </>
        )}
      </Text>
    </div>
  );
}

export default HiveTaskSummary;
