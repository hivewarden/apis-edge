/**
 * TaskEmptyState Component
 *
 * Displays a friendly empty state when a hive has no pending tasks.
 * Shows an icon, title, and helpful subtext encouraging users to add tasks.
 *
 * Part of Epic 14, Story 14.9: Mobile Tasks Section View
 */
import { CSSProperties } from 'react';
import { Typography, Space } from 'antd';
import { CheckSquareOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

export interface TaskEmptyStateProps {
  /** Optional style overrides */
  style?: CSSProperties;
}

/**
 * Empty state display for when a hive has no tasks.
 * Centered layout with icon, title, and subtext.
 *
 * @example
 * <TaskEmptyState style={{ marginTop: 24 }} />
 */
export function TaskEmptyState({ style }: TaskEmptyStateProps) {
  return (
    <div
      data-testid="task-empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        textAlign: 'center',
        ...style,
      }}
    >
      <Space direction="vertical" size={12} align="center">
        {/* Icon */}
        <CheckSquareOutlined
          style={{
            fontSize: 48,
            color: colors.textMuted,
          }}
          data-testid="empty-state-icon"
        />

        {/* Title */}
        <Title
          level={5}
          style={{
            margin: 0,
            color: colors.brownBramble,
          }}
          data-testid="empty-state-title"
        >
          No tasks for this hive
        </Title>

        {/* Subtext */}
        <Text
          type="secondary"
          style={{
            color: colors.textMuted,
            fontSize: 13,
          }}
          data-testid="empty-state-subtext"
        >
          Plan your next visit by adding a task below
        </Text>
      </Space>
    </div>
  );
}

export default TaskEmptyState;
