/**
 * MiniHiveVisualization Component
 *
 * Displays a miniature visual representation of a hive's box configuration.
 * Part of Epic 5, Story 5.2 remediation: Extract shared component.
 */

import { Badge } from 'antd';
import { colors } from '../theme/apisTheme';
import type { HiveListItem } from '../types';

export interface MiniHiveVisualizationProps {
  /** Number of brood boxes (1-3) */
  broodBoxes: number;
  /** Number of honey supers (0-5) */
  honeySupers: number;
  /** Hive status for the badge dot color */
  status: HiveListItem['status'];
  /** Maximum boxes to display (default 2 for mini view) */
  maxDisplay?: number;
}

/**
 * Renders a miniature hive diagram showing:
 * - Brood boxes (brown, at bottom)
 * - Honey supers (orange/gold, above brood)
 * - Roof (brown, at top)
 * - Status dot badge
 */
export function MiniHiveVisualization({
  broodBoxes,
  honeySupers,
  status,
  maxDisplay = 2,
}: MiniHiveVisualizationProps) {
  const badgeStatus = status === 'healthy' ? 'success' : status === 'needs_attention' ? 'warning' : 'default';

  return (
    <Badge
      dot
      status={badgeStatus}
      offset={[-4, 4]}
    >
      <div style={{
        width: 48,
        height: 48,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 4,
        backgroundColor: 'rgba(247, 164, 45, 0.1)',
        borderRadius: 6,
      }}>
        {/* Brood boxes */}
        {Array.from({ length: Math.min(broodBoxes, maxDisplay) }).map((_, i) => (
          <div
            key={`b-${i}`}
            style={{
              width: 28,
              height: 8,
              backgroundColor: colors.brownBramble,
              borderRadius: 2,
              marginTop: i > 0 ? 1 : 0,
            }}
          />
        ))}
        {/* Honey supers */}
        {Array.from({ length: Math.min(honeySupers, maxDisplay) }).map((_, i) => (
          <div
            key={`s-${i}`}
            style={{
              width: 28,
              height: 6,
              backgroundColor: colors.seaBuckthorn,
              borderRadius: 2,
              marginTop: 1,
            }}
          />
        ))}
        {/* Roof */}
        <div
          style={{
            width: 32,
            height: 4,
            backgroundColor: colors.brownBramble,
            borderRadius: '2px 2px 0 0',
            marginTop: 1,
          }}
        />
      </div>
    </Badge>
  );
}

export default MiniHiveVisualization;
