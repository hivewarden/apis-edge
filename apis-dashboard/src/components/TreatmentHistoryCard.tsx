/**
 * TreatmentHistoryCard Component
 *
 * Displays treatment history for a hive in a card format.
 * Shows treatments sorted by date with efficacy indicators.
 *
 * Part of Epic 6, Story 6.1 (Treatment Log)
 */
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Empty,
  Spin,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  MedicineBoxOutlined,
  PlusOutlined,
  ExperimentOutlined,
  DeleteOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { colors } from '../theme/apisTheme';

dayjs.extend(relativeTime);
import {
  type Treatment,
  formatTreatmentType,
  formatTreatmentMethod,
} from '../hooks/useTreatments';

const { Text } = Typography;

interface TreatmentHistoryCardProps {
  treatments: Treatment[];
  loading?: boolean;
  error?: boolean;
  onLogTreatment: () => void;
  onAddFollowup: (treatment: Treatment) => void;
  onDelete: (id: string) => Promise<void>;
  deleting?: boolean;
}

/**
 * Renders efficacy display with color coding.
 */
function EfficacyDisplay({ efficacy }: { efficacy: number | undefined }) {
  if (efficacy === undefined) {
    return <Text type="secondary">-</Text>;
  }

  const isReduction = efficacy >= 0;
  const absEfficacy = Math.abs(efficacy);
  const color =
    efficacy >= 80
      ? colors.success
      : efficacy >= 50
      ? colors.warning
      : efficacy < 0
      ? colors.error
      : colors.textMuted;

  return (
    <Space size={4}>
      {isReduction ? (
        <ArrowDownOutlined style={{ color, fontSize: 12 }} />
      ) : (
        <ArrowUpOutlined style={{ color, fontSize: 12 }} />
      )}
      <Text style={{ color, fontWeight: 600 }}>
        {absEfficacy}%
      </Text>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {isReduction ? 'reduction' : 'increase'}
      </Text>
    </Space>
  );
}

/**
 * Treatment History Card
 *
 * Displays a table of treatments with:
 * - Date, type, method, dose
 * - Mite counts (before/after)
 * - Efficacy indicator
 * - Actions (add follow-up, delete)
 */
