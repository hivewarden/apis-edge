/**
 * Tests for inspection helper utilities
 *
 * Part of Epic 5, Story 5.2 remediation: Add unit tests for shared utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';
import { getLastInspectionText } from '../../src/utils/inspectionHelpers';

describe('getLastInspectionText', () => {
  // Mock current date to make tests deterministic
  const NOW = new Date('2026-01-25T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "No inspections yet" when last_inspection_at is null', () => {
    const hive = { last_inspection_at: null };
    expect(getLastInspectionText(hive)).toBe('No inspections yet');
  });

  it('returns "Inspected today" for same-day inspection', () => {
    const hive = { last_inspection_at: '2026-01-25' };
    expect(getLastInspectionText(hive)).toBe('Inspected today');
  });

  it('returns "Inspected yesterday" for one-day-old inspection', () => {
    const hive = { last_inspection_at: '2026-01-24' };
    expect(getLastInspectionText(hive)).toBe('Inspected yesterday');
  });

  it('returns "Inspected X days ago" for older inspections', () => {
    const hive = { last_inspection_at: '2026-01-20' };
    expect(getLastInspectionText(hive)).toBe('Inspected 5 days ago');
  });

  it('handles 14-day threshold boundary (AC3)', () => {
    // 14 days ago
    const hive14 = { last_inspection_at: '2026-01-11' };
    expect(getLastInspectionText(hive14)).toBe('Inspected 14 days ago');

    // 15 days ago
    const hive15 = { last_inspection_at: '2026-01-10' };
    expect(getLastInspectionText(hive15)).toBe('Inspected 15 days ago');
  });

  it('handles very old inspections', () => {
    const hive = { last_inspection_at: '2025-01-25' };
    expect(getLastInspectionText(hive)).toBe('Inspected 365 days ago');
  });
});
