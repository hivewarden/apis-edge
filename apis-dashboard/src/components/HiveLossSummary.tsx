/**
 * HiveLossSummary Component
 *
 * A card component showing post-mortem summary for a lost hive.
 * Displays cause, date, symptoms, and reflection in a warm, respectful style.
 *
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { Card, Typography, Space, Tag, Divider } from 'antd';
import { HeartOutlined, CalendarOutlined, EyeOutlined, BulbOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import type { HiveLoss } from '../hooks/useHiveLoss';

const { Text, Paragraph } = Typography;

export interface HiveLossSummaryProps {
  /** The hive loss record to display */
  loss: HiveLoss;
  /** Whether to show in compact mode */
  compact?: boolean;
}

/**
 * HiveLossSummary displays a respectful summary of what happened when a hive was lost.
 *
 * @example
 * <HiveLossSummary loss={hiveLoss} />
 */
export function HiveLossSummary({ loss, compact = false }: HiveLossSummaryProps) {
  const formattedDate = dayjs(loss.discovered_at).format('MMMM D, YYYY');
  const causeDisplay = loss.cause_display || loss.cause;
  const symptomsDisplay = loss.symptoms_display || loss.symptoms || [];

  if (compact) {
    return (
      <div
        style={{
          padding: 12,
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space>
            <HeartOutlined style={{ color: '#8c8c8c' }} />
            <Text style={{ color: '#8c8c8c' }}>
              {causeDisplay} - {formattedDate}
            </Text>
          </Space>
          {symptomsDisplay.length > 0 && (
            <div style={{ marginLeft: 22 }}>
              {symptomsDisplay.slice(0, 3).map((symptom, index) => (
                <Tag key={index} style={{ fontSize: 11, marginTop: 4 }}>
                  {symptom}
                </Tag>
              ))}
              {symptomsDisplay.length > 3 && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                  +{symptomsDisplay.length - 3} more
                </Text>
              )}
            </div>
          )}
        </Space>
      </div>
    );
  }

  return (
    <Card
      title={
        <Space>
          <HeartOutlined style={{ color: colors.textMuted }} />
          <Text style={{ color: colors.brownBramble }}>Loss Record</Text>
        </Space>
      }
      style={{
        background: colors.coconutCream,
        borderColor: colors.border,
      }}
      styles={{
        header: {
          background: 'transparent',
          borderBottom: `1px solid ${colors.border}`,
        },
        body: {
          padding: 20,
        },
      }}
    >
      {/* Date and Cause */}
      <div style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 8 }}>
          <CalendarOutlined style={{ color: colors.textMuted }} />
          <Text type="secondary">Discovered {formattedDate}</Text>
        </Space>
        <div style={{ marginTop: 8 }}>
          <Text strong style={{ color: colors.brownBramble }}>
            Probable Cause: {causeDisplay}
          </Text>
          {loss.cause === 'other' && loss.cause_other != null && loss.cause_other !== '' && (
            <Text style={{ display: 'block', marginTop: 4 }}>
              {loss.cause_other}
            </Text>
          )}
        </div>
      </div>

      {/* Symptoms */}
      {symptomsDisplay.length > 0 && (
        <>
          <Divider style={{ margin: '16px 0', borderColor: colors.border }} />
          <div style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 12 }}>
              <EyeOutlined style={{ color: colors.textMuted }} />
              <Text type="secondary">Observed Symptoms</Text>
            </Space>
            <div>
              {symptomsDisplay.map((symptom, index) => (
                <Tag key={index} style={{ marginBottom: 4, marginRight: 4 }}>
                  {symptom}
                </Tag>
              ))}
            </div>
            {loss.symptoms_notes && (
              <Paragraph
                type="secondary"
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontStyle: 'italic',
                  fontSize: 13,
                }}
              >
                "{loss.symptoms_notes}"
              </Paragraph>
            )}
          </div>
        </>
      )}

      {/* Reflection */}
      {loss.reflection && (
        <>
          <Divider style={{ margin: '16px 0', borderColor: colors.border }} />
          <div>
            <Space style={{ marginBottom: 8 }}>
              <BulbOutlined style={{ color: colors.textMuted }} />
              <Text type="secondary">Reflection</Text>
            </Space>
            <Paragraph
              style={{
                marginBottom: 0,
                fontStyle: 'italic',
                color: colors.brownBramble,
              }}
            >
              "{loss.reflection}"
            </Paragraph>
          </div>
        </>
      )}

      {/* Data Choice Note */}
      <Divider style={{ margin: '16px 0', borderColor: colors.border }} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {loss.data_choice === 'archive'
          ? 'Historical data has been preserved for reference.'
          : 'This hive has been removed from your active list.'}
      </Text>
    </Card>
  );
}

export default HiveLossSummary;
