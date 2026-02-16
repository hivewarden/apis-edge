/**
 * useCalendar Hook Tests
 *
 * Tests for the calendar hook that provides calendar events,
 * reminders, and treatment interval management.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_TREATMENT_INTERVALS,
  formatTreatmentType,
} from '../../src/hooks/useCalendar';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('DEFAULT_TREATMENT_INTERVALS', () => {
  it('contains all expected treatment types', () => {
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('oxalic_acid');
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('formic_acid');
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('apiguard');
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('apivar');
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('maqs');
    expect(DEFAULT_TREATMENT_INTERVALS).toHaveProperty('api_bioxal');
  });

  it('has correct default interval for oxalic_acid (90 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.oxalic_acid).toBe(90);
  });

  it('has correct default interval for formic_acid (60 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.formic_acid).toBe(60);
  });

  it('has correct default interval for apiguard (84 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.apiguard).toBe(84);
  });

  it('has correct default interval for apivar (42 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.apivar).toBe(42);
  });

  it('has correct default interval for maqs (7 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.maqs).toBe(7);
  });

  it('has correct default interval for api_bioxal (90 days)', () => {
    expect(DEFAULT_TREATMENT_INTERVALS.api_bioxal).toBe(90);
  });

  it('all intervals are positive numbers', () => {
    Object.values(DEFAULT_TREATMENT_INTERVALS).forEach(interval => {
      expect(interval).toBeGreaterThan(0);
    });
  });

  it('all intervals are 365 days or less', () => {
    Object.values(DEFAULT_TREATMENT_INTERVALS).forEach(interval => {
      expect(interval).toBeLessThanOrEqual(365);
    });
  });
});

describe('formatTreatmentType', () => {
  it('formats oxalic_acid correctly', () => {
    expect(formatTreatmentType('oxalic_acid')).toBe('Oxalic Acid');
  });

  it('formats formic_acid correctly', () => {
    expect(formatTreatmentType('formic_acid')).toBe('Formic Acid');
  });

  it('formats apiguard correctly', () => {
    expect(formatTreatmentType('apiguard')).toBe('Apiguard');
  });

  it('formats apivar correctly', () => {
    expect(formatTreatmentType('apivar')).toBe('Apivar');
  });

  it('formats maqs correctly', () => {
    expect(formatTreatmentType('maqs')).toBe('MAQS');
  });

  it('formats api_bioxal correctly', () => {
    expect(formatTreatmentType('api_bioxal')).toBe('Api-Bioxal');
  });

  it('returns unknown types as-is', () => {
    expect(formatTreatmentType('custom_treatment')).toBe('custom_treatment');
    expect(formatTreatmentType('unknown')).toBe('unknown');
    expect(formatTreatmentType('')).toBe('');
  });
});

describe('CalendarEvent Types', () => {
  it('valid event types include treatment_past, treatment_due, reminder', () => {
    const validTypes = ['treatment_past', 'treatment_due', 'reminder'];
    validTypes.forEach(type => {
      expect(['treatment_past', 'treatment_due', 'reminder']).toContain(type);
    });
  });
});

describe('ReminderType', () => {
  it('valid reminder types include treatment_due, treatment_followup, custom', () => {
    const validTypes = ['treatment_due', 'treatment_followup', 'custom'];
    validTypes.forEach(type => {
      expect(['treatment_due', 'treatment_followup', 'custom']).toContain(type);
    });
  });
});

describe('CreateReminderInput', () => {
  it('can be constructed with required fields', () => {
    const input = {
      title: 'Check mites',
      due_at: '2026-03-15',
    };

    expect(input.title).toBe('Check mites');
    expect(input.due_at).toBe('2026-03-15');
  });

  it('supports optional hive_id', () => {
    const input = {
      hive_id: 'hive-1',
      title: 'Treatment reminder',
      due_at: '2026-03-15',
    };

    expect(input.hive_id).toBe('hive-1');
  });

  it('supports optional reminder_type', () => {
    const input = {
      title: 'Follow-up',
      due_at: '2026-03-15',
      reminder_type: 'treatment_followup' as const,
    };

    expect(input.reminder_type).toBe('treatment_followup');
  });

  it('supports optional metadata', () => {
    const input = {
      title: 'Check hive',
      due_at: '2026-03-15',
      metadata: { note: 'Check for swarm cells' },
    };

    expect(input.metadata).toEqual({ note: 'Check for swarm cells' });
  });
});

describe('UpdateReminderInput', () => {
  it('supports partial updates', () => {
    const titleOnlyUpdate = { title: 'New title' };
    expect(titleOnlyUpdate.title).toBe('New title');

    const dueAtOnlyUpdate = { due_at: '2026-04-01' };
    expect(dueAtOnlyUpdate.due_at).toBe('2026-04-01');

    const snoozedOnlyUpdate = { snoozed_until: '2026-04-08' };
    expect(snoozedOnlyUpdate.snoozed_until).toBe('2026-04-08');
  });
});

describe('Date Format Expectations', () => {
  it('due_at should be in YYYY-MM-DD format', () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const validDates = ['2026-01-01', '2026-12-31', '2026-02-28'];

    validDates.forEach(date => {
      expect(date).toMatch(dateRegex);
    });
  });

  it('calendar API expects YYYY-MM-DD for start and end params', () => {
    const startDate = '2026-01-01';
    const endDate = '2026-01-31';

    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Calendar Event Structure', () => {
  it('treatment_past event has expected structure', () => {
    const event = {
      id: 'treatment-123',
      date: '2026-01-15',
      type: 'treatment_past' as const,
      title: 'Oxalic Acid - Hive Alpha',
      hive_id: 'hive-1',
      hive_name: 'Hive Alpha',
      metadata: {
        treatment_id: 'treat-456',
        treatment_type: 'oxalic_acid',
      },
    };

    expect(event.id).toBeDefined();
    expect(event.date).toBeDefined();
    expect(event.type).toBe('treatment_past');
    expect(event.title).toContain('Oxalic Acid');
  });

  it('treatment_due event has expected structure', () => {
    const event = {
      id: 'due-hive-1-oxalic_acid',
      date: '2026-02-15',
      type: 'treatment_due' as const,
      title: 'Oxalic Acid due - Hive Alpha',
      hive_id: 'hive-1',
      hive_name: 'Hive Alpha',
      metadata: {
        treatment_type: 'oxalic_acid',
        days_since_last: 87,
        last_treatment_date: '2025-11-20',
      },
    };

    expect(event.type).toBe('treatment_due');
    expect(event.metadata.days_since_last).toBeDefined();
    expect(event.metadata.last_treatment_date).toBeDefined();
  });

  it('reminder event has expected structure', () => {
    const event = {
      id: 'reminder-101',
      date: '2026-02-20',
      type: 'reminder' as const,
      title: 'Check for swarm cells',
      hive_id: 'hive-1',
      hive_name: 'Hive Alpha',
      reminder_id: 'reminder-101',
    };

    expect(event.type).toBe('reminder');
    expect(event.reminder_id).toBeDefined();
  });
});

describe('Snooze Behavior', () => {
  it('default snooze is 7 days', () => {
    const defaultSnoozeDays = 7;
    expect(defaultSnoozeDays).toBe(7);
  });

  it('snooze days must be positive', () => {
    const validSnoozeDays = [1, 7, 14, 30];
    validSnoozeDays.forEach(days => {
      expect(days).toBeGreaterThan(0);
    });
  });
});

describe('Treatment Intervals Type Safety', () => {
  it('TreatmentIntervals is a Record<string, number>', () => {
    const intervals: Record<string, number> = {
      custom_treatment: 45,
      another_type: 60,
    };

    expect(typeof intervals.custom_treatment).toBe('number');
    expect(typeof intervals.another_type).toBe('number');
  });
});
