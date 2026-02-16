import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Row,
  Col,
  Empty,
  Spin,
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
import { ErrorBoundary } from '../components';
import { useUnits } from '../hooks';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;

/**
 * UnitsContent component - internal implementation
 */
function UnitsContent() {
  const navigate = useNavigate();

  // Use hook for units
  const { units, loading } = useUnits();

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
                onClick={() => handleUnitClick(unit.id)}
                style={{
                  height: '100%',
                  borderLeft: `4px solid ${colors.seaBuckthorn}`,
                  boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(247, 162, 43, 0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(102, 38, 4, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Space size={8}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: 'rgba(247, 164, 45, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: colors.seaBuckthorn,
                        fontSize: 20,
                      }}>
                        <ApiOutlined />
                      </div>
                      <Title level={4} style={{ margin: 0 }}>
                        {unit.name || unit.serial}
                      </Title>
                    </Space>
                    {getStatusBadge(unit.status)}
                  </div>

                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <ApiOutlined style={{ marginRight: 4 }} />
                    {unit.serial}
                  </Text>

                  {unit.site_name && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
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
                      <Tag color="default" style={{
                        margin: 0,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#8c7e72',
                        backgroundColor: '#f8f7f5',
                        borderColor: 'transparent',
                        borderRadius: 9999,
                      }}>
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

/**
 * Units Page
 *
 * Displays a grid of all registered APIS units for the authenticated user.
 * Shows status indicators, site assignments, and last seen timestamps.
 * Wrapped in ErrorBoundary for graceful error handling.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function Units() {
  return (
    <ErrorBoundary>
      <UnitsContent />
    </ErrorBoundary>
  );
}

export default Units;
