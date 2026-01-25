/**
 * Sync Status Component
 *
 * Displays offline sync status including last sync time, storage usage,
 * pending items count, and provides a manual sync button.
 * Supports both full and compact modes.
 *
 * Part of Epic 7, Story 7.2: IndexedDB Offline Storage
 * Enhanced in Story 7.4: Automatic Background Sync
 *
 * @module components/SyncStatus
 */
import React, { useState } from 'react';
import { Typography, Space, Button, Progress, Tooltip, Card, Badge, List } from 'antd';
import {
  SyncOutlined,
  CloudOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePendingSync } from '../hooks/usePendingSync';
import { colors } from '../theme/apisTheme';
import { MAX_STORAGE_MB } from '../services/offlineCache';

dayjs.extend(relativeTime);

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface SyncStatusProps {
  /** When the data was last synced from the server */
  lastSynced: Date | null;
  /** Current storage usage in MB */
  storageUsedMB?: number;
  /** Maximum storage in MB (default: 50) */
  maxStorageMB?: number;
  /** Callback when user clicks "Sync now" */
  onSyncNow?: () => void;
  /** Whether a sync is currently in progress */
  isSyncing?: boolean;
  /** Compact mode for headers/toolbars */
  compact?: boolean;
  /** Whether to show as a card (default: true for non-compact) */
  showAsCard?: boolean;
  /** Callback when user clicks "Retry" for failed items */
  onRetryFailed?: () => void;
  /** Number of items that failed to sync */
  failedCount?: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * SyncStatus component
 *
 * Displays the current sync status with online/offline indicator,
 * last sync time, storage usage, and sync button.
 *
 * @example
 * ```tsx
 * // Full display
 * <SyncStatus
 *   lastSynced={new Date()}
 *   storageUsedMB={12.5}
 *   onSyncNow={handleSync}
 *   isSyncing={isSyncing}
 * />
 *
 * // Compact display for header
 * <SyncStatus lastSynced={lastSynced} compact />
 * ```
 */
export function SyncStatus({
  lastSynced,
  storageUsedMB = 0,
  maxStorageMB = MAX_STORAGE_MB,
  onSyncNow,
  isSyncing = false,
  compact = false,
  showAsCard = true,
  onRetryFailed,
  failedCount = 0,
}: SyncStatusProps): React.ReactElement {
  const isOnline = useOnlineStatus();
  const { pendingCount, pendingGroups, hasErrors } = usePendingSync();
  const [isHovered, setIsHovered] = useState(false);
  const [showPendingList, setShowPendingList] = useState(false);

  const storagePercent = Math.round((storageUsedMB / maxStorageMB) * 100);
  const storageWarning = storagePercent > 80;

  const lastSyncedText = lastSynced
    ? `Last synced ${dayjs(lastSynced).fromNow()}`
    : 'Never synced';

  // Pending items text
  const pendingText = pendingCount > 0
    ? `${pendingCount} inspection${pendingCount !== 1 ? 's' : ''} pending`
    : null;

  // Compact mode - just an icon with tooltip
  if (compact) {
    const statusIcon = isOnline ? (
      isSyncing ? (
        <SyncOutlined spin style={{ color: colors.seaBuckthorn }} />
      ) : pendingCount > 0 ? (
        <Badge count={pendingCount} size="small">
          <CloudOutlined style={{ color: colors.warning }} />
        </Badge>
      ) : (
        <CloudSyncOutlined style={{ color: colors.success }} />
      )
    ) : (
      <Badge count={pendingCount} size="small">
        <CloudOutlined style={{ color: colors.warning }} />
      </Badge>
    );

    const tooltipContent = (
      <div>
        <div>{isOnline ? 'Online' : 'Offline'}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{lastSyncedText}</div>
        {pendingText && (
          <div style={{ fontSize: 12, color: colors.warning }}>
            {pendingText}
          </div>
        )}
        {storageUsedMB > 0 && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Storage: {storageUsedMB.toFixed(1)}MB / {maxStorageMB}MB
          </div>
        )}
      </div>
    );

    return (
      <Tooltip title={tooltipContent}>
        <Space
          size="small"
          style={{ cursor: 'pointer' }}
          onClick={isOnline && onSyncNow ? onSyncNow : undefined}
        >
          {statusIcon}
          <Text
            type="secondary"
            style={{
              fontSize: 12,
              color: isOnline && pendingCount === 0 ? colors.textMuted : colors.warning,
            }}
          >
            {isSyncing ? 'Syncing...' : isOnline && pendingCount === 0 ? 'Synced' : pendingCount > 0 ? `${pendingCount} pending` : 'Offline'}
          </Text>
        </Space>
      </Tooltip>
    );
  }

  // Full display content
  const content = (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      {/* Status row */}
      <Space
        style={{ width: '100%', justifyContent: 'space-between' }}
        align="center"
      >
        <Space>
          {isOnline ? (
            pendingCount === 0 ? (
              <CheckCircleOutlined style={{ color: colors.success, fontSize: 16 }} />
            ) : (
              <ExclamationCircleOutlined
                style={{ color: colors.warning, fontSize: 16 }}
              />
            )
          ) : (
            <ExclamationCircleOutlined
              style={{ color: colors.warning, fontSize: 16 }}
            />
          )}
          <Text strong style={{ color: isOnline && pendingCount === 0 ? colors.success : colors.warning }}>
            {isOnline ? (pendingCount === 0 ? 'Online' : 'Online - Pending') : 'Offline'}
          </Text>
        </Space>

        {isOnline && onSyncNow && (
          <Button
            type="link"
            size="small"
            icon={<SyncOutlined spin={isSyncing} />}
            onClick={onSyncNow}
            disabled={isSyncing}
            style={{ padding: 0 }}
          >
            {isSyncing ? 'Syncing...' : 'Sync now'}
          </Button>
        )}
      </Space>

      {/* Last synced text */}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {lastSyncedText}
      </Text>

      {/* Pending items section */}
      {pendingCount > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(230, 126, 0, 0.1)',
            borderRadius: 6,
            border: `1px solid ${colors.warning}`,
          }}
        >
          <Space
            style={{ width: '100%', justifyContent: 'space-between' }}
            onClick={() => setShowPendingList(!showPendingList)}
            role="button"
            tabIndex={0}
          >
            <Space size="small">
              <FormOutlined style={{ color: colors.warning }} />
              <Text style={{ color: colors.warning, fontWeight: 500 }}>
                {pendingText}
              </Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {showPendingList ? 'Hide' : 'Show'}
            </Text>
          </Space>

          {/* Expandable pending items list */}
          {showPendingList && pendingGroups.length > 0 && (
            <List
              size="small"
              style={{ marginTop: 8 }}
              dataSource={pendingGroups.flatMap(g =>
                g.items.map(item => ({
                  key: item.local_id,
                  date: item.date,
                  hasError: !!item.sync_error,
                  error: item.sync_error,
                }))
              )}
              renderItem={(item) => (
                <List.Item
                  style={{
                    padding: '4px 0',
                    borderBottom: 'none',
                  }}
                >
                  <Space size="small">
                    {item.hasError ? (
                      <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                    ) : (
                      <CloudOutlined style={{ color: colors.warning, fontSize: 12 }} />
                    )}
                    <Text style={{ fontSize: 12 }}>
                      Inspection: {dayjs(item.date).format('MMM D, YYYY')}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}

          {hasErrors && (
            <div style={{ marginTop: 8 }}>
              <Text type="danger" style={{ fontSize: 11, display: 'block' }}>
                Some items failed to sync.
              </Text>
              {onRetryFailed && (
                <Button
                  type="link"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={onRetryFailed}
                  style={{ padding: 0, height: 'auto', fontSize: 11, color: colors.seaBuckthorn }}
                >
                  Retry failed items ({failedCount || 'all'})
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Storage usage */}
      <Space size="small" style={{ width: '100%' }} align="center">
        <DatabaseOutlined
          style={{
            color: storageWarning ? colors.warning : colors.brownBramble,
            fontSize: 14,
          }}
        />
        <div style={{ flex: 1 }}>
          <Progress
            percent={storagePercent}
            size="small"
            strokeColor={storageWarning ? colors.warning : colors.seaBuckthorn}
            trailColor="rgba(102, 38, 4, 0.1)"
            showInfo={false}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {storageUsedMB.toFixed(1)}MB / {maxStorageMB}MB
        </Text>
      </Space>

      {/* Warning if storage is high */}
      {storageWarning && (
        <Text type="warning" style={{ fontSize: 11 }}>
          Storage nearly full. Old data will be pruned automatically.
        </Text>
      )}
    </Space>
  );

  // Wrap in card if requested
  if (showAsCard) {
    return (
      <Card
        size="small"
        style={{
          background: colors.coconutCream,
          borderColor: isOnline ? colors.salomie : colors.warning,
          transition: 'all 0.2s ease',
          transform: isHovered ? 'translateY(-1px)' : 'none',
          boxShadow: isHovered ? colors.shadowMd : colors.shadowSm,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {content}
      </Card>
    );
  }

  // Plain content without card wrapper
  return (
    <div
      style={{
        padding: 12,
        background: colors.coconutCream,
        borderRadius: 8,
        border: `1px solid ${isOnline ? colors.salomie : colors.warning}`,
      }}
    >
      {content}
    </div>
  );
}

export default SyncStatus;
