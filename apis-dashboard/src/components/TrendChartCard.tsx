/**
 * TrendChartCard Component
 *
 * Displays a line/area chart showing detection trends over time.
 * Aggregation depends on time range:
 * - day: hourly
 * - week/month: daily
 * - season/year/all: weekly
 *
 * Part of Epic 3, Story 3.7: Daily/Weekly Trend Line Chart
 */
import { Card, Typography, Space, Empty } from 'antd';
import { AreaChartOutlined } from '@ant-design/icons';
import { Area } from '@ant-design/charts';
import { useTrendData } from '../hooks/useTrendData';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface TrendChartCardProps {
  siteId: string | null;
}

/**
 * Get title based on time range.
 */
function getTitle(range: TimeRange): string {
  switch (range) {
    case 'day':
      return 'Hourly Activity';
    case 'week':
      return 'Weekly Trend';
    case 'month':
      return 'Monthly Trend';
    case 'season':
      return 'Season Trend';
    case 'year':
      return 'Yearly Trend';
    case 'all':
      return 'All-Time Trend';
    default:
      return 'Detection Trend';
  }
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
 * TrendChartCard
 *
 * Renders an area chart showing detection trends over time.
 * Uses TimeRangeContext to sync with the time range selector.
 */
export function TrendChartCard({ siteId }: TrendChartCardProps) {
  const { range, date } = useTimeRange();
  const { points, totalDetections, loading, error } = useTrendData(siteId, range, date);

  const title = getTitle(range);

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
          <AreaChartOutlined style={{ fontSize: 32, color: colors.brownBramble, opacity: 0.5 }} />
          <Text type="secondary">Select a site to view trends</Text>
        </Space>
      </Card>
    );
  }

  // Loading state
  if (loading && points.length === 0) {
    return (
      <Card
        style={{
          background: colors.salomie,
          borderColor: colors.seaBuckthorn,
          height: '100%',
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <AreaChartOutlined spin style={{ fontSize: 32, color: colors.seaBuckthorn }} />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Loading trend data...</Text>
          </div>
        </div>
      </Card>
    );
  }

  // Error state
  if (error && points.length === 0) {
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
            <Text type="secondary">Failed to load trend data</Text>
          }
          style={{ padding: '20px 0' }}
        />
      </Card>
    );
  }

  // Empty state - no detections in range
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

  // Calculate max for y-axis (use points directly, no transform needed)
  const maxCount = Math.max(...points.map(d => d.count));

  const config = {
    data: points,
    xField: 'label',
    yField: 'count',
    smooth: true,
    areaStyle: {
      fill: `l(270) 0:rgba(247, 164, 45, 0) 1:rgba(247, 164, 45, 0.6)`,
    },
    line: {
      color: colors.seaBuckthorn,
      size: 2,
    },
    point: {
      size: 3,
      shape: 'circle',
      style: {
        fill: colors.seaBuckthorn,
        stroke: colors.salomie,
        lineWidth: 1,
      },
    },
    xAxis: {
      label: {
        autoRotate: false,
        autoHide: true,
        autoEllipsis: true,
        style: { fill: colors.brownBramble, fontSize: 10 },
      },
      line: null,
      tickLine: null,
    },
    yAxis: {
      min: 0,
      max: maxCount + Math.ceil(maxCount * 0.1), // 10% headroom
      label: {
        style: { fill: colors.brownBramble, fontSize: 10 },
      },
      grid: {
        line: {
          style: { stroke: colors.seaBuckthorn, strokeOpacity: 0.2 },
        },
      },
    },
    tooltip: {
      formatter: (datum: { label: string; count: number }) => ({
        name: datum.label,
        value: `${datum.count} detection${datum.count !== 1 ? 's' : ''}`,
      }),
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
          <AreaChartOutlined style={{ color: colors.seaBuckthorn }} />
          <Text strong style={{ color: colors.brownBramble, fontSize: 14 }}>
            {title}
          </Text>
        </Space>
      </div>
      <div
        style={{ height: 220 }}
        role="img"
        aria-label={`Trend chart showing ${totalDetections} total detections over ${points.length} periods`}
      >
        <Area {...config} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {totalDetections} total detection{totalDetections !== 1 ? 's' : ''}
        </Text>
      </div>
    </Card>
  );
}

export default TrendChartCard;
