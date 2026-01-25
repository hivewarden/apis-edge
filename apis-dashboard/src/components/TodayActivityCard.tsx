import { Card, Typography, Skeleton, Space } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, AimOutlined } from '@ant-design/icons';
import { useDetectionStats } from '../hooks/useDetectionStats';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

const { Title, Text, Paragraph } = Typography;

interface TodayActivityCardProps {
  siteId: string | null;
}

/**
 * Get display label for the selected time range.
 */
function getRangeLabel(range: TimeRange): string {
  switch (range) {
    case 'day':
      return "Today's";
    case 'week':
      return "This Week's";
    case 'month':
      return "This Month's";
    case 'season':
      return "This Season's";
    case 'year':
      return "This Year's";
    case 'all':
      return 'All-Time';
    default:
      return "Today's";
  }
}

/**
 * Get quiet message for the selected time range.
 */
function getQuietMessage(range: TimeRange): string {
  switch (range) {
    case 'day':
      return 'No hornets detected today';
    case 'week':
      return 'No hornets detected this week';
    case 'month':
      return 'No hornets detected this month';
    case 'season':
      return 'No hornets detected this season';
    case 'year':
      return 'No hornets detected this year';
    case 'all':
      return 'No hornets detected';
    default:
      return 'No hornets detected';
  }
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  return then.toLocaleDateString();
}

/**
 * TodayActivityCard Component
 *
 * Displays hornet detection statistics for the selected time range.
 * Uses TimeRangeContext to sync with time range selector.
 * Shows detection count, last detection time, and laser activation stats.
 *
 * Part of Epic 3, Story 3.2 (base) and Story 3.4 (time range support)
 */
export function TodayActivityCard({ siteId }: TodayActivityCardProps) {
  // Get time range from context (component must be within TimeRangeProvider)
  const { range, date } = useTimeRange();
  const { stats, loading, error } = useDetectionStats(siteId, range, date);
  const rangeLabel = getRangeLabel(range);

  // No site selected state
  if (!siteId) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Text type="secondary">Select a site to view activity</Text>
      </Card>
    );
  }

  // Loading state with skeleton
  if (loading && !stats) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Error state (but only if we have no stats at all)
  if (error && !stats) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
        }}
      >
        <Text type="danger">Failed to load detection data</Text>
      </Card>
    );
  }

  const hasDetections = stats && stats.total_detections > 0;

  // Zero detections - "All quiet" state
  if (!hasDetections) {
    return (
      <Card
        style={{
          background: `linear-gradient(135deg, ${colors.salomie} 0%, #e8f5e9 100%)`,
          borderColor: '#52c41a',
          borderWidth: 2,
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleFilled style={{ fontSize: 24, color: '#52c41a' }} />
            <Title level={4} style={{ margin: 0, color: '#52c41a' }}>
              All quiet
            </Title>
          </div>
          <Paragraph style={{ margin: 0, color: colors.brownBramble }}>
            {getQuietMessage(range)} — your hives are protected
          </Paragraph>
        </Space>
      </Card>
    );
  }

  // Detections found - show stats
  const laserRate = stats.total_detections > 0
    ? Math.round((stats.laser_activations / stats.total_detections) * 100)
    : 0;

  return (
    <Card
      style={{
        background: `linear-gradient(135deg, ${colors.salomie} 0%, ${colors.seaBuckthorn}20 100%)`,
        borderColor: colors.seaBuckthorn,
        borderWidth: 2,
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header */}
        <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
          {rangeLabel} Activity
        </Text>

        {/* Large count */}
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Title
            level={1}
            style={{
              margin: 0,
              fontSize: 56,
              color: colors.seaBuckthorn,
              lineHeight: 1,
            }}
          >
            {stats.total_detections}
          </Title>
          <Text style={{ color: colors.brownBramble, fontSize: 16 }}>
            hornet{stats.total_detections !== 1 ? 's' : ''} deterred
          </Text>
        </div>

        {/* Stats footer */}
        <div
          style={{
            borderTop: `1px solid ${colors.seaBuckthorn}40`,
            paddingTop: 12,
            marginTop: 4,
          }}
        >
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {/* Last detection time */}
            {stats.last_detection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClockCircleOutlined style={{ color: colors.brownBramble }} />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Last detection: {formatRelativeTime(stats.last_detection)}
                </Text>
              </div>
            )}

            {/* Laser activation stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AimOutlined style={{ color: colors.brownBramble }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {stats.laser_activations} of {stats.total_detections} deterred with laser ({laserRate}%)
              </Text>
            </div>
          </Space>
        </div>
      </Space>
    </Card>
  );
}

export default TodayActivityCard;
