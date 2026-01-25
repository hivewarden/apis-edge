/**
 * HiveWinterStatusCard Component
 *
 * Card for each hive in the overwintering survey, allowing the beekeeper
 * to mark survival status and enter details for surviving hives.
 *
 * Features:
 * - Status selector: Survived / Lost / Weak
 * - Conditional fields for survived/weak hives (condition, stores, notes)
 * - Link to post-mortem wizard for lost hives
 * - Visual status indication with colors
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#2, AC#3
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Radio, Space, Typography, Input, Collapse, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { RadioChangeEvent } from 'antd';
import { colors } from '../theme/apisTheme';
import type { HiveWithRecord } from '../hooks/useOverwintering';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export type WinterStatus = 'survived' | 'lost' | 'weak';
export type Condition = 'strong' | 'medium' | 'weak';
export type StoresRemaining = 'none' | 'low' | 'adequate' | 'plenty';

export interface HiveWinterData {
  hiveId: string;
  hiveName: string;
  status: WinterStatus | null;
  condition?: Condition;
  storesRemaining?: StoresRemaining;
  firstInspectionNotes?: string;
}

interface HiveWinterStatusCardProps {
  /** Hive data with any existing record */
  hive: HiveWithRecord;
  /** Current form data for this hive */
  data: HiveWinterData;
  /** Callback when data changes */
  onChange: (data: HiveWinterData) => void;
  /** Winter season for post-mortem link */
  winterSeason: number;
  /** Whether the card is disabled */
  disabled?: boolean;
}

const STATUS_OPTIONS = [
  {
    value: 'survived' as const,
    label: 'Survived',
    icon: <CheckCircleOutlined />,
    color: colors.success,
  },
  {
    value: 'lost' as const,
    label: 'Lost',
    icon: <CloseCircleOutlined />,
    color: colors.error,
  },
  {
    value: 'weak' as const,
    label: 'Weak',
    icon: <WarningOutlined />,
    color: colors.warning,
  },
];

const CONDITION_OPTIONS: { value: Condition; label: string }[] = [
  { value: 'strong', label: 'Strong' },
  { value: 'medium', label: 'Medium' },
  { value: 'weak', label: 'Weak' },
];

const STORES_OPTIONS: { value: StoresRemaining; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'adequate', label: 'Adequate' },
  { value: 'plenty', label: 'Plenty' },
];

/**
 * Get border color based on status
 */
function getStatusBorderColor(status: WinterStatus | null): string {
  switch (status) {
    case 'survived':
      return colors.success;
    case 'lost':
      return colors.error;
    case 'weak':
      return colors.warning;
    default:
      return colors.border;
  }
}

/**
 * HiveWinterStatusCard Component
 *
 * Interactive card for documenting a hive's winter survival status.
 * Shows conditional fields based on survival status and links to
 * post-mortem wizard for lost hives.
 *
 * @example
 * <HiveWinterStatusCard
 *   hive={hiveWithRecord}
 *   data={formData}
 *   onChange={handleChange}
 *   winterSeason={2025}
 * />
 */
