/**
 * Shared utility functions
 */

// Inspection helpers - Epic 5, Story 5.2
export { getLastInspectionText } from './inspectionHelpers';

// Calendar helpers - Epic 6, Story 6.6
export { getBadgeStatus, getBadgeColor, truncateText } from './calendarUtils';

// Activity feed helpers - Epic 13, Story 13.17
export { getActivityIcon, getActivityColor, getActivityEntityLink } from './activityUtils';

// Queen helpers - Epic 14, Story 14.7
export { formatQueenSource, calculateQueenAge } from './queenHelpers';

// Task helpers - Dashboard Refactoring Pass 5
export {
  cachedToTask,
  isCacheStale,
  isOverdue,
  sortByPriority,
  sortByPriorityThenDueDate,
  priorityOrder,
} from './taskUtils';

// Security helpers - AUTH-001-6-DASH remediation
export { sanitizeString, sanitizeError, safeConsole } from './sanitizeError';

// URL validation helpers - Security XSS-001-3, CSRF-001-2
export {
  isValidImageUrl,
  getSafeImageUrl,
  isValidRedirectUrl,
  getSafeRedirectUrl,
} from './urlValidation';

// CSRF protection helpers - Security AUTH-001-7-DASH
export {
  getCsrfToken,
  hasCsrfToken,
  getCsrfHeaders,
  clearCsrfToken,
  CSRF_HEADER_NAME,
} from './csrf';
