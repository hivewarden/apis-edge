/**
 * Activity Feed Utility Functions
 *
 * Shared icon and color mappings for activity feed components.
 * Used by ActivityFeedCard and Activity page.
 *
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import React from 'react';
import {
  FileSearchOutlined,
  MedicineBoxOutlined,
  CoffeeOutlined,
  GiftOutlined,
  HomeOutlined,
  EditOutlined,
  DeleteOutlined,
  VideoCameraOutlined,
  UserAddOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { ActivityItem } from '../hooks/useActivityFeed';

/**
 * Icon mapping from server icon names to Ant Design icon components.
 */
const iconMap: Record<string, React.ReactElement> = {
  FileSearchOutlined: React.createElement(FileSearchOutlined),
  MedicineBoxOutlined: React.createElement(MedicineBoxOutlined),
  CoffeeOutlined: React.createElement(CoffeeOutlined),
  GiftOutlined: React.createElement(GiftOutlined),
  HomeOutlined: React.createElement(HomeOutlined),
  EditOutlined: React.createElement(EditOutlined),
  DeleteOutlined: React.createElement(DeleteOutlined),
  VideoCameraOutlined: React.createElement(VideoCameraOutlined),
  UserAddOutlined: React.createElement(UserAddOutlined),
  EnvironmentOutlined: React.createElement(EnvironmentOutlined),
  ClockCircleOutlined: React.createElement(ClockCircleOutlined),
};

/**
 * Color mapping for activity types.
 */
const activityColorMap: Record<string, string> = {
  inspection_created: colors.seaBuckthorn,
  treatment_recorded: '#52c41a', // green
  feeding_recorded: '#1890ff', // blue
  harvest_recorded: colors.seaBuckthorn,
  hive_created: colors.brownBramble,
  hive_updated: '#8c8c8c', // gray
  hive_deleted: '#ff4d4f', // red
  clip_uploaded: '#722ed1', // purple
  user_joined: '#1890ff', // blue
  site_created: colors.brownBramble,
  site_updated: '#8c8c8c', // gray
  site_deleted: '#ff4d4f', // red
};

/**
 * Get the icon component for an activity item.
 * Falls back to ClockCircleOutlined if icon name is not found.
 *
 * @param iconName - The icon name from the server (e.g., "FileSearchOutlined")
 * @returns React element for the icon
 */
export function getActivityIcon(iconName: string): React.ReactElement {
  return iconMap[iconName] || React.createElement(ClockCircleOutlined);
}

/**
 * Get the color for an activity type.
 * Falls back to textMuted color if activity type is not found.
 *
 * @param activityType - The activity type (e.g., "inspection_created")
 * @returns Hex color string
 */
export function getActivityColor(activityType: string): string {
  return activityColorMap[activityType] || colors.textMuted;
}

/**
 * Get the navigation link for an activity item.
 * Returns null if the entity type has no associated link.
 *
 * @param item - The activity item
 * @returns URL path or null
 */
export function getActivityEntityLink(item: ActivityItem): string | null {
  switch (item.entity_type) {
    case 'hives':
      return `/hives/${item.entity_id}`;
    case 'inspections':
      // Link to hive detail if hive_id is available
      return item.hive_id ? `/hives/${item.hive_id}` : null;
    case 'treatments':
    case 'feedings':
    case 'harvests':
      // Link to hive detail
      return item.hive_id ? `/hives/${item.hive_id}` : null;
    case 'sites':
      return `/sites/${item.entity_id}`;
    case 'clips':
      return '/clips';
    case 'users':
      // User links have no navigation
      return null;
    default:
      return null;
  }
}
