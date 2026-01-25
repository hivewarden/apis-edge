/**
 * SeasonRecap Page
 *
 * Main page for viewing and sharing season recaps.
 * Allows year selection, displays summary card, per-hive breakdown,
 * and provides sharing options.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import React, { useState, useRef } from 'react';
import {
  Typography,
  Select,
  Button,
  Spin,
  Empty,
  Space,
  Row,
  Col,
  Alert,
  Tooltip,
} from 'antd';
import {
  ShareAltOutlined,
  ReloadOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import {
  useSeasonRecap,
  useAvailableSeasons,
  useRecapTime,
} from '../hooks/useSeasonRecap';
import { SeasonRecapCard } from '../components/SeasonRecapCard';
import { HiveSeasonSummary } from '../components/HiveSeasonSummary';
import { RecapShareModal } from '../components/RecapShareModal';
import { YearComparisonChart } from '../components/YearComparisonChart';
import { colors } from '../theme/apisTheme';

const { Title, Paragraph, Text } = Typography;

/**
 * SeasonRecap page displays the annual beekeeping season summary.
 */
export function SeasonRecap() {
  // Get current season info
  const { isRecapTime, currentSeason, loading: loadingTime } = useRecapTime('northern');

  // Selected year state
  const [selectedYear, setSelectedYear] = useState<number | undefined>();

  // Fetch available seasons for dropdown
  const { seasons, loading: loadingSeasons } = useAvailableSeasons();

  // Fetch recap data
  const { recap, loading, error, regenerate, regenerating } = useSeasonRecap(
    selectedYear,
    'northern'
  );

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Handle year selection
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  // Generate year options from available seasons + current
  const yearOptions = React.useMemo(() => {
    const yearsSet = new Set(seasons);
    // Always include current season
    yearsSet.add(currentSeason);
    // Add a few recent years even if no data
    for (let y = currentSeason; y >= currentSeason - 3 && y >= 2020; y--) {
      yearsSet.add(y);
    }
    return Array.from(yearsSet)
      .sort((a, b) => b - a)
      .map((year) => ({
        value: year,
        label: `${year} Season`,
      }));
  }, [seasons, currentSeason]);

  // Loading state
  if (loadingTime || loadingSeasons) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
        <Paragraph style={{ marginTop: 16 }}>Loading season data...</Paragraph>
      </div>
    );
  }

  return (
    <div className="season-recap-page">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Season Recap
          </Title>
          <Paragraph type="secondary">
            Review and share your beekeeping season achievements
          </Paragraph>
        </div>

        <Space wrap>
          <Select
            style={{ width: 160 }}
            value={selectedYear || currentSeason}
            onChange={handleYearChange}
            options={yearOptions}
            suffixIcon={<CalendarOutlined />}
          />

          <Tooltip title="Regenerate recap with latest data">
            <Button
              icon={<ReloadOutlined spin={regenerating} />}
              onClick={regenerate}
              loading={regenerating}
              disabled={!recap}
            >
              Refresh
            </Button>
          </Tooltip>

          <Button
            type="primary"
            icon={<ShareAltOutlined />}
            onClick={() => setShareModalOpen(true)}
            disabled={!recap}
          >
            Share
          </Button>
        </Space>
      </div>

      {/* Season Prompt Banner */}
      {isRecapTime && !selectedYear && (
        <Alert
          type="info"
          message={`Your ${currentSeason} beekeeping season has ended!`}
          description="Take a moment to review your achievements and share your recap with fellow beekeepers."
          style={{ marginBottom: 24 }}
          showIcon
          closable
        />
      )}

      {/* Main Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            Generating your season recap...
          </Paragraph>
        </div>
      ) : error ? (
        <Alert
          type="error"
          message="Failed to load recap"
          description={error.message || 'Please try again later.'}
          action={
            <Button size="small" onClick={regenerate}>
              Retry
            </Button>
          }
        />
      ) : !recap ? (
        <Empty
          description="No data available for this season"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Paragraph type="secondary">
            Start recording harvests, inspections, and detections to generate your
            season recap.
          </Paragraph>
        </Empty>
      ) : (
        <>
          {/* Summary Card */}
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={14}>
              <SeasonRecapCard recap={recap} />
            </Col>
            <Col xs={24} lg={10}>
              <div
                style={{
                  background: colors.coconutCream,
                  borderRadius: 8,
                  padding: 20,
                  height: '100%',
                }}
              >
                <Title level={4} style={{ color: colors.brownBramble }}>
                  About This Season
                </Title>
                <Paragraph>
                  <Text strong>Season Period:</Text>{' '}
                  {recap.season_dates.display_text}
                </Paragraph>
                <Paragraph>
                  <Text strong>Hemisphere:</Text>{' '}
                  {recap.hemisphere === 'northern' ? 'Northern' : 'Southern'}
                </Paragraph>
                <Paragraph>
                  <Text strong>Data Generated:</Text>{' '}
                  {new Date(recap.generated_at).toLocaleDateString()}
                </Paragraph>

                {recap.milestones.length > 0 && (
                  <>
                    <Title
                      level={5}
                      style={{ color: colors.brownBramble, marginTop: 20 }}
                    >
                      Season Milestones
                    </Title>
                    {recap.milestones.map((milestone, idx) => (
                      <Paragraph
                        key={idx}
                        style={{ marginBottom: 8 }}
                        type={milestone.type === 'hive_loss' ? 'secondary' : undefined}
                      >
                        {milestone.type === 'hive_loss' ? '⚠️' : '🏆'}{' '}
                        {milestone.description}
                      </Paragraph>
                    ))}
                  </>
                )}
              </div>
            </Col>
          </Row>

          {/* Year Comparison */}
          {recap.comparison_data && (
            <YearComparisonChart
              currentYear={recap.season_year}
              currentHarvestKg={recap.total_harvest_kg}
              currentHornets={recap.hornets_deterred}
              comparison={recap.comparison_data}
            />
          )}

          {/* Per-Hive Breakdown */}
          <HiveSeasonSummary stats={recap.per_hive_stats} />
        </>
      )}

      {/* Share Modal */}
      {recap && (
        <RecapShareModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          recap={recap}
        />
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          .ant-layout-sider,
          .ant-layout-header,
          button,
          .ant-select,
          .ant-alert {
            display: none !important;
          }
          .season-recap-page {
            padding: 0 !important;
          }
          .ant-card {
            break-inside: avoid;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default SeasonRecap;
