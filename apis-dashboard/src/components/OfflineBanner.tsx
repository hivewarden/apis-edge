/**
 * OfflineBanner Component
 *
 * A warm, apiary-themed banner that appears when the user loses network connectivity.
 * Features a honeycomb texture pattern and smooth slide-in animation.
 * Shows pending item count when offline (Epic 7, Story 7.3).
 * Shows "Syncing..." state when background sync is in progress (Epic 7, Story 7.4).
 *
 * Part of Epic 7, Story 7.1: Service Worker & App Shell Caching
 * Enhanced in Story 7.3 to show pending sync count
 * Enhanced in Story 7.4 to show syncing state
 */
import { CSSProperties, useEffect, useState, useContext } from 'react';
import { WifiOutlined, SyncOutlined } from '@ant-design/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePendingSync } from '../hooks/usePendingSync';
import { colors, spacing } from '../theme/apisTheme';

/** Honeycomb SVG pattern for the banner background texture */
const honeycombPattern = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23662604' fill-opacity='0.06'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

/** Styles for the banner container */
const bannerStyles: CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1100,
  overflow: 'hidden',
};

/** Content wrapper styles */
const contentStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.sm,
  padding: `${spacing.sm}px ${spacing.md}px`,
  background: `linear-gradient(135deg, ${colors.warning} 0%, #d97706 100%)`,
  backgroundImage: honeycombPattern,
  backgroundBlendMode: 'overlay',
  color: '#ffffff',
  fontWeight: 500,
  fontSize: 14,
  letterSpacing: '0.02em',
  boxShadow: `0 2px 8px rgba(230, 126, 0, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.1)`,
};

/** Icon container styles for the pulsing wifi icon */
const iconContainerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.2)',
};

/** Disconnected wifi icon with diagonal strike */
const iconStyles: CSSProperties = {
  fontSize: 14,
  position: 'relative' as const,
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
 * Design: Amber/orange gradient with honeycomb texture pattern,
 * echoing the apiary theme while clearly communicating a warning state.
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
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
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
        {/* Show sync icon when syncing, wifi icon when offline */}
        {isSyncing ? (
          <div style={iconContainerStyles}>
            <SyncOutlined spin style={iconStyles} />
          </div>
        ) : (
          <div style={iconContainerStyles}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <WifiOutlined style={iconStyles} />
              {/* Diagonal strike-through line */}
              <span
                style={{
                  position: 'absolute',
                  width: 18,
                  height: 2,
                  background: '#ffffff',
                  transform: 'rotate(-45deg)',
                  borderRadius: 1,
                  top: '50%',
                  left: '50%',
                  marginTop: -1,
                  marginLeft: -9,
                }}
              />
            </span>
          </div>
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
