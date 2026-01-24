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
  Badge,
} from 'antd';
import {
  PlusOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { apiClient } from '../providers/apiClient';

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

interface UnitsResponse {
  data: Unit[];
  meta: {
    total: number;
  };
}

/**
 * Units Page
 *
 * Displays a grid of all registered APIS units for the authenticated user.
 * Shows status indicators, site assignments, and last seen timestamps.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function Units() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<UnitsResponse>('/units');
      setUnits(response.data.data || []);
    } catch {
      message.error('Failed to load units');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitClick = (id: string) => {
    navigate(`/units/${id}`);
  };

  const handleRegisterUnit = () => {
    navigate('/units/register');
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

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never';
    const date = new Date(lastSeen);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
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
        <Title level={2} style={{ margin: 0 }}>Units</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleRegisterUnit}
        >
          Register Unit
        </Button>
      </div>

      {units.length === 0 ? (
        <Empty
          description="No units registered yet"
          style={{ marginTop: 48 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRegisterUnit}>
            Register your first unit
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {units.map((unit) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={unit.id}>
              <Card
                hoverable
                onClick={() => handleUnitClick(unit.id)}
                style={{ height: '100%' }}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Title level={4} style={{ margin: 0 }}>
                      {unit.name || unit.serial}
                    </Title>
                    {getStatusBadge(unit.status)}
                  </div>

                  <Text type="secondary">
                    <ApiOutlined style={{ marginRight: 4 }} />
                    {unit.serial}
                  </Text>

                  {unit.site_name && (
                    <Text type="secondary">
                      <EnvironmentOutlined style={{ marginRight: 4 }} />
                      {unit.site_name}
                    </Text>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {formatLastSeen(unit.last_seen)}
                    </Text>
                    {unit.firmware_version && (
                      <Tag color="default" style={{ margin: 0 }}>
                        v{unit.firmware_version}
                      </Tag>
                    )}
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default Units;
