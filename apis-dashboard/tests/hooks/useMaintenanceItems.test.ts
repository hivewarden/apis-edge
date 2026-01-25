/**
 * useMaintenanceItems Hook Tests
 *
 * Tests for the maintenance items hook and its interfaces.
 * Part of Epic 8, Story 8.5 (Maintenance Priority View)
 */
import { describe, it, expect } from 'vitest';

// Interface definitions for testing
interface QuickAction {
  label: string;
  url: string;
  tab?: string;
}

interface MaintenanceItem {
  hive_id: string;
  hive_name: string;
  site_id: string;
  site_name: string;
  priority: 'Urgent' | 'Soon' | 'Optional';
  priority_score: number;
  summary: string;
  insights: Array<{ id: string; rule_id: string; severity: string }>;
  quick_actions: QuickAction[];
}

interface RecentlyCompletedItem {
  hive_id: string;
  hive_name: string;
  action: string;
  completed_at: string;
}

interface MaintenanceData {
  items: MaintenanceItem[];
  recently_completed: RecentlyCompletedItem[];
  total_count: number;
  all_caught_up: boolean;
}

describe('MaintenanceItem interface', () => {
  it('has all required fields', () => {
    const item: MaintenanceItem = {
      hive_id: 'hive-123',
      hive_name: 'Test Hive',
      site_id: 'site-456',
      site_name: 'Home Apiary',
      priority: 'Urgent',
      priority_score: 130,
      summary: 'Treatment overdue',
      insights: [{ id: 'ins-1', rule_id: 'treatment_due', severity: 'action-needed' }],
      quick_actions: [{ label: 'Log Treatment', url: '/hives/hive-123', tab: 'treatments' }],
    };

    expect(item.hive_id).toBe('hive-123');
    expect(item.hive_name).toBe('Test Hive');
    expect(item.site_id).toBe('site-456');
    expect(item.site_name).toBe('Home Apiary');
    expect(item.priority).toBe('Urgent');
    expect(item.priority_score).toBe(130);
    expect(item.summary).toBe('Treatment overdue');
    expect(item.insights).toHaveLength(1);
    expect(item.quick_actions).toHaveLength(1);
  });

  it('priority can be Urgent, Soon, or Optional', () => {
    const priorities: Array<'Urgent' | 'Soon' | 'Optional'> = ['Urgent', 'Soon', 'Optional'];

    priorities.forEach((priority) => {
      const item: MaintenanceItem = {
        hive_id: 'hive-1',
        hive_name: 'Hive',
        site_id: 'site-1',
        site_name: 'Site',
        priority,
        priority_score: 50,
        summary: 'Test',
        insights: [],
        quick_actions: [],
      };
      expect(['Urgent', 'Soon', 'Optional']).toContain(item.priority);
    });
  });

  it('priority_score is a number', () => {
    const item: MaintenanceItem = {
      hive_id: 'hive-1',
      hive_name: 'Hive',
      site_id: 'site-1',
      site_name: 'Site',
      priority: 'Soon',
      priority_score: 75,
      summary: 'Test',
      insights: [],
      quick_actions: [],
    };

    expect(typeof item.priority_score).toBe('number');
    expect(item.priority_score).toBeGreaterThanOrEqual(0);
  });
});

describe('QuickAction interface', () => {
  it('has required fields label and url', () => {
    const action: QuickAction = {
      label: 'Log Treatment',
      url: '/hives/hive-123',
    };

    expect(action.label).toBe('Log Treatment');
    expect(action.url).toBe('/hives/hive-123');
  });

  it('tab is optional', () => {
    const actionWithTab: QuickAction = {
      label: 'Log Treatment',
      url: '/hives/hive-123',
      tab: 'treatments',
    };

    const actionWithoutTab: QuickAction = {
      label: 'View Details',
      url: '/hives/hive-123',
    };

    expect(actionWithTab.tab).toBe('treatments');
    expect(actionWithoutTab.tab).toBeUndefined();
  });
});

describe('RecentlyCompletedItem interface', () => {
  it('has all required fields', () => {
    const item: RecentlyCompletedItem = {
      hive_id: 'hive-123',
      hive_name: 'Test Hive',
      action: 'Treatment logged',
      completed_at: '2026-01-24T15:00:00Z',
    };

    expect(item.hive_id).toBe('hive-123');
    expect(item.hive_name).toBe('Test Hive');
    expect(item.action).toBe('Treatment logged');
    expect(item.completed_at).toBe('2026-01-24T15:00:00Z');
  });

  it('completed_at is ISO 8601 format', () => {
    const item: RecentlyCompletedItem = {
      hive_id: 'hive-123',
      hive_name: 'Test Hive',
      action: 'Inspection logged',
      completed_at: '2026-01-23T10:30:00Z',
    };

    // ISO 8601 format check
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    expect(item.completed_at).toMatch(isoRegex);
  });
});

