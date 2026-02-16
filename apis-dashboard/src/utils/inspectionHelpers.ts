/**
 * Inspection helper utilities
 *
 * Shared functions for formatting and calculating inspection-related data.
 * Part of Epic 5, Story 5.2 remediation: Extract shared utilities.
 */

import dayjs from 'dayjs';
import type { HiveListItem } from '../types';

/**
 * Returns a human-readable string describing when the hive was last inspected.
 *
 * @param hive - The hive to get inspection text for
 * @returns A string like "Inspected today", "Inspected yesterday", "Inspected X days ago", or "No inspections yet"
 */
export function getLastInspectionText(hive: Pick<HiveListItem, 'last_inspection_at'>): string {
  if (!hive.last_inspection_at) {
    return 'No inspections yet';
  }
  const days = dayjs().diff(dayjs(hive.last_inspection_at), 'day');
  if (days === 0) return 'Inspected today';
  if (days === 1) return 'Inspected yesterday';
  return `Inspected ${days} days ago`;
}
