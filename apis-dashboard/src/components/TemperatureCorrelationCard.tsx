/**
 * TemperatureCorrelationCard Component
 *
 * Displays a scatter plot showing temperature vs detection count correlation.
 * For day range: shows hourly data points for that day.
 * For other ranges: shows daily data points.
 *
 * Part of Epic 3, Story 3.6: Temperature Correlation Chart
 */
import { Card, Typography, Space, Empty } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import { Scatter } from '@ant-design/charts';
import { useTemperatureCorrelation, CorrelationPoint } from '../hooks/useTemperatureCorrelation';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

// Chart height constant for consistent sizing across dashboard cards
const CHART_HEIGHT = 220;

interface TemperatureCorrelationCardProps {
  siteId: string | null;
}

/**
 * Format date string for display in tooltip.
 * Parses YYYY-MM-DD format and displays as "Jan 15" style.
 */
function formatDate(dateStr: string): string {
  // Parse YYYY-MM-DD explicitly to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format hour number for display in tooltip.
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

/**
 * Get title based on time range.
 */
function getTitle(range: TimeRange): string {
  if (range === 'day') {
    return 'Hourly Temperature vs Activity';
  }
  return 'Temperature Correlation';
}

/**
 * Transform correlation data for the Scatter chart.
 */
function transformData(points: CorrelationPoint[], isHourly: boolean) {
  return points.map((point) => ({
    temperature: Math.round(point.avg_temp * 10) / 10, // Round to 1 decimal
    detections: point.detection_count,
    label: isHourly && point.hour !== undefined
      ? formatHour(point.hour)
      : point.date
        ? formatDate(point.date)
        : '',
  }));
}

/**
 * TemperatureCorrelationCard
 *
 * Renders a scatter plot showing temperature vs detection correlation.
 * Uses TimeRangeContext to sync with the time range selector.
 */
export function TemperatureCorrelationCard({ siteId }: TemperatureCorrelationCardProps) {
  const { range, date } = useTimeRange();
  const { points, isHourly, loading, error } = useTemperatureCorrelation(siteId, range, date);

  const title = getTitle(range);

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
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <LineChartOutlined style={{ fontSize: 32, color: colors.brownBramble, opacity: 0.5 }} />
          <Text type="secondary">Select a site to view temperature correlation</Text>
        </Space>
      </Card>
    );
  }

  // Loading state
  if (loading && points.length === 0) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <LineChartOutlined spin style={{ fontSize: 32, color: colors.seaBuckthorn }} />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Loading correlation data...</Text>
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
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
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
            <Text type="secondary">Failed to load temperature data</Text>
          }
          style={{ padding: '20px 0' }}
        />
      </Card>
    );
  }

  // Empty state - no data with temperature
  if (points.length === 0) {
    return (
      <Card
        style={{
          background: '#ffffff',
          borderColor: '#ece8d6',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          height: '100%',
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
            <Text type="secondary">No temperature data recorded for this period</Text>
          }
          style={{ padding: '20px 0' }}
        />
      </Card>
    );
  }

  // Transform data for chart
  const chartData = transformData(points, isHourly);

  // Calculate temperature range for axis
  const temps = chartData.map(d => d.temperature);
  const minTemp = Math.floor(Math.min(...temps) - 2);
  const maxTemp = Math.ceil(Math.max(...temps) + 2);

  // Calculate detection range for axis
  const detections = chartData.map(d => d.detections);
  const maxDetections = Math.max(...detections);

  const config = {
    data: chartData,
    xField: 'temperature',
    yField: 'detections',
    color: colors.seaBuckthorn,
    shape: 'circle',
    size: 8,
    xAxis: {
      title: {
        text: 'Temperature (°C)',
        style: { fill: colors.brownBramble, fontSize: 11 },
      },
      min: minTemp,
      max: maxTemp,
      label: {
        style: { fill: colors.brownBramble, fontSize: 10 },
      },
      grid: {
        line: {
          style: { stroke: colors.seaBuckthorn, strokeOpacity: 0.2 },
        },
      },
    },
    yAxis: {
      title: {
        text: 'Detections',
        style: { fill: colors.brownBramble, fontSize: 11 },
      },
      min: 0,
      max: maxDetections + Math.ceil(maxDetections * 0.1), // 10% headroom
      label: {
        style: { fill: colors.brownBramble, fontSize: 10 },
      },
      grid: {
        line: {
          style: { stroke: colors.seaBuckthorn, strokeOpacity: 0.2 },
        },
      },
    },
    pointStyle: {
      fill: colors.seaBuckthorn,
      stroke: colors.brownBramble,
      strokeWidth: 1,
      fillOpacity: 0.7,
    },
    tooltip: {
      // AC3: Tooltip format "Oct 15: 22C, 14 detections"
      customContent: (_title: string, items: Array<{ data: { temperature: number; detections: number; label: string } }>) => {
        if (!items || items.length === 0) return '';
        const datum = items[0].data;
        const detectionText = datum.detections === 1 ? 'detection' : 'detections';
        return `<div style="padding: 8px 12px; font-size: 12px;">${datum.label}: ${datum.temperature}°C, ${datum.detections} ${detectionText}</div>`;
      },
    },
    // Optional regression line
    regressionLine: chartData.length >= 3 ? {
      type: 'linear' as const,
      style: {
        stroke: colors.brownBramble,
        strokeOpacity: 0.5,
        lineDash: [4, 4],
        lineWidth: 1,
      },
    } : undefined,
    legend: false,
  };

  return (
    <Card
      style={{
        background: '#ffffff',
        borderColor: '#ece8d6',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
        height: '100%',
      }}
      styles={{
        body: {
          padding: 24,
        },
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Space>
          <LineChartOutlined style={{ color: colors.seaBuckthorn }} />
          <Text strong style={{ color: colors.brownBramble, fontSize: 18 }}>
            {title}
          </Text>
        </Space>
      </div>
      <div
        style={{ height: CHART_HEIGHT }}
        role="img"
        aria-label={`Temperature correlation chart showing ${points.length} data points`}
      >
        <Scatter {...config} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {points.length} data point{points.length !== 1 ? 's' : ''}
          {isHourly ? ' (hourly)' : ' (daily)'}
        </Text>
      </div>
    </Card>
  );
}

export default TemperatureCorrelationCard;
