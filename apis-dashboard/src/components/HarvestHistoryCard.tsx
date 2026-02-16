/**
 * HarvestHistoryCard Component
 *
 * Displays harvest history for a hive in a card format.
 * Shows harvests sorted by date with season totals and per-hive breakdown.
 *
 * Part of Epic 6, Story 6.3 (Harvest Tracking)
 */
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Empty,
  Spin,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  GiftOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { colors } from '../theme/apisTheme';
import type { Harvest } from '../hooks/useHarvests';
import { formatKg, getCurrentSeasonLabel } from '../hooks/useHarvests';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface HarvestHistoryCardProps {
  harvests: Harvest[];
  loading?: boolean;
  error?: boolean;
  onLogHarvest: () => void;
  onEdit?: (harvest: Harvest) => void;
  onDelete: (id: string) => Promise<void>;
  deleting?: boolean;
  /** Current season totals in kg */
  seasonTotalKg?: number;
  /** Number of harvests this season */
  seasonHarvestCount?: number;
}

/**
 * Harvest History Card
 *
 * Displays a table of harvests with:
 * - Date, frames, total amount
 * - Per-hive breakdown (expandable)
 * - Quality notes
 * - Season totals summary
 */
export function HarvestHistoryCard({
  harvests,
  loading = false,
  error = false,
  onLogHarvest,
  onEdit,
  onDelete,
  deleting = false,
  seasonTotalKg = 0,
  seasonHarvestCount = 0,
}: HarvestHistoryCardProps) {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'harvested_at',
      key: 'harvested_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Harvest',
      key: 'harvest',
      render: (_: unknown, record: Harvest) => {
        const totalFrames = record.hives?.reduce(
          (sum, h) => sum + (h.frames || 0),
          0
        );
        return (
          <div>
            <Text strong style={{ color: colors.seaBuckthorn }}>
              {formatKg(record.total_kg)}
            </Text>
            {totalFrames !== undefined && totalFrames > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {totalFrames} frame{totalFrames !== 1 ? 's' : ''}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Hives',
      key: 'hives',
      width: 160,
      render: (_: unknown, record: Harvest) => {
        if (!record.hives || record.hives.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        if (record.hives.length <= 2) {
          return (
            <Space wrap size={4}>
              {record.hives.map((h) => (
                <Tag key={h.hive_id} color="gold">
                  {h.hive_name}: {h.amount_kg.toFixed(1)}kg
                </Tag>
              ))}
            </Space>
          );
        }
        // More than 2 hives - show count with tooltip
        return (
          <Tooltip
            title={record.hives
              .map((h) => `${h.hive_name}: ${h.amount_kg.toFixed(1)}kg`)
              .join(', ')}
          >
            <Tag color="gold">
              {record.hives.length} hives
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_: unknown, record: Harvest) => (
        <Space size={4}>
          {onEdit && (
            <Button
              type="default"
              shape="circle"
              icon={<EditOutlined style={{ fontSize: 14 }} />}
              onClick={() => onEdit(record)}
              style={{
                minWidth: 36,
                width: 36,
                height: 36,
                color: '#9d7a48',
                borderColor: 'rgba(157, 122, 72, 0.45)',
                backgroundColor: 'rgba(157, 122, 72, 0.1)',
              }}
            />
          )}
          <Popconfirm
            title="Delete harvest?"
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
        </Space>
      ),
    },
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin size="small" />
          <Text type="secondary" style={{ marginLeft: 8 }}>
            Loading harvests...
          </Text>
        </div>
      );
    }

    if (error) {
      return (
        <Empty
          description="Failed to load harvests"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    if (harvests.length === 0) {
      return (
        <Empty
          description="No harvests recorded yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Track your honey harvests to monitor yields over time.
          </Text>
        </Empty>
      );
    }

    return (
      <Table
        dataSource={harvests}
        columns={columns}
        rowKey="id"
        pagination={
          harvests.length > 5
            ? { pageSize: 5, size: 'small', showSizeChanger: false }
            : false
        }
        size="small"
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '8px 0' }}>
              {record.notes ? (
                <>
                  <Text type="secondary">Quality notes: </Text>
                  <Text>{record.notes}</Text>
                </>
              ) : (
                <Text type="secondary" italic>
                  No quality notes recorded
                </Text>
              )}
            </div>
          ),
          rowExpandable: () => true,
        }}
      />
    );
  };

  return (
    <Card
      title={
        <Space>
          <GiftOutlined style={{ color: colors.seaBuckthorn }} />
          Harvest History
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onLogHarvest}
          style={{
            background: colors.seaBuckthorn,
          }}
        >
          Log Harvest
        </Button>
      }
    >
      {renderContent()}

      {/* Season totals summary */}
      {(harvests.length > 0 || seasonTotalKg > 0) && (
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
              Total Harvests
            </Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {harvests.length}
              </Text>
            </div>
          </div>

          {harvests[0] && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Last Harvest
              </Text>
              <div>
                <Text strong>
                  {dayjs(harvests[0].harvested_at).format('MMM D, YYYY')}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({dayjs(harvests[0].harvested_at).fromNow()})
                </Text>
              </div>
            </div>
          )}

          {/* Season totals */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {getCurrentSeasonLabel()} (Apr-Mar)
            </Text>
            <div>
              <Text strong style={{ color: colors.seaBuckthorn, fontSize: 18 }}>
                {seasonTotalKg.toFixed(1)} kg
              </Text>
              <Text type="secondary" style={{ marginLeft: 8 }}>
                from {seasonHarvestCount} harvest
                {seasonHarvestCount !== 1 ? 's' : ''}
              </Text>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default HarvestHistoryCard;
