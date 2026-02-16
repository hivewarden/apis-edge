/**
 * SeasonRecapCard Component
 *
 * Displays the season recap summary in a shareable card format.
 * Features Honey Beegood styling for visual appeal and sharing.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { forwardRef } from 'react';
import { Typography, Row, Col, Space } from 'antd';
import {
  TrophyOutlined,
  BugOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { SeasonRecap, getMilestoneIcon } from '../hooks/useSeasonRecap';

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
 * Design per mockup: white card with top primary border, centered layout.
 */
export const SeasonRecapCard = forwardRef<HTMLDivElement, SeasonRecapCardProps>(
  function SeasonRecapCard({ recap, compact = false }, ref) {
    const { season_dates, milestones } = recap;

    // Stat item component
    const StatItem = ({
      icon,
      label,
      value,
    }: {
      icon: React.ReactNode;
      label: string;
      value: string | number;
    }) => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: 24,
          borderRadius: 16,
          backgroundColor: colors.coconutCream,
          border: '1px solid transparent',
          transition: 'border-color 0.2s',
        }}
      >
        <div
          style={{
            padding: 12,
            backgroundColor: '#ffffff',
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          }}
        >
          {icon}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#8a4a28',
              display: 'block',
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: colors.brownBramble,
              lineHeight: 1.2,
              marginTop: 4,
              display: 'block',
            }}
          >
            {value}
          </Text>
        </div>
      </div>
    );

    return (
      <div ref={ref}>
        {/* Card with top border per mockup */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
            borderTop: `8px solid ${colors.seaBuckthorn}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: compact ? '32px 24px' : '64px 64px',
              gap: compact ? 24 : 40,
            }}
          >
            {/* Header with trophy icon */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 16,
                maxWidth: 600,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(247, 164, 45, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <TrophyOutlined style={{ fontSize: 32, color: colors.seaBuckthorn }} />
              </div>
              <Title
                level={compact ? 3 : 2}
                style={{
                  color: colors.brownBramble,
                  margin: 0,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}
              >
                {recap.season_year} Season Recap
              </Title>
              <Text
                style={{
                  fontSize: compact ? 16 : 20,
                  color: '#8a4a28',
                  lineHeight: 1.6,
                }}
              >
                {season_dates.display_text}
              </Text>
            </div>

            {/* Decorative divider */}
            <div
              style={{
                width: 96,
                height: 4,
                background: `linear-gradient(to right, transparent, rgba(247, 164, 45, 0.3), transparent)`,
                borderRadius: 2,
              }}
            />

            {/* Stats grid - 4 columns per mockup */}
            <Row gutter={[16, 16]} style={{ width: '100%' }}>
              <Col xs={12} sm={12} md={6}>
                <StatItem
                  icon={<TrophyOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />}
                  label="Total Harvest"
                  value={`${recap.total_harvest_kg} kg`}
                />
              </Col>
              <Col xs={12} sm={12} md={6}>
                <StatItem
                  icon={<BugOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />}
                  label="Hornets Deterred"
                  value={recap.hornets_deterred}
                />
              </Col>
              <Col xs={12} sm={12} md={6}>
                <StatItem
                  icon={<SearchOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />}
                  label="Inspections"
                  value={recap.inspections_count}
                />
              </Col>
              <Col xs={12} sm={12} md={6}>
                <StatItem
                  icon={<TrophyOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />}
                  label="Milestones"
                  value={milestones.length}
                />
              </Col>
            </Row>

            {/* Milestones list - only in non-compact mode */}
            {milestones.length > 0 && !compact && (
              <div style={{ width: '100%', maxWidth: 600 }}>
                <Title level={5} style={{ color: colors.brownBramble, marginBottom: 16, textAlign: 'center' }}>
                  Highlights
                </Title>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {milestones.slice(0, 5).map((milestone, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        backgroundColor: colors.coconutCream,
                        borderRadius: 12,
                      }}
                    >
                      <MilestoneIcon type={milestone.type} />
                      <Text style={{ color: colors.brownBramble }}>{milestone.description}</Text>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </div>
        </div>

        {/* Footer - outside card */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Text style={{ fontSize: 14, color: '#8a4a28' }}>
            Generated with Hive Warden - hivewarden.com
          </Text>
        </div>
      </div>
    );
  }
);

export default SeasonRecapCard;
