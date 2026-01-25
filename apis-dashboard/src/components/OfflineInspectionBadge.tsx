/**
 * Offline Inspection Badge Component
 *
 * Displays a visual indicator for inspections that haven't been synced yet.
 * Shows "Not synced" with an orange warning style, and displays the
 * local ID in a tooltip on hover.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 */
import { Tag, Tooltip } from 'antd';
import { CloudOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

// ============================================================================
// Types
// ============================================================================

export interface OfflineInspectionBadgeProps {
  /** The local ID of the offline inspection */
  localId: string;
  /** Optional sync error message to display */
  syncError?: string | null;
  /** Whether to show in compact mode (icon only) */
  compact?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Badge showing that an inspection is not yet synced
 *
 * @example
 * ```tsx
 * // Full badge
 * <OfflineInspectionBadge localId="local_abc123" />
 *
 * // Compact (icon only)
 * <OfflineInspectionBadge localId="local_abc123" compact />
 *
 * // With sync error
 * <OfflineInspectionBadge
 *   localId="local_abc123"
 *   syncError="Network error"
 * />
 * ```
 */
export function OfflineInspectionBadge({
  localId,
  syncError,
  compact = false,
}: OfflineInspectionBadgeProps) {
  // Build tooltip content
  const tooltipContent = (
    <div>
      <div style={{ fontWeight: 500 }}>
        {syncError ? 'Sync failed' : 'Not synced yet'}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
        Local ID: {localId.substring(0, 20)}...
      </div>
      {syncError && (
        <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 4 }}>
          Error: {syncError}
        </div>
      )}
    </div>
  );

  // Compact mode: just an icon
  if (compact) {
    return (
      <Tooltip title={tooltipContent}>
        {syncError ? (
          <ExclamationCircleOutlined
            style={{
              color: '#ff4d4f',
              fontSize: 14,
            }}
          />
        ) : (
          <CloudOutlined
            style={{
              color: colors.warning,
              fontSize: 14,
            }}
          />
        )}
      </Tooltip>
    );
  }

  // Full badge
  return (
    <Tooltip title={tooltipContent}>
      <Tag
        icon={syncError ? <ExclamationCircleOutlined /> : <CloudOutlined />}
        color={syncError ? 'error' : 'warning'}
        style={{
          borderColor: syncError ? '#ff4d4f' : colors.warning,
          backgroundColor: syncError
            ? 'rgba(255, 77, 79, 0.1)'
            : 'rgba(230, 126, 0, 0.1)',
        }}
      >
        {syncError ? 'Sync failed' : 'Not synced'}
      </Tag>
    </Tooltip>
  );
}

export default OfflineInspectionBadge;
