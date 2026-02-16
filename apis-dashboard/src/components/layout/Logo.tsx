import { Typography } from 'antd';
import type { CSSProperties } from 'react';
import { colors } from '../../theme/apisTheme';

const { Title } = Typography;

interface LogoProps {
  /** Whether the sidebar is in collapsed state */
  collapsed: boolean;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Variant: 'light' for white sidebar, 'dark' for mobile drawer */
  variant?: 'light' | 'dark';
}

/**
 * APIS Logo Component
 *
 * Per DESIGN-KEY mockups: Orange square icon with hive symbol + "APIS" text.
 * Supports light (white sidebar) and dark (mobile drawer) variants.
 *
 * Behavior:
 * - Expanded: Shows icon + "APIS" text
 * - Collapsed: Shows just icon centered
 */
export function Logo({ collapsed, style, variant = 'light' }: LogoProps) {
  const isDark = variant === 'dark';

  return (
    <div
      style={{
        padding: collapsed ? '24px 8px' : '24px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 12,
        transition: 'padding 0.25s ease',
        ...style,
      }}
    >
      {/* Orange square icon with hive symbol per mockups */}
      <div
        style={{
          width: 40,
          height: 40,
          background: colors.seaBuckthorn,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(102, 38, 4, 0.1)',
          flexShrink: 0,
        }}
      >
        {/* Using Material Symbol 'hive' icon */}
        <span
          className="material-symbols-outlined"
          style={{
            color: '#ffffff',
            fontSize: 24,
            fontVariationSettings: "'wght' 300",
          }}
        >
          hive
        </span>
      </div>

      {/* App name - only visible when expanded */}
      {!collapsed && (
        <Title
          level={4}
          style={{
            color: isDark ? colors.coconutCream : colors.brownBramble,
            margin: 0,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: '-0.02em',
          }}
        >
          Hive Warden
        </Title>
      )}
    </div>
  );
}

export default Logo;
