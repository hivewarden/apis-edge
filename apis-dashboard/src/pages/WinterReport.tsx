/**
 * WinterReport Page
 *
 * Displays the overwintering report for a specific winter season.
 * Shows survival statistics, lost hive causes, and historical comparisons.
 *
 * Features:
 * - Survival rate card with progress visualization
 * - 100% survival celebration (when applicable)
 * - Lost hives section with causes and post-mortem links
 * - Survived hives section with condition summaries
 * - Historical comparison card
 * - Year selector for viewing past winters
 * - Survival trend chart
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#4, AC#5, AC#6
 */
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Typography, Select, Row, Col, Card, Progress, Spin, Empty, Space, Tag, Divider, List, Alert, Skeleton } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  FileSearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { SurvivalCelebration } from '../components/SurvivalCelebration';
import { LazySurvivalTrendChart as SurvivalTrendChart } from '../components/lazy';
import {
  useWinterReport,
  useSurvivalTrends,
  useAvailableWinters,
  getSeasonLabel,
  getConditionDisplay,
  getStoresDisplay,
} from '../hooks/useOverwintering';

const { Title, Text, Paragraph } = Typography;

/**
 * Get color for survival rate progress bar
 */
function getSurvivalColor(rate: number): string {
  if (rate >= 90) return colors.success;
  if (rate >= 70) return colors.seaBuckthorn;
  if (rate >= 50) return colors.warning;
  return colors.error;
}

/**
 * Get condition tag color
 */
function getConditionColor(condition?: string): string {
  switch (condition) {
    case 'strong':
      return 'success';
    case 'medium':
      return 'warning';
    case 'weak':
      return 'error';
    default:
      return 'default';
  }
}

/**
 * WinterReport Page Component
 */
