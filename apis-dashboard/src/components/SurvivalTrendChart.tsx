/**
 * SurvivalTrendChart Component
 *
 * Line chart showing survival rate percentage over multiple winters.
 * Helps beekeepers visualize their year-over-year improvement or decline
 * in overwintering success.
 *
 * Features:
 * - Line chart with survival rate (0-100%) on Y-axis
 * - Winter seasons on X-axis (e.g., 2022-2023, 2023-2024)
 * - Trend indicator showing improvement/decline
 * - Honey Beegood styling
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#6
 */
import { Card, Typography, Empty, Spin, Tag, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, LineChartOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { SurvivalTrend } from '../hooks/useOverwintering';

const { Title, Text } = Typography;

interface SurvivalTrendChartProps {
  /** Survival trend data */
  trends: SurvivalTrend[];
  /** Whether data is loading */
  loading?: boolean;
  /** Title for the card */
  title?: string;
}

/**
 * Calculate the trend direction based on first and last data points
 */
function calculateTrend(trends: SurvivalTrend[]): 'up' | 'down' | 'stable' | null {
  if (trends.length < 2) return null;

  const first = trends[trends.length - 1]; // Oldest
  const last = trends[0]; // Most recent

  const diff = last.survival_rate - first.survival_rate;

  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

/**
 * Get trend tag color and icon
 */
function getTrendDisplay(trend: 'up' | 'down' | 'stable' | null) {
  switch (trend) {
    case 'up':
      return {
        color: 'success',
        icon: <ArrowUpOutlined />,
        text: 'Improving',
      };
    case 'down':
      return {
        color: 'error',
        icon: <ArrowDownOutlined />,
        text: 'Declining',
      };
    case 'stable':
      return {
        color: 'default',
        icon: <MinusOutlined />,
        text: 'Stable',
      };
    default:
      return null;
  }
}

/**
 * Simple bar-based chart since we don't have a charting library
 */
function SimpleBarChart({ trends }: { trends: SurvivalTrend[] }) {
  // Reverse to show oldest to newest (left to right)
  const sortedTrends = [...trends].reverse();
  const maxRate = 100; // Always use 100% as max

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '16px 0' }}>
      {sortedTrends.map((trend, index) => {
        const barHeight = (trend.survival_rate / maxRate) * 140;
        const isLatest = index === sortedTrends.length - 1;

        return (
          <div
            key={trend.winter_season}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {/* Rate Label */}
            <Text
              style={{
                fontSize: 11,
                fontWeight: isLatest ? 700 : 400,
                color: isLatest ? colors.seaBuckthorn : colors.textMuted,
              }}
            >
              {trend.survival_rate.toFixed(0)}%
            </Text>

            {/* Bar */}
            <div
              style={{
                width: '100%',
                maxWidth: 40,
                height: barHeight,
                minHeight: 4,
                background: isLatest
                  ? `linear-gradient(180deg, ${colors.seaBuckthorn} 0%, ${colors.salomie} 100%)`
                  : colors.salomie,
                borderRadius: 4,
                transition: 'height 0.3s ease',
                border: isLatest ? `2px solid ${colors.seaBuckthorn}` : 'none',
              }}
            />

            {/* Season Label */}
            <Text
              style={{
                fontSize: 10,
                color: colors.textMuted,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {trend.season_label.split('-')[0]}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

/**
 * SurvivalTrendChart Component
 *
 * Displays a visual representation of survival rates over multiple winters.
 * Uses a simple bar chart implementation and shows trend direction.
 *
 * @example
 * <SurvivalTrendChart
 *   trends={trendData}
 *   loading={isLoading}
 *   title="Survival Trends"
 * />
 */
export function SurvivalTrendChart({
  trends,
  loading = false,
  title = 'Winter Survival Trends',
}: SurvivalTrendChartProps) {
  const trend = calculateTrend(trends);
  const trendDisplay = getTrendDisplay(trend);

  return (
    <Card
      styles={{
        body: { padding: 20 },
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <LineChartOutlined style={{ fontSize: 18, color: colors.seaBuckthorn }} />
          <Title level={5} style={{ margin: 0, color: colors.brownBramble }}>
            {title}
          </Title>
        </Space>
        {trendDisplay && (
          <Tag color={trendDisplay.color} icon={trendDisplay.icon}>
            {trendDisplay.text}
          </Tag>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : trends.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No historical data yet"
          style={{ padding: '20px 0' }}
        />
      ) : trends.length === 1 ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text style={{ fontSize: 48, fontWeight: 700, color: colors.seaBuckthorn }}>
            {trends[0].survival_rate.toFixed(0)}%
          </Text>
          <div>
            <Text type="secondary">
              {trends[0].season_label} • {trends[0].survived_count} of {trends[0].total_hives} hives
            </Text>
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            More data needed for trend analysis
          </Text>
        </div>
      ) : (
        <>
          <SimpleBarChart trends={trends} />

          {/* Summary */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 16,
              paddingTop: 12,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                Latest Season
              </Text>
              <Text strong>{trends[0].survival_rate.toFixed(1)}%</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                Average
              </Text>
              <Text strong>
                {(trends.reduce((sum, t) => sum + t.survival_rate, 0) / trends.length).toFixed(1)}%
              </Text>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {trends.length} Winters
              </Text>
              <Text strong>
                {trends.reduce((sum, t) => sum + t.survived_count, 0)} survived
              </Text>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default SurvivalTrendChart;
