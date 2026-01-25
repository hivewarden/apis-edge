import { Typography } from 'antd';
import type { CSSProperties } from 'react';
import { colors } from '../../theme/apisTheme';

const { Title } = Typography;

interface LogoProps {
  /** Whether the sidebar is in collapsed state */
  collapsed: boolean;
  /** Additional inline styles */
  style?: CSSProperties;
}

/**
 * APIS Logo Component
 *
 * The brand mark for APIS - featuring a bee emoji and the app name.
 * Uses warm cream text on the dark brown sidebar background for
 * excellent contrast and a honey-themed aesthetic.
 *
 * Behavior:
 * - Expanded: Shows "🐝 APIS" with subtle glow effect
 * - Collapsed: Shows just "🐝" centered
 * - Smooth transition between states
 */
export function Logo({ collapsed, style }: LogoProps) {
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? 0 : '0 20px',
        borderBottom: `1px solid rgba(251, 249, 231, 0.1)`,
        transition: 'padding 0.25s ease',
        ...style,
      }}
    >
      {/* Bee icon with subtle golden glow */}
      <span
        style={{
          fontSize: collapsed ? 24 : 22,
          lineHeight: 1,
          filter: 'drop-shadow(0 0 4px rgba(247, 164, 45, 0.4))',
          transition: 'font-size 0.25s ease',
        }}
        role="img"
        aria-label="Bee"
      >
        🐝
      </span>

      {/* App name - only visible when expanded */}
      {!collapsed && (
        <Title
          level={4}
          style={{
            color: colors.coconutCream,
            margin: 0,
            marginLeft: 10,
            whiteSpace: 'nowrap',
            fontWeight: 600,
            letterSpacing: '0.5px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          }}
        >
          APIS
        </Title>
      )}
    </div>
  );
}

export default Logo;
