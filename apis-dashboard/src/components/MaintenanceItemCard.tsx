/**
 * MaintenanceItemCard Component
 *
 * Displays a single maintenance item (hive needing attention) with:
 * - Selection checkbox for batch actions
 * - Priority indicator badge (Urgent/Soon/Optional)
 * - Hive name and site name
 * - Summary text of the issue
 * - Quick action buttons
 *
 * Part of Epic 8, Story 8.5: Maintenance Priority View
 */
import { Checkbox, Typography } from 'antd';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/apisTheme';
import type { MaintenanceItem } from '../hooks/useMaintenanceItems';

const { Text } = Typography;

/**
 * Priority styling configuration per mockup design.
 * - Urgent: muted-rose color scheme
 * - Soon: amber color scheme
 * - Optional/Routine: soft-sage color scheme
 */
const priorityStyles = {
  Urgent: {
    iconBg: 'rgba(238, 180, 180, 0.2)', // muted-rose/20
    iconColor: '#c16464',
    badgeBg: '#eeb4b4', // muted-rose
    badgeText: '#7a2e2e',
    icon: <WarningOutlined />,
  },
  Soon: {
    iconBg: '#fef3c7', // amber-100
    iconColor: '#b45309', // amber-700
    badgeBg: '#fcd34d', // amber-300
    badgeText: '#78350f', // amber-900
    icon: <ExclamationCircleOutlined />,
  },
  Optional: {
    iconBg: 'rgba(164, 191, 163, 0.2)', // soft-sage/20
    iconColor: '#5c7a5b',
    badgeBg: 'rgba(164, 191, 163, 0.5)', // soft-sage/50
    badgeText: '#3a5239',
    icon: <InfoCircleOutlined />,
  },
} as const;

/**
 * Props for MaintenanceItemCard component.
 */
export interface MaintenanceItemCardProps {
  /** The maintenance item to display */
  item: MaintenanceItem;
  /** Whether this item is selected for batch actions */
  selected: boolean;
  /** Callback when selection changes */
  onSelectionChange: (hiveId: string, selected: boolean) => void;
  /** Callback when a quick action is clicked (optional, for analytics) */
  onQuickAction?: (action: { url: string; tab?: string; label: string }) => void;
}

/**
 * MaintenanceItemCard displays a hive that needs attention.
 *
 * Features:
 * - Priority badge with color-coded severity (red/orange/green)
 * - Checkbox for batch selection
 * - Hive name as link to hive detail
 * - Site name as secondary text
 * - Summary of the main issue
 * - Quick action buttons for common tasks
 *
 * @example
 * <MaintenanceItemCard
 *   item={maintenanceItem}
 *   selected={selectedIds.has(item.hive_id)}
 *   onSelectionChange={(id, selected) => toggleSelection(id)}
 * />
 */
export function MaintenanceItemCard({
  item,
  selected,
  onSelectionChange,
}: MaintenanceItemCardProps) {
  const navigate = useNavigate();
  const style = priorityStyles[item.priority];

  const handleCheckboxChange = (e: { target: { checked: boolean } }) => {
    onSelectionChange(item.hive_id, e.target.checked);
  };

  const handleHiveClick = () => {
    navigate(`/hives/${item.hive_id}`);
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 20,
        borderLeft: `4px solid ${style.iconColor}`,
        boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        height: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(247, 162, 43, 0.15)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        const iconEl = e.currentTarget.querySelector('[data-icon-container]') as HTMLElement;
        if (iconEl) {
          iconEl.style.backgroundColor = style.iconColor;
          iconEl.style.color = '#ffffff';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(102, 38, 4, 0.08)';
        e.currentTarget.style.transform = 'translateY(0)';
        const iconEl = e.currentTarget.querySelector('[data-icon-container]') as HTMLElement;
        if (iconEl) {
          iconEl.style.backgroundColor = style.iconBg;
          iconEl.style.color = style.iconColor;
        }
      }}
      onClick={handleHiveClick}
    >
      {/* Top row: Icon + Priority badge + Checkbox */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div
          data-icon-container
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: style.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: style.iconColor,
            transition: 'all 0.3s ease',
          }}
        >
          <span style={{ fontSize: 20 }}>
            {style.icon}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: style.badgeBg,
              color: style.badgeText,
              padding: '4px 8px',
              borderRadius: 9999,
            }}
          >
            {item.priority}
          </span>
          <Checkbox
            checked={selected}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${item.hive_name}`}
          />
        </div>
      </div>

      {/* Hive name */}
      <Text
        strong
        style={{
          display: 'block',
          fontSize: 15,
          color: colors.brownBramble,
          marginBottom: 4,
        }}
      >
        {item.hive_name}
      </Text>

      {/* Summary */}
      <Text
        style={{
          display: 'block',
          fontSize: 13,
          color: '#8c7e72',
          lineHeight: 1.5,
          marginBottom: 8,
        }}
        ellipsis={{ tooltip: true }}
      >
        {item.summary}
      </Text>

      {/* Site name */}
      <Text style={{ fontSize: 12, color: '#a89f95' }}>
        {item.site_name}
      </Text>
    </div>
  );
}

export default MaintenanceItemCard;
