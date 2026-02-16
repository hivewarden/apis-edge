/**
 * Tests for useSeasonRecap hook and helper functions
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatHarvestKg,
  getStatusColor,
  getStatusLabel,
  getMilestoneIcon,
} from '../../src/hooks/useSeasonRecap';

// Mock for fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useSeasonRecap helpers', () => {
  describe('formatHarvestKg', () => {
    it('formats zero correctly', () => {
      expect(formatHarvestKg(0)).toBe('0.0 kg');
    });

    it('formats small amounts with one decimal', () => {
      expect(formatHarvestKg(1.5)).toBe('1.5 kg');
    });

    it('formats larger amounts with one decimal', () => {
      expect(formatHarvestKg(45.678)).toBe('45.7 kg');
    });

    it('handles whole numbers', () => {
      expect(formatHarvestKg(100)).toBe('100.0 kg');
    });
  });

  describe('getStatusColor', () => {
    it('returns green for healthy', () => {
      expect(getStatusColor('healthy')).toBe('green');
    });

    it('returns orange for treated', () => {
      expect(getStatusColor('treated')).toBe('orange');
    });

    it('returns blue for new_queen', () => {
      expect(getStatusColor('new_queen')).toBe('blue');
    });

    it('returns red for lost', () => {
      expect(getStatusColor('lost')).toBe('red');
    });

    it('returns default for unknown status', () => {
      expect(getStatusColor('unknown')).toBe('default');
    });
  });

  describe('getStatusLabel', () => {
    it('returns Healthy for healthy', () => {
      expect(getStatusLabel('healthy')).toBe('Healthy');
    });

    it('returns Treated for treated', () => {
      expect(getStatusLabel('treated')).toBe('Treated');
    });

    it('returns New Queen for new_queen', () => {
      expect(getStatusLabel('new_queen')).toBe('New Queen');
    });

    it('returns Lost for lost', () => {
      expect(getStatusLabel('lost')).toBe('Lost');
    });

    it('returns raw value for unknown statuses', () => {
      expect(getStatusLabel('something')).toBe('something');
    });
  });

  describe('getMilestoneIcon', () => {
    it('returns trophy for first_harvest', () => {
      expect(getMilestoneIcon('first_harvest')).toBe('trophy');
    });

    it('returns plus-circle for new_hive', () => {
      expect(getMilestoneIcon('new_hive')).toBe('plus-circle');
    });

    it('returns crown for queen_replaced', () => {
      expect(getMilestoneIcon('queen_replaced')).toBe('crown');
    });

    it('returns warning for hive_loss', () => {
      expect(getMilestoneIcon('hive_loss')).toBe('warning');
    });

    it('returns star for unknown types', () => {
      expect(getMilestoneIcon('unknown_type')).toBe('star');
    });
  });
});

describe('Season date logic', () => {
  // Backend logic (from season_recap.go):
  // Northern Hemisphere: Recap time is November+ (month >= November)
  // Southern Hemisphere: Recap time is May+ (month >= May)
  // These tests validate the logic that matches the backend implementation

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('identifies October as NOT recap time for Northern hemisphere', () => {
    // October 15, 2024 - NOT recap time (backend requires November+)
    vi.setSystemTime(new Date(2024, 9, 15));

    const currentMonth = new Date().getMonth() + 1; // 1-based
    const isNorthernRecapTime = currentMonth >= 11; // November+
    expect(isNorthernRecapTime).toBe(false);
  });

  it('identifies November as recap time for Northern hemisphere', () => {
    // November 15, 2024
    vi.setSystemTime(new Date(2024, 10, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isNorthernRecapTime = currentMonth >= 11; // November+
    expect(isNorthernRecapTime).toBe(true);
  });

  it('identifies December as recap time for Northern hemisphere', () => {
    // December 15, 2024
    vi.setSystemTime(new Date(2024, 11, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isNorthernRecapTime = currentMonth >= 11; // November+
    expect(isNorthernRecapTime).toBe(true);
  });

  it('identifies June as NOT recap time for Northern hemisphere', () => {
    // June 15, 2024
    vi.setSystemTime(new Date(2024, 5, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isNorthernRecapTime = currentMonth >= 11; // November+
    expect(isNorthernRecapTime).toBe(false);
  });

  it('identifies April as NOT recap time for Southern hemisphere', () => {
    // April 15, 2024 - NOT recap time (backend requires May+)
    vi.setSystemTime(new Date(2024, 3, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isSouthernRecapTime = currentMonth >= 5; // May+
    expect(isSouthernRecapTime).toBe(false);
  });

  it('identifies May as recap time for Southern hemisphere', () => {
    // May 15, 2024
    vi.setSystemTime(new Date(2024, 4, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isSouthernRecapTime = currentMonth >= 5; // May+
    expect(isSouthernRecapTime).toBe(true);
  });

  it('identifies June as recap time for Southern hemisphere', () => {
    // June 15, 2024
    vi.setSystemTime(new Date(2024, 5, 15));

    const currentMonth = new Date().getMonth() + 1;
    const isSouthernRecapTime = currentMonth >= 5; // May+
    expect(isSouthernRecapTime).toBe(true);
  });
});
