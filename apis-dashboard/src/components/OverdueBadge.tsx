/**
 * OverdueBadge Component
 *
 * A small red badge showing the count of overdue tasks for a hive.
 * Designed to be overlaid on hive cards in list views.
 *
 * Part of Epic 14, Story 14.6: Portal Hive Detail Task Count Integration
 */
import { Badge } from 'antd';

export interface OverdueBadgeProps {
  /** Number of overdue tasks. If 0 or undefined, renders nothing. */
  count: number;
  /** Child element to wrap (optional - can be used standalone) */
  children?: React.ReactNode;
}

/**
 * Displays a red badge with overdue task count.
 *
 * Features:
 * - Renders nothing if count is 0 or undefined (hidden when no overdue tasks)
 * - Uses Ant Design Badge with error status for consistent red styling
 * - Can wrap a child element or be used standalone
 *
 * @example
 * // Wrapping a hive card
 * <OverdueBadge count={3}>
 *   <HiveCard {...props} />
 * </OverdueBadge>
 *
 * @example
 * // Standalone
 * {overdue > 0 && <OverdueBadge count={overdue} />}
 */
export function OverdueBadge({ count, children }: OverdueBadgeProps) {
  // Don't render anything if count is 0 or undefined
  if (!count || count <= 0) {
    return children ? <>{children}</> : null;
  }

  return (
    <Badge
      count={count}
      size="small"
      offset={[-5, 5]}
      style={{
        // Ensure the badge is visible with a contrasting background
        boxShadow: '0 0 0 1px #fff',
      }}
    >
      {children}
    </Badge>
  );
}

export default OverdueBadge;
