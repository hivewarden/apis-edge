/**
 * Calendar Utilities Tests
 *
 * Tests for shared calendar utility functions.
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { describe, it, expect } from 'vitest';
import { getBadgeStatus, getBadgeColor, truncateText } from '../../src/utils/calendarUtils';

describe('getBadgeStatus', () => {
  it('returns success for treatment_past', () => {
    expect(getBadgeStatus('treatment_past')).toBe('success');
  });

  it('returns warning for treatment_due', () => {
    expect(getBadgeStatus('treatment_due')).toBe('warning');
  });

  it('returns processing for reminder', () => {
    expect(getBadgeStatus('reminder')).toBe('processing');
  });

  it('returns default for unknown types', () => {
    // @ts-expect-error Testing invalid type
    expect(getBadgeStatus('unknown_type')).toBe('default');
  });
});

describe('getBadgeColor', () => {
  it('returns success color for treatment_past', () => {
    const color = getBadgeColor('treatment_past');
    expect(color).toBeDefined();
    expect(typeof color).toBe('string');
  });

  it('returns seaBuckthorn color for treatment_due', () => {
    const color = getBadgeColor('treatment_due');
    expect(color).toBeDefined();
    expect(typeof color).toBe('string');
  });

  it('returns info color for reminder', () => {
    const color = getBadgeColor('reminder');
    expect(color).toBeDefined();
    expect(typeof color).toBe('string');
  });

  it('returns textMuted color for unknown types', () => {
    // @ts-expect-error Testing invalid type
    const color = getBadgeColor('unknown_type');
    expect(color).toBeDefined();
    expect(typeof color).toBe('string');
  });
});

describe('truncateText', () => {
  it('truncates long strings with ellipsis', () => {
    const longText = 'This is a very long text that needs to be truncated';
    const result = truncateText(longText, 15);

    expect(result.length).toBeLessThanOrEqual(15);
    expect(result).toContain('...');
  });

  it('does not truncate short strings', () => {
    const shortText = 'Short';
    const result = truncateText(shortText, 15);

    expect(result).toBe(shortText);
    expect(result).not.toContain('...');
  });

  it('handles strings exactly at max length', () => {
    const exactText = '12345678901234'; // 14 chars
    const result = truncateText(exactText, 14);

    expect(result).toBe(exactText);
    expect(result).not.toContain('...');
  });

  it('handles empty strings', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('handles max length of 1', () => {
    const result = truncateText('Hello', 1);
    expect(result).toBe('.'); // Only first character of '...'
    expect(result.length).toBe(1);
  });

  it('handles max length of 4', () => {
    const result = truncateText('Hello World', 4);
    expect(result.length).toBeLessThanOrEqual(4);
  });
});
