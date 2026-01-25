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
import { ClockCircleOutlined } from '@ant-design/icons';
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
  const { stats, loading } = useDetectionStats(siteId, range, date);

  const title = getTitle(range);
  const totalDetections = stats?.total_detections ?? 0;
  const hourlyBreakdown = stats?.hourly_breakdown ?? Array(24).fill(0);

  // No site selected state
  if (!siteId) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
          height: '100%',
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
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
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
          height: '100%',
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

  // Empty state - no detections
  if (totalDetections === 0) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
          height: '100%',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
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

  // Chart configuration
  const chartData = transformData(hourlyBreakdown);

  const config = {
    data: chartData,
    xField: 'hour',
    yField: 'count',
    meta: {
      count: {
        alias: 'Detections',
        min: 0,
      },
    },
    xAxis: {
      line: null,
      tickLine: null,
      label: {
        formatter: (text: string) => {
          const hour = parseInt(text);
          return isCardinalHour(hour) ? text : '';
        },
        style: {
          fill: colors.brownBramble,
          fontSize: 11,
        },
      },
    },
    yAxis: {
      line: null,
      tickLine: null,
      grid: {
        line: {
          type: 'line',
          style: {
            stroke: colors.seaBuckthorn,
            strokeOpacity: 0.3,
          },
        },
      },
      label: null, // Hide y-axis labels for cleaner look
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
    lineStyle: {
      lineWidth: 2,
    },
    color: colors.seaBuckthorn,
    tooltip: {
      formatter: (datum: { hour: string; hourIndex: number; count: number }) => {
        const nextHourNum = (datum.hourIndex + 1) % 24;
        const nextHour = nextHourNum.toString().padStart(2, '0');
        const percentage = getPercentage(datum.count, totalDetections);
        return {
          name: `${datum.hour} - ${nextHour}:59`,
          value: `${datum.count} detection${datum.count !== 1 ? 's' : ''} (${percentage}%)`,
        };
      },
    },
    animation: CHART_ANIMATION,
  };

  return (
    <Card
      style={{
        background: colors.salomie,
        borderColor: colors.seaBuckthorn,
        height: '100%',
      }}
      styles={{
        body: {
          padding: '16px',
        },
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Space>
          <ClockCircleOutlined style={{ color: colors.seaBuckthorn }} />
          <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
            {title}
          </Text>
        </Space>
      </div>
      <div
        style={{ height: 220 }}
        role="img"
        aria-label={`Hourly activity chart showing ${totalDetections} total detections across 24 hours`}
      >
        <Radar {...config} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {totalDetections} total detection{totalDetections !== 1 ? 's' : ''}
        </Text>
      </div>
    </Card>
  );
}

export default ActivityClockCard;
