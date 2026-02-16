/**
 * HiveStatusBadge Component
 *
 * Displays a status badge for a hive based on its inspection status.
 * Part of Epic 5, Story 5.2 remediation: Extract shared component.
 */

import { Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { HiveListItem } from '../types';
import { LostHiveBadge } from './LostHiveBadge';

export interface HiveStatusBadgeProps {
  /** The hive to display status for */
  hive: Pick<HiveListItem, 'status' | 'hive_status' | 'lost_at'>;
}

/**
 * Renders a colored tag indicating the hive's current status.
 *
 * - Lost hives show a LostHiveBadge with the date
 * - "needs_attention" shows orange warning tag
 * - "healthy" shows green success tag
 * - "unknown" shows default gray tag
 */
export function HiveStatusBadge({ hive }: HiveStatusBadgeProps) {
  // Check if hive is lost first
  if (hive.hive_status === 'lost' && hive.lost_at) {
    return <LostHiveBadge lostAt={hive.lost_at} />;
  }
  if (hive.status === 'needs_attention') {
    return (
      <Tag color="warning" icon={<WarningOutlined />}>
        Needs attention
      </Tag>
    );
  }
  if (hive.status === 'healthy') {
    return <Tag color="success">Healthy</Tag>;
  }
  return <Tag color="default">Unknown</Tag>;
}

export default HiveStatusBadge;
