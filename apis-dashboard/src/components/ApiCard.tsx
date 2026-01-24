import { Card, CardProps } from 'antd';

/**
 * ApiCard - Styled Card component for APIS Dashboard
 *
 * Extends Ant Design Card with Honey Beegood theme defaults.
 * Theme tokens from apisTheme.ts apply automatically via ConfigProvider.
 *
 * Features:
 * - 12px border radius (via theme token borderRadiusLG)
 * - Salomie (#fcd483) background (via theme component token)
 * - Subtle shadow with brown tint (via theme boxShadowTertiary)
 * - Hoverable by default for interactive feel
 *
 * Usage:
 * ```tsx
 * <ApiCard title="Detection Stats">
 *   <p>Content here</p>
 * </ApiCard>
 * ```
 */
export interface ApiCardProps extends CardProps {
  /** Disable hover effect. Default: false (hoverable) */
  noHover?: boolean;
}

export function ApiCard({ noHover = false, hoverable, ...props }: ApiCardProps) {
  // Enable hoverable by default unless explicitly disabled
  const isHoverable = hoverable ?? !noHover;

  return <Card hoverable={isHoverable} {...props} />;
}

export default ApiCard;
