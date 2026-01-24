import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  message,
  Modal,
  Empty,
  Badge,
  Tag,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  KeyOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';
import { APIKeyModal } from '../components/APIKeyModal';
import { LiveStream } from '../components/LiveStream';

const { Title, Text } = Typography;

interface Unit {
  id: string;
  serial: string;
  name: string | null;
  site_id: string | null;
  site_name: string | null;
  firmware_version: string | null;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

interface UnitResponse {
  data: Unit;
}

interface RegenerateKeyResponse {
  data: {
    api_key: string;
  };
  warning: string;
}

/**
 * Unit Detail Page
 *
 * Displays detailed information about a single APIS unit.
 * Allows editing, deletion, and API key regeneration.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showLiveStream, setShowLiveStream] = useState(false);

  const fetchUnit = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<UnitResponse>(`/units/${id}`);
      setUnit(response.data.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Unit not found');
      } else {
        message.error('Failed to load unit');
      }
      navigate('/units');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (id) {
      fetchUnit();
    }
  }, [id, fetchUnit]);

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Unit',
      content: `Are you sure you want to delete "${unit?.name || unit?.serial}"? This action cannot be undone and the API key will be invalidated.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeleting(true);
          await apiClient.delete(`/units/${id}`);
          message.success('Unit deleted successfully');
          navigate('/units');
        } catch {
          message.error('Failed to delete unit');
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleRegenerateKey = () => {
    Modal.confirm({
      title: 'Regenerate API Key',
      content: 'Are you sure? The current API key will be invalidated immediately and any connected devices will stop working until reconfigured.',
      okText: 'Regenerate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setRegenerating(true);
          const response = await apiClient.post<RegenerateKeyResponse>(`/units/${id}/regenerate-key`);
          setNewApiKey(response.data.data.api_key);
          setShowKeyModal(true);
          message.success('API key regenerated successfully');
        } catch {
          message.error('Failed to regenerate API key');
        } finally {
          setRegenerating(false);
        }
      },
    });
  };

  const handleKeyModalClose = () => {
    setShowKeyModal(false);
    setNewApiKey(null);
  };

  const handleEdit = () => {
    navigate(`/units/${id}/edit`);
  };

  const handleBack = () => {
    navigate('/units');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge status="success" text="Online" />;
      case 'error':
        return <Badge status="error" text="Error" />;
      default:
        return <Badge status="default" text="Offline" />;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!unit) {
    return (
      <Empty description="Unit not found">
        <Button onClick={handleBack}>Back to Units</Button>
      </Empty>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>{unit.name || unit.serial}</Title>
          {getStatusBadge(unit.status)}
        </Space>
        <Space>
          <Button
            type={showLiveStream ? 'default' : 'primary'}
            icon={<VideoCameraOutlined />}
            onClick={() => setShowLiveStream(!showLiveStream)}
            disabled={unit.status !== 'online' && !showLiveStream}
          >
            {showLiveStream ? 'Hide Live Feed' : 'View Live Feed'}
          </Button>
          <Button
            icon={<KeyOutlined />}
            onClick={handleRegenerateKey}
            loading={regenerating}
          >
            Regenerate Key
          </Button>
          <Button icon={<EditOutlined />} onClick={handleEdit}>
            Edit
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            loading={deleting}
          >
            Delete
          </Button>
        </Space>
      </div>

      {/* Live Stream - Story 2.5 */}
      {showLiveStream && unit && (
        <LiveStream
          unitId={unit.id}
          unitStatus={unit.status}
          onClose={() => setShowLiveStream(false)}
        />
      )}

      <Card title="Unit Information">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label="Serial Number">{unit.serial}</Descriptions.Item>
          <Descriptions.Item label="Name">{unit.name || <Text type="secondary">Not set</Text>}</Descriptions.Item>
          <Descriptions.Item label="Status">{getStatusBadge(unit.status)}</Descriptions.Item>
          <Descriptions.Item label="Assigned Site">
            {unit.site_name || <Text type="secondary">Not assigned</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Firmware Version">
            {unit.firmware_version ? (
              <Tag color="blue">v{unit.firmware_version}</Tag>
            ) : (
              <Text type="secondary">Unknown</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Last Seen">
            {unit.last_seen ? (
              new Date(unit.last_seen).toLocaleString()
            ) : (
              <Text type="secondary">Never</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Registered">
            {new Date(unit.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Last Updated">
            {new Date(unit.updated_at).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Refresh button for status */}
      <div style={{ marginTop: 16 }}>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchUnit}
          loading={loading}
        >
          Refresh Status
        </Button>
      </div>

      {newApiKey && (
        <APIKeyModal
          visible={showKeyModal}
          apiKey={newApiKey}
          onClose={handleKeyModalClose}
          isRegenerate={true}
        />
      )}
    </div>
  );
}

export default UnitDetail;
