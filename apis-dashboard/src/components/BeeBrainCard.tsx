/**
 * BeeBrainCard Component
 *
 * Displays BeeBrain AI analysis summary and insights on the dashboard.
 * Shows health status, warnings, and actionable insights for the beekeeper.
 *
 * Part of Epic 8, Story 8.2: Dashboard BeeBrain Card
 */
import { Card, Typography, Button, Space, Skeleton, List, Tooltip, Tag } from 'antd';
import type { KeyboardEvent } from 'react';
import {
  ReloadOutlined,
  BulbOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useBeeBrain, Insight } from '../hooks/useBeeBrain';
import { colors, spacing } from '../theme/apisTheme';

const { Text, Paragraph } = Typography;

/**
 * Props for BeeBrainCard component.
 */
export interface BeeBrainCardProps {
  /** The site ID to display BeeBrain analysis for */
  siteId: string | null;
}

/**
 * Severity configuration mapping severity levels to icons and colors.
 */
const severityConfig = {
  'action-needed': {
    icon: <ExclamationCircleOutlined />,
    color: colors.error,
    tagColor: 'red',
    priority: 1,
  },
  'warning': {
    icon: <WarningOutlined />,
    color: colors.warning,
    tagColor: 'orange',
    priority: 2,
  },
  'info': {
    icon: <InfoCircleOutlined />,
    color: colors.info,
    tagColor: 'blue',
    priority: 3,
  },
} as const;

/**
 * Format a timestamp as relative time (e.g., "5m ago", "2h ago").
 */
function formatLastUpdated(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return then.toLocaleDateString();
}

/**
 * Sort insights by severity (action-needed first, then warning, then info).
 */
function sortInsightsBySeverity(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => {
    return severityConfig[a.severity].priority - severityConfig[b.severity].priority;
  });
}

/**
 * BeeBrainCard Component
 *
 * Displays the BeeBrain AI analysis card on the dashboard.
 * Shows either a healthy status message or a prioritized list of insights/warnings.
 */
