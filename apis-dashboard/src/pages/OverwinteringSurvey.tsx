/**
 * OverwinteringSurvey Page
 *
 * Survey page where beekeepers document which hives survived winter.
 * Displays all active hives and allows marking each as Survived/Lost/Weak.
 *
 * Features:
 * - Lists all hives for the specified winter season
 * - Status selector for each hive (Survived/Lost/Weak)
 * - "Mark all as Survived" quick action
 * - Conditional detail fields for surviving hives
 * - Redirects to post-mortem for lost hives
 * - Navigates to Winter Report on completion
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#2, AC#3
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Button, Space, Spin, Empty, message, Row, Col, Alert, Card } from 'antd';
import {
  CheckOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { HiveWinterStatusCard, type HiveWinterData, type WinterStatus } from '../components/HiveWinterStatusCard';
import {
  useOverwinteringHives,
  submitOverwinteringRecord,
  getSeasonLabel,
  type CreateOverwinteringInput,
  type HiveWithRecord,
} from '../hooks/useOverwintering';

const { Title, Paragraph, Text } = Typography;

/**
 * Initialize form data from hives list
 */
function initializeFormData(hives: HiveWithRecord[]): Map<string, HiveWinterData> {
  const data = new Map<string, HiveWinterData>();

  hives.forEach((hive) => {
    // If existing record, pre-populate
    if (hive.existing_record) {
      const rec = hive.existing_record;
      let status: WinterStatus = 'survived';
      if (!rec.survived) {
        status = 'lost';
      } else if (rec.condition === 'weak') {
        status = 'weak';
      }

      data.set(hive.hive_id, {
        hiveId: hive.hive_id,
        hiveName: hive.hive_name,
        status,
        condition: rec.condition as 'strong' | 'medium' | 'weak' | undefined,
        storesRemaining: rec.stores_remaining as 'none' | 'low' | 'adequate' | 'plenty' | undefined,
        firstInspectionNotes: rec.first_inspection_notes,
      });
    } else {
      // New entry
      data.set(hive.hive_id, {
        hiveId: hive.hive_id,
        hiveName: hive.hive_name,
        status: null,
      });
    }
  });

  return data;
}

/**
 * OverwinteringSurvey Page Component
 */
