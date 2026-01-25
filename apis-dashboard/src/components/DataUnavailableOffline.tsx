/**
 * Data Unavailable Offline Component
 *
 * Displays a friendly message when requested data isn't available
 * in the offline cache. Provides guidance for syncing when online.
 *
 * @module components/DataUnavailableOffline
 */
import React from 'react';
import { Result, Button, Space, Typography } from 'antd';
import {
  CloudDownloadOutlined,
  WifiOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface DataUnavailableOfflineProps {
  /** Type of data that's unavailable (e.g., "hive data", "inspections") */
  dataType?: string;
  /** Callback when user clicks "Sync Now" */
  onRetry?: () => void;
  /** Whether sync is in progress */
  isSyncing?: boolean;
  /** Optional custom title */
  title?: string;
  /** Optional custom subtitle */
  subtitle?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * DataUnavailableOffline component
 *
 * Shows when cached data isn't available for offline viewing.
 * Provides different UI states for online vs offline scenarios.
 *
 * @example
 * ```tsx
 * // Basic usage
 * if (!data && isOffline) {
 *   return <DataUnavailableOffline dataType="hive data" />;
 * }
 *
 * // With sync callback
 * <DataUnavailableOffline
 *   dataType="inspection history"
 *   onRetry={handleSync}
 *   isSyncing={isSyncing}
 * />
 * ```
 */
export function DataUnavailableOffline({
  dataType = 'data',
  onRetry,
  isSyncing = false,
  title,
  subtitle,
}: DataUnavailableOfflineProps): React.ReactElement {
  const isOnline = useOnlineStatus();

  const displayTitle = title || `This ${dataType} isn't available offline`;
  const displaySubtitle =
    subtitle ||
    (isOnline
      ? `Click below to download this ${dataType} for offline use`
      : `Connect to the internet to sync this ${dataType}`);

  return (
    <Result
      icon={
        <CloudDownloadOutlined
          style={{
            color: isOnline ? colors.seaBuckthorn : colors.warning,
            fontSize: 64,
          }}
        />
      }
      title={
        <span style={{ color: colors.brownBramble }}>{displayTitle}</span>
      }
      subTitle={
        <Text type="secondary" style={{ fontSize: 14 }}>
          {displaySubtitle}
        </Text>
      }
      extra={
        isOnline && onRetry ? (
          <Button
            type="primary"
            size="large"
            onClick={onRetry}
            loading={isSyncing}
            icon={isSyncing ? <LoadingOutlined /> : <CloudDownloadOutlined />}
            style={{
              height: 48,
              paddingInline: 24,
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        ) : (
          <Space
            direction="vertical"
            align="center"
            style={{
              color: colors.brownBramble,
              opacity: 0.7,
            }}
          >
            <WifiOutlined style={{ fontSize: 24 }} />
            <Text type="secondary">Waiting for connection...</Text>
          </Space>
        )
      }
      style={{
        background: colors.coconutCream,
        borderRadius: 12,
        padding: 32,
        border: `1px solid ${colors.salomie}`,
        margin: 16,
      }}
    />
  );
}

/**
 * Compact version for inline use
 */
export function DataUnavailableOfflineCompact({
  dataType = 'data',
  onRetry,
}: Pick<DataUnavailableOfflineProps, 'dataType' | 'onRetry'>): React.ReactElement {
  const isOnline = useOnlineStatus();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        background: colors.coconutCream,
        borderRadius: 8,
        border: `1px dashed ${colors.warning}`,
      }}
    >
      <CloudDownloadOutlined
        style={{
          fontSize: 32,
          color: colors.warning,
          marginBottom: 12,
        }}
      />
      <Text style={{ marginBottom: 8 }}>
        {dataType} not available offline
      </Text>
      {isOnline && onRetry ? (
        <Button type="link" onClick={onRetry} size="small">
          Sync now
        </Button>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Connect to sync
        </Text>
      )}
    </div>
  );
}

export default DataUnavailableOffline;
