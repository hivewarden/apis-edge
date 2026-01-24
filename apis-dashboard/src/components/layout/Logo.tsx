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
 * Displays the APIS brand in the sidebar header.
 * Adapts to collapsed state: shows full text when expanded, icon only when collapsed.
 */
export function Logo({ collapsed, style }: LogoProps) {
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? 0 : '0 16px',
        ...style,
      }}
    >
      <Title
        level={4}
        style={{
          color: colors.coconutCream,
          margin: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {collapsed ? '🐝' : '🐝 APIS'}
      </Title>
    </div>
  );
}

export default Logo;
