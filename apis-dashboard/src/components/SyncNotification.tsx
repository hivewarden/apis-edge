/**
 * SyncNotification Component
 *
 * Displays toast-style notifications for background sync events.
 * Shows syncing progress, success messages (auto-dismiss), and error alerts.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 *
 * @module components/SyncNotification
 */
import React, { useEffect, useRef } from 'react';
import { notification, Progress } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { SyncProgress, SyncResult } from '../services/backgroundSync';

// ============================================================================
// Types
// ============================================================================

export interface SyncNotificationProps {
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Current sync progress */
  progress: SyncProgress | null;
  /** Result of the last sync operation */
  lastResult: SyncResult | null;
  /** Callback when user clicks to resolve failed items */
  onResolveErrors: () => void;
}

// ============================================================================
// Notification Keys
// ============================================================================

const SYNC_PROGRESS_KEY = 'sync-progress';
const SYNC_SUCCESS_KEY = 'sync-success';
const SYNC_ERROR_KEY = 'sync-error';

// ============================================================================
// Component
// ============================================================================

/**
 * SyncNotification - Manages sync-related toast notifications
 *
 * This component doesn't render any visual elements directly.
 * Instead, it uses Ant Design's notification API to show toasts.
 *
 * Behavior:
 * - Shows "Syncing... X of Y" during sync (doesn't auto-close)
 * - Shows "All changes synced" on success (auto-dismisses after 3s)
 * - Shows "X items failed to sync - tap to resolve" on partial failure
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isSyncing, progress, lastSyncResult } = useBackgroundSync();
 *
 *   return (
 *     <>
 *       <SyncNotification
 *         isSyncing={isSyncing}
 *         progress={progress}
 *         lastResult={lastSyncResult}
 *         onResolveErrors={() => setShowErrorModal(true)}
 *       />
 *       <MainContent />
 *     </>
 *   );
 * }
 * ```
 */
export function SyncNotification({
  isSyncing,
  progress,
  lastResult,
  onResolveErrors,
}: SyncNotificationProps): null {
  // Track if we've already shown a result notification for this result
  const lastResultRef = useRef<SyncResult | null>(null);

  // Show/update syncing notification
  useEffect(() => {
    if (isSyncing && progress && progress.total > 0) {
      const percent = Math.round((progress.completed / progress.total) * 100);

      try {
        notification.open({
          key: SYNC_PROGRESS_KEY,
          message: 'Syncing...',
          description: (
            <div>
              <Progress
                percent={percent}
                size="small"
                strokeColor={colors.seaBuckthorn}
                trailColor="rgba(102, 38, 4, 0.1)"
              />
              <span style={{ color: colors.textMuted, fontSize: 12 }}>
                {progress.completed} of {progress.total} items
                {progress.failed > 0 && (
                  <span style={{ color: colors.error, marginLeft: 8 }}>
                    ({progress.failed} failed)
                  </span>
                )}
              </span>
            </div>
          ),
          icon: (
            <SyncOutlined
              spin
              style={{ color: colors.seaBuckthorn }}
            />
          ),
          duration: 0, // Don't auto-close
          placement: 'bottomRight',
        });
      } catch (error) {
        // Notification API may fail in some environments (e.g., SSR, tests)
        console.warn('[SyncNotification] Failed to show syncing notification:', error);
      }
    } else {
      // Close syncing notification when not syncing
      try {
        notification.destroy(SYNC_PROGRESS_KEY);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [isSyncing, progress]);

  // Show result notification when sync completes
  useEffect(() => {
    // Only show result notification once per result
    if (!lastResult || lastResult === lastResultRef.current || isSyncing) {
      return;
    }

    // Close any existing notifications first
    try {
      notification.destroy(SYNC_PROGRESS_KEY);
      notification.destroy(SYNC_SUCCESS_KEY);
      notification.destroy(SYNC_ERROR_KEY);
    } catch {
      // Ignore cleanup errors
    }

    lastResultRef.current = lastResult;

    try {
      if (lastResult.success && lastResult.synced > 0) {
        // Full success
        notification.success({
          key: SYNC_SUCCESS_KEY,
          message: 'All changes synced',
          description:
            lastResult.synced === 1
              ? '1 item synchronized'
              : `${lastResult.synced} items synchronized`,
          icon: <CheckCircleOutlined style={{ color: colors.success }} />,
          duration: 3, // Auto-dismiss after 3 seconds
          placement: 'bottomRight',
        });
      } else if (lastResult.failed > 0) {
        // Partial or full failure
        const failedText =
          lastResult.failed === 1
            ? '1 item failed to sync'
            : `${lastResult.failed} items failed to sync`;

        notification.warning({
          key: SYNC_ERROR_KEY,
          message: failedText,
          description: (
            <span
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => {
                try {
                  notification.destroy(SYNC_ERROR_KEY);
                } catch {
                  // Ignore
                }
                onResolveErrors();
              }}
            >
              Tap to resolve
            </span>
          ),
          icon: <ExclamationCircleOutlined style={{ color: colors.warning }} />,
          duration: 0, // Don't auto-close errors
          placement: 'bottomRight',
          onClick: () => {
            try {
              notification.destroy(SYNC_ERROR_KEY);
            } catch {
              // Ignore
            }
            onResolveErrors();
          },
        });
      }
    } catch (error) {
      // Notification API may fail in some environments (e.g., SSR, tests)
      console.warn('[SyncNotification] Failed to show result notification:', error);
    }
    // If synced === 0 and failed === 0, don't show anything (no items to sync)
  }, [lastResult, isSyncing, onResolveErrors]);

  // Component doesn't render anything - notifications are shown via API
  return null;
}

export default SyncNotification;
