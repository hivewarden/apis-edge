/**
 * ImpersonationBanner Component
 *
 * Displays a prominent warning banner when a super-admin is impersonating a tenant.
 * Shows the tenant name being impersonated and provides a "Stop Impersonation" button.
 *
 * This banner appears at the top of the application layout to ensure the admin
 * is always aware they are operating in another tenant's context.
 *
 * Part of Epic 13, Story 13.14: Super-Admin Impersonation
 */
import { CSSProperties, useCallback, useState } from 'react';
import { API_URL } from '../../config';
import { colors } from '../../theme/apisTheme';

// ============================================================================
// Styles
// ============================================================================

/** Banner container - sticky at top */
const bannerStyles: CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1200, // Above OfflineBanner (1100)
  overflow: 'hidden',
};

/** Content wrapper - distinctive amber/caramel for warning state */
const contentStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
  padding: '16px 24px',
  backgroundColor: '#d4a574', // amber-banner color from mockup
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

/** Left side content with icon and text */
const leftContentStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 16,
};

/** Icon container - darker background circle */
const iconContainerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '50%',
  backgroundColor: 'rgba(102, 38, 4, 0.1)',
  flexShrink: 0,
};

/** Text container */
const textContainerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

/** Main message text */
const messageStyles: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: colors.brownBramble,
  lineHeight: 1,
};

/** Subtitle text */
const subtitleStyles: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'rgba(102, 38, 4, 0.8)',
  marginTop: 4,
};

/** Stop button styles */
const buttonStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 24px',
  borderRadius: 9999,
  border: `2px solid ${colors.brownBramble}`,
  backgroundColor: 'transparent',
  color: colors.brownBramble,
  fontSize: 14,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  flexShrink: 0,
};

const buttonHoverStyles: CSSProperties = {
  ...buttonStyles,
  backgroundColor: colors.brownBramble,
  color: '#fcd483', // salomie
};

// ============================================================================
// Types
// ============================================================================

export interface ImpersonationBannerProps {
  /** Name of the tenant being impersonated */
  tenantName: string;
  /** ID of the tenant being impersonated */
  tenantId: string;
  /** Callback when impersonation is stopped */
  onStop?: () => void;
}

/**
 * ImpersonationBanner Component
 *
 * Displays a sticky warning banner at the top of the viewport when a super-admin
 * is impersonating a tenant. The banner:
 * - Uses distinctive amber/caramel styling to indicate a special state
 * - Shows the name of the tenant being impersonated
 * - Shows audit warning text
 * - Provides a "Stop Impersonating" button to end the session
 *
 * @example
 * ```tsx
 * <ImpersonationBanner
 *   tenantName="Sweet Valley Apiary"
 *   tenantId="tenant-123"
 *   onStop={() => window.location.reload()}
 * />
 * ```
 */
export function ImpersonationBanner({ tenantName, tenantId, onStop }: ImpersonationBannerProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleStopImpersonation = useCallback(async () => {
    setIsStopping(true);
    try {
      const response = await fetch(`${API_URL}/admin/impersonate/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to stop impersonation');
      }

      // Notify parent and reload to get fresh session
      onStop?.();
      // Reload the page to apply new session cookie
      window.location.reload();
    } catch (error) {
      console.error('Failed to stop impersonation:', error);
      setIsStopping(false);
    }
  }, [onStop]);

  return (
    <div
      style={bannerStyles}
      role="alert"
      aria-live="polite"
    >
      <div style={contentStyles}>
        {/* Left side: Icon and text */}
        <div style={leftContentStyles}>
          {/* Warning icon in circle */}
          <div style={iconContainerStyles}>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 20,
                color: colors.brownBramble,
                fontVariationSettings: "'FILL' 1",
              }}
            >
              warning
            </span>
          </div>

          {/* Message text */}
          <div style={textContainerStyles}>
            <span style={messageStyles}>
              Viewing as {tenantName || `Tenant ${tenantId.slice(0, 8)}...`}
            </span>
            <span style={subtitleStyles}>
              Actions are logged for audit purposes.
            </span>
          </div>
        </div>

        {/* Stop button */}
        <button
          onClick={handleStopImpersonation}
          disabled={isStopping}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={isHovered ? buttonHoverStyles : buttonStyles}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18 }}
          >
            logout
          </span>
          {isStopping ? 'Stopping...' : 'Stop Impersonating'}
        </button>
      </div>
    </div>
  );
}

export default ImpersonationBanner;
