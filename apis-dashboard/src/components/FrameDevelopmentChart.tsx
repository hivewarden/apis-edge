import { Card, Empty, Spin, Alert, Space, Typography } from 'antd';
import { AreaChartOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Area } from '@ant-design/charts';
import { useFrameHistory } from '../hooks';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

interface FrameDevelopmentChartProps {
  hiveId: string;
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
export function FrameDevelopmentChart({ hiveId }: FrameDevelopmentChartProps) {
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
          return `${date.getMonth() + 1}/${date.getDate()}`;
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
      formatter: (datum: { type: string; value: number }) => {
        return {
          name: datum.type,
          value: `${datum.value} frames`,
        };
      },
      title: (title: string) => {
        const date = new Date(title);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      <Area {...config} height={300} />
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
