/**
 * Pagination Constants
 *
 * Default values for paginated data fetching across the application.
 * Centralizes pagination configuration to ensure consistency.
 *
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */

/**
 * Default limit for activity feed queries.
 * Used by useActivityFeed hook and Activity page.
 */
export const ACTIVITY_FEED_DEFAULT_LIMIT = 20;

/**
 * Maximum allowed limit for activity feed queries (server enforced).
 */
export const ACTIVITY_FEED_MAX_LIMIT = 100;

/**
 * Default limit for compact activity cards (Dashboard, detail pages).
 */
export const ACTIVITY_CARD_DEFAULT_LIMIT = 5;
