/**
 * LostHiveBadge Component
 *
 * A small badge component showing "Lost" status for hives that have been lost.
 * Uses muted styling with the loss date shown on hover.
 *
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';

export interface LostHiveBadgeProps {
  /** The date the hive was lost (ISO format string) */
  lostAt: string;
  /** Size variant */
  size?: 'small' | 'default';
}

/**
 * LostHiveBadge displays a muted "Lost" tag for hives that are no longer active.
 *
 * @example
 * <LostHiveBadge lostAt="2026-01-20" />
 */
export function LostHiveBadge({ lostAt, size = 'default' }: LostHiveBadgeProps) {
  const formattedDate = dayjs(lostAt).format('MMMM D, YYYY');

  return (
    <Tooltip title={`Lost on ${formattedDate}`}>
      <Tag
        style={{
          backgroundColor: '#f0f0f0',
          borderColor: '#d9d9d9',
          color: '#8c8c8c',
          fontStyle: 'italic',
          fontSize: size === 'small' ? 11 : 12,
          padding: size === 'small' ? '0 4px' : '0 7px',
          margin: 0,
        }}
      >
        Lost
      </Tag>
    </Tooltip>
  );
}

export default LostHiveBadge;
