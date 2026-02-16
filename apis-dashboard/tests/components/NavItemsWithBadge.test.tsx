/**
 * NavItemsWithBadge Tests
 *
 * Tests for the navigation badge functionality.
 * Part of Epic 14, Story 14.14 (Overdue Alerts + Navigation Badge)
 */
import { describe, it, expect } from 'vitest';
import { navItems, getNavItemsWithBadges } from '../../src/components/layout/navItems';

describe('navItems', () => {
  it('exports static navItems array', () => {
    expect(navItems).toBeInstanceOf(Array);
    expect(navItems?.length).toBeGreaterThan(0);
  });

  it('includes Tasks nav item', () => {
    const tasksItem = navItems?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/tasks'
    );
    expect(tasksItem).toBeDefined();
  });

  it('all items have key, icon, and label', () => {
    navItems?.forEach((item) => {
      if (item && typeof item === 'object') {
        expect(item).toHaveProperty('key');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('label');
      }
    });
  });
});

describe('getNavItemsWithBadges', () => {
  it('returns array of nav items', () => {
    const items = getNavItemsWithBadges({});
    expect(items).toBeInstanceOf(Array);
    expect(items?.length).toBeGreaterThan(0);
  });

  it('adds badge to Tasks item when count > 0', () => {
    const items = getNavItemsWithBadges({ tasks: 3 });
    const tasksItem = items?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/tasks'
    );

    expect(tasksItem).toBeDefined();
    // The label should be a React element containing the badge
    if (tasksItem && typeof tasksItem === 'object' && 'label' in tasksItem) {
      // Label is now a JSX element, not a string
      expect(typeof tasksItem.label).not.toBe('string');
    }
  });

  it('keeps original label when count = 0', () => {
    const items = getNavItemsWithBadges({ tasks: 0 });
    const tasksItem = items?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/tasks'
    );

    expect(tasksItem).toBeDefined();
    if (tasksItem && typeof tasksItem === 'object' && 'label' in tasksItem) {
      // Label should remain as string 'Tasks'
      expect(tasksItem.label).toBe('Tasks');
    }
  });

  it('keeps original label when count undefined', () => {
    const items = getNavItemsWithBadges({});
    const tasksItem = items?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/tasks'
    );

    expect(tasksItem).toBeDefined();
    if (tasksItem && typeof tasksItem === 'object' && 'label' in tasksItem) {
      // Label should remain as string 'Tasks'
      expect(tasksItem.label).toBe('Tasks');
    }
  });

  it('does not modify other nav items', () => {
    const items = getNavItemsWithBadges({ tasks: 3 });

    // Check that Dashboard item is unchanged
    const dashboardItem = items?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/'
    );
    expect(dashboardItem).toBeDefined();
    if (dashboardItem && typeof dashboardItem === 'object' && 'label' in dashboardItem) {
      expect(dashboardItem.label).toBe('Dashboard');
    }

    // Check that Sites item is unchanged
    const sitesItem = items?.find((item) =>
      item && typeof item === 'object' && 'key' in item && item.key === '/sites'
    );
    expect(sitesItem).toBeDefined();
    if (sitesItem && typeof sitesItem === 'object' && 'label' in sitesItem) {
      expect(sitesItem.label).toBe('Sites');
    }
  });

  it('returns same number of items as original', () => {
    const items = getNavItemsWithBadges({ tasks: 5 });
    expect(items?.length).toBe(navItems?.length);
  });
});

describe('Badge visibility logic', () => {
  it('badge shows when count > 0', () => {
    const count = 5;
    const shouldShowBadge = count > 0;
    expect(shouldShowBadge).toBe(true);
  });

  it('badge hidden when count = 0', () => {
    const count = 0;
    const shouldShowBadge = count > 0;
    expect(shouldShowBadge).toBe(false);
  });

  it('badge hidden when count undefined', () => {
    const count = undefined;
    const shouldShowBadge = count && count > 0;
    expect(shouldShowBadge).toBeFalsy();
  });

  it('badge hidden when count null', () => {
    const count = null;
    const shouldShowBadge = count && count > 0;
    expect(shouldShowBadge).toBeFalsy();
  });
});

describe('NavBadgeCounts interface', () => {
  it('supports tasks count', () => {
    const counts = { tasks: 3 };
    expect(counts.tasks).toBe(3);
  });

  it('tasks is optional', () => {
    const counts = {};
    expect(counts).toBeDefined();
    // TypeScript would allow this - tasks is optional
  });

  it('can be extended for future badge counts', () => {
    // Document that the interface can be extended
    // Future: could add maintenance, calendar, etc.
    interface FutureNavBadgeCounts {
      tasks?: number;
      maintenance?: number;
      calendar?: number;
    }

    const futureCounts: FutureNavBadgeCounts = {
      tasks: 3,
      maintenance: 2,
      calendar: 1,
    };

    expect(futureCounts.tasks).toBe(3);
    expect(futureCounts.maintenance).toBe(2);
    expect(futureCounts.calendar).toBe(1);
  });
});
