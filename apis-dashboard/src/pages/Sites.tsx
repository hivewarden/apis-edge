import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Row,
  Col,
  Empty,
  Spin,
  message,
  Space,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
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

interface SitesResponse {
  data: Site[];
  meta: {
    total: number;
  };
}

/**
 * Sites Page
 *
 * Displays a grid of all sites (apiaries) for the authenticated user.
 * Allows navigation to site details and creation of new sites.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
export function Sites() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<SitesResponse>('/sites');
      setSites(response.data.data || []);
    } catch {
      message.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const handleSiteClick = (id: string) => {
    navigate(`/sites/${id}`);
  };

  const handleCreateSite = () => {
    navigate('/sites/create');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Sites</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateSite}
        >
          Add Site
        </Button>
      </div>

      {sites.length === 0 ? (
        <Empty
          description="No sites yet"
          style={{ marginTop: 48 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSite}>
            Create your first site
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {sites.map((site) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={site.id}>
              <Card
                hoverable
                onClick={() => handleSiteClick(site.id)}
                style={{ height: '100%' }}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Title level={4} style={{ margin: 0 }}>{site.name}</Title>

                  {site.latitude !== null && site.longitude !== null ? (
                    <Text type="secondary">
                      <EnvironmentOutlined style={{ marginRight: 4 }} />
                      {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                    </Text>
                  ) : (
                    <Text type="secondary">
                      <EnvironmentOutlined style={{ marginRight: 4 }} />
                      No location set
                    </Text>
                  )}

                  <Tag icon={<ClockCircleOutlined />} color="default">
                    {site.timezone}
                  </Tag>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default Sites;
