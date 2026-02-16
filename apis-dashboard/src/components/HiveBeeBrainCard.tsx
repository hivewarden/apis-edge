/**
 * HiveBeeBrainCard Component
 *
 * Displays BeeBrain AI analysis for a specific hive with expandable insights,
 * dismiss functionality, and navigation to suggested actions.
 *
 * Part of Epic 8, Story 8.3: Hive Detail BeeBrain Analysis
 */
import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Skeleton,
  List,
  Tag,
  Divider,
  Tooltip,
  message,
} from 'antd';
import {
  ReloadOutlined,
  BulbOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  DownOutlined,
  UpOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useHiveBeeBrain, type Insight } from '../hooks/useHiveBeeBrain';
import { colors, spacing } from '../theme/apisTheme';

// Extend dayjs with relativeTime plugin for consistent time formatting
dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

/**
 * Props for HiveBeeBrainCard component.
 */
export interface HiveBeeBrainCardProps {
  /** The hive ID to display BeeBrain analysis for */
  hiveId: string;
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
    label: 'Action Needed',
  },
  'warning': {
    icon: <WarningOutlined />,
    color: colors.warning,
    tagColor: 'orange',
    priority: 2,
    label: 'Warning',
  },
  'info': {
    icon: <InfoCircleOutlined />,
    color: colors.info,
    tagColor: 'blue',
    priority: 3,
    label: 'Info',
  },
} as const;

/**
 * Map rule_id to navigation path and action label.
 */
const actionMapping: Record<string, { path: (hiveId: string) => string; label: string }> = {
  'queen_aging': { path: (id) => `/hives/${id}`, label: 'View Queen Info' },
  'treatment_due': { path: (id) => `/hives/${id}`, label: 'Log Treatment' },
  'inspection_overdue': { path: (id) => `/hives/${id}/inspections/new`, label: 'New Inspection' },
  'hornet_activity_spike': { path: () => `/clips`, label: 'View Clips' },
};

/**
 * Map rule_id to contextual "why it matters" explanations.
 */
const whyItMatters: Record<string, string> = {
  'queen_aging': 'An aging queen with declining productivity may lead to reduced colony strength, poor brood patterns, and lower honey yields. Early detection allows you to plan for requeening.',
  'treatment_due': 'Varroa mites can rapidly increase and cause significant damage to your colony if left untreated. Regular treatments help maintain colony health.',
  'inspection_overdue': 'Regular inspections help you catch problems early, assess colony strength, and make timely management decisions.',
  'hornet_activity_spike': 'Increased hornet activity may indicate a nest nearby or changing conditions. Monitoring helps protect your hives.',
};

/**
 * Human-readable labels for data point keys.
 */
const keyLabels: Record<string, string> = {
  days_since_treatment: 'Days since treatment',
  last_treatment_date: 'Last treatment date',
  last_treatment_type: 'Last treatment type',
  days_since_inspection: 'Days since inspection',
  last_inspection_date: 'Last inspection date',
  queen_age_years: 'Queen age (years)',
  productivity_drop_percent: 'Productivity drop',
  count_24h: 'Detections in 24h',
  avg_daily: 'Average daily detections',
  multiplier: 'Activity multiplier',
};

/**
 * Format a data point value for display.
 */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (key.includes('date')) return dayjs(value as string).format('MMM D, YYYY');
  if (key.includes('percent')) return `${value}%`;
  if (key.includes('multiplier')) return `${(value as number).toFixed(1)}x`;
  return String(value);
}

/**
 * Format data points as human-readable key-value pairs.
 */
