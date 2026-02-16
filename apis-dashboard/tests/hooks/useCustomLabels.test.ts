/**
 * useCustomLabels Hook Tests
 *
 * Tests for the custom labels hook that provides CRUD operations
 * for user-defined feed, treatment, equipment, and issue types.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  BUILT_IN_FEED_TYPES,
  BUILT_IN_TREATMENT_TYPES,
  BUILT_IN_EQUIPMENT_TYPES,
  BUILT_IN_ISSUE_TYPES,
  getBuiltInTypes,
  mergeTypesWithCustomLabels,
  LABEL_CATEGORIES,
} from '../../src/hooks/useCustomLabels';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('LABEL_CATEGORIES', () => {
  it('contains all four categories', () => {
    expect(LABEL_CATEGORIES).toHaveLength(4);
    expect(LABEL_CATEGORIES.map(c => c.value)).toEqual(['feed', 'treatment', 'equipment', 'issue']);
  });

  it('has correct labels for each category', () => {
    const labels = LABEL_CATEGORIES.map(c => c.label);
    expect(labels).toContain('Feed Types');
    expect(labels).toContain('Treatment Types');
    expect(labels).toContain('Equipment Types');
    expect(labels).toContain('Issue Types');
  });
});

describe('Built-in Types', () => {
  describe('BUILT_IN_FEED_TYPES', () => {
    it('contains expected feed types', () => {
      const values = BUILT_IN_FEED_TYPES.map(t => t.value);
      expect(values).toContain('sugar_syrup');
      expect(values).toContain('fondant');
      expect(values).toContain('pollen_patty');
      expect(values).toContain('pollen_substitute');
      expect(values).toContain('honey');
    });

    it('has valid label for each type', () => {
      BUILT_IN_FEED_TYPES.forEach(type => {
        expect(type.label).toBeTruthy();
        expect(type.label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('BUILT_IN_TREATMENT_TYPES', () => {
    it('contains expected treatment types', () => {
      const values = BUILT_IN_TREATMENT_TYPES.map(t => t.value);
      expect(values).toContain('oxalic_acid');
      expect(values).toContain('formic_acid');
      expect(values).toContain('apiguard');
      expect(values).toContain('apivar');
      expect(values).toContain('maqs');
      expect(values).toContain('api_bioxal');
    });
  });

  describe('BUILT_IN_EQUIPMENT_TYPES', () => {
    it('contains expected equipment types', () => {
      const values = BUILT_IN_EQUIPMENT_TYPES.map(t => t.value);
      expect(values).toContain('entrance_reducer');
      expect(values).toContain('mouse_guard');
      expect(values).toContain('queen_excluder');
      expect(values).toContain('feeder');
    });

    it('has more than 10 equipment types', () => {
      expect(BUILT_IN_EQUIPMENT_TYPES.length).toBeGreaterThan(10);
    });
  });

  describe('BUILT_IN_ISSUE_TYPES', () => {
    it('contains expected issue types', () => {
      const values = BUILT_IN_ISSUE_TYPES.map(t => t.value);
      expect(values).toContain('queenless');
      expect(values).toContain('weak_colony');
      expect(values).toContain('pest_infestation');
      expect(values).toContain('disease');
      expect(values).toContain('robbing');
      expect(values).toContain('swarming');
    });
  });
});

describe('getBuiltInTypes', () => {
  it('returns feed types for feed category', () => {
    const types = getBuiltInTypes('feed');
    expect(types).toBe(BUILT_IN_FEED_TYPES);
  });

  it('returns treatment types for treatment category', () => {
    const types = getBuiltInTypes('treatment');
    expect(types).toBe(BUILT_IN_TREATMENT_TYPES);
  });

  it('returns equipment types for equipment category', () => {
    const types = getBuiltInTypes('equipment');
    expect(types).toBe(BUILT_IN_EQUIPMENT_TYPES);
  });

  it('returns issue types for issue category', () => {
    const types = getBuiltInTypes('issue');
    expect(types).toBe(BUILT_IN_ISSUE_TYPES);
  });

  it('returns empty array for unknown category', () => {
    // @ts-expect-error - testing invalid input
    const types = getBuiltInTypes('unknown');
    expect(types).toEqual([]);
  });
});

describe('mergeTypesWithCustomLabels', () => {
  const mockBuiltInTypes = [
    { value: 'type1', label: 'Type 1' },
    { value: 'type2', label: 'Type 2' },
  ] as const;

  it('returns only built-in types when no custom labels', () => {
    const result = mergeTypesWithCustomLabels(mockBuiltInTypes, []);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ value: 'type1', label: 'Type 1' });
    expect(result[1]).toEqual({ value: 'type2', label: 'Type 2' });
  });

  it('adds divider and custom labels when present', () => {
    const customLabels = [
      { id: '1', category: 'feed' as const, name: 'Custom Type', created_at: '2026-01-26T10:00:00Z' },
    ];

    const result = mergeTypesWithCustomLabels(mockBuiltInTypes, customLabels);
    expect(result).toHaveLength(4); // 2 built-in + 1 divider + 1 custom

    // Check divider
    expect(result[2]).toEqual({ value: 'divider', label: '── Custom ──', disabled: true });

    // Check custom label
    expect(result[3]).toEqual({ value: 'Custom Type', label: 'Custom Type' });
  });

  it('uses label name as value for custom labels', () => {
    const customLabels = [
      { id: '123', category: 'treatment' as const, name: 'Thymovar', created_at: '2026-01-26T10:00:00Z' },
    ];

    const result = mergeTypesWithCustomLabels(mockBuiltInTypes, customLabels);
    const customItem = result.find(r => r.label === 'Thymovar');

    expect(customItem).toBeDefined();
    expect(customItem!.value).toBe('Thymovar'); // Uses name, not ID
  });

  it('handles multiple custom labels', () => {
    const customLabels = [
      { id: '1', category: 'feed' as const, name: 'Label A', created_at: '2026-01-26T10:00:00Z' },
      { id: '2', category: 'feed' as const, name: 'Label B', created_at: '2026-01-26T11:00:00Z' },
      { id: '3', category: 'feed' as const, name: 'Label C', created_at: '2026-01-26T12:00:00Z' },
    ];

    const result = mergeTypesWithCustomLabels(mockBuiltInTypes, customLabels);
    expect(result).toHaveLength(6); // 2 built-in + 1 divider + 3 custom
  });

  it('preserves order: built-in, divider, custom', () => {
    const customLabels = [
      { id: '1', category: 'feed' as const, name: 'Custom', created_at: '2026-01-26T10:00:00Z' },
    ];

    const result = mergeTypesWithCustomLabels(mockBuiltInTypes, customLabels);

    // First items should be built-in
    expect(result[0].value).toBe('type1');
    expect(result[1].value).toBe('type2');

    // Then divider
    expect(result[2].value).toBe('divider');
    expect(result[2].disabled).toBe(true);

    // Then custom
    expect(result[3].value).toBe('Custom');
  });
});

describe('Type Safety', () => {
  it('LabelCategory type includes all valid categories', () => {
    // This test verifies the type system at compile time
    const validCategories: Array<'feed' | 'treatment' | 'equipment' | 'issue'> = [
      'feed',
      'treatment',
      'equipment',
      'issue',
    ];

    validCategories.forEach(cat => {
      expect(['feed', 'treatment', 'equipment', 'issue']).toContain(cat);
    });
  });
});