export function WinterReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const seasonParam = searchParams.get('season');

  // Default to current winter season (last year in spring)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const defaultSeason = currentMonth <= 3 ? currentYear - 1 : currentYear;

  const [selectedSeason, setSelectedSeason] = useState<number>(
    seasonParam ? parseInt(seasonParam, 10) : defaultSeason
  );

  // Fetch data
  const { report, loading: reportLoading, error: reportError } = useWinterReport(selectedSeason);
  const { trends, loading: trendsLoading } = useSurvivalTrends(5);
  const { seasons, loading: seasonsLoading } = useAvailableWinters();

  // Update URL when season changes
  useEffect(() => {
    setSearchParams({ season: selectedSeason.toString() });
  }, [selectedSeason, setSearchParams]);

  const handleSeasonChange = (value: number) => {
    setSelectedSeason(value);
  };

  // Season options for selector
  const seasonOptions = seasons.map((season) => ({
    value: season,
    label: getSeasonLabel(season),
  }));

  // Add current season if not in list
  if (!seasons.includes(selectedSeason)) {
    seasonOptions.unshift({
      value: selectedSeason,
      label: getSeasonLabel(selectedSeason),
    });
  }

  // Loading state
  if (reportLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Loading winter report...</Text>
        </div>
      </div>
    );
  }

  // Error state
  if (reportError) {
    return (
      <Alert
        type="error"
        message="Failed to load winter report"
        description="Please try refreshing the page."
      />
    );
  }

  // No data state
  if (!report || report.total_hives === 0) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>
            Winter Report
          </Title>
          <Select
            value={selectedSeason}
            onChange={handleSeasonChange}
            loading={seasonsLoading}
            options={seasonOptions}
            style={{ width: 160 }}
          />
        </div>
        <Empty
          description={`No overwintering data for ${getSeasonLabel(selectedSeason)}`}
          style={{ padding: '48px 0' }}
        >
          <Space>
            <Link to={`/overwintering/survey?season=${selectedSeason}`}>
              <Tag
                color="blue"
                icon={<EditOutlined />}
                style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 14 }}
              >
                Complete Survey
              </Tag>
            </Link>
          </Space>
        </Empty>
      </div>
    );
  }

  const survivalColor = getSurvivalColor(report.survival_rate);

  return (
    <div>
      {/* Header with Season Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          Winter {report.season_label} Report
        </Title>
        <Select
          value={selectedSeason}
          onChange={handleSeasonChange}
          loading={seasonsLoading}
          options={seasonOptions}
          style={{ width: 160 }}
        />
      </div>

      {/* 100% Survival Celebration */}
      {report.is_100_percent && (
        <div style={{ marginBottom: 24 }}>
          <SurvivalCelebration
            winterSeason={report.winter_season}
            survivedCount={report.survived_count}
            showConfetti={true}
          />
        </div>
      )}

      <Row gutter={[16, 16]}>
        {/* Survival Rate Card */}
        <Col xs={24} lg={12}>
          <Card>
            <Title level={4} style={{ marginBottom: 16 }}>
              Survival Rate
            </Title>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Progress
                type="circle"
                percent={report.survival_rate}
                strokeColor={survivalColor}
                size={160}
                format={() => (
                  <div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: survivalColor }}>
                      {report.survival_rate.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>
                      Survival
                    </div>
                  </div>
                )}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text style={{ fontSize: 16 }}>
                <CheckCircleOutlined style={{ color: colors.success, marginRight: 8 }} />
                <strong>{report.survived_count}</strong> of <strong>{report.total_hives}</strong> hives survived
              </Text>
              {report.weak_count > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    <WarningOutlined style={{ color: colors.warning, marginRight: 4 }} />
                    {report.weak_count} weak hive{report.weak_count !== 1 ? 's' : ''} needing attention
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* Historical Comparison */}
        <Col xs={24} lg={12}>
          {report.comparison ? (
            <Card>
              <Title level={4} style={{ marginBottom: 16 }}>
                Compared to Last Winter
              </Title>
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">{report.comparison.previous_season_label}</Text>
                  <div style={{ fontSize: 24 }}>
                    {report.comparison.previous_survival_rate.toFixed(0)}%
                  </div>
                </div>
                <Divider style={{ margin: '16px 0' }} />
                <div>
                  {report.comparison.improved ? (
                    <Tag color="success" icon={<ArrowUpOutlined />} style={{ fontSize: 16, padding: '4px 12px' }}>
                      +{report.comparison.change_percent.toFixed(1)}% Improvement
                    </Tag>
                  ) : (
                    <Tag color="error" icon={<ArrowDownOutlined />} style={{ fontSize: 16, padding: '4px 12px' }}>
                      {report.comparison.change_percent.toFixed(1)}% Decline
                    </Tag>
                  )}
                </div>
                <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  {report.comparison.improved
                    ? 'Great progress! Your winter preparation has improved.'
                    : 'Consider what changes might help next winter.'}
                </Paragraph>
              </div>
            </Card>
          ) : (
            <Card>
              <Title level={4} style={{ marginBottom: 16 }}>
                Historical Comparison
              </Title>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No previous winter data for comparison"
              />
            </Card>
          )}
        </Col>
      </Row>

      {/* Lost Hives Section */}
      {report.lost_hives.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Title level={4} style={{ marginBottom: 16 }}>
            <CloseCircleOutlined style={{ color: colors.error, marginRight: 8 }} />
            Lost Hives ({report.lost_count})
          </Title>
          <List
            dataSource={report.lost_hives}
            renderItem={(item) => (
              <List.Item
                actions={[
                  item.has_post_mortem ? (
                    <Link to={`/hives/${item.hive_id}`} key="view">
                      <Tag icon={<FileSearchOutlined />} color="blue">
                        View Post-Mortem
                      </Tag>
                    </Link>
                  ) : (
                    <Link to={`/hives/${item.hive_id}/loss`} key="complete">
                      <Tag icon={<EditOutlined />} color="orange">
                        Complete Post-Mortem
                      </Tag>
                    </Link>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={item.hive_name}
                  description={
                    item.cause_display ? (
                      <Text type="secondary">Cause: {item.cause_display}</Text>
                    ) : (
                      <Text type="secondary">Cause unknown</Text>
                    )
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Survived Hives Section */}
      {report.survived_hives.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Title level={4} style={{ marginBottom: 16 }}>
            <CheckCircleOutlined style={{ color: colors.success, marginRight: 8 }} />
            Survived Hives ({report.survived_count})
          </Title>
          <List
            dataSource={report.survived_hives}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      {item.hive_name}
                      {item.condition && (
                        <Tag color={getConditionColor(item.condition)}>
                          {getConditionDisplay(item.condition)}
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4}>
                      {item.stores_remaining && (
                        <Text type="secondary">
                          Stores: {getStoresDisplay(item.stores_remaining)}
                        </Text>
                      )}
                      {item.first_inspection_notes && (
                        <Text type="secondary" italic>
                          "{item.first_inspection_notes}"
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Survival Trends (lazy loaded) */}
      <div style={{ marginTop: 16 }}>
        <Suspense fallback={<Skeleton.Node active style={{ width: '100%', height: 300 }}><div /></Skeleton.Node>}>
          <SurvivalTrendChart
            trends={trends}
            loading={trendsLoading}
            title="Your Winter Survival History"
          />
        </Suspense>
      </div>

      {/* Edit Survey Link */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link to={`/overwintering/survey?season=${selectedSeason}`}>
          <Tag
            icon={<EditOutlined />}
            color="orange"
            style={{ cursor: 'pointer', padding: '6px 16px', fontSize: 14 }}
          >
            Edit Survey Responses
          </Tag>
        </Link>
      </div>
    </div>
  );
}

export default WinterReport;
