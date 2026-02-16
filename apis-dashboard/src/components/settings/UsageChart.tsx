/**
 * UsageChart Component
 *
 * Displays resource usage with progress bars and color-coded status.
 * Shows warning (orange) when usage > 80%, danger (red) when > 95%.
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { Space, Progress, Typography } from 'antd';
import {
  HomeOutlined,
  HddOutlined,
  TeamOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import type { UsageInfo, LimitsInfo, PercentagesInfo } from '../../hooks/useTenantSettings';
import { formatStorageSize, isWarningZone } from '../../hooks/useTenantSettings';
import { colors } from '../../theme/apisTheme';

const { Text } = Typography;

interface UsageChartProps {
  usage: UsageInfo;
  limits: LimitsInfo;
  percentages: PercentagesInfo;
}

interface UsageProgressBarProps {
  label: string;
  icon: React.ReactNode;
  current: number;
  max: number;
  percent: number;
  format?: (current: number, max: number) => string;
}

/**
 * Individual progress bar for a resource type.
 */
function UsageProgressBar({ label, icon, current, max, percent, format }: UsageProgressBarProps) {
  // Determine status for coloring
  const isWarning = isWarningZone(percent);
  const isDanger = percent >= 95;

  // Get stroke color based on usage level
  const getStrokeColor = () => {
    if (isDanger) {
      return colors.error || '#ff4d4f';
    }
    if (isWarning) {
      return colors.warning || '#faad14';
    }
    return colors.success || '#52c41a';
  };

  // Format display text
  const displayText = format ? format(current, max) : `${current} / ${max}`;

  return (
    <div style={{ marginBottom: 20 }}>
      <Space style={{ marginBottom: 4 }}>
        {icon}
        <Text strong>{label}</Text>
      </Space>
      <Progress
        percent={percent}
        strokeColor={getStrokeColor()}
        trailColor="#f0f0f0"
        format={() => (
          <span style={{ fontSize: 12 }}>
            {displayText} ({percent}%)
          </span>
        )}
        status={isDanger ? 'exception' : undefined}
      />
    </div>
  );
}

/**
 * UsageChart displays all resource usage bars.
 */
export function UsageChart({ usage, limits, percentages }: UsageChartProps) {
  return (
    <div>
      <UsageProgressBar
        label="Hives"
        icon={<HomeOutlined style={{ color: colors.seaBuckthorn }} />}
        current={usage.hive_count}
        max={limits.max_hives}
        percent={percentages.hives_percent}
      />

      <UsageProgressBar
        label="Units"
        icon={<HddOutlined style={{ color: colors.seaBuckthorn }} />}
        current={usage.unit_count}
        max={limits.max_units}
        percent={percentages.units_percent}
      />

      <UsageProgressBar
        label="Users"
        icon={<TeamOutlined style={{ color: colors.seaBuckthorn }} />}
        current={usage.user_count}
        max={limits.max_users}
        percent={percentages.users_percent}
      />

      <UsageProgressBar
        label="Storage"
        icon={<CloudOutlined style={{ color: colors.seaBuckthorn }} />}
        current={usage.storage_bytes}
        max={limits.max_storage_bytes}
        percent={percentages.storage_percent}
        format={(current, max) =>
          `${formatStorageSize(current)} / ${formatStorageSize(max)}`
        }
      />
    </div>
  );
}

export default UsageChart;