export function TreatmentHistoryCard({
  treatments,
  loading = false,
  error = false,
  onLogTreatment,
  onAddFollowup,
  onDelete,
  deleting = false,
}: TreatmentHistoryCardProps) {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'treated_at',
      key: 'treated_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Treatment',
      dataIndex: 'treatment_type',
      key: 'treatment_type',
      render: (type: string, record: Treatment) => (
        <div>
          <Text strong>{formatTreatmentType(type)}</Text>
          {record.method && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatTreatmentMethod(record.method)}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Dose',
      dataIndex: 'dose',
      key: 'dose',
      width: 100,
      render: (dose: string | undefined) => (
        <Text type={dose ? undefined : 'secondary'}>{dose || '-'}</Text>
      ),
    },
    {
      title: 'Mite Count',
      key: 'mite_counts',
      width: 120,
      render: (_: unknown, record: Treatment) => {
        const before = record.mite_count_before;
        const after = record.mite_count_after;

        if (before === undefined && after === undefined) {
          return <Text type="secondary">-</Text>;
        }

        return (
          <Space direction="vertical" size={0}>
            {before !== undefined && (
              <Text style={{ fontSize: 12 }}>
                Before: <strong>{before}</strong>
              </Text>
            )}
            {after !== undefined && (
              <Text style={{ fontSize: 12 }}>
                After: <strong>{after}</strong>
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Efficacy',
      key: 'efficacy',
      width: 130,
      render: (_: unknown, record: Treatment) => {
        // If has both counts, show efficacy
        if (record.mite_count_before !== undefined && record.mite_count_after !== undefined) {
          return <EfficacyDisplay efficacy={record.efficacy} />;
        }
        // If only has before, show "add follow-up" option
        if (record.mite_count_before !== undefined) {
          return (
            <Tooltip title="Add follow-up mite count to calculate efficacy">
              <Button
                type="link"
                size="small"
                icon={<ExperimentOutlined />}
                onClick={() => onAddFollowup(record)}
                style={{ padding: 0 }}
              >
                Add follow-up
              </Button>
            </Tooltip>
          );
        }
        // If no before count, guide user
        return (
          <Tooltip title="Add a 'before' mite count when logging treatments to track efficacy">
            <Text type="secondary" style={{ fontSize: 12 }}>No count</Text>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: Treatment) => (
        <Popconfirm
          title="Delete treatment?"
          description="This action cannot be undone."
          onConfirm={() => onDelete(record.id)}
          okText="Delete"
          okType="danger"
          cancelText="Cancel"
        >
          <Button
            type="default"
            shape="circle"
            icon={<DeleteOutlined style={{ fontSize: 14 }} />}
            loading={deleting}
            style={{
              minWidth: 36,
              width: 36,
              height: 36,
              color: '#c4857a',
              borderColor: 'rgba(196, 133, 122, 0.45)',
              backgroundColor: 'rgba(196, 133, 122, 0.1)',
            }}
          />
        </Popconfirm>
      ),
    },
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin size="small" />
          <Text type="secondary" style={{ marginLeft: 8 }}>
            Loading treatments...
          </Text>
        </div>
      );
    }

    if (error) {
      return (
        <Empty
          description="Failed to load treatments"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    if (treatments.length === 0) {
      return (
        <Empty
          description="No treatments recorded yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Track varroa treatments to monitor hive health and treatment efficacy.
          </Text>
        </Empty>
      );
    }

    return (
      <Table
        dataSource={treatments}
        columns={columns}
        rowKey="id"
        pagination={
          treatments.length > 5
            ? { pageSize: 5, size: 'small', showSizeChanger: false }
            : false
        }
        size="small"
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '8px 0' }}>
              {record.weather && (
                <div>
                  <Text type="secondary">Weather: </Text>
                  <Text>{record.weather}</Text>
                </div>
              )}
              {record.notes && (
                <div style={{ marginTop: record.weather ? 4 : 0 }}>
                  <Text type="secondary">Notes: </Text>
                  <Text>{record.notes}</Text>
                </div>
              )}
              {!record.weather && !record.notes && (
                <Text type="secondary">No additional details</Text>
              )}
            </div>
          ),
          rowExpandable: (record) => !!(record.weather || record.notes),
        }}
      />
    );
  };

  return (
    <Card
      title={
        <Space>
          <MedicineBoxOutlined style={{ color: colors.seaBuckthorn }} />
          Treatment History
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onLogTreatment}
        >
          Log Treatment
        </Button>
      }
    >
      {renderContent()}

      {/* Summary stats if treatments exist */}
      {treatments.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: 'rgba(247, 164, 45, 0.06)',
            borderRadius: 8,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total Treatments
            </Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {treatments.length}
              </Text>
            </div>
          </div>

          {treatments[0] && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Last Treatment
              </Text>
              <div>
                <Text strong>
                  {dayjs(treatments[0].treated_at).format('MMM D, YYYY')}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({dayjs(treatments[0].treated_at).fromNow()})
                </Text>
              </div>
            </div>
          )}

          {/* Average efficacy if any */}
          {(() => {
            const withEfficacy = treatments.filter(
              (t) => t.efficacy !== undefined
            );
            if (withEfficacy.length === 0) return null;
            const avgEfficacy = Math.round(
              withEfficacy.reduce((sum, t) => sum + (t.efficacy || 0), 0) /
                withEfficacy.length
            );
            return (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Avg. Efficacy
                </Text>
                <div>
                  <Tag
                    color={
                      avgEfficacy >= 80
                        ? 'success'
                        : avgEfficacy >= 50
                        ? 'warning'
                        : 'error'
                    }
                  >
                    {avgEfficacy}% reduction
                  </Tag>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}

export default TreatmentHistoryCard;
