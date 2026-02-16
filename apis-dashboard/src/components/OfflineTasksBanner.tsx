/**
 * OfflineTasksBanner Component
 *
 * A subtle banner that appears in the MobileTasksSection when the user is offline.
 * Shows pending sync count if there are offline changes waiting to sync.
 *
 * Part of Epic 14, Story 14.16: Offline Task Support
 */
import { CSSProperties } from 'react';
import { Typography } from 'antd';
import { CloudOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface OfflineTasksBannerProps {
  /** Number of tasks pending sync */
  pendingSyncCount: number;
  /** Optional style overrides */
  style?: CSSProperties;
}

/**
 * Offline banner for the tasks section.
 *
 * Displays a subtle gray banner with cloud icon indicating offline state.
 * Shows pending sync count when there are offline changes.
 *
 * @example
 * {isOffline && <OfflineTasksBanner pendingSyncCount={pendingSyncCount} />}
 */
export function OfflineTasksBanner({ pendingSyncCount, style }: OfflineTasksBannerProps) {
  return (
    <div
      data-testid="offline-tasks-banner"
      style={{
        background: '#f5f5f5',
        padding: '8px 12px',
        borderRadius: 8,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      <CloudOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />
      <Text style={{ color: '#595959', fontSize: 14 }}>
        ☁️ Offline — changes will sync
        {pendingSyncCount > 0 && ` (${pendingSyncCount} pending)`}
      </Text>
    </div>
  );
}

export default OfflineTasksBanner;
