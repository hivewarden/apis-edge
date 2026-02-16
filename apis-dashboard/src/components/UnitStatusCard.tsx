import { Card, Typography } from 'antd';
import { colors } from '../theme/apisTheme';

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

export interface UnitStatusCardProps {
  unit: Unit;
  onClick: (id: string) => void;
}

/**
 * UnitStatusCard Component
 *
 * Displays a single unit's status in a card format per DESIGN-KEY mockups.
 * Shows status indicator (green=armed, yellow=warning, red=offline),
 * unit name, site name, and last seen timestamp.
 *
 * Updated to match apis_unit_card_component mockup.
 * Part of Epic 2, Story 2.4: Unit Status Dashboard Cards
 */
export function UnitStatusCard({ unit, onClick }: UnitStatusCardProps) {
  const getStatusConfig = (status: string) => {
    // Per DESIGN-KEY: Active/Healthy = green #E8F5E9/#2E7D32, Warning = amber with pulse, Offline = red
    switch (status) {
      case 'online':
        return {
          label: 'Active',
          bgColor: '#E8F5E9', // DESIGN-KEY green background
          borderColor: 'rgba(46, 125, 50, 0.2)', // green border
          textColor: '#2E7D32', // DESIGN-KEY green text
          dotColor: '#2E7D32',
          pulse: false, // Active/healthy state doesn't pulse
        };
      case 'error':
        return {
          label: 'Warning',
          bgColor: '#fffbeb', // amber-50
          borderColor: 'rgba(251, 191, 36, 0.5)', // amber-200/50
          textColor: '#92400e', // amber-800
          dotColor: '#d97706', // amber-600
          pulse: true, // Warning state pulses per DESIGN-KEY
        };
      default:
        return {
          label: 'Offline',
          bgColor: '#fef2f2', // red-50
          borderColor: 'rgba(248, 113, 113, 0.5)', // red-300/50
          textColor: '#991b1b', // red-800
          dotColor: '#dc2626', // red-600
          pulse: true, // Pending/offline state pulses per DESIGN-KEY
        };
    }
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never connected';

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

  const statusConfig = getStatusConfig(unit.status);

  return (
    <Card
      hoverable
      onClick={() => onClick(unit.id)}
      style={{
        height: '100%',
        borderRadius: 16, // DESIGN-KEY: rounded-2xl
        overflow: 'hidden',
        border: '1px solid #ece8d6', // DESIGN-KEY: orange-100 border
        background: '#ffffff', // DESIGN-KEY: white card bg
        boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)', // DESIGN-KEY: shadow-soft
        transition: 'all 0.3s',
      }}
      styles={{
        body: { padding: 0 },
      }}
      className="group"
    >
      {/* Image placeholder - per mockup shows unit photo */}
      <div style={{
        height: 192,
        background: '#f3f4f6',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Placeholder gradient for missing image */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #fcd483 0%, #f7a42d 100%)',
          opacity: 0.3,
        }} />

        {/* Unit icon in center */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 64,
              color: colors.brownBramble,
              opacity: 0.2,
            }}
          >
            shield
          </span>
        </div>

        {/* More menu button per mockup */}
        <button
          onClick={(e) => { e.stopPropagation(); }}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            cursor: 'pointer',
            color: colors.brownBramble,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_horiz</span>
        </button>
      </div>

      {/* Content area per mockup */}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Name and icon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <Title
            level={5}
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: colors.brownBramble,
              lineHeight: 1.3,
            }}
          >
            {unit.name || unit.serial}
          </Title>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: 'rgba(102, 38, 4, 0.8)' }}
          >
            shield
          </span>
        </div>

        {/* Site name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: 'rgba(102, 38, 4, 0.6)' }}
          >
            location_on
          </span>
          <Text style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.7)' }}>
            {unit.site_name || 'Unassigned'}
          </Text>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(102, 38, 4, 0.05)', marginBottom: 16 }} />

        {/* Status and last seen row per mockup */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          {/* Status badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 9999,
            background: statusConfig.bgColor,
            border: `1px solid ${statusConfig.borderColor}`,
          }}>
            <div
              className={statusConfig.pulse ? 'animate-pulse' : undefined}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusConfig.dotColor,
              }}
            />
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: statusConfig.textColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {statusConfig.label}
            </span>
          </div>

          {/* Last seen */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'rgba(102, 38, 4, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Last seen
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, color: colors.brownBramble }}
              >
                history
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.brownBramble }}>
                {formatLastSeen(unit.last_seen)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default UnitStatusCard;
