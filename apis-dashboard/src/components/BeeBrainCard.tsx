/**
 * BeeBrainCard Component
 *
 * Displays BeeBrain AI analysis summary and insights on the dashboard.
 * Shows health status, warnings, and actionable insights for the beekeeper.
 *
 * Part of Epic 8, Story 8.2: Dashboard BeeBrain Card
 */
import { Card, Typography, Button, Space, Skeleton, Tooltip, Row, Col } from 'antd';
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
import { colors } from '../theme/apisTheme';

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
  const handleInsightKeyDown = (event: KeyboardEvent<HTMLElement>, insight: Insight) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleInsightClick(insight);
    }
  };

  // Card styling - white bg, subtle warm shadow
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: `1px solid #f3efe8`,
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
    height: '100%',
    overflow: 'hidden',
  };

  // No site selected state
  if (!siteId) {
    return (
      <Card style={cardStyle}>
        <Space direction="vertical" size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
            <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
              BeeBrain Alerts
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
              BeeBrain Alerts
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
                BeeBrain Alerts
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
                BeeBrain Alerts
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
  const sortedInsights = sortInsightsBySeverity(data.insights || []);

  return (
    <Card style={cardStyle}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header with icon container, title, and refresh - per mockup */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Circular icon container */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
                border: '1px solid rgba(102, 38, 4, 0.1)',
              }}
            >
              <BulbOutlined style={{ fontSize: 24, color: colors.brownBramble }} />
            </div>
            <div>
              <Text strong style={{ color: colors.brownBramble, fontSize: 18, display: 'block', lineHeight: 1.2 }}>
                BeeBrain Alerts
              </Text>
            </div>
          </div>
          {/* Time and refresh */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Tooltip title={`Last updated: ${formatLastUpdated(data.last_analysis)}`}>
              <Text
                type="secondary"
                style={{
                  fontSize: 11,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  padding: '4px 8px',
                  borderRadius: 9999,
                  border: '1px solid rgba(102, 38, 4, 0.1)',
                }}
              >
                {formatLastUpdated(data.last_analysis)}
              </Text>
            </Tooltip>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={refresh}
              disabled={refreshing}
              style={{ color: colors.brownBramble, fontSize: 11, fontWeight: 700, marginTop: 4, padding: '0 4px' }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary text - per mockup styling */}
        {data.summary && (
          <div style={{ marginBottom: 24 }}>
            <Paragraph
              style={{
                margin: 0,
                color: colors.brownBramble,
                fontSize: 17,
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              {data.summary}
            </Paragraph>
          </div>
        )}

        {/* All Good State - no warning items to show */}
        {data.all_good && (
          <div
            style={{
              padding: 16,
              backgroundColor: '#ffffff',
              borderRadius: 12,
              borderLeft: `4px solid ${colors.success}`,
              boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: 'rgba(46, 125, 50, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircleOutlined style={{ fontSize: 20, color: colors.success }} />
            </div>
            <Text style={{ color: colors.brownBramble, fontSize: 14, fontWeight: 500 }}>
              All hives are healthy
            </Text>
          </div>
        )}

        {/* Concerns State - Card Grid (top 9) */}
        {!data.all_good && sortedInsights.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ fontSize: 13, color: '#8c7e72', display: 'block', marginBottom: 12 }}>
              Top {Math.min(sortedInsights.length, 9)} insights
            </Text>
            <Row gutter={[12, 12]}>
              {sortedInsights.slice(0, 9).map((insight) => {
                const config = severityConfig[insight.severity];
                const isClickable = !!insight.hive_id;

                return (
                  <Col xs={24} sm={12} md={8} key={insight.message + insight.hive_id}>
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: 12,
                        padding: 16,
                        borderLeft: `4px solid ${config.color}`,
                        boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
                        cursor: isClickable ? 'pointer' : 'default',
                        transition: 'all 0.3s ease',
                        height: '100%',
                      }}
                      onMouseEnter={(e) => {
                        if (isClickable) {
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(247, 162, 43, 0.15)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          const iconEl = e.currentTarget.querySelector('[data-insight-icon]') as HTMLElement;
                          if (iconEl) {
                            iconEl.style.backgroundColor = String(config.color);
                            iconEl.style.color = '#ffffff';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(102, 38, 4, 0.08)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        const iconEl = e.currentTarget.querySelector('[data-insight-icon]') as HTMLElement;
                        if (iconEl) {
                          iconEl.style.backgroundColor = colors.coconutCream;
                          iconEl.style.color = String(config.color);
                        }
                      }}
                      onClick={() => isClickable && handleInsightClick(insight)}
                      onKeyDown={(e) => isClickable && handleInsightKeyDown(e, insight)}
                      tabIndex={isClickable ? 0 : undefined}
                      role={isClickable ? 'button' : undefined}
                    >
                      {/* Icon */}
                      <div
                        data-insight-icon
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: colors.coconutCream,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: config.color,
                          marginBottom: 10,
                          transition: 'all 0.3s ease',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{config.icon}</span>
                      </div>
                      {/* Hive name */}
                      {insight.hive_name && (
                        <Text strong style={{ display: 'block', fontSize: 13, color: colors.brownBramble, marginBottom: 2 }}>
                          {insight.hive_name}
                        </Text>
                      )}
                      {/* Message */}
                      <Paragraph
                        style={{ fontSize: 12, color: '#8c7e72', marginBottom: 0, lineHeight: 1.4 }}
                        ellipsis={{ rows: 2 }}
                      >
                        {insight.message}
                      </Paragraph>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>
        )}

        {/* View all insights link - per mockup */}
        <div
          style={{
            borderTop: '1px solid rgba(102, 38, 4, 0.1)',
            paddingTop: 16,
            marginTop: 'auto',
          }}
        >
          <a
            onClick={() => navigate('/maintenance')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: colors.brownBramble,
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            View all insights
            <span style={{ transition: 'transform 0.2s' }}>→</span>
          </a>
        </div>

        {/* Stale data indicator */}
        {error && data && (
          <div style={{ marginTop: 8 }}>
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