export function OverwinteringSurvey() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const seasonParam = searchParams.get('season');
  const winterSeason = seasonParam ? parseInt(seasonParam, 10) : new Date().getFullYear() - 1;

  const { hives, loading, error } = useOverwinteringHives(winterSeason);
  const [formData, setFormData] = useState<Map<string, HiveWinterData>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null);
  const [lostHiveRedirects, setLostHiveRedirects] = useState<string[]>([]);

  // Initialize form data when hives load
  useEffect(() => {
    if (hives.length > 0) {
      setFormData(initializeFormData(hives));
    }
  }, [hives]);

  // Handle individual hive data change
  const handleHiveChange = useCallback((data: HiveWinterData) => {
    setFormData((prev) => {
      const newMap = new Map(prev);
      newMap.set(data.hiveId, data);
      return newMap;
    });
  }, []);

  // Mark all as survived
  const handleMarkAllSurvived = () => {
    setFormData((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((data, hiveId) => {
        newMap.set(hiveId, {
          ...data,
          status: 'survived',
        });
      });
      return newMap;
    });
  };

  // Check if all hives have a status
  const allHavesStatus = Array.from(formData.values()).every((d) => d.status !== null);
  const completedCount = Array.from(formData.values()).filter((d) => d.status !== null).length;
  const totalCount = formData.size;

  // Submit all records
  const handleSubmit = async () => {
    if (!allHavesStatus) {
      message.warning('Please select a status for all hives');
      return;
    }

    setSubmitting(true);
    setSubmitProgress({ done: 0, total: formData.size });
    const redirects: string[] = [];
    let successCount = 0;

    try {
      for (const [, data] of formData) {
        // Skip if no status (shouldn't happen with validation)
        if (!data.status) continue;

        const input: CreateOverwinteringInput = {
          hive_id: data.hiveId,
          winter_season: winterSeason,
          survived: data.status !== 'lost',
        };

        // Add details for survived/weak hives
        if (data.status === 'survived' || data.status === 'weak') {
          // Force weak condition for weak status to ensure data consistency
          if (data.status === 'weak') {
            input.condition = 'weak';
          } else if (data.condition) {
            input.condition = data.condition;
          }
          if (data.storesRemaining) {
            input.stores_remaining = data.storesRemaining;
          }
          if (data.firstInspectionNotes) {
            input.first_inspection_notes = data.firstInspectionNotes;
          }
        }

        try {
          const result = await submitOverwinteringRecord(input);
          successCount++;
          setSubmitProgress((prev) => prev ? { ...prev, done: successCount } : null);

          // Collect redirects for lost hives
          if (result.redirect) {
            redirects.push(result.redirect);
          }
        } catch (submitError) {
          console.error(`Failed to submit record for hive ${data.hiveId}:`, submitError);
        }
      }

      if (successCount === formData.size) {
        message.success('All overwintering records saved successfully');
      } else {
        message.warning(`Saved ${successCount} of ${formData.size} records`);
      }

      setLostHiveRedirects(redirects);

      // If no lost hives, go directly to report
      if (redirects.length === 0) {
        navigate(`/overwintering/report?season=${winterSeason}`);
      }
    } catch {
      message.error('Failed to save overwintering records');
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const seasonLabel = getSeasonLabel(winterSeason);

  // If there are lost hives to process - show post-mortem completion options
  if (lostHiveRedirects.length > 0) {
    return (
      <div>
        <Title level={2}>Complete Post-Mortems</Title>
        <Card style={{ maxWidth: 600 }}>
          <Alert
            type="info"
            showIcon
            message="Post-mortem documentation helps you learn"
            description="Recording what happened to lost hives helps you identify patterns and improve your beekeeping practice over time."
            style={{ marginBottom: 16 }}
          />
          <Paragraph>
            You marked {lostHiveRedirects.length} hive{lostHiveRedirects.length !== 1 ? 's' : ''} as lost.
            Complete the post-mortem for each hive to document what may have caused the loss.
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
            You can complete these in any order. After each post-mortem, you'll return here to continue with the next.
          </Paragraph>
          <Space direction="vertical" style={{ width: '100%' }}>
            {lostHiveRedirects.map((redirect, index) => (
              <Button
                key={index}
                type="primary"
                onClick={() => navigate(redirect)}
                block
                icon={<ArrowRightOutlined />}
              >
                Complete Post-Mortem {index + 1} of {lostHiveRedirects.length}
              </Button>
            ))}
          </Space>
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${colors.border || '#f0f0f0'}` }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              You can skip the post-mortems and add them later from each hive's detail page.
            </Text>
            <Button
              icon={<BarChartOutlined />}
              onClick={() => navigate(`/overwintering/report?season=${winterSeason}`)}
            >
              Skip to Winter Report
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8 }}>
          Winter {seasonLabel} Overwintering Report
        </Title>
        <Paragraph>
          Document which hives survived the winter. For lost hives, you'll be prompted to complete
          a post-mortem to help understand what happened.
        </Paragraph>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading hives...</Text>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert
          type="error"
          message="Failed to load hives"
          description="Please try refreshing the page."
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Empty State */}
      {!loading && !error && hives.length === 0 && (
        <Empty
          description="No hives found for this winter season"
          style={{ padding: '48px 0' }}
        >
          <Button type="primary" onClick={() => navigate('/hives')}>
            View All Hives
          </Button>
        </Empty>
      )}

      {/* Hive List */}
      {!loading && !error && hives.length > 0 && (
        <>
          {/* Quick Actions */}
          <div style={{ marginBottom: 24 }}>
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                onClick={handleMarkAllSurvived}
                disabled={submitting}
                style={{
                  borderColor: colors.success,
                  color: colors.success,
                }}
              >
                Mark All as Survived
              </Button>
              <Text type="secondary">
                {completedCount} of {totalCount} hives recorded
              </Text>
            </Space>
          </div>

          {/* Hive Cards */}
          <Row gutter={[16, 16]}>
            {hives.map((hive) => {
              const data = formData.get(hive.hive_id) || {
                hiveId: hive.hive_id,
                hiveName: hive.hive_name,
                status: null,
              };

              return (
                <Col xs={24} sm={12} lg={8} key={hive.hive_id}>
                  <HiveWinterStatusCard
                    hive={hive}
                    data={data}
                    onChange={handleHiveChange}
                    winterSeason={winterSeason}
                    disabled={submitting}
                  />
                </Col>
              );
            })}
          </Row>

          {/* Submit Button */}
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            {submitProgress && (
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">
                  Saving... {submitProgress.done} of {submitProgress.total}
                </Text>
              </div>
            )}
            <Button
              type="primary"
              size="large"
              icon={allHavesStatus ? <CheckOutlined /> : <ArrowRightOutlined />}
              onClick={handleSubmit}
              loading={submitting}
              disabled={!allHavesStatus}
              style={{
                background: allHavesStatus ? colors.seaBuckthorn : undefined,
                borderColor: allHavesStatus ? colors.seaBuckthorn : undefined,
                height: 48,
                paddingInline: 32,
              }}
            >
              {allHavesStatus ? 'Complete Survey' : `${totalCount - completedCount} hives remaining`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default OverwinteringSurvey;
