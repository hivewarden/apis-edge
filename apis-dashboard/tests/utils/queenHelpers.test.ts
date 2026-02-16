/**
 * Queen Helper Utilities Tests
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatQueenSource, calculateQueenAge } from '../../src/utils/queenHelpers';

describe('formatQueenSource', () => {
  it('returns "Unknown" when source is null', () => {
    expect(formatQueenSource(null)).toBe('Unknown');
  });

  it('capitalizes the first letter of the source', () => {
    expect(formatQueenSource('breeder')).toBe('Breeder');
    expect(formatQueenSource('swarm')).toBe('Swarm');
    expect(formatQueenSource('split')).toBe('Split');
    expect(formatQueenSource('package')).toBe('Package');
    expect(formatQueenSource('other')).toBe('Other');
  });

  it('handles already capitalized sources', () => {
    expect(formatQueenSource('Breeder')).toBe('Breeder');
  });

  it('handles empty string', () => {
    expect(formatQueenSource('')).toBe('Unknown');
  });
});

describe('calculateQueenAge', () => {
  beforeEach(() => {
    // Mock Date to ensure consistent test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-30'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns days for ages less than 30 days', () => {
    expect(calculateQueenAge('2026-01-25')).toBe('5 days');
    expect(calculateQueenAge('2026-01-29')).toBe('1 days');
    expect(calculateQueenAge('2026-01-30')).toBe('0 days');
  });

  it('returns months for ages between 30 days and 1 year', () => {
    expect(calculateQueenAge('2025-12-30')).toBe('1 months');
    expect(calculateQueenAge('2025-10-30')).toBe('3 months');
    expect(calculateQueenAge('2025-07-30')).toBe('6 months');
  });

  it('returns years for ages 1 year or more', () => {
    expect(calculateQueenAge('2025-01-30')).toBe('1 year');
    expect(calculateQueenAge('2024-01-30')).toBe('2 years');
  });

  it('returns years and months for mixed ages', () => {
    expect(calculateQueenAge('2024-10-30')).toBe('1y 3m');
    expect(calculateQueenAge('2023-07-30')).toBe('2y 6m');
  });
});
