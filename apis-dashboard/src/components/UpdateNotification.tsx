/**
 * UpdateNotification Component
 *
 * A warm, honey-themed notification that appears when a new version
 * of the PWA is available. Features a honeycomb accent border and
 * smooth entrance animation.
 *
 * Part of Epic 7, Story 7.1: Service Worker & App Shell Caching
 */
import { CSSProperties, useEffect, useState } from 'react';
import { Button, Space } from 'antd';
import { GiftOutlined, CloseOutlined } from '@ant-design/icons';
import { useSWUpdate } from '../hooks/useSWUpdate';
import { colors, spacing } from '../theme/apisTheme';

/** Honeycomb accent border SVG for the left edge */
const honeycombBorder = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='14' viewBox='0 0 8 14'%3E%3Cpath fill='%23f7a42d' d='M4 0l4 2.5v5L4 10 0 7.5v-5L4 0zm0 2L2 3.2v3.6L4 8l2-1.2V3.2L4 2z'/%3E%3C/svg%3E")`;

/** Container positioning styles */
const containerStyles: CSSProperties = {
  position: 'fixed',
  bottom: spacing.lg,
  right: spacing.lg,
  zIndex: 1200,
  maxWidth: 340,
  width: 'calc(100% - 48px)',
};

/** Toast card styles */
const toastStyles: CSSProperties = {
  background: colors.coconutCream,
  borderRadius: 12,
  boxShadow: `
    0 4px 24px rgba(102, 38, 4, 0.15),
    0 8px 32px rgba(102, 38, 4, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.8)
  `,
  border: `1px solid ${colors.seaBuckthorn}40`,
  overflow: 'hidden',
};

/** Inner content wrapper */
const contentWrapperStyles: CSSProperties = {
  display: 'flex',
  position: 'relative' as const,
};

/** Honeycomb accent stripe on the left */
const accentStripeStyles: CSSProperties = {
  width: 6,
  background: `linear-gradient(180deg, ${colors.seaBuckthorn} 0%, #d97706 100%)`,
  backgroundImage: honeycombBorder,
  backgroundRepeat: 'repeat-y',
  backgroundSize: '8px 14px',
  backgroundBlendMode: 'overlay',
  flexShrink: 0,
};

/** Main content area styles */
const contentStyles: CSSProperties = {
  flex: 1,
  padding: spacing.md,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: spacing.sm,
};

/** Header row with icon and close button */
const headerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: spacing.sm,
};

/** Gift icon wrapper with honey glow */
const iconWrapperStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 8,
  background: `linear-gradient(135deg, ${colors.seaBuckthorn}20 0%, ${colors.salomie}60 100%)`,
  border: `1px solid ${colors.seaBuckthorn}30`,
  flexShrink: 0,
};

/** Title text styles */
const titleStyles: CSSProperties = {
  color: colors.brownBramble,
  fontWeight: 600,
  fontSize: 15,
  lineHeight: 1.3,
  margin: 0,
};

/** Description text styles */
const descriptionStyles: CSSProperties = {
  color: colors.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
};

/** Close button styles */
const closeButtonStyles: CSSProperties = {
  color: colors.textMuted,
  padding: 4,
  height: 'auto',
  lineHeight: 1,
};

/**
 * UpdateNotification Component
 *
 * Displays a toast notification when a new version of the PWA is available.
 * Users can either click "Refresh" to apply the update immediately or
 * dismiss the notification to update later.
 *
 * Design: Warm cream background with a honeycomb-textured gold accent
 * stripe, evoking the feeling of discovering fresh honey in the hive.
 *
 * @example
 * ```tsx
 * // Add to App.tsx or AppLayout - will show automatically when update available
 * <UpdateNotification />
 * ```
 */
export function UpdateNotification() {
  const { needRefresh, updateServiceWorker } = useSWUpdate();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle show/hide transitions
  useEffect(() => {
    if (needRefresh && !isDismissed) {
      // Show notification with animation
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      // Hide with animation
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [needRefresh, isDismissed]);

  // Reset dismissed state when a new update becomes available
  useEffect(() => {
    if (needRefresh) {
      setIsDismissed(false);
    }
  }, [needRefresh]);

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const handleRefresh = () => {
    updateServiceWorker();
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      style={{
        ...containerStyles,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }}
      role="alertdialog"
      aria-labelledby="update-notification-title"
      aria-describedby="update-notification-desc"
    >
      <div style={toastStyles}>
        <div style={contentWrapperStyles}>
          {/* Honeycomb accent stripe */}
          <div style={accentStripeStyles} aria-hidden="true" />

          {/* Main content */}
          <div style={contentStyles}>
            {/* Header with icon and close */}
            <div style={headerStyles}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <div style={iconWrapperStyles}>
                  <GiftOutlined
                    style={{
                      fontSize: 18,
                      color: colors.seaBuckthorn,
                    }}
                  />
                </div>
                <div>
                  <h3 id="update-notification-title" style={titleStyles}>
                    New version available
                  </h3>
                </div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined style={{ fontSize: 12 }} />}
                onClick={handleDismiss}
                style={closeButtonStyles}
                aria-label="Dismiss notification"
              />
            </div>

            {/* Description */}
            <p id="update-notification-desc" style={descriptionStyles}>
              A fresh update is ready. Refresh to get the latest features and improvements.
            </p>

            {/* Action buttons */}
            <Space size="small" style={{ marginTop: 4 }}>
              <Button
                type="primary"
                size="middle"
                onClick={handleRefresh}
                style={{
                  background: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                  fontWeight: 500,
                }}
              >
                Refresh Now
              </Button>
              <Button
                type="text"
                size="middle"
                onClick={handleDismiss}
                style={{
                  color: colors.textMuted,
                }}
              >
                Later
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpdateNotification;
