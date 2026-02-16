import { Badge } from 'antd';
import type { MenuProps } from 'antd';

/**
 * Material Symbols Icon Component
 *
 * Renders Material Symbols Outlined icons with DESIGN-KEY specifications:
 * - Icon size: 20-22px
 * - Style: FILL 0, wght 300 (outlined, light weight)
 */
interface MaterialIconProps {
  name: string;
  size?: number;
}

function MaterialIcon({ name, size = 22 }: MaterialIconProps) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontSize: size,
        fontVariationSettings: "'FILL' 0, 'wght' 300",
        lineHeight: 1,
      }}
    >
      {name}
    </span>
  );
}

/**
 * Badge Counts Interface
 *
 * Defines badge counts that can be dynamically applied to nav items.
 * Part of Epic 14, Story 14.14 (Overdue Alerts + Navigation Badge)
 */
export interface NavBadgeCounts {
  /** Count of overdue tasks to display on Tasks nav item */
  tasks?: number;
}

/**
 * Navigation Items Configuration
 *
 * Defines all sidebar navigation items with their routes, icons, and labels.
 * Keys match the route paths for easy active state detection.
 */
/**
 * Navigation items with Material Symbols Outlined icons per DESIGN-KEY.
 *
 * Icon mapping:
 * - Dashboard: grid_view
 * - Sites: location_on
 * - Units: memory (device/hardware)
 * - Hives: hexagon
 * - Calendar: calendar_month
 * - Activity: history
 * - Maintenance: handyman
 * - Tasks: task_alt
 * - Clips: smart_display
 * - Statistics: bar_chart
 * - Settings: settings
 */
export const navItems: MenuProps['items'] = [
  { key: '/', icon: <MaterialIcon name="grid_view" />, label: 'Dashboard' },
  { key: '/sites', icon: <MaterialIcon name="location_on" />, label: 'Sites' },
  { key: '/units', icon: <MaterialIcon name="memory" />, label: 'Units' },
  { key: '/hives', icon: <MaterialIcon name="hexagon" />, label: 'Hives' },
  { key: '/calendar', icon: <MaterialIcon name="calendar_month" />, label: 'Calendar' },
  { key: '/activity', icon: <MaterialIcon name="history" />, label: 'Activity' },
  { key: '/maintenance', icon: <MaterialIcon name="handyman" />, label: 'Maintenance' },
  { key: '/tasks', icon: <MaterialIcon name="task_alt" />, label: 'Tasks' },
  { key: '/clips', icon: <MaterialIcon name="smart_display" />, label: 'Clips' },
  { key: '/statistics', icon: <MaterialIcon name="bar_chart" />, label: 'Statistics' },
  { key: '/settings', icon: <MaterialIcon name="settings" />, label: 'Settings' },
];

/**
 * Get Navigation Items with Dynamic Badges
 *
 * Returns navigation items array with badge counts applied to relevant items.
 * Use this function instead of the static navItems when you need badges.
 *
 * @param badgeCounts - Object containing badge counts for specific nav items
 * @returns Navigation items array with badges applied
 *
 * @example
 * const { stats } = useTaskStats();
 * const items = getNavItemsWithBadges({ tasks: stats?.overdue });
 */
export function getNavItemsWithBadges(badgeCounts: NavBadgeCounts): MenuProps['items'] {
  return navItems?.map((item) => {
    // Type guard to ensure item is a valid menu item with key
    if (!item || typeof item !== 'object' || !('key' in item)) {
      return item;
    }

    // Add badge to Tasks nav item when overdue count > 0
    if (item.key === '/tasks' && badgeCounts.tasks && badgeCounts.tasks > 0) {
      return {
        ...item,
        label: (
          <span>
            Tasks
            <Badge
              count={badgeCounts.tasks}
              size="small"
              style={{ marginLeft: 8 }}
            />
          </span>
        ),
      };
    }

    return item;
  }) ?? [];
}