export function BeeBrainCard({ siteId }: BeeBrainCardProps) {
  const navigate = useNavigate();
  const { data, loading, refreshing, error, timedOut, refresh } = useBeeBrain(siteId);

  /**
   * Handle clicking on an insight row - navigate to the hive detail page.
   */
  const handleInsightClick = (insight: Insight) => {
    if (insight.hive_id) {
      navigate(`/hives/${insight.hive_id}`);
    }
  };

  /**
   * Handle keyboard interaction on insight row for accessibility.
   * Allows Enter or Space to activate the insight (same as click).
   */
  const handleInsightKeyDown = (event: KeyboardEvent<HTMLLIElement>, insight: Insight) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleInsightClick(insight);
    }
  };

  // Card styling consistent with other dashboard cards
  const cardStyle = {
    background: `linear-gradient(135deg, ${colors.salomie} 0%, #f0e6ff 100%)`,
    borderColor: colors.seaBuckthorn,
    borderWidth: 2,
    height: '100%',
  };

  // No site selected state
  if (!siteId) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
            <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
              BeeBrain Analysis
            </Text>
          </div>
          <Text type="secondary">Select a site to view BeeBrain analysis</Text>
        </Space>
      </Card>
    );
  }

  // Loading state with skeleton
  if (loading && !data) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
            <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
              BeeBrain Analysis
            </Text>
          </div>
          <Skeleton active paragraph={{ rows: 2 }} />
        </Space>
      </Card>
    );
  }

  // Timeout state
  if (timedOut) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={8}>
              <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
              <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
                BeeBrain Analysis
              </Text>
            </Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={refresh}
              disabled={refreshing}
            >
              Retry
            </Button>
          </div>
          {/* Timeout message */}
          <div
            style={{
              padding: 16,
              background: 'rgba(102, 38, 4, 0.05)',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <WarningOutlined style={{ fontSize: 24, color: colors.warning, marginBottom: 8 }} />
            <Paragraph style={{ margin: 0, color: colors.brownBramble }}>
              Analysis is taking longer than expected. Check back soon.
            </Paragraph>
          </div>
        </Space>
      </Card>
    );
  }

  // Error state (but only if we have no data at all)
  if (error && !data) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={8}>
              <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
              <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
                BeeBrain Analysis
              </Text>
            </Space>
          </div>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <InfoCircleOutlined style={{ fontSize: 24, color: '#999', marginBottom: 8 }} />
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Analysis unavailable
            </Text>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={refresh}
            >
              Retry
            </Button>
          </div>
        </Space>
      </Card>
    );
  }

  // No data available (shouldn't happen, but handle gracefully)
  if (!data) {
    return null;
  }

  // Sort insights by severity for prioritized display
  const sortedInsights = sortInsightsBySeverity(data.insights);

  return (
    <Card style={cardStyle}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header with title and refresh button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={8}>
            <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
            <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
              BeeBrain Analysis
            </Text>
          </Space>
          <Space size={spacing.sm}>
            <Tooltip title={`Last updated: ${formatLastUpdated(data.last_analysis)}`}>
              <Text type="secondary" style={{ fontSize: spacing.sm + 3 }}>
                {formatLastUpdated(data.last_analysis)}
              </Text>
            </Tooltip>
            <Tooltip title="Run new analysis">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={refreshing} />}
                onClick={refresh}
                disabled={refreshing}
                style={{ color: colors.brownBramble }}
              />
            </Tooltip>
          </Space>
        </div>

        {/* All Good State */}
        {data.all_good && (
          <div
            style={{
              padding: 16,
              background: 'rgba(46, 125, 50, 0.08)',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <CheckCircleOutlined
              style={{
                fontSize: 32,
                color: colors.success,
                marginBottom: 8,
              }}
            />
            <Paragraph
              style={{
                margin: 0,
                color: colors.brownBramble,
                fontSize: 14,
              }}
            >
              {data.summary}
            </Paragraph>
          </div>
        )}

        {/* Concerns State - Prioritized List */}
        {!data.all_good && sortedInsights.length > 0 && (
          <>
            {/* Summary text if provided */}
            {data.summary && (
              <Paragraph
                type="secondary"
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                {data.summary}
              </Paragraph>
            )}

            {/* Insights list */}
            <List
              size="small"
              dataSource={sortedInsights}
              renderItem={(insight) => {
                const config = severityConfig[insight.severity];
                const isClickable = !!insight.hive_id;
                const insightLabel = insight.hive_name
                  ? `${insight.hive_name}: ${insight.message}. ${insight.suggested_action || ''}`
                  : `${insight.message}. ${insight.suggested_action || ''}`;

                return (
                  <List.Item
                    style={{
                      padding: `${spacing.sm}px 0`,
                      cursor: isClickable ? 'pointer' : 'default',
                      borderRadius: spacing.xs,
                    }}
                    onClick={() => isClickable && handleInsightClick(insight)}
                    onKeyDown={(e) => isClickable && handleInsightKeyDown(e, insight)}
                    tabIndex={isClickable ? 0 : undefined}
                    role={isClickable ? 'button' : undefined}
                    aria-label={isClickable ? `View details for ${insightLabel}` : undefined}
                  >
                    <Space align="start" style={{ width: '100%' }}>
                      <span style={{ color: config.color, fontSize: spacing.md }}>
                        {config.icon}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: 2 }}>
                          {insight.hive_name && (
                            <Text
                              strong
                              style={{
                                color: isClickable ? colors.seaBuckthorn : colors.brownBramble,
                                marginRight: spacing.sm,
                              }}
                            >
                              {insight.hive_name}:
                            </Text>
                          )}
                          <Text style={{ color: colors.brownBramble }}>
                            {insight.message}
                          </Text>
                        </div>
                        {insight.suggested_action && (
                          <Text
                            type="secondary"
                            style={{ fontSize: spacing.sm + spacing.xs, display: 'block' }}
                          >
                            {insight.suggested_action}
                          </Text>
                        )}
                      </div>
                      <Tag color={config.tagColor} style={{ marginLeft: 'auto' }}>
                        {insight.severity === 'action-needed' ? 'Action' : insight.severity}
                      </Tag>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </>
        )}

        {/* Stale data indicator */}
        {error && data && (
          <div style={{ marginTop: 4 }}>
            <Text type="warning" style={{ fontSize: 11 }}>
              Showing cached data
              <Button
                type="link"
                size="small"
                onClick={refresh}
                disabled={refreshing}
                style={{ padding: '0 4px', fontSize: 11 }}
              >
                Refresh
              </Button>
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );
}
