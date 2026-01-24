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
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';

const { Title, Text } = Typography;

interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface SiteResponse {
  data: Site;
}

/**
 * Site Detail Page
 *
 * Displays detailed information about a single site.
 * Allows editing and deletion of the site.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchSite = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<SiteResponse>(`/sites/${id}`);
      setSite(response.data.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Site not found');
      } else {
        message.error('Failed to load site');
      }
      navigate('/sites');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (id) {
      fetchSite();
    }
  }, [id, fetchSite]);

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Site',
      content: `Are you sure you want to delete "${site?.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeleting(true);
          await apiClient.delete(`/sites/${id}`);
          message.success('Site deleted successfully');
          navigate('/sites');
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            message.error(error.response.data?.error || 'Cannot delete site with assigned units');
          } else {
            message.error('Failed to delete site');
          }
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleEdit = () => {
    navigate(`/sites/${id}/edit`);
  };

  const handleBack = () => {
    navigate('/sites');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!site) {
    return (
      <Empty description="Site not found">
        <Button onClick={handleBack}>Back to Sites</Button>
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
          <Title level={2} style={{ margin: 0 }}>{site.name}</Title>
        </Space>
        <Space>
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

      <Card title="Site Information">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label="Name">{site.name}</Descriptions.Item>
          <Descriptions.Item label="Timezone">{site.timezone}</Descriptions.Item>
          <Descriptions.Item label="Location" span={2}>
            {site.latitude !== null && site.longitude !== null ? (
              <Space>
                <EnvironmentOutlined />
                <Text>{site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}</Text>
              </Space>
            ) : (
              <Text type="secondary">No location set</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {new Date(site.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Last Updated">
            {new Date(site.updated_at).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Map placeholder - will show location if coordinates are set */}
      {site.latitude !== null && site.longitude !== null && (
        <Card title="Location Map" style={{ marginTop: 16 }}>
          <div
            style={{
              height: 300,
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
          >
            <Text type="secondary">
              <EnvironmentOutlined style={{ fontSize: 24, marginRight: 8 }} />
              Map will be displayed here ({site.latitude.toFixed(4)}, {site.longitude.toFixed(4)})
            </Text>
          </div>
        </Card>
      )}

      {/* Units section - placeholder for Story 2.2 */}
      <Card title="Units at this Site" style={{ marginTop: 16 }}>
        <Empty description="No units assigned to this site yet">
          <Text type="secondary">
            Units can be assigned when you register them.
          </Text>
        </Empty>
      </Card>
    </div>
  );
}

export default SiteDetail;
