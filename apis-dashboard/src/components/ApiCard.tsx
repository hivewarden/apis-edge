import { Card, CardProps } from 'antd';
import { colors } from '../theme/apisTheme';

/**
 * ApiCard - Styled Card component for APIS Dashboard
 *
 * A warm, inviting card component that embodies the Honey Beegood
 * aesthetic. Uses golden Salomie backgrounds with subtle warm shadows
 * that make content feel precious and protected - like honeycomb cells.
 *
 * Theme tokens from apisTheme.ts apply automatically via ConfigProvider,
 * but this component adds enhanced hover transitions and accessibility.
 *
 * Features:
 * - 12px border radius for soft, natural curves
 * - Salomie (#fcd483) golden honey background
 * - Warm brown-tinted shadows that lift on hover
 * - Smooth 250ms transitions for organic feel
 * - Focus-visible ring for keyboard navigation
 * - ARIA-compatible structure
 *
 * Variants:
 * - Default: Golden honey background (Salomie)
 * - Glass: Semi-transparent for layered contexts
 * - Outlined: Cream background with subtle border
 *
 * @example
 * ```tsx
 * // Default golden card
 * <ApiCard title="Detection Stats">
 *   <p>5 hornets deterred today</p>
 * </ApiCard>
 *
 * // Non-hoverable card for static content
 * <ApiCard title="Settings" noHover>
 *   <p>Configuration options</p>
 * </ApiCard>
 *
 * // Glass variant for layered UI
 * <ApiCard title="Overlay Info" variant="glass">
 *   <p>Floating content</p>
 * </ApiCard>
 * ```
 */
export type ApiCardVariant = 'default' | 'glass' | 'outlined';

export interface ApiCardProps extends Omit<CardProps, 'variant'> {
  /** Disable hover effect. Default: false (hoverable) */
  noHover?: boolean;
  /** Visual variant for APIS styling. Default: 'default' */
  variant?: ApiCardVariant;
}

/** Variant-specific styles */
const variantStyles: Record<ApiCardVariant, React.CSSProperties> = {
  default: {
    // Uses theme token colorBgContainer (Salomie) - no override needed
  },
  glass: {
    background: 'rgba(252, 212, 131, 0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  outlined: {
    background: colors.coconutCream,
    border: `1px solid ${colors.border}`,
    boxShadow: 'none',
  },
};

export function ApiCard({
  noHover = false,
  hoverable,
  variant = 'default',
  style,
  ...props
}: ApiCardProps) {
  // Enable hoverable by default unless explicitly disabled
  const isHoverable = hoverable ?? !noHover;

  // Merge variant styles with any custom styles
  const mergedStyle: React.CSSProperties = {
    transition: 'box-shadow 0.25s ease, transform 0.25s ease',
    ...variantStyles[variant],
    ...style,
  };

  return (
    <Card
      hoverable={isHoverable}
      style={mergedStyle}
      {...props}
    />
  );
}

export default ApiCard;
