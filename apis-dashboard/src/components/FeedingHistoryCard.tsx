/**
 * FeedingHistoryCard Component
 *
 * Displays feeding history for a hive in a card format.
 * Shows feedings sorted by date with season totals.
 *
 * Part of Epic 6, Story 6.2 (Feeding Log)
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
} from 'antd';
import {
  CoffeeOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { colors } from '../theme/apisTheme';

dayjs.extend(relativeTime);

import {
  type Feeding,
  type SeasonTotal,
  formatFeedType,
  formatAmount,
} from '../hooks/useFeedings';

const { Text } = Typography;

interface FeedingHistoryCardProps {
  feedings: Feeding[];
  seasonTotals: SeasonTotal[];
  loading?: boolean;
  error?: boolean;
  onLogFeeding: () => void;
  onEdit: (feeding: Feeding) => void;
  onDelete: (id: string) => Promise<void>;
  deleting?: boolean;
}

/**
 * Formats season totals for display.
 */
function formatSeasonTotals(totals: SeasonTotal[]): string {
  if (totals.length === 0) return 'No feedings this season';

  return totals
    .map((t) => `${t.total} ${t.unit} ${formatFeedType(t.feed_type).toLowerCase()}`)
    .join(', ');
}

/**
 * Feeding History Card
 *
 * Displays a table of feedings with:
 * - Date, type, amount
 * - Concentration (for syrup)
 * - Notes
 * - Season totals summary
 */
export function FeedingHistoryCard({
  feedings,
  seasonTotals,
  loading = false,
  error = false,
  onLogFeeding,
  onEdit,
  onDelete,
  deleting = false,
}: FeedingHistoryCardProps) {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'fed_at',
      key: 'fed_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Feed Type',
      dataIndex: 'feed_type',
      key: 'feed_type',
      render: (type: string, record: Feeding) => (
        <div>
          <Text strong>{formatFeedType(type)}</Text>
          {record.concentration && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.concentration}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 100,
      render: (_: unknown, record: Feeding) => (
        <Text>{formatAmount(record.amount, record.unit)}</Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_: unknown, record: Feeding) => (
        <Space size={4}>
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
          <Popconfirm
            title="Delete feeding?"
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
            Loading feedings...
          </Text>
        </div>
      );
    }

    if (error) {
      return (
        <Empty
          description="Failed to load feedings"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    if (feedings.length === 0) {
      return (
        <Empty
          description="No feedings recorded yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Track feedings to monitor hive nutrition and consumption.
          </Text>
        </Empty>
      );
    }

    return (
      <Table
        dataSource={feedings}
        columns={columns}
        rowKey="id"
        pagination={
          feedings.length > 5
            ? { pageSize: 5, size: 'small', showSizeChanger: false }
            : false
        }
        size="small"
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '8px 0' }}>
              <Text type="secondary">Notes: </Text>
              <Text>{record.notes || 'No notes recorded'}</Text>
            </div>
          ),
          rowExpandable: (record) => !!record.notes,
        }}
      />
    );
  };

  return (
    <Card
      title={
        <Space>
          <CoffeeOutlined style={{ color: colors.seaBuckthorn }} />
          Feeding History
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onLogFeeding}
        >
          Log Feeding
        </Button>
      }
    >
      {renderContent()}

      {/* Season totals summary */}
      {(feedings.length > 0 || seasonTotals.length > 0) && (
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
              Total Feedings
            </Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {feedings.length}
              </Text>
            </div>
          </div>

          {feedings[0] && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Last Feeding
              </Text>
              <div>
                <Text strong>
                  {dayjs(feedings[0].fed_at).format('MMM D, YYYY')}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({dayjs(feedings[0].fed_at).fromNow()})
                </Text>
              </div>
            </div>
          )}

          {/* Season totals */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              This Season (Apr-Mar)
            </Text>
            <div>
              <Text strong>
                {formatSeasonTotals(seasonTotals)}
              </Text>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default FeedingHistoryCard;
