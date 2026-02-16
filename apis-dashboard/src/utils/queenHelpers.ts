/**
 * Queen helper utilities
 *
 * Shared functions for formatting and calculating queen-related data.
 * Used by HiveDetail, HiveDetailMobile, and HiveDetailDesktop components.
 *
 * Part of Epic 14, Story 14.7 remediation: Extract shared utilities.
 */

import dayjs from 'dayjs';

/**
 * Formats a queen source string for display.
 *
 * @param source - The queen source value (e.g., 'breeder', 'swarm')
 * @returns Formatted string with first letter capitalized, or 'Unknown' if null
 */
export function formatQueenSource(source: string | null): string {
  if (!source) return 'Unknown';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/**
 * Calculates and formats the queen age based on introduction date.
 *
 * @param introducedAt - ISO date string when queen was introduced
 * @returns Human-readable age string (e.g., "5 days", "3 months", "1y 2m")
 */
export function calculateQueenAge(introducedAt: string): string {
  const days = dayjs().diff(dayjs(introducedAt), 'day');
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years} year${years > 1 ? 's' : ''}`;
  return `${years}y ${remainingMonths}m`;
}
