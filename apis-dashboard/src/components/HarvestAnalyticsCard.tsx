/**
 * HarvestAnalyticsCard Component
 *
 * Displays harvest analytics with charts:
 * - Yield per hive comparison bar chart
 * - Year-over-year comparison line chart
 * - Best performing hive highlighted
 *
 * Part of Epic 6, Story 6.3 (Harvest Tracking) - AC#4
 */
import { Card, Typography, Space, Empty, Spin, Row, Col, Statistic, Tag } from 'antd';
import { BarChartOutlined, TrophyOutlined, RiseOutlined } from '@ant-design/icons';
import { Column, Line } from '@ant-design/charts';
import type { HarvestAnalytics } from '../hooks/useHarvests';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

interface HarvestAnalyticsCardProps {
  analytics: HarvestAnalytics | null;
  loading?: boolean;
  error?: boolean;
}

/**
 * Static chart animation config
 */
const CHART_ANIMATION = {
  appear: {
    animation: 'wave-in' as const,
    duration: 600,
  },
};

/**
 * Per-hive yield bar chart configuration
 */
function PerHiveChart({ data }: { data: HarvestAnalytics['per_hive'] }) {
  if (data.length === 0) {
    return (
      <Empty
        description="No per-hive data available"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const chartData = data.map((d) => ({
    hive: d.hive_name,
    yield: d.total_kg,
    harvests: d.harvests,
  }));

  return (
    <Column
      data={chartData}
      xField="hive"
      yField="yield"
      color={colors.seaBuckthorn}
      animation={CHART_ANIMATION}
      columnStyle={{
        radius: [4, 4, 0, 0],
      }}
      label={{
        position: 'top',
        style: {
          fill: colors.brownBramble,
          fontSize: 11,
        },
        formatter: (datum: { yield?: number }) => {
          const val = datum?.yield;
          return val !== undefined ? `${val.toFixed(1)}kg` : '';
        },
      }}
      xAxis={{
        label: {
          style: {
            fill: colors.brownBramble,
            fontSize: 11,
          },
        },
      }}
      yAxis={{
        label: {
          formatter: (v: string) => `${v}kg`,
          style: {
            fill: colors.brownBramble,
            fontSize: 10,
          },
        },
        title: {
          text: 'Total Yield (kg)',
          style: {
            fill: colors.brownBramble,
            fontSize: 11,
          },
        },
      }}
      tooltip={{
        formatter: (datum: { hive?: string; yield?: number; harvests?: number }) => ({
          name: datum.hive || 'Hive',
          value: `${datum.yield?.toFixed(1) || 0} kg from ${datum.harvests || 0} harvests`,
        }),
      }}
      height={200}
    />
  );
}

/**
 * Year-over-year comparison line chart
 */
function YearOverYearChart({ data }: { data: HarvestAnalytics['year_over_year'] }) {
  if (data.length === 0) {
    return (
      <Empty
        description="No year-over-year data available"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const chartData = data.map((d) => ({
    year: d.year.toString(),
    yield: d.total_kg,
  }));

  return (
    <Line
      data={chartData}
      xField="year"
      yField="yield"
      color={colors.seaBuckthorn}
      animation={CHART_ANIMATION}
      point={{
        size: 6,
        shape: 'circle',
        style: {
          fill: colors.seaBuckthorn,
          stroke: 'white',
          lineWidth: 2,
        },
      }}
      lineStyle={{
        lineWidth: 3,
      }}
      xAxis={{
        label: {
          style: {
            fill: colors.brownBramble,
            fontSize: 11,
          },
        },
      }}
      yAxis={{
        label: {
          formatter: (v: string) => `${v}kg`,
          style: {
            fill: colors.brownBramble,
            fontSize: 10,
          },
        },
        title: {
          text: 'Total Yield (kg)',
          style: {
            fill: colors.brownBramble,
            fontSize: 11,
          },
        },
      }}
      tooltip={{
        formatter: (datum: { year?: string; yield?: number }) => ({
          name: datum.year || 'Year',
          value: `${datum.yield?.toFixed(1) || 0} kg`,
        }),
      }}
      height={180}
    />
  );
}

/**
 * Best Performing Hive highlight card
 */
function BestHiveHighlight({
  best,
}: {
  best: HarvestAnalytics['best_performing_hive'];
}) {
  if (!best) {
    return null;
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${colors.seaBuckthorn}15 0%, ${colors.salomie}30 100%)`,
        borderRadius: 8,
        padding: 16,
        border: `1px solid ${colors.seaBuckthorn}33`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: colors.seaBuckthorn,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TrophyOutlined style={{ fontSize: 24, color: 'white' }} />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Top Performer
        </Text>
        <div>
          <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
            {best.hive_name}
          </Text>
          <Tag color="gold" style={{ marginLeft: 8 }}>
            {best.kg_per_harvest.toFixed(1)} kg/harvest
          </Tag>
        </div>
      </div>
    </div>
  );
}

/**
 * Harvest Analytics Card
 *
 * Comprehensive analytics view for harvest data including:
 * - Summary statistics (total kg, harvests)
 * - Per-hive yield comparison
 * - Year-over-year trends
 * - Best performing hive highlight
 */
export function HarvestAnalyticsCard({
  analytics,
  loading = false,
  error = false,
}: HarvestAnalyticsCardProps) {
  // Loading state
  if (loading) {
    return (
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: colors.seaBuckthorn }} />
            Harvest Analytics
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading analytics...</Text>
          </div>
        </div>
      </Card>
    );
  }

  // Error state
  if (error || !analytics) {
    return (
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: colors.seaBuckthorn }} />
            Harvest Analytics
          </Space>
        }
      >
        <Empty
          description={error ? 'Failed to load analytics' : 'No analytics data available'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // No data state
  if (analytics.total_harvests === 0) {
    return (
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: colors.seaBuckthorn }} />
            Harvest Analytics
          </Space>
        }
      >
        <Empty
          description="No harvests recorded yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Start logging harvests to see yield analytics and comparisons.
          </Text>
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <BarChartOutlined style={{ color: colors.seaBuckthorn }} />
          Harvest Analytics
        </Space>
      }
    >
      {/* Summary Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="Total Yield"
            value={analytics.total_kg}
            precision={1}
            suffix="kg"
            valueStyle={{ color: colors.seaBuckthorn }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Harvests"
            value={analytics.total_harvests}
            valueStyle={{ color: colors.brownBramble }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Hives"
            value={analytics.per_hive.length}
            valueStyle={{ color: colors.brownBramble }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="Avg Per Harvest"
            value={
              analytics.total_harvests > 0
                ? analytics.total_kg / analytics.total_harvests
                : 0
            }
            precision={1}
            suffix="kg"
            prefix={<RiseOutlined />}
            valueStyle={{ color: colors.seaBuckthorn }}
          />
        </Col>
      </Row>

      {/* Best Performing Hive */}
      {analytics.best_performing_hive && (
        <div style={{ marginBottom: 24 }}>
          <BestHiveHighlight best={analytics.best_performing_hive} />
        </div>
      )}

      {/* Charts */}
      <Row gutter={[24, 24]}>
        {/* Per-Hive Yield Chart */}
        <Col xs={24} lg={14}>
          <div>
            <Title level={5} style={{ marginBottom: 16, color: colors.brownBramble }}>
              Yield by Hive
            </Title>
            <PerHiveChart data={analytics.per_hive} />
          </div>
        </Col>

        {/* Year-over-Year Chart */}
        <Col xs={24} lg={10}>
          <div>
            <Title level={5} style={{ marginBottom: 16, color: colors.brownBramble }}>
              Year-over-Year
            </Title>
            <YearOverYearChart data={analytics.year_over_year} />
          </div>
        </Col>
      </Row>
    </Card>
  );
}

export default HarvestAnalyticsCard;
