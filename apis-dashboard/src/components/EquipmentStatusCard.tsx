/**
 * EquipmentStatusCard Component
 *
 * Displays equipment status for a hive in a card format.
 * Shows two sections: Currently Installed and Equipment History.
 *
 * Part of Epic 6, Story 6.4 (Equipment Log)
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
  Divider,
  Tooltip,
} from 'antd';
import {
  ToolOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { colors } from '../theme/apisTheme';
import {
  type CurrentlyInstalledEquipment,
  type EquipmentHistoryItem,
  type EquipmentLog,
  formatDuration,
} from '../hooks/useEquipment';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface EquipmentStatusCardProps {
  currentlyInstalled: CurrentlyInstalledEquipment[];
  equipmentHistory: EquipmentHistoryItem[];
  equipmentLogs: EquipmentLog[];
  loading?: boolean;
  error?: boolean;
  onLogEquipment: () => void;
  onRemoveEquipment: (equipmentType: string) => void;
  onEdit: (log: EquipmentLog) => void;
  onDelete: (id: string) => Promise<void>;
  deleting?: boolean;
}

/**
 * Equipment Status Card
 *
 * Displays equipment status with:
 * - Currently Installed section with remove buttons
 * - Equipment History section with dates and durations
 */
export function EquipmentStatusCard({
  currentlyInstalled,
  equipmentHistory,
  equipmentLogs,
  loading = false,
  error = false,
  onLogEquipment,
  onRemoveEquipment,
  onEdit,
  onDelete,
  deleting = false,
}: EquipmentStatusCardProps) {
  // Columns for currently installed equipment
  const installedColumns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment_label',
      key: 'equipment_label',
      render: (label: string, record: CurrentlyInstalledEquipment) => (
        record.notes ? (
          <Tooltip title={record.notes}>
            <Text strong style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>{label}</Text>
          </Tooltip>
        ) : (
          <Text strong>{label}</Text>
        )
      ),
    },
    {
      title: 'Installed',
      dataIndex: 'installed_at',
      key: 'installed_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'days_installed',
      key: 'days_installed',
      width: 100,
      render: (days: number) => (
        <Text type="secondary">{formatDuration(days)}</Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: CurrentlyInstalledEquipment) => (
        <Button
          type="link"
          size="small"
          icon={<MinusCircleOutlined />}
          onClick={() => onRemoveEquipment(record.equipment_type)}
          style={{ padding: 0 }}
        >
          Remove
        </Button>
      ),
    },
  ];

  // Columns for equipment history
  const historyColumns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment_label',
      key: 'equipment_label',
      render: (label: string, record: EquipmentHistoryItem) => (
        record.notes ? (
          <Tooltip title={record.notes}>
            <Text style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>{label}</Text>
          </Tooltip>
        ) : (
          <Text>{label}</Text>
        )
      ),
    },
    {
      title: 'Period',
      key: 'period',
      render: (_: unknown, record: EquipmentHistoryItem) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(record.installed_at).format('MMM D')} - {dayjs(record.removed_at).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_days',
      key: 'duration_days',
      width: 100,
      render: (days: number) => (
        <Text type="secondary">{formatDuration(days)}</Text>
      ),
    },
  ];

  // Columns for all equipment logs (for edit/delete)
  const logsColumns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment_label',
      key: 'equipment_label',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (action: string) => (
        <Text style={{ textTransform: 'capitalize' }}>{action}</Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'logged_at',
      key: 'logged_at',
      width: 120,
      render: (date: string) => (
        <Text style={{ whiteSpace: 'nowrap' }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: EquipmentLog) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
          <Popconfirm
            title="Delete log entry?"
            description="This action cannot be undone."
            onConfirm={() => onDelete(record.id)}
            okText="Delete"
            okType="danger"
            cancelText="Cancel"
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
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
            Loading equipment...
          </Text>
        </div>
      );
    }

    if (error) {
      return (
        <Empty
          description="Failed to load equipment"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    const hasData = currentlyInstalled.length > 0 || equipmentHistory.length > 0;

    if (!hasData) {
      return (
        <Empty
          description="No equipment recorded yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            Track equipment installed on this hive for seasonal management.
          </Text>
        </Empty>
      );
    }

    return (
      <>
        {/* Currently Installed Section */}
        <div>
          <Text strong style={{ fontSize: 14, color: colors.seaBuckthorn }}>
            Currently Installed
          </Text>
          {currentlyInstalled.length === 0 ? (
            <div style={{ padding: '12px 0' }}>
              <Text type="secondary">No equipment currently installed</Text>
            </div>
          ) : (
            <Table
              dataSource={currentlyInstalled}
              columns={installedColumns}
              rowKey="id"
              pagination={false}
              size="small"
              style={{ marginTop: 8 }}
            />
          )}
        </div>

        {/* Equipment History Section */}
        {equipmentHistory.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <div>
              <Text strong style={{ fontSize: 14 }}>
                Equipment History
              </Text>
              <Table
                dataSource={equipmentHistory}
                columns={historyColumns}
                rowKey={(record, index) => `${record.equipment_type}-${record.installed_at}-${record.removed_at}-${index}`}
                pagination={
                  equipmentHistory.length > 5
                    ? { pageSize: 5, size: 'small', showSizeChanger: false }
                    : false
                }
                size="small"
                style={{ marginTop: 8 }}
              />
            </div>
          </>
        )}

        {/* All Logs Section (for edit/delete) */}
        {equipmentLogs.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <details style={{ cursor: 'pointer' }}>
              <summary style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  All Log Entries ({equipmentLogs.length})
                </Text>
              </summary>
              <Table
                dataSource={equipmentLogs}
                columns={logsColumns}
                rowKey="id"
                pagination={
                  equipmentLogs.length > 5
                    ? { pageSize: 5, size: 'small', showSizeChanger: false }
                    : false
                }
                size="small"
              />
            </details>
          </>
        )}
      </>
    );
  };

  return (
    <Card
      title={
        <Space>
          <ToolOutlined style={{ color: colors.seaBuckthorn }} />
          Equipment
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onLogEquipment}
        >
          Log Equipment
        </Button>
      }
    >
      {renderContent()}

      {/* Summary stats */}
      {(currentlyInstalled.length > 0 || equipmentHistory.length > 0) && (
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
              Currently Installed
            </Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {currentlyInstalled.length}
              </Text>
            </div>
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total Tracked
            </Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {equipmentLogs.length}
              </Text>
              <Text type="secondary" style={{ marginLeft: 4 }}>
                entries
              </Text>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default EquipmentStatusCard;
