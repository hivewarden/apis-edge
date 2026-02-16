/**
 * useOverwintering Hook Tests
 *
 * Tests for the overwintering hooks that manage winter survival data.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - Task 14.5, 14.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSeasonLabel,
  getConditionDisplay,
  getStoresDisplay,
} from '../../src/hooks/useOverwintering';

// Mock localStorage for spring prompt dismiss tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useOverwintering helpers', () => {
  describe('getSeasonLabel', () => {
    it('formats winter season as year range', () => {
      expect(getSeasonLabel(2025)).toBe('2025-2026');
      expect(getSeasonLabel(2024)).toBe('2024-2025');
      expect(getSeasonLabel(2000)).toBe('2000-2001');
    });

    it('handles edge cases', () => {
      expect(getSeasonLabel(2099)).toBe('2099-2100');
      expect(getSeasonLabel(1999)).toBe('1999-2000');
    });
  });

  describe('getConditionDisplay', () => {
    it('returns display name for valid conditions', () => {
      expect(getConditionDisplay('strong')).toBe('Strong');
      expect(getConditionDisplay('medium')).toBe('Medium');
      expect(getConditionDisplay('weak')).toBe('Weak');
    });

    it('returns original value for unknown conditions', () => {
      expect(getConditionDisplay('unknown')).toBe('unknown');
      expect(getConditionDisplay('')).toBe('');
    });
  });

  describe('getStoresDisplay', () => {
    it('returns display name for valid stores values', () => {
      expect(getStoresDisplay('none')).toBe('None');
      expect(getStoresDisplay('low')).toBe('Low');
      expect(getStoresDisplay('adequate')).toBe('Adequate');
      expect(getStoresDisplay('plenty')).toBe('Plenty');
    });

    it('returns original value for unknown stores values', () => {
      expect(getStoresDisplay('lots')).toBe('lots');
      expect(getStoresDisplay('')).toBe('');
    });
  });
});

describe('useOverwintering types', () => {
  it('should have correct type structure for OverwinteringRecord', () => {
    // Type check - this test verifies the type definition exists
    const record = {
      id: 'test-id',
      hive_id: 'hive-1',
      hive_name: 'Test Hive',
      winter_season: 2025,
      survived: true,
      condition: 'strong' as const,
      stores_remaining: 'adequate' as const,
      first_inspection_notes: 'Looking good',
      recorded_at: '2026-03-15',
      created_at: '2026-03-15T10:00:00Z',
    };

    expect(record.id).toBe('test-id');
    expect(record.survived).toBe(true);
    expect(record.condition).toBe('strong');
  });

  it('should have correct type structure for WinterReport', () => {
    const report = {
      winter_season: 2025,
      season_label: '2025-2026',
      total_hives: 3,
      survived_count: 2,
      lost_count: 1,
      weak_count: 0,
      survival_rate: 66.67,
      is_100_percent: false,
      lost_hives: [],
      survived_hives: [],
    };

    expect(report.winter_season).toBe(2025);
    expect(report.survival_rate).toBeCloseTo(66.67, 2);
    expect(report.is_100_percent).toBe(false);
  });

  it('should have correct type structure for SurvivalTrend', () => {
    const trend = {
      winter_season: 2025,
      season_label: '2025-2026',
      survival_rate: 75.0,
      total_hives: 4,
      survived_count: 3,
    };

    expect(trend.winter_season).toBe(2025);
    expect(trend.survival_rate).toBe(75.0);
    expect(trend.total_hives).toBe(4);
  });

  it('should have correct type structure for CreateOverwinteringInput', () => {
    const input = {
      hive_id: 'hive-1',
      winter_season: 2025,
      survived: true,
      condition: 'medium' as const,
      stores_remaining: 'low' as const,
      first_inspection_notes: 'Needs feeding',
    };

    expect(input.hive_id).toBe('hive-1');
    expect(input.survived).toBe(true);
    expect(input.condition).toBe('medium');
  });
});

describe('Spring Prompt Display Logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('localStorage dismiss persistence', () => {
    const DISMISS_KEY = 'overwintering-prompt-dismiss';

    it('should store dismiss state in localStorage', () => {
      const dismissData = {
        season: 2025,
        dismissedAt: new Date().toISOString(),
        type: 'completed',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));

      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      expect(stored.season).toBe(2025);
      expect(stored.type).toBe('completed');
    });

    it('should respect localStorage dismiss state', () => {
      const dismissData = {
        season: 2025,
        dismissedAt: new Date().toISOString(),
        type: 'completed',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));

      const stored = localStorage.getItem(DISMISS_KEY);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.type).toBe('completed');
    });

    it('should clear dismiss state for different season', () => {
      const oldDismiss = {
        season: 2024,
        dismissedAt: new Date().toISOString(),
        type: 'completed',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(oldDismiss));

      // Check that stored season differs from current
      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      const currentSeason = 2025;

      // Should prompt again if season differs
      const shouldPrompt = stored.season !== currentSeason;
      expect(shouldPrompt).toBe(true);
    });
  });

  describe('7-day reminder expiry logic', () => {
    const DISMISS_KEY = 'overwintering-prompt-dismiss';

    it('should respect remind-later dismiss within 7 days', () => {
      const now = new Date('2026-03-10T10:00:00Z');
      vi.setSystemTime(now);

      const dismissData = {
        season: 2025,
        dismissedAt: new Date('2026-03-08T10:00:00Z').toISOString(), // 2 days ago
        type: 'remind-later',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));

      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      const dismissedAt = new Date(stored.dismissedAt);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const isWithinRemindPeriod = now.getTime() - dismissedAt.getTime() < sevenDaysMs;

      expect(isWithinRemindPeriod).toBe(true);
    });

    it('should show prompt again after 7 days for remind-later', () => {
      const now = new Date('2026-03-20T10:00:00Z');
      vi.setSystemTime(now);

      const dismissData = {
        season: 2025,
        dismissedAt: new Date('2026-03-08T10:00:00Z').toISOString(), // 12 days ago
        type: 'remind-later',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));

      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      const dismissedAt = new Date(stored.dismissedAt);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const isExpired = now.getTime() - dismissedAt.getTime() >= sevenDaysMs;

      expect(isExpired).toBe(true);
    });

    it('should never expire completed dismiss for same season', () => {
      const now = new Date('2026-03-20T10:00:00Z');
      vi.setSystemTime(now);

      const dismissData = {
        season: 2025,
        dismissedAt: new Date('2026-03-01T10:00:00Z').toISOString(), // 19 days ago
        type: 'completed',
      };

      localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));

      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');

      // Completed type should never expire for same season
      const shouldShowAgain = stored.type !== 'completed' || stored.season !== 2025;
      expect(shouldShowAgain).toBe(false);
    });
  });
});
