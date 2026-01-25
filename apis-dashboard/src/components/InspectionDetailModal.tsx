import { useState, useEffect } from 'react';
import { Modal, Descriptions, Tag, Space, Button, Popconfirm, message, Table, Collapse, Typography, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, ExperimentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface FrameData {
  box_position: number;
  box_type: string;
  total_frames: number;
  drawn_frames: number;
  brood_frames: number;
  honey_frames: number;
  pollen_frames: number;
}

interface Inspection {
  id: string;
  hive_id: string;
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string | null;
  frames?: FrameData[];
  created_at: string;
  updated_at: string;
}

interface InspectionDetailModalProps {
  inspection: Inspection | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

// Issue code to human-readable label mapping
const ISSUE_LABELS: Record<string, string> = {
  dwv: 'DWV (Deformed Wing Virus)',
  chalkbrood: 'Chalkbrood',
  wax_moth: 'Wax Moth',
  robbing: 'Robbing',
};

const formatIssue = (issue: string): string => {
  if (issue.startsWith('other:')) {
    return `Other: ${issue.substring(6)}`;
  }
  return ISSUE_LABELS[issue] || issue;
};

const formatBoolean = (value: boolean | null): React.ReactNode => {
  if (value === null) return <Tag>Not recorded</Tag>;
  return value ? <Tag color="success">Yes</Tag> : <Tag color="default">No</Tag>;
};

/**
 * Modal component for displaying inspection details.
 * Shows all recorded inspection data with options to edit (within 24 hours) or delete.
 * Fetches full inspection data (including frames) when modal opens.
 *
 * Part of Epic 5, Story 5.4: Inspection History View
 */
export function InspectionDetailModal({
  inspection,
  open,
  onClose,
  onDeleted,
}: InspectionDetailModalProps) {
  const navigate = useNavigate();
  const [fullInspection, setFullInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch full inspection data (with frames) when modal opens
  useEffect(() => {
    if (open && inspection) {
      setLoading(true);
      apiClient
        .get<{ data: Inspection }>(`/inspections/${inspection.id}`)
        .then((response) => {
          setFullInspection(response.data.data);
        })
        .catch(() => {
          // Fall back to the inspection from list if fetch fails
          setFullInspection(inspection);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setFullInspection(null);
    }
  }, [open, inspection]);

  if (!inspection) return null;

  // Use full inspection data if available, otherwise fall back to list data
  const displayInspection = fullInspection || inspection;

  // Check if within 24-hour edit window
  const createdAt = dayjs(displayInspection.created_at);
  const isEditable = dayjs().diff(createdAt, 'hour') < 24;

  const handleEdit = () => {
    onClose();
    navigate(`/inspections/${displayInspection.id}/edit`);
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/inspections/${displayInspection.id}`);
      message.success('Inspection deleted successfully');
      onClose();
      onDeleted();
    } catch {
      message.error('Failed to delete inspection');
    }
  };

  return (
    <Modal
      title={`Inspection: ${dayjs(displayInspection.inspected_at).format('MMMM D, YYYY')}`}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Popconfirm
            title="Delete this inspection?"
            description="This action cannot be undone."
            onConfirm={handleDelete}
            okText="Delete"
            okType="danger"
          >
            <Button danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
          {isEditable ? (
            <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
              Edit
            </Button>
          ) : (
            <Button type="primary" disabled title="Edit window expired (24 hours)">
              Edit (expired)
            </Button>
          )}
        </Space>
      }
      width={600}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Loading inspection details...
          </Text>
        </div>
      ) : (
        <>
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="Date" span={2}>
          {dayjs(displayInspection.inspected_at).format('MMMM D, YYYY')}
        </Descriptions.Item>

        {/* Queen observations */}
        <Descriptions.Item label="Queen Seen">
          {formatBoolean(displayInspection.queen_seen)}
        </Descriptions.Item>
        <Descriptions.Item label="Eggs Seen">
          {formatBoolean(displayInspection.eggs_seen)}
        </Descriptions.Item>
        <Descriptions.Item label="Queen Cells" span={2}>
          {formatBoolean(displayInspection.queen_cells)}
        </Descriptions.Item>

        {/* Brood */}
        <Descriptions.Item label="Brood Frames">
          {displayInspection.brood_frames !== null ? displayInspection.brood_frames : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Brood Pattern">
          {displayInspection.brood_pattern ? (
            <Tag
              color={
                displayInspection.brood_pattern === 'good'
                  ? 'success'
                  : displayInspection.brood_pattern === 'spotty'
                  ? 'warning'
                  : 'error'
              }
            >
              {displayInspection.brood_pattern}
            </Tag>
          ) : (
            '-'
          )}
        </Descriptions.Item>

        {/* Stores */}
        <Descriptions.Item label="Honey Level">
          {displayInspection.honey_level ? (
            <Tag color="gold">{displayInspection.honey_level}</Tag>
          ) : (
            '-'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Pollen Level">
          {displayInspection.pollen_level ? (
            <Tag color="orange">{displayInspection.pollen_level}</Tag>
          ) : (
            '-'
          )}
        </Descriptions.Item>

        {/* Temperament */}
        <Descriptions.Item label="Temperament" span={2}>
          {displayInspection.temperament || '-'}
        </Descriptions.Item>

        {/* Issues */}
        <Descriptions.Item label="Issues" span={2}>
          {displayInspection.issues.length > 0 ? (
            <Space wrap>
              {displayInspection.issues.map((issue, idx) => (
                <Tag key={idx} color="warning">
                  {formatIssue(issue)}
                </Tag>
              ))}
            </Space>
          ) : (
            'None'
          )}
        </Descriptions.Item>

        {/* Notes */}
        <Descriptions.Item label="Notes" span={2}>
          {displayInspection.notes || '-'}
        </Descriptions.Item>

        {/* Metadata */}
        <Descriptions.Item label="Created">
          {dayjs(displayInspection.created_at).format('MMM D, YYYY h:mm A')}
        </Descriptions.Item>
        <Descriptions.Item label="Updated">
          {dayjs(displayInspection.updated_at).format('MMM D, YYYY h:mm A')}
        </Descriptions.Item>
      </Descriptions>

      {/* Frame Data (Advanced Mode) */}
      {displayInspection.frames && displayInspection.frames.length > 0 && (
        <Collapse
          ghost
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'frames',
              label: (
                <Space>
                  <ExperimentOutlined style={{ color: colors.seaBuckthorn }} />
                  <Text strong>Frame-Level Data</Text>
                  <Text type="secondary">({displayInspection.frames.length} boxes)</Text>
                </Space>
              ),
              children: (
                <Table
                  dataSource={displayInspection.frames}
                  rowKey="box_position"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: 'Box',
                      key: 'box',
                      render: (_: unknown, record: FrameData) => (
                        <Tag color={record.box_type === 'brood' ? colors.brownBramble : colors.seaBuckthorn}>
                          {record.box_type === 'brood' ? `Brood ${record.box_position}` : `Super ${record.box_position}`}
                        </Tag>
                      ),
                    },
                    { title: 'Total', dataIndex: 'total_frames', key: 'total' },
                    { title: 'Drawn', dataIndex: 'drawn_frames', key: 'drawn' },
                    {
                      title: 'Brood',
                      dataIndex: 'brood_frames',
                      key: 'brood',
                      render: (v: number) => v > 0 ? <Tag color="#8B4513">{v}</Tag> : '-',
                    },
                    {
                      title: 'Honey',
                      dataIndex: 'honey_frames',
                      key: 'honey',
                      render: (v: number) => v > 0 ? <Tag color={colors.seaBuckthorn}>{v}</Tag> : '-',
                    },
                    {
                      title: 'Pollen',
                      dataIndex: 'pollen_frames',
                      key: 'pollen',
                      render: (v: number) => v > 0 ? <Tag color="#FFA500">{v}</Tag> : '-',
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      )}

      {!isEditable && (
        <div
          style={{
            marginTop: 16,
            padding: 8,
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            borderRadius: 4,
            fontSize: 12,
            color: '#666',
          }}
        >
          Note: This inspection was created more than 24 hours ago and can no longer be edited.
        </div>
      )}
        </>
      )}
    </Modal>
  );
}

export default InspectionDetailModal;
