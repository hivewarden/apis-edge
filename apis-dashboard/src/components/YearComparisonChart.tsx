/**
 * YearComparisonChart Component
 *
 * Simple bar chart comparing current vs previous year statistics.
 * Shows harvest kg and hornet count comparisons.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { Card, Row, Col, Typography, Progress, Empty } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { YearComparison } from '../hooks/useSeasonRecap';

const { Text, Title } = Typography;

export interface YearComparisonChartProps {
  currentYear: number;
  currentHarvestKg: number;
  currentHornets: number;
  comparison: YearComparison | null | undefined;
}

/**
 * Comparison indicator showing direction and percentage.
 */
function ChangeIndicator({ change, inverse = false }: { change: number; inverse?: boolean }) {
  const isPositive = change >= 0;

  // For hornets, an increase is bad (inverse=true)
  // For harvest, an increase is good
  const isGood = inverse ? !isPositive : isPositive;

  const icon = change > 0.5 ? (
    <ArrowUpOutlined />
  ) : change < -0.5 ? (
    <ArrowDownOutlined />
  ) : (
    <MinusOutlined />
  );

  return (
    <Text
      style={{
        color: isGood ? '#52c41a' : change !== 0 ? '#ff4d4f' : '#999',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {icon} {isPositive ? '+' : ''}{change.toFixed(1)}%
    </Text>
  );
}

/**
 * YearComparisonChart displays a visual comparison between years.
 */
export function YearComparisonChart({
  currentYear,
  currentHarvestKg,
  currentHornets,
  comparison,
}: YearComparisonChartProps) {
  if (!comparison) {
    return (
      <Card title="Year-over-Year Comparison">
        <Empty description="No previous year data available for comparison" />
      </Card>
    );
  }

  const { previous_year, previous_harvest_kg, previous_hornets, harvest_change_percent, hornets_change_percent } =
    comparison;

  // Calculate max values for scaling
  const maxHarvest = Math.max(currentHarvestKg, previous_harvest_kg) || 1;
  const maxHornets = Math.max(currentHornets, previous_hornets) || 1;

  return (
    <Card title="Year-over-Year Comparison" style={{ marginTop: 16 }}>
      <Row gutter={[32, 24]}>
        {/* Harvest Comparison */}
        <Col xs={24} md={12}>
          <Title level={5} style={{ marginBottom: 16, color: colors.brownBramble }}>
            Harvest (kg)
          </Title>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>{currentYear}</Text>
              <Text strong style={{ color: colors.seaBuckthorn }}>
                {currentHarvestKg.toFixed(1)} kg
              </Text>
            </div>
            <Progress
              percent={(currentHarvestKg / maxHarvest) * 100}
              showInfo={false}
              strokeColor={colors.seaBuckthorn}
              trailColor={colors.salomie}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary">{previous_year}</Text>
              <Text type="secondary">{previous_harvest_kg.toFixed(1)} kg</Text>
            </div>
            <Progress
              percent={(previous_harvest_kg / maxHarvest) * 100}
              showInfo={false}
              strokeColor="#ccc"
              trailColor="#f0f0f0"
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <ChangeIndicator change={harvest_change_percent} />
          </div>
        </Col>

        {/* Hornet Comparison */}
        <Col xs={24} md={12}>
          <Title level={5} style={{ marginBottom: 16, color: colors.brownBramble }}>
            Hornets Deterred
          </Title>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>{currentYear}</Text>
              <Text strong style={{ color: '#ff7a45' }}>
                {currentHornets}
              </Text>
            </div>
            <Progress
              percent={(currentHornets / maxHornets) * 100}
              showInfo={false}
              strokeColor="#ff7a45"
              trailColor="#ffd8bf"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary">{previous_year}</Text>
              <Text type="secondary">{previous_hornets}</Text>
            </div>
            <Progress
              percent={(previous_hornets / maxHornets) * 100}
              showInfo={false}
              strokeColor="#ccc"
              trailColor="#f0f0f0"
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <ChangeIndicator change={hornets_change_percent} inverse />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                (less is better)
              </Text>
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}

export default YearComparisonChart;
