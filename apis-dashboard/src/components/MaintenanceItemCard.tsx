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
import { Card, Checkbox, Tag, Typography, Button, Space, Tooltip } from 'antd';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/apisTheme';
import type { MaintenanceItem, QuickAction } from '../hooks/useMaintenanceItems';

const { Text, Title } = Typography;

/**
 * Priority styling configuration.
 */
const priorityStyles = {
  Urgent: {
    color: colors.error,
    bgColor: '#ffebee',
    icon: <ExclamationCircleOutlined />,
    tagColor: 'red' as const,
  },
  Soon: {
    color: colors.warning,
    bgColor: '#fff8e1',
    icon: <WarningOutlined />,
    tagColor: 'orange' as const,
  },
  Optional: {
    color: colors.success,
    bgColor: '#e8f5e9',
    icon: <InfoCircleOutlined />,
    tagColor: 'green' as const,
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
  onQuickAction?: (action: QuickAction) => void;
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
  onQuickAction,
}: MaintenanceItemCardProps) {
  const navigate = useNavigate();
  const style = priorityStyles[item.priority];

  const handleCheckboxChange = (e: { target: { checked: boolean } }) => {
    onSelectionChange(item.hive_id, e.target.checked);
  };

  const handleHiveClick = () => {
    navigate(`/hives/${item.hive_id}`);
  };

  const handleQuickAction = (action: QuickAction) => {
    onQuickAction?.(action);

    // Navigate to the URL
    if (action.tab) {
      // For actions with tabs, navigate with state
      navigate(action.url, { state: { activeTab: action.tab } });
    } else {
      navigate(action.url);
    }
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderLeft: `4px solid ${style.color}`,
        backgroundColor: style.bgColor,
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Selection checkbox */}
        <Checkbox
          checked={selected}
          onChange={handleCheckboxChange}
          style={{ marginTop: 4 }}
          aria-label={`Select ${item.hive_name}`}
        />

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header row: Priority badge + Hive name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Tag
              color={style.tagColor}
              icon={style.icon}
              style={{ margin: 0 }}
            >
              {item.priority}
            </Tag>

            <Tooltip title="View hive details">
              <Title
                level={5}
                onClick={handleHiveClick}
                style={{
                  margin: 0,
                  cursor: 'pointer',
                  color: colors.brownBramble,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.hive_name}
              </Title>
            </Tooltip>

            <RightOutlined style={{ color: colors.textMuted, fontSize: 10 }} />

            <Text
              type="secondary"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.site_name}
            </Text>
          </div>

          {/* Summary text */}
          <Text
            style={{
              display: 'block',
              marginBottom: 8,
              color: colors.brownBramble,
            }}
          >
            {item.summary}
          </Text>

          {/* Quick action buttons */}
          <Space wrap size={8}>
            {item.quick_actions.map((action, index) => (
              <Button
                key={`${action.url}-${index}`}
                size="small"
                type={index === 0 ? 'primary' : 'default'}
                onClick={() => handleQuickAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        </div>
      </div>
    </Card>
  );
}

export default MaintenanceItemCard;
