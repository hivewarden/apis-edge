/**
 * Constants Index
 *
 * Re-exports all shared constants for easy importing.
 */

export { TIMEZONES } from './timezones';
export type { TimezoneOption } from './timezones';

// Pagination constants - Epic 13, Story 13.17
export {
  ACTIVITY_FEED_DEFAULT_LIMIT,
  ACTIVITY_FEED_MAX_LIMIT,
  ACTIVITY_CARD_DEFAULT_LIMIT,
} from './pagination';

// Polling and cache constants - Dashboard Refactoring Pass 5
/** Polling interval for dashboard updates (30 seconds) */
export const POLL_INTERVAL_MS = 30000;

/** Cache staleness threshold for task data (5 minutes) */
export const CACHE_STALENESS_MINUTES = 5;