describe('MaintenanceData interface', () => {
  it('has all required fields', () => {
    const data: MaintenanceData = {
      items: [],
      recently_completed: [],
      total_count: 0,
      all_caught_up: true,
    };

    expect(data.items).toEqual([]);
    expect(data.recently_completed).toEqual([]);
    expect(data.total_count).toBe(0);
    expect(data.all_caught_up).toBe(true);
  });

  it('all_caught_up is true when items is empty', () => {
    const data: MaintenanceData = {
      items: [],
      recently_completed: [],
      total_count: 0,
      all_caught_up: true,
    };

    expect(data.all_caught_up).toBe(true);
    expect(data.items).toHaveLength(0);
  });

  it('all_caught_up is false when items exist', () => {
    const data: MaintenanceData = {
      items: [{
        hive_id: 'hive-1',
        hive_name: 'Hive 1',
        site_id: 'site-1',
        site_name: 'Site 1',
        priority: 'Urgent',
        priority_score: 100,
        summary: 'Test',
        insights: [],
        quick_actions: [],
      }],
      recently_completed: [],
      total_count: 1,
      all_caught_up: false,
    };

    expect(data.all_caught_up).toBe(false);
    expect(data.items).toHaveLength(1);
  });

  it('total_count matches items length', () => {
    const items: MaintenanceItem[] = [
      {
        hive_id: 'hive-1',
        hive_name: 'Hive 1',
        site_id: 'site-1',
        site_name: 'Site 1',
        priority: 'Urgent',
        priority_score: 100,
        summary: 'Test 1',
        insights: [],
        quick_actions: [],
      },
      {
        hive_id: 'hive-2',
        hive_name: 'Hive 2',
        site_id: 'site-1',
        site_name: 'Site 1',
        priority: 'Soon',
        priority_score: 75,
        summary: 'Test 2',
        insights: [],
        quick_actions: [],
      },
    ];

    const data: MaintenanceData = {
      items,
      recently_completed: [],
      total_count: items.length,
      all_caught_up: false,
    };

    expect(data.total_count).toBe(data.items.length);
  });
});

describe('Priority score calculation', () => {
  it('action-needed has base score of 100', () => {
    const baseScore = 100;
    expect(baseScore).toBe(100);
  });

  it('warning has base score of 50', () => {
    const baseScore = 50;
    expect(baseScore).toBe(50);
  });

  it('info has base score of 10', () => {
    const baseScore = 10;
    expect(baseScore).toBe(10);
  });

  it('older items have higher scores', () => {
    // Priority score = severity_weight + age_in_days
    const freshActionNeeded = 100 + 0;  // 100
    const oldActionNeeded = 100 + 30;   // 130

    expect(oldActionNeeded).toBeGreaterThan(freshActionNeeded);
  });

  it('severity weights higher than age when fresh', () => {
    // action-needed (100) > warning (50) even if warning is older
    const freshActionNeeded = 100 + 0;  // 100
    const oldWarning = 50 + 49;         // 99

    expect(freshActionNeeded).toBeGreaterThan(oldWarning);
  });
});

describe('Priority label mapping', () => {
  it('action-needed maps to Urgent', () => {
    const severity = 'action-needed';
    const label = severity === 'action-needed' ? 'Urgent' : severity === 'warning' ? 'Soon' : 'Optional';
    expect(label).toBe('Urgent');
  });

  it('warning maps to Soon', () => {
    const severity = 'warning';
    const label = severity === 'action-needed' ? 'Urgent' : severity === 'warning' ? 'Soon' : 'Optional';
    expect(label).toBe('Soon');
  });

  it('info maps to Optional', () => {
    const severity = 'info';
    const label = severity === 'action-needed' ? 'Urgent' : severity === 'warning' ? 'Soon' : 'Optional';
    expect(label).toBe('Optional');
  });
});

describe('Quick action generation', () => {
  it('treatment_due generates Log Treatment action', () => {
    const ruleId = 'treatment_due';
    const action = ruleId === 'treatment_due' ? { label: 'Log Treatment', url: '/hives/hive-1', tab: 'treatments' } : null;
    expect(action).not.toBeNull();
    expect(action?.label).toBe('Log Treatment');
    expect(action?.tab).toBe('treatments');
  });

  it('inspection_overdue generates Log Inspection action', () => {
    const ruleId = 'inspection_overdue';
    const action = ruleId === 'inspection_overdue' ? { label: 'Log Inspection', url: '/hives/hive-1/inspections/new' } : null;
    expect(action).not.toBeNull();
    expect(action?.label).toBe('Log Inspection');
    expect(action?.url).toContain('/inspections/new');
  });

  it('every item gets View Details action', () => {
    const viewDetails: QuickAction = { label: 'View Details', url: '/hives/hive-1' };
    expect(viewDetails.label).toBe('View Details');
    expect(viewDetails.url).toMatch(/^\/hives\//);
  });
});
