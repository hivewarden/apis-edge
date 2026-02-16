/**
 * Common IANA Timezones
 *
 * Shared timezone list for use across site components.
 * These are common IANA timezone identifiers for European and global users.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */

export interface TimezoneOption {
  value: string;
  label: string;
}

export const TIMEZONES: TimezoneOption[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Brussels', label: 'Europe/Brussels' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
  { value: 'Europe/Rome', label: 'Europe/Rome' },
  { value: 'Europe/Vienna', label: 'Europe/Vienna' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
  { value: 'Europe/Prague', label: 'Europe/Prague' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
  { value: 'Europe/Oslo', label: 'Europe/Oslo' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki' },
  { value: 'Europe/Athens', label: 'Europe/Athens' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin' },
  { value: 'America/New_York', label: 'America/New York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles' },
  { value: 'America/Toronto', label: 'America/Toronto' },
  { value: 'America/Vancouver', label: 'America/Vancouver' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
];
