/**
 * MobileTaskCard Component
 *
 * A mobile-optimized expandable card for displaying individual task items.
 * Shows task name, priority indicator, due date, and expands to reveal
 * description, notes, created date, and source on tap.
 *
 * Part of Epic 14, Story 14.9: Mobile Tasks Section View
 * Updated to match v2 mockups (apis_expandable_task_card)
 */
import { CSSProperties } from 'react';
import { Typography, Button } from 'antd';
import { RobotOutlined, UpOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { Task } from '../hooks/useTasks';

const { Text } = Typography;

export interface MobileTaskCardProps {
  /** The task data to display */
  task: Task;
  /** Whether the card is currently expanded */
  expanded: boolean;
  /** Callback when the card is tapped (not on buttons) */
  onToggle: () => void;
  /** Callback when the Complete button is tapped */
  onComplete: () => void;
  /** Callback when the Delete link is tapped */
  onDelete: () => void;
  /** Optional style overrides */
  style?: CSSProperties;
}

/**
 * Mobile-optimized task card with expandable details.
 * Updated to match v2 mockup design with left border accent and refined styling.
 *
 * @example
 * <MobileTaskCard
 *   task={task}
 *   expanded={expandedId === task.id}
 *   onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
 *   onComplete={() => handleComplete(task)}
 *   onDelete={() => handleDelete(task.id)}
 * />
 */
export function MobileTaskCard({
  task,
  expanded,
  onToggle,
  onComplete,
  onDelete,
  style,
}: MobileTaskCardProps) {
  // Determine task display name (custom_title takes precedence over title)
  const displayName = task.custom_title || task.title;

  // Format due date if present (MMM D format, e.g., "Oct 15")
  const formattedDueDate = task.due_date
    ? dayjs(task.due_date).format('MMM D')
    : null;

  // Format created date for expanded view (e.g., "Created Oct 12")
  const formattedCreatedDate = dayjs(task.created_at).format('MMM D');

  // Determine source - check if task was created by BeeBrain
  const isBeeBrainSource = task.source === 'beebrain';

  // Collapsed card (simple view)
  if (!expanded) {
    return (
      <div
        data-testid="mobile-task-card"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          padding: 16,
          marginBottom: 8,
          boxShadow: '0 4px 12px -4px rgba(102, 38, 4, 0.06)',
          border: '1px solid rgba(102, 38, 4, 0.05)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...style,
        }}
      >
        <div>
          <Text
            strong
            style={{
              color: colors.brownBramble,
              fontSize: 15,
              display: 'block',
            }}
          >
            {displayName}
          </Text>
          {formattedDueDate && (
            <Text
              style={{
                color: 'rgba(102, 38, 4, 0.5)',
                fontSize: 12,
              }}
            >
              Due {formattedDueDate}
            </Text>
          )}
        </div>
        <RightOutlined style={{ color: 'rgba(102, 38, 4, 0.2)', fontSize: 14 }} />
      </div>
    );
  }

  // Expanded card (full view with actions)
  return (
    <div
      data-testid="mobile-task-card"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        marginBottom: 8,
        boxShadow: '0 8px 24px -6px rgba(102, 38, 4, 0.08)',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {/* Left border accent */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: colors.seaBuckthorn,
        }}
      />

      <div style={{ padding: '20px 20px 20px 24px' }}>
        {/* Header row with title and collapse button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            {/* Task title */}
            <Text
              strong
              style={{
                color: colors.brownBramble,
                fontSize: 18,
                display: 'block',
                lineHeight: 1.3,
              }}
            >
              {displayName}
            </Text>
            {/* Created date */}
            <Text
              style={{
                color: 'rgba(102, 38, 4, 0.5)',
                fontSize: 12,
                fontWeight: 500,
              }}
              data-testid="created-date"
            >
              Created {formattedCreatedDate}
            </Text>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'rgba(102, 38, 4, 0.4)',
            }}
            aria-label="Collapse task"
          >
            <UpOutlined style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Description */}
        {task.description && (
          <Text
            style={{
              display: 'block',
              color: 'rgba(102, 38, 4, 0.8)',
              fontSize: 14,
              lineHeight: 1.6,
              marginTop: 12,
              marginBottom: 24,
              fontWeight: 500,
            }}
            data-testid="task-description"
          >
            {task.description}
          </Text>
        )}

        {/* Notes */}
        {task.notes && (
          <Text
            style={{
              display: 'block',
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 16,
              fontStyle: 'italic',
            }}
            data-testid="task-notes"
          >
            Notes: {task.notes}
          </Text>
        )}

        {/* Source indicator */}
        {isBeeBrainSource && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 16,
            }}
            data-testid="source-indicator"
          >
            <RobotOutlined style={{ color: colors.seaBuckthorn, fontSize: 14 }} />
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              Suggested by BeeBrain
            </Text>
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingTop: 16,
            borderTop: '1px solid rgba(102, 38, 4, 0.05)',
          }}
        >
          {/* Complete button - primary orange, rounded, 48px height */}
          <Button
            type="primary"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            icon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 12,
              backgroundColor: colors.seaBuckthorn,
              borderColor: colors.seaBuckthorn,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(247, 162, 43, 0.4)',
            }}
            data-testid="complete-button"
          >
            Complete
          </Button>

          {/* Delete button - text style */}
          <Button
            type="text"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              height: 48,
              padding: '0 16px',
              color: colors.brownBramble,
              fontWeight: 700,
              fontSize: 14,
            }}
            data-testid="delete-button"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MobileTaskCard;
