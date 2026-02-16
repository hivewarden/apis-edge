/**
 * OfflineBanner Component
 *
 * A storm-gray banner that appears when the user loses network connectivity.
 * Shows pending item count when offline (Epic 7, Story 7.3).
 * Shows "Syncing..." state when background sync is in progress (Epic 7, Story 7.4).
 *
 * Design: Storm Gray (#6b7280) background per DESIGN-KEY.md offline banner spec.
 *
 * Part of Epic 7, Story 7.1: Service Worker & App Shell Caching
 * Enhanced in Story 7.3 to show pending sync count
 * Enhanced in Story 7.4 to show syncing state
 */
import { CSSProperties, useEffect, useState } from 'react';
import { SyncOutlined } from '@ant-design/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePendingSync } from '../hooks/usePendingSync';

/** Styles for the banner container */
const bannerStyles: CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  overflow: 'hidden',
};

/** Storm Gray color from design key for offline state */
const stormGray = '#6b7280';

/** Content wrapper styles - uses storm gray per DESIGN-KEY for offline banner
 * Layout: flex items-center justify-center gap-3
 * Padding: px-8 py-3 (32px horizontal, 12px vertical)
 * Text: text-sm font-semibold (14px, 600 weight)
 */
const contentStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12, // gap-3 per DESIGN-KEY
  padding: '12px 32px', // py-3 px-8 per DESIGN-KEY
  backgroundColor: stormGray,
  color: '#ffffff',
  fontWeight: 600, // font-semibold
  fontSize: 14, // text-sm
};

// ============================================================================
// Types
// ============================================================================

export interface OfflineBannerProps {
  /** Whether background sync is currently in progress */
  isSyncing?: boolean;
  /** Current sync progress (X of Y items) */
  syncProgress?: { completed: number; total: number } | null;
}

/**
 * OfflineBanner Component
 *
 * Displays a sticky banner at the top of the viewport when the user
 * goes offline or when syncing is in progress. Automatically hides
 * with a smooth transition when connectivity is restored and sync completes.
 *
 * Design: Storm Gray (#6b7280) with cloud icon per DESIGN-KEY.md.
 *
 * @example
 * ```tsx
 * // Basic usage (offline detection only)
 * <OfflineBanner />
 *
 * // With sync state from BackgroundSyncProvider
 * <OfflineBanner isSyncing={isSyncing} syncProgress={progress} />
 * ```
 */
export function OfflineBanner({ isSyncing = false, syncProgress = null }: OfflineBannerProps) {
  const isOnline = useOnlineStatus();
  const { pendingCount } = usePendingSync();
  const [isVisible, setIsVisible] = useState(!isOnline);
  const [shouldRender, setShouldRender] = useState(!isOnline);

  // Handle visibility transitions - show when offline OR syncing
  useEffect(() => {
    const shouldShow = !isOnline || isSyncing;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (shouldShow) {
      // Show banner
      setShouldRender(true);
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      // Hide with animation first
      setIsVisible(false);
      // Wait for animation to complete before removing from DOM
      timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
    }

    // Always return cleanup function for defensive coding
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOnline, isSyncing]);

  // Don't render anything if online and animation complete
  if (!shouldRender) {
    return null;
  }

  return (
    <div
      style={{
        ...bannerStyles,
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out',
      }}
      role="alert"
      aria-live="polite"
    >
      <div style={contentStyles}>
        {/* Show sync icon when syncing, cloud_off icon when offline */}
        {isSyncing ? (
          <SyncOutlined spin style={{ fontSize: 18 }} />
        ) : (
          <span
            className="material-symbols-outlined animate-pulse"
            style={{ fontSize: 18 }}
          >
            cloud_off
          </span>
        )}

        {/* Banner text based on state */}
        {isSyncing ? (
          <>
            <span>Syncing...</span>
            {syncProgress && (
              <span style={{ opacity: 0.85, fontWeight: 400 }}>
                &mdash; {syncProgress.completed} of {syncProgress.total} items
              </span>
            )}
          </>
        ) : (
          <>
            <span>Offline mode</span>
            {pendingCount > 0 ? (
              <span style={{ opacity: 0.85, fontWeight: 400 }}>
                &mdash; {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending sync
              </span>
            ) : (
              <span style={{ opacity: 0.85, fontWeight: 400 }}>
                &mdash; some features unavailable
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default OfflineBanner;
