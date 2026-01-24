import { Card, Badge, Typography, Space } from 'antd';
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  ApiOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

export interface Unit {
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

interface UnitStatusCardProps {
  unit: Unit;
  onClick: (id: string) => void;
}

/**
 * UnitStatusCard Component
 *
 * Displays a single unit's status in a card format.
 * Shows status indicator (green=armed, yellow=disarmed, red=offline),
 * unit name, site name, and last seen timestamp.
 *
 * Part of Epic 2, Story 2.4: Unit Status Dashboard Cards
 */
export function UnitStatusCard({ unit, onClick }: UnitStatusCardProps) {
  const getStatusConfig = (status: string) => {
    // Current API has: 'online' | 'offline' | 'error'
    // MVP: online=armed (green), error=disarmed (yellow), offline=offline (red)
    switch (status) {
      case 'online':
        return {
          badgeStatus: 'success' as const,
          label: 'Armed',
          color: '#52c41a',
        };
      case 'error':
        return {
          badgeStatus: 'warning' as const,
          label: 'Disarmed',
          color: '#faad14',
        };
      default:
        return {
          badgeStatus: 'error' as const,
          label: 'Offline',
          color: '#ff4d4f',
        };
    }
  };

  const formatLastSeen = (lastSeen: string | null, status: string) => {
    if (!lastSeen) return 'Never connected';

    const date = new Date(lastSeen);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    // For offline units, show "Offline since HH:MM"
    if (status === 'offline') {
      return `Offline since ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // For online units, show relative time
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const statusConfig = getStatusConfig(unit.status);

  return (
    <Card
      hoverable
      onClick={() => onClick(unit.id)}
      style={{ height: '100%' }}
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header with name and status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Title level={5} style={{ margin: 0, maxWidth: '70%' }} ellipsis>
            {unit.name || unit.serial}
          </Title>
          <Badge status={statusConfig.badgeStatus} text={statusConfig.label} />
        </div>

        {/* Serial number (if different from name) */}
        {unit.name && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ApiOutlined style={{ marginRight: 4 }} />
            {unit.serial}
          </Text>
        )}

        {/* Site name */}
        {unit.site_name && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            <EnvironmentOutlined style={{ marginRight: 4 }} />
            {unit.site_name}
          </Text>
        )}

        {/* Last seen timestamp */}
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {formatLastSeen(unit.last_seen, unit.status)}
          </Text>
        </div>
      </Space>
    </Card>
  );
}

export default UnitStatusCard;
