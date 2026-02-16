/**
 * ActivityClockCard Component
 *
 * Displays a 24-hour polar/radar chart showing hourly detection patterns.
 * The chart shape resembles a clock with spokes for each hour.
 * Bulging spokes indicate higher activity during those hours.
 *
 * Part of Epic 3, Story 3.5: Activity Clock Visualization
 */
import { Card, Typography, Space, Empty } from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { Radar } from '@ant-design/charts';
import { useDetectionStats } from '../hooks/useDetectionStats';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface ActivityClockCardProps {
  siteId: string | null;
}

/**
 * Format hour number to display string.
 * Shows only cardinal hours (00, 06, 12, 18) for cleaner display.
 */
function formatHourLabel(hour: number): string {
  const hourStr = hour.toString().padStart(2, '0');
  return `${hourStr}:00`;
}

/**
 * Check if hour should display a label (cardinal positions only).
 * Used by the xAxis label formatter in the Radar chart configuration
 * to show labels only at 00:00, 06:00, 12:00, and 18:00.
 */
function isCardinalHour(hour: number): boolean {
  return [0, 6, 12, 18].includes(hour);
}

/**
 * Calculate percentage of total detections.
 */
function getPercentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

/**
 * Get title based on time range.
 * Longer ranges show "Average" since they aggregate multiple days.
 */
function getTitle(range: TimeRange): string {
  const isLongRange = ['season', 'year', 'all'].includes(range);
  return isLongRange ? 'Average Hourly Activity' : 'Hourly Activity';
}

/**
 * Transform hourly breakdown data for the Radar chart.
 */
function transformData(hourlyBreakdown: number[]) {
  return hourlyBreakdown.map((count, hour) => ({
    hour: formatHourLabel(hour),
    hourIndex: hour, // Used by tooltip formatter
    count,
  }));
}

/**
 * Static animation config - extracted to avoid recreation on every render.
 * Uses 'as const' to ensure type literal preservation for the chart library.
 */
const CHART_ANIMATION = {
  appear: {
    animation: 'wave-in' as const,
    duration: 800,
  },
};

/**
 * ActivityClockCard
 *
 * Renders a polar/radar chart showing detection patterns by hour.
 * Uses TimeRangeContext to sync with the time range selector.
 */
export function ActivityClockCard({ siteId }: ActivityClockCardProps) {
  const { range, date } = useTimeRange();
  const { stats, loading, error } = useDetectionStats(siteId, range, date);

  const title = getTitle(range);
  const totalDetections = stats?.total_detections ?? 0;
  const hourlyBreakdown = stats?.hourly_breakdown ?? Array(24).fill(0);

  // No site selected state
  if (!siteId) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
          minHeight: 320,
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
          <ClockCircleOutlined style={{ fontSize: 32, color: colors.brownBramble, opacity: 0.5 }} />
          <Text type="secondary">Select a site to view activity patterns</Text>
        </Space>
      </Card>
    );
  }

  // Loading state
  if (loading && !stats) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
          minHeight: 320,
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <ClockCircleOutlined spin style={{ fontSize: 32, color: colors.seaBuckthorn }} />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Loading activity data...</Text>
          </div>
        </div>
      </Card>
    );
  }

  // Error state - API failure
  if (error && !stats) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
          minHeight: 320,
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
          <WarningOutlined style={{ fontSize: 32, color: colors.brownBramble }} />
          <Text type="danger">Failed to load activity data</Text>
        </Space>
      </Card>
    );
  }

  // Empty state - no detections
  if (totalDetections === 0) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
          minHeight: 320,
        }}
        styles={{
          body: {
            padding: 24,
          },
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ color: colors.brownBramble, fontSize: 18 }}>
            {title}
          </Text>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary">No activity recorded for this period</Text>
          }
          style={{ padding: '20px 0' }}
        />
      </Card>
    );
  }

  // Chart configuration — @ant-design/charts v2 API (G2 5.0)
  const chartData = transformData(hourlyBreakdown);

  const config = {
    data: chartData,
    xField: 'hour',
    yField: 'count',
    axis: {
      x: {
        line: false,
        tick: false,
        labelFormatter: (text: string) => {
          const hour = parseInt(text);
          return isCardinalHour(hour) ? text : '';
        },
        labelFill: colors.brownBramble,
        labelFontSize: 10,
        grid: true,
      },
      y: {
        label: false,
        line: false,
        tick: false,
        grid: true,
        gridStroke: colors.seaBuckthorn,
        gridStrokeOpacity: 0.2,
      },
    },
    area: {
      style: {
        fillOpacity: 0.4,
      },
    },
    point: {
      size: 3,
      shape: 'circle',
      style: {
        fill: colors.seaBuckthorn,
        stroke: colors.seaBuckthorn,
        lineWidth: 1,
      },
    },
    style: {
      lineWidth: 2,
    },
    color: colors.seaBuckthorn,
    tooltip: {
      items: [
        (d: { hour: string; hourIndex: number; count: number }) => {
          const nextHourNum = (d.hourIndex + 1) % 24;
          const nextHour = nextHourNum.toString().padStart(2, '0');
          const percentage = getPercentage(d.count, totalDetections);
          return {
            name: `${d.hour} - ${nextHour}:59`,
            value: `${d.count} detection${d.count !== 1 ? 's' : ''} (${percentage}%)`,
          };
        },
      ],
    },
    animation: CHART_ANIMATION,
  };

  return (
    <Card
      style={{
        background: '#ffffff',
        borderColor: '#ece8d6',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
      }}
      styles={{
        body: {
          padding: '16px 12px',
          overflow: 'hidden',
        },
      }}
    >
      <div style={{ marginBottom: 4 }}>
        <Space>
          <ClockCircleOutlined style={{ color: colors.seaBuckthorn }} />
          <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
            {title}
          </Text>
        </Space>
      </div>
      <div
        style={{ height: 280, overflow: 'hidden' }}
        role="img"
        aria-label={`Hourly activity chart showing ${totalDetections} total detections across 24 hours`}
      >
        <Radar {...config} autoFit />
      </div>
      <div style={{ textAlign: 'center', marginTop: 2 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {totalDetections} total detection{totalDetections !== 1 ? 's' : ''}
        </Text>
      </div>
    </Card>
  );
}

export default ActivityClockCard;
