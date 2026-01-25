import {
  DashboardOutlined,
  ApiOutlined,
  HomeOutlined,
  VideoCameraOutlined,
  BarChartOutlined,
  SettingOutlined,
  EnvironmentOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

/**
 * Navigation Items Configuration
 *
 * Defines all sidebar navigation items with their routes, icons, and labels.
 * Keys match the route paths for easy active state detection.
 */
export const navItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/sites', icon: <EnvironmentOutlined />, label: 'Sites' },
  { key: '/units', icon: <ApiOutlined />, label: 'Units' },
  { key: '/hives', icon: <HomeOutlined />, label: 'Hives' },
  { key: '/maintenance', icon: <ToolOutlined />, label: 'Maintenance' },
  { key: '/clips', icon: <VideoCameraOutlined />, label: 'Clips' },
  { key: '/statistics', icon: <BarChartOutlined />, label: 'Statistics' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];
