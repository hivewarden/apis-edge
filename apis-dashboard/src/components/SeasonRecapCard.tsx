/**
 * SeasonRecapCard Component
 *
 * Displays the season recap summary in a shareable card format.
 * Features Honey Beegood styling for visual appeal and sharing.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import React, { forwardRef } from 'react';
import { Card, Typography, Row, Col, Statistic, Tag, Space, Divider } from 'antd';
import {
  TrophyOutlined,
  BugOutlined,
  SearchOutlined,
  MedicineBoxOutlined,
  CoffeeOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { SeasonRecap, Milestone, formatHarvestKg, getMilestoneIcon } from '../hooks/useSeasonRecap';

const { Title, Text } = Typography;

export interface SeasonRecapCardProps {
  recap: SeasonRecap;
  compact?: boolean;
}

/**
 * Get icon component for milestone type.
 */
function MilestoneIcon({ type }: { type: string }) {
  const iconType = getMilestoneIcon(type);
  switch (iconType) {
    case 'trophy':
      return <TrophyOutlined style={{ color: colors.seaBuckthorn }} />;
    case 'plus-circle':
      return <span style={{ color: colors.seaBuckthorn }}>+</span>;
    case 'crown':
      return <span style={{ color: colors.seaBuckthorn }}>&#x1F451;</span>;
    case 'warning':
      return <span style={{ color: '#ff4d4f' }}>!</span>;
    default:
      return <span style={{ color: colors.seaBuckthorn }}>*</span>;
  }
}

/**
 * SeasonRecapCard displays the season summary with key statistics.
 * Uses forwardRef to allow capturing via html2canvas for image export.
 */
export const SeasonRecapCard = forwardRef<HTMLDivElement, SeasonRecapCardProps>(
  function SeasonRecapCard({ recap, compact = false }, ref) {
    const { season_dates, milestones, comparison_data } = recap;

    return (
      <div ref={ref}>
        <Card
          style={{
            background: `linear-gradient(135deg, ${colors.coconutCream} 0%, ${colors.salomie}40 100%)`,
            borderColor: colors.seaBuckthorn,
            borderWidth: 2,
          }}
          bodyStyle={{ padding: compact ? 16 : 24 }}
        >
          {/* Header */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: compact ? 12 : 20,
              padding: compact ? 8 : 16,
              background: colors.seaBuckthorn,
              borderRadius: 8,
              marginTop: -8,
              marginLeft: -8,
              marginRight: -8,
            }}
          >
            <Title
              level={compact ? 4 : 3}
              style={{ color: 'white', margin: 0 }}
            >
              Season Recap {recap.season_year}
            </Title>
            <Text style={{ color: 'white', opacity: 0.9 }}>
              {season_dates.display_text}
            </Text>
          </div>

          {/* Key Stats */}
          <Row gutter={[16, 16]} style={{ marginBottom: compact ? 12 : 20 }}>
            <Col xs={12} sm={8}>
              <Statistic
                title="Harvest"
                value={recap.total_harvest_kg}
                suffix="kg"
                valueStyle={{ color: colors.brownBramble, fontSize: compact ? 20 : 24 }}
                prefix={<TrophyOutlined style={{ color: colors.seaBuckthorn }} />}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Hornets Deterred"
                value={recap.hornets_deterred}
                valueStyle={{ color: colors.brownBramble, fontSize: compact ? 20 : 24 }}
                prefix={<BugOutlined style={{ color: colors.seaBuckthorn }} />}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Inspections"
                value={recap.inspections_count}
                valueStyle={{ color: colors.brownBramble, fontSize: compact ? 20 : 24 }}
                prefix={<SearchOutlined style={{ color: colors.seaBuckthorn }} />}
              />
            </Col>
            {!compact && (
              <>
                <Col xs={12} sm={8}>
                  <Statistic
                    title="Treatments"
                    value={recap.treatments_count}
                    valueStyle={{ color: colors.brownBramble, fontSize: 20 }}
                    prefix={<MedicineBoxOutlined style={{ color: colors.seaBuckthorn }} />}
                  />
                </Col>
                <Col xs={12} sm={8}>
                  <Statistic
                    title="Feedings"
                    value={recap.feedings_count}
                    valueStyle={{ color: colors.brownBramble, fontSize: 20 }}
                    prefix={<CoffeeOutlined style={{ color: colors.seaBuckthorn }} />}
                  />
                </Col>
              </>
            )}
          </Row>

          {/* Year Comparison */}
          {comparison_data && (
            <>
              <Divider style={{ margin: compact ? '8px 0' : '16px 0' }} />
              <div style={{ textAlign: 'center', marginBottom: compact ? 8 : 16 }}>
                <Text type="secondary">vs {comparison_data.previous_year}: </Text>
                <Tag color={comparison_data.harvest_change_percent >= 0 ? 'green' : 'red'}>
                  {comparison_data.harvest_change_percent >= 0 ? '+' : ''}
                  {comparison_data.harvest_change_percent.toFixed(1)}% harvest
                </Tag>
                <Tag color={comparison_data.hornets_change_percent >= 0 ? 'orange' : 'green'}>
                  {comparison_data.hornets_change_percent >= 0 ? '+' : ''}
                  {comparison_data.hornets_change_percent.toFixed(1)}% hornets
                </Tag>
              </div>
            </>
          )}

          {/* Milestones */}
          {milestones.length > 0 && !compact && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <Title level={5} style={{ color: colors.brownBramble, marginBottom: 12 }}>
                Highlights
              </Title>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {milestones.slice(0, 5).map((milestone, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MilestoneIcon type={milestone.type} />
                    <Text>{milestone.description}</Text>
                  </div>
                ))}
              </Space>
            </>
          )}

          {/* Footer */}
          <div
            style={{
              textAlign: 'center',
              marginTop: compact ? 12 : 20,
              paddingTop: 12,
              borderTop: `1px solid ${colors.seaBuckthorn}40`,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Generated with APIS - apis.honeybeegood.be
            </Text>
          </div>
        </Card>
      </div>
    );
  }
);

export default SeasonRecapCard;
