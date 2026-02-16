/**
 * Calendar Utility Functions
 *
 * Shared utilities for calendar-related components.
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import type { BadgeProps } from 'antd';
import type { CalendarEvent } from '../hooks/useCalendar';
import { colors } from '../theme/apisTheme';

/**
 * Get Ant Design Badge status for a calendar event type.
 */
export function getBadgeStatus(type: CalendarEvent['type']): BadgeProps['status'] {
  switch (type) {
    case 'treatment_past':
      return 'success'; // Green
    case 'treatment_due':
      return 'warning'; // Orange
    case 'reminder':
      return 'processing'; // Blue
    default:
      return 'default';
  }
}

/**
 * Get color for a calendar event type.
 */
export function getBadgeColor(type: CalendarEvent['type']): string {
  switch (type) {
    case 'treatment_past':
      return colors.success;
    case 'treatment_due':
      return colors.seaBuckthorn;
    case 'reminder':
      return colors.info;
    default:
      return colors.textMuted;
  }
}

/**
 * Truncate a string with ellipsis.
 * The resulting string (including ellipsis) will be at most maxLength characters.
 */
export function truncateText(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  if (maxLength <= 3) return '...'.slice(0, maxLength);
  return str.slice(0, maxLength - 3) + '...';
}
