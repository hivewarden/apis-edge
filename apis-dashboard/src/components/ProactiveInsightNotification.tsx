/**
 * ProactiveInsightNotification Component
 *
 * Individual notification card for a BeeBrain proactive insight.
 * Displays severity-coded insight with dismiss, snooze, and take action buttons.
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Button, Dropdown, Space, Typography, Tag } from 'antd';
import {
  CloseOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  DownOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ProactiveInsight } from '../hooks/useProactiveInsights';
import { colors, spacing } from '../theme/apisTheme';

const { Text, Paragraph } = Typography;

/**
 * Props for ProactiveInsightNotification component.
 */
export interface ProactiveInsightNotificationProps {
  /** The insight to display */
  insight: ProactiveInsight;
  /** Callback when insight is dismissed */
  onDismiss: (id: string) => void;
  /** Callback when insight is snoozed */
  onSnooze: (id: string, days: number) => void;
  /** Whether this insight is being removed (for animation) */
  isRemoving?: boolean;
}

/**
 * Severity configuration mapping severity levels to icons, colors, and labels.
 */
const severityConfig = {
  'action-needed': {
    icon: <ExclamationCircleOutlined />,
    color: colors.error,
    tagColor: 'red',
    label: 'Action Needed',
    priority: 1,
  },
  'warning': {
    icon: <WarningOutlined />,
    color: colors.warning,
    tagColor: 'orange',
    label: 'Warning',
    priority: 2,
  },
  'info': {
    icon: <InfoCircleOutlined />,
    color: colors.info,
    tagColor: 'blue',
    label: 'Info',
    priority: 3,
  },
} as const;

/**
 * Snooze duration options.
 */
const snoozeOptions = [
  { key: '1', label: 'Snooze for 1 day', days: 1 },
  { key: '7', label: 'Snooze for 7 days', days: 7 },
  { key: '30', label: 'Snooze for 30 days', days: 30 },
];

/**
 * Navigation mapping: rule_id to target URL.
 */
const getActionUrl = (insight: ProactiveInsight): string => {
  switch (insight.rule_id) {
    case 'queen_aging':
      return insight.hive_id ? `/hives/${insight.hive_id}` : '/hives';
    case 'treatment_due':
      return insight.hive_id ? `/hives/${insight.hive_id}` : '/hives';
    case 'inspection_overdue':
      return insight.hive_id ? `/hives/${insight.hive_id}/inspections/new` : '/hives';
    case 'hornet_activity_spike':
      return '/clips';
    default:
      // Fallback: if hive_id exists, go to hive detail, otherwise hives list
      return insight.hive_id ? `/hives/${insight.hive_id}` : '/hives';
  }
};

/**
 * ProactiveInsightNotification Component
 *
 * Displays a single proactive insight notification card with:
 * - Severity icon and color coding
 * - Insight message and suggested action
 * - Hive name link (if applicable)
 * - Action buttons: Dismiss, Snooze (dropdown), Take Action
 */
export function ProactiveInsightNotification({
  insight,
  onDismiss,
  onSnooze,
  isRemoving = false,
}: ProactiveInsightNotificationProps) {
  const navigate = useNavigate();
  const [dismissLoading, setDismissLoading] = useState(false);
  const [snoozeLoading, setSnoozeLoading] = useState(false);

  const config = severityConfig[insight.severity] || severityConfig.info;

  /**
   * Handle dismiss button click.
   */
  const handleDismiss = async () => {
    setDismissLoading(true);
    try {
      await onDismiss(insight.id);
    } finally {
      setDismissLoading(false);
    }
  };

  /**
   * Handle snooze selection.
   */
  const handleSnooze = async (days: number) => {
    setSnoozeLoading(true);
    try {
      await onSnooze(insight.id, days);
    } finally {
      setSnoozeLoading(false);
    }
  };

  /**
   * Handle "Take Action" button click.
   */
  const handleTakeAction = () => {
    const url = getActionUrl(insight);
    navigate(url);
  };

  /**
   * Handle keyboard interaction on hive name for accessibility.
   */
  const handleHiveNameKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (insight.hive_id) {
        navigate(`/hives/${insight.hive_id}`);
      }
    }
  };

  /**
   * Card styling with severity-based left border.
   */
  const cardStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${colors.salomie} 0%, #fff5e6 100%)`,
    borderLeft: `4px solid ${config.color}`,
    borderRadius: 8,
    padding: spacing.md,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    opacity: isRemoving ? 0 : 1,
    transform: isRemoving ? 'translateX(-20px)' : 'translateX(0)',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
  };

  /**
   * Build ARIA label for the entire notification.
   */
  const ariaLabel = insight.hive_name
    ? `${config.label}: ${insight.hive_name} - ${insight.message}`
    : `${config.label}: ${insight.message}`;

  return (
    <div
      style={cardStyle}
      role="alert"
      aria-label={ariaLabel}
      aria-live="polite"
    >
      {/* Header: Severity icon + tag */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.sm,
        }}
      >
        <Space size={8}>
          <span
            style={{ color: config.color, fontSize: 18 }}
            aria-hidden="true"
          >
            {config.icon}
          </span>
          <Tag color={config.tagColor}>{config.label}</Tag>
        </Space>
      </div>

      {/* Message content */}
      <div style={{ marginBottom: spacing.sm }}>
        {insight.hive_name && (
          <Text
            strong
            style={{
              color: colors.seaBuckthorn,
              marginRight: spacing.sm,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={() => navigate(`/hives/${insight.hive_id}`)}
            onKeyDown={handleHiveNameKeyDown}
            tabIndex={0}
            role="link"
            aria-label={`View ${insight.hive_name}`}
          >
            {insight.hive_name}:
          </Text>
        )}
        <Text style={{ color: colors.brownBramble }}>
          {insight.message}
        </Text>
      </div>

      {/* Suggested action */}
      {insight.suggested_action && (
        <Paragraph
          type="secondary"
          style={{
            margin: 0,
            marginBottom: spacing.md,
            fontSize: 13,
          }}
        >
          {insight.suggested_action}
        </Paragraph>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={handleDismiss}
          loading={dismissLoading}
          aria-label={`Dismiss insight: ${insight.message}`}
        >
          Dismiss
        </Button>

        <Dropdown
          menu={{
            items: snoozeOptions.map(opt => ({
              key: opt.key,
              label: opt.label,
              onClick: () => handleSnooze(opt.days),
            })),
          }}
          trigger={['click']}
          disabled={snoozeLoading}
        >
          <Button
            size="small"
            loading={snoozeLoading}
            aria-label={`Snooze insight: ${insight.message}`}
            aria-haspopup="menu"
          >
            Snooze <DownOutlined />
          </Button>
        </Dropdown>

        <Button
          size="small"
          type="primary"
          icon={<ArrowRightOutlined />}
          onClick={handleTakeAction}
          aria-label={`Take action on insight: ${insight.message}`}
        >
          Take Action
        </Button>
      </div>
    </div>
  );
}

export default ProactiveInsightNotification;
