import { Card, Typography, Skeleton } from 'antd';
import { useDetectionStats } from '../hooks/useDetectionStats';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

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

  // Card base styles per mockup: white bg, rounded-2xl, border-orange-100, shadow-soft
  const cardStyle = {
    background: '#ffffff',
    borderRadius: 16,
    border: '1px solid #ece8d6',
    boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
    transition: 'all 0.3s ease-in-out',
  };

  // No site selected state
  if (!siteId) {
    return (
      <Card style={cardStyle} styles={{ body: { padding: 20 } }}>
        <Text type="secondary">Select a site to view activity</Text>
      </Card>
    );
  }

  // Loading/Error state with skeleton
  if ((loading && !stats) || (error && !stats)) {
    return (
      <Card style={cardStyle} styles={{ body: { padding: 20 } }}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  const hasDetections = stats && stats.total_detections > 0;
  const laserRate = stats && stats.total_detections > 0
    ? Math.round((stats.laser_activations / stats.total_detections) * 100)
    : 0;

  return (
    <Card
      aria-label={`${rangeLabel} Activity: ${hasDetections ? stats.total_detections : 0} hornets deterred`}
      role="region"
      style={{
        ...cardStyle,
        opacity: loading ? 0.7 : 1,
      }}
      styles={{ body: { padding: 20 } }}
    >
      {/* Top row: icon + badge per mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          padding: 8,
          background: 'rgba(247, 164, 45, 0.1)',
          borderRadius: 12,
          color: colors.seaBuckthorn,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>pest_control</span>
        </div>
        {hasDetections && (
          <span style={{
            background: '#E8F5E9', // DESIGN-KEY success background
            color: '#2E7D32', // DESIGN-KEY success text
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 9999,
            fontWeight: 500,
          }}>
            Active
          </span>
        )}
      </div>

      {/* Bottom: Label + stats per mockup */}
      <div>
        <p style={{
          color: '#8a5025',
          fontSize: 14,
          fontWeight: 500,
          marginBottom: 4,
        }}>
          {rangeLabel} Activity
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 30,
            fontWeight: 700,
            color: colors.brownBramble,
            lineHeight: 1,
          }}>
            {hasDetections ? stats.total_detections : 0}
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#8a5025',
          }}>
            detections
          </span>
        </div>
        {hasDetections && (
          <>
            <div style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 500,
              color: colors.seaBuckthorn,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
              {laserRate}% Laser Success
            </div>
            {stats.last_detection && (
              <div style={{
                marginTop: 4,
                fontSize: 11,
                fontWeight: 500,
                color: '#8a5025',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
                Last: {formatRelativeTime(stats.last_detection)}
              </div>
            )}
          </>
        )}
        {!hasDetections && (
          <div style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: 500,
            color: colors.success,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
            {getQuietMessage(range)}
          </div>
        )}
      </div>
    </Card>
  );
}

export default TodayActivityCard;
