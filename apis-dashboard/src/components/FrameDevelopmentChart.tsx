import { Card, Empty, Spin, Alert, Space, Typography } from 'antd';
import { AreaChartOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Area } from '@ant-design/charts';
import { useFrameHistory } from '../hooks';
import { colors } from '../theme/apisTheme';
import React from 'react';

const { Text, Title } = Typography;

// Error boundary for chart rendering failures
interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChartErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="warning"
          message="Chart rendering failed"
          description="Unable to display the frame development chart. Please try refreshing the page."
          showIcon
        />
      );
    }

    return this.props.children;
  }
}

// Default chart height - can be overridden via props
const DEFAULT_CHART_HEIGHT = 300;

interface FrameDevelopmentChartProps {
  hiveId: string;
  /** Optional chart height in pixels. Defaults to 300. */
  height?: number;
}

// Color palette matching story requirements
const CHART_COLORS = {
  Brood: '#8B4513',  // saddle brown
  Honey: colors.seaBuckthorn, // #f7a42d
  Pollen: '#FFA500', // orange
};

/**
 * Frame Development Chart Component
 *
 * Displays a stacked area chart showing frame development over time.
 * Shows brood, honey, and pollen frame counts from inspection history.
 *
 * Part of Epic 5, Story 5.6: Frame Development Graphs
 */
export function FrameDevelopmentChart({ hiveId, height = DEFAULT_CHART_HEIGHT }: FrameDevelopmentChartProps) {
  const { data, loading, error, hasEnoughData } = useFrameHistory(hiveId);

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Loading frame history...
          </Text>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert type="error" message={error} />
      </Card>
    );
  }

  if (!hasEnoughData) {
    return (
      <Card
        title={
          <Space>
            <AreaChartOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Frame Development</span>
          </Space>
        }
      >
        <Empty
          image={<ExperimentOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
          description={
            <div>
              <Title level={5} type="secondary">
                Record more inspections to see frame trends
              </Title>
              <Text type="secondary">
                At least 3 inspections with frame-level data are needed to display the chart.
                Enable Advanced Mode in Settings and record frame data during inspections.
              </Text>
            </div>
          }
        />
        {/* Preview placeholder */}
        <div
          style={{
            marginTop: 24,
            height: 200,
            background: 'linear-gradient(to top, rgba(139, 69, 19, 0.1), rgba(247, 164, 45, 0.1), rgba(255, 165, 0, 0.05))',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text type="secondary">Chart preview will appear here</Text>
        </div>
      </Card>
    );
  }

  const config = {
    data,
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    areaStyle: {
      fillOpacity: 0.7,
    },
    color: (datum: { type: string }) => {
      return CHART_COLORS[datum.type as keyof typeof CHART_COLORS] || '#999';
    },
    xAxis: {
      type: 'time' as const,
      tickCount: 5,
      label: {
        formatter: (text: string) => {
          const date = new Date(text);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        },
      },
    },
    yAxis: {
      title: {
        text: 'Frame Count',
      },
      min: 0,
    },
    tooltip: {
      shared: true,
      showMarkers: false,
      customContent: (title: string, items: Array<{ name: string; value: string; data: { type: string; value: number } }>) => {
        if (!items || items.length === 0) return null;
        const date = new Date(title);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Extract values by type
        const values: Record<string, number> = {};
        items.forEach(item => {
          values[item.data.type.toLowerCase()] = item.data.value;
        });

        const brood = values['brood'] ?? 0;
        const honey = values['honey'] ?? 0;
        const pollen = values['pollen'] ?? 0;

        // Format as "Jun 15: 6 brood, 4 honey, 2 pollen frames" per AC#2
        const tooltipText = `${formattedDate}: ${brood} brood, ${honey} honey, ${pollen} pollen frames`;

        return `<div style="padding: 8px 12px; background: white; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">${tooltipText}</div>`;
      },
    },
    legend: {
      position: 'top' as const,
      itemName: {
        style: {
          fill: colors.brownBramble,
        },
      },
    },
    isStack: true,
    animation: {
      appear: {
        duration: 800,
      },
    },
  };

  return (
    <Card
      title={
        <Space>
          <AreaChartOutlined style={{ color: colors.seaBuckthorn }} />
          <span>Frame Development</span>
        </Space>
      }
    >
      <ChartErrorBoundary>
        <Area {...config} height={height} />
      </ChartErrorBoundary>
      <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Space>
          <div style={{ width: 12, height: 12, backgroundColor: CHART_COLORS.Brood, borderRadius: 2 }} />
          <Text type="secondary">Brood</Text>
        </Space>
        <Space>
          <div style={{ width: 12, height: 12, backgroundColor: CHART_COLORS.Honey, borderRadius: 2 }} />
          <Text type="secondary">Honey</Text>
        </Space>
        <Space>
          <div style={{ width: 12, height: 12, backgroundColor: CHART_COLORS.Pollen, borderRadius: 2 }} />
          <Text type="secondary">Pollen</Text>
        </Space>
      </div>
    </Card>
  );
}

export default FrameDevelopmentChart;