function formatDataPoints(dataPoints: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(dataPoints).map(([key, value]) => ({
    label: keyLabels[key] || key.replace(/_/g, ' '),
    value: formatValue(key, value),
  }));
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
 * HiveBeeBrainCard Component
 *
 * Displays the BeeBrain AI analysis card for a specific hive.
 * Shows health assessment, expandable insights, and recommendations.
 */
export function HiveBeeBrainCard({ hiveId }: HiveBeeBrainCardProps) {
  const navigate = useNavigate();
  const { data, loading, refreshing, error, timedOut, refresh, dismissInsight } = useHiveBeeBrain(hiveId);
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Refs for focus management after dismiss
  const insightRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const healthSectionRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup focus timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Toggle expanded state for an insight.
   */
  const toggleExpanded = (insightId: string) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      if (next.has(insightId)) {
        next.delete(insightId);
      } else {
        next.add(insightId);
      }
      return next;
    });
  };

  /**
   * Handle keyboard interaction on toggle button for accessibility.
   */
  const handleToggleKeyDown = (event: KeyboardEvent<HTMLSpanElement>, insightId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded(insightId);
    }
  };

  /**
   * Set ref for an insight element for focus management.
   */
  const setInsightRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      insightRefs.current.set(id, el);
    } else {
      insightRefs.current.delete(id);
    }
  }, []);

  /**
   * Handle dismiss with loading state and focus management.
   * After dismiss, focus moves to the next insight or the health section.
   */
  const handleDismiss = async (insightId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent toggle

    // Get sorted insights and find current index for focus management
    const sortedInsights = data ? sortInsightsBySeverity(data.insights) : [];
    const currentIndex = sortedInsights.findIndex((i) => i.id === insightId);
    const nextInsight = sortedInsights[currentIndex + 1];

    setDismissingId(insightId);
    try {
      await dismissInsight(insightId);
      message.success('Insight dismissed');

      // Move focus to next insight or health section
      // Clear any existing focus timeout first
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = setTimeout(() => {
        if (nextInsight) {
          const nextRef = insightRefs.current.get(nextInsight.id);
          if (nextRef) {
            nextRef.focus();
            return;
          }
        }
        // No next insight - focus health section
        healthSectionRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error('Failed to dismiss insight:', err);
      message.error('Failed to dismiss insight. Please try again.');
    } finally {
      setDismissingId(null);
    }
  };

  /**
   * Handle keyboard interaction on dismiss button for accessibility.
   */
  const handleDismissKeyDown = (event: KeyboardEvent<HTMLElement>, insightId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      handleDismiss(insightId, event as unknown as React.MouseEvent);
    }
  };

  /**
   * Handle navigation to suggested action.
   */
  const handleActionClick = (ruleId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent toggle
    const mapping = actionMapping[ruleId];
    if (mapping) {
      navigate(mapping.path(hiveId));
    }
  };

  /**
   * Handle keyboard interaction on action button for accessibility.
   */
  const handleActionKeyDown = (event: KeyboardEvent<HTMLElement>, ruleId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      const mapping = actionMapping[ruleId];
      if (mapping) {
        navigate(mapping.path(hiveId));
      }
    }
  };

  // Card styling consistent with BeeBrainCard
  const cardStyle = {
    background: `linear-gradient(135deg, ${colors.salomie} 0%, #f0e6ff 100%)`,
    borderColor: colors.seaBuckthorn,
    borderWidth: 2,
  };

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
          {/* Health assessment skeleton */}
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
          {/* Insight placeholders */}
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
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
              aria-label="Retry loading analysis"
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

  // Error state (only if we have no data at all)
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
              aria-label="Retry loading analysis"
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
  const hasInsights = sortedInsights.length > 0;

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
            <Tooltip title={`Last updated: ${dayjs(data.last_analysis).fromNow()}`}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(data.last_analysis).fromNow()}
              </Text>
            </Tooltip>
            <Tooltip title="Refresh analysis">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined spin={refreshing} />}
                onClick={refresh}
                disabled={refreshing}
                style={{ color: colors.brownBramble }}
                aria-label="Refresh analysis"
              />
            </Tooltip>
          </Space>
        </div>

        {/* Health Assessment Section */}
        <div
          ref={healthSectionRef}
          tabIndex={-1}
          style={{
            padding: spacing.md,
            background: hasInsights ? 'rgba(102, 38, 4, 0.04)' : 'rgba(46, 125, 50, 0.08)',
            borderRadius: spacing.sm,
            outline: 'none',
          }}
        >
          <Space align="start">
            {hasInsights ? (
              <InfoCircleOutlined style={{ color: colors.seaBuckthorn, fontSize: 18, marginTop: 2 }} />
            ) : (
              <CheckCircleOutlined style={{ color: colors.success, fontSize: 18, marginTop: 2 }} />
            )}
            <Paragraph
              style={{
                margin: 0,
                color: colors.brownBramble,
                fontSize: 14,
              }}
            >
              {data.health_assessment}
            </Paragraph>
          </Space>
        </div>

        {/* Insights List */}
        {hasInsights && (
          <List
            size="small"
            dataSource={sortedInsights}
            renderItem={(insight) => {
              const config = severityConfig[insight.severity];
              const isExpanded = expandedInsights.has(insight.id);
              const isDismissing = dismissingId === insight.id;
              const formattedDataPoints = formatDataPoints(insight.data_points);
              const whyText = whyItMatters[insight.rule_id] || insight.message;
              const actionConfig = actionMapping[insight.rule_id];

              return (
                <List.Item
                  style={{
                    padding: `${spacing.sm}px 0`,
                    display: 'block',
                    borderRadius: spacing.xs,
                  }}
                >
                  {/* Insight Header */}
                  <div
                    ref={(el) => setInsightRef(insight.id, el)}
                    tabIndex={-1}
                    style={{ display: 'flex', alignItems: 'flex-start', width: '100%', outline: 'none' }}
                  >
                    <span style={{ color: config.color, fontSize: spacing.md, marginRight: spacing.sm, marginTop: 2 }}>
                      {config.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4 }}>
                        <Tag
                          color={config.tagColor}
                          style={{ marginRight: 8 }}
                          aria-label={`Severity: ${config.label}`}
                        >
                          {insight.severity === 'action-needed' ? 'Action' : insight.severity}
                        </Tag>
                        <Text style={{ color: colors.brownBramble }}>
                          {insight.message}
                        </Text>
                      </div>
                      {/* Toggle and Dismiss buttons */}
                      <Space size={spacing.sm}>
                        <span
                          tabIndex={0}
                          role="button"
                          onClick={() => toggleExpanded(insight.id)}
                          onKeyDown={(e) => handleToggleKeyDown(e, insight.id)}
                          style={{
                            color: colors.seaBuckthorn,
                            cursor: 'pointer',
                            fontSize: 13,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          aria-expanded={isExpanded}
                          aria-controls={`insight-details-${insight.id}`}
                          aria-label={isExpanded ? 'Show less details' : 'Tell me more about this insight'}
                        >
                          {isExpanded ? (
                            <>
                              Less <UpOutlined style={{ fontSize: 10 }} />
                            </>
                          ) : (
                            <>
                              Tell me more <DownOutlined style={{ fontSize: 10 }} />
                            </>
                          )}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined />}
                          loading={isDismissing}
                          onClick={(e) => handleDismiss(insight.id, e)}
                          onKeyDown={(e) => handleDismissKeyDown(e, insight.id)}
                          style={{ color: colors.textMuted, fontSize: 12 }}
                          aria-label={`Dismiss insight: ${insight.message}`}
                        >
                          Dismiss
                        </Button>
                      </Space>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div
                      id={`insight-details-${insight.id}`}
                      style={{
                        marginTop: spacing.sm,
                        marginLeft: spacing.xl, // Aligns with insight text after icon
                        padding: spacing.md,
                        background: 'rgba(102, 38, 4, 0.03)',
                        borderRadius: spacing.sm,
                        borderLeft: `3px solid ${config.color}`,
                      }}
                    >
                      {/* Data Points */}
                      {formattedDataPoints.length > 0 && (
                        <>
                          <Text strong style={{ color: colors.brownBramble, fontSize: 13 }}>
                            What triggered this:
                          </Text>
                          <ul style={{ margin: `${spacing.sm}px 0 ${spacing.md}px 0`, paddingLeft: spacing.lg }}>
                            {formattedDataPoints.map(({ label, value }) => (
                              <li key={label} style={{ color: colors.brownBramble, fontSize: 13 }}>
                                <Text type="secondary">{label}:</Text> {value}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      <Divider style={{ margin: `${spacing.sm}px 0` }} />

                      {/* Why it Matters */}
                      <Text strong style={{ color: colors.brownBramble, fontSize: 13 }}>
                        Why this matters:
                      </Text>
                      <Paragraph
                        style={{
                          margin: `${spacing.sm}px 0 ${spacing.md}px 0`,
                          color: colors.brownBramble,
                          fontSize: 13,
                        }}
                      >
                        {whyText}
                      </Paragraph>

                      <Divider style={{ margin: `${spacing.sm}px 0` }} />

                      {/* Suggested Action */}
                      <Text strong style={{ color: colors.brownBramble, fontSize: 13 }}>
                        Suggested next step:
                      </Text>
                      <Paragraph
                        style={{
                          margin: `${spacing.sm}px 0`,
                          color: colors.brownBramble,
                          fontSize: 13,
                        }}
                      >
                        {insight.suggested_action}
                      </Paragraph>
                      {actionConfig && (
                        <Button
                          type="primary"
                          size="small"
                          onClick={(e) => handleActionClick(insight.rule_id, e)}
                          onKeyDown={(e) => handleActionKeyDown(e, insight.rule_id)}
                          aria-label={`${actionConfig.label} for this hive`}
                        >
                          {actionConfig.label} &rarr;
                        </Button>
                      )}
                    </div>
                  )}
                </List.Item>
              );
            }}
          />
        )}

        {/* Recommendations (shown when no insights or alongside insights) */}
        {data.recommendations.length > 0 && (
          <div style={{ marginTop: hasInsights ? spacing.md : 0 }}>
            {hasInsights && (
              <Divider style={{ margin: `${spacing.sm}px 0` }} />
            )}
            <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
              Recommendations:
            </Text>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              {data.recommendations.map((rec, idx) => (
                <li key={idx} style={{ color: colors.brownBramble, fontSize: 13, marginBottom: 4 }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
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

export default HiveBeeBrainCard;