export function HiveWinterStatusCard({
  hive,
  data,
  onChange,
  winterSeason,
  disabled = false,
}: HiveWinterStatusCardProps) {
  const [detailsOpen, setDetailsOpen] = useState<string[]>([]);

  // Auto-expand details when status is survived or weak
  useEffect(() => {
    if (data.status === 'survived' || data.status === 'weak') {
      setDetailsOpen(['details']);
    } else {
      setDetailsOpen([]);
    }
  }, [data.status]);

  const handleStatusChange = (e: RadioChangeEvent) => {
    const newStatus = e.target.value as WinterStatus;
    onChange({
      ...data,
      status: newStatus,
      // Clear condition/stores/notes if status is "lost"
      condition: newStatus === 'lost' ? undefined : data.condition,
      storesRemaining: newStatus === 'lost' ? undefined : data.storesRemaining,
      firstInspectionNotes: newStatus === 'lost' ? undefined : data.firstInspectionNotes,
    });
  };

  const handleConditionChange = (e: RadioChangeEvent) => {
    onChange({
      ...data,
      condition: e.target.value as Condition,
    });
  };

  const handleStoresChange = (e: RadioChangeEvent) => {
    onChange({
      ...data,
      storesRemaining: e.target.value as StoresRemaining,
    });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({
      ...data,
      firstInspectionNotes: e.target.value,
    });
  };

  const borderColor = getStatusBorderColor(data.status);
  const hasExistingRecord = !!hive.existing_record;

  return (
    <Card
      style={{
        borderColor,
        borderWidth: 2,
        transition: 'border-color 0.2s ease',
      }}
      styles={{
        body: { padding: 16 },
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>
            {hive.hive_name}
          </Text>
          {hasExistingRecord && (
            <Tag color="orange" icon={<EditOutlined />}>
              Previously Recorded
            </Tag>
          )}
        </div>
      </div>

      {/* Status Selector */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Winter Outcome
        </Text>
        <Radio.Group
          value={data.status}
          onChange={handleStatusChange}
          disabled={disabled}
          buttonStyle="solid"
        >
          <Space>
            {STATUS_OPTIONS.map((option) => (
              <Radio.Button
                key={option.value}
                value={option.value}
                style={{
                  ...(data.status === option.value && {
                    backgroundColor: option.color,
                    borderColor: option.color,
                    color: 'white',
                  }),
                }}
              >
                <Space>
                  {option.icon}
                  {option.label}
                </Space>
              </Radio.Button>
            ))}
          </Space>
        </Radio.Group>
      </div>

      {/* Lost hive - show post-mortem link */}
      {data.status === 'lost' && (
        <div
          style={{
            padding: 12,
            background: `${colors.error}10`,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <Paragraph style={{ margin: 0 }}>
            <CloseCircleOutlined style={{ color: colors.error, marginRight: 8 }} />
            Sorry to hear about this loss. Please complete the{' '}
            <Link
              to={`/hives/${hive.hive_id}/loss?winter_season=${winterSeason}`}
              style={{ color: colors.seaBuckthorn, fontWeight: 600 }}
            >
              post-mortem wizard
            </Link>{' '}
            to help understand what happened.
          </Paragraph>
        </div>
      )}

      {/* Survived/Weak - show details */}
      {(data.status === 'survived' || data.status === 'weak') && (
        <Collapse
          activeKey={detailsOpen}
          onChange={(keys) => setDetailsOpen(keys as string[])}
          ghost
          items={[
            {
              key: 'details',
              label: (
                <Text type="secondary">
                  First Inspection Details
                </Text>
              ),
              children: (
                <div>
                  {/* Colony Strength */}
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      Colony Strength
                    </Text>
                    <Radio.Group
                      value={data.condition}
                      onChange={handleConditionChange}
                      disabled={disabled}
                    >
                      <Space direction="vertical">
                        {CONDITION_OPTIONS.map((option) => (
                          <Radio key={option.value} value={option.value}>
                            {option.label}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                  </div>

                  {/* Stores Remaining */}
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      Stores Remaining
                    </Text>
                    <Radio.Group
                      value={data.storesRemaining}
                      onChange={handleStoresChange}
                      disabled={disabled}
                    >
                      <Space direction="vertical">
                        {STORES_OPTIONS.map((option) => (
                          <Radio key={option.value} value={option.value}>
                            {option.label}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                  </div>

                  {/* First Inspection Notes */}
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      First Inspection Notes
                    </Text>
                    <TextArea
                      value={data.firstInspectionNotes || ''}
                      onChange={handleNotesChange}
                      placeholder="Any observations from your first spring inspection..."
                      rows={3}
                      disabled={disabled}
                      maxLength={500}
                      showCount
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export default HiveWinterStatusCard;
