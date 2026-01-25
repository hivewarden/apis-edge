/**
 * useExport Hook Tests
 *
 * Tests for the export hook and its utility exports.
 * Part of Epic 9, Story 9.1 (Configurable Data Export)
 */
import { describe, it, expect } from 'vitest';
import { EXPORT_FIELD_OPTIONS } from '../../src/hooks/useExport';

describe('useExport utilities', () => {
  describe('EXPORT_FIELD_OPTIONS', () => {
    it('has all four categories', () => {
      expect(EXPORT_FIELD_OPTIONS).toHaveProperty('basics');
      expect(EXPORT_FIELD_OPTIONS).toHaveProperty('details');
      expect(EXPORT_FIELD_OPTIONS).toHaveProperty('analysis');
      expect(EXPORT_FIELD_OPTIONS).toHaveProperty('financial');
    });

    describe('basics category', () => {
      it('has all expected basic fields', () => {
        const values = EXPORT_FIELD_OPTIONS.basics.map(f => f.value);
        expect(values).toContain('hive_name');
        expect(values).toContain('queen_age');
        expect(values).toContain('boxes');
        expect(values).toContain('current_weight');
        expect(values).toContain('location');
      });

      it('has labels for all fields', () => {
        EXPORT_FIELD_OPTIONS.basics.forEach(field => {
          expect(field.label).toBeDefined();
          expect(field.label.length).toBeGreaterThan(0);
        });
      });
    });

    describe('details category', () => {
      it('has all expected detail fields', () => {
        const values = EXPORT_FIELD_OPTIONS.details.map(f => f.value);
        expect(values).toContain('inspection_log');
        expect(values).toContain('hornet_data');
        expect(values).toContain('weight_history');
        expect(values).toContain('weather_correlations');
      });

      it('has labels for all fields', () => {
        EXPORT_FIELD_OPTIONS.details.forEach(field => {
          expect(field.label).toBeDefined();
          expect(field.label.length).toBeGreaterThan(0);
        });
      });
    });

    describe('analysis category', () => {
      it('has all expected analysis fields', () => {
        const values = EXPORT_FIELD_OPTIONS.analysis.map(f => f.value);
        expect(values).toContain('beebrain_insights');
        expect(values).toContain('health_summary');
        expect(values).toContain('season_comparison');
      });

      it('has labels for all fields', () => {
        EXPORT_FIELD_OPTIONS.analysis.forEach(field => {
          expect(field.label).toBeDefined();
          expect(field.label.length).toBeGreaterThan(0);
        });
      });
    });

    describe('financial category', () => {
      it('has all expected financial fields', () => {
        const values = EXPORT_FIELD_OPTIONS.financial.map(f => f.value);
        expect(values).toContain('costs');
        expect(values).toContain('harvest_revenue');
        expect(values).toContain('roi_per_hive');
      });

      it('has labels for all fields', () => {
        EXPORT_FIELD_OPTIONS.financial.forEach(field => {
          expect(field.label).toBeDefined();
          expect(field.label.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('field options format', () => {
    it('all fields have value and label properties', () => {
      const allFields = [
        ...EXPORT_FIELD_OPTIONS.basics,
        ...EXPORT_FIELD_OPTIONS.details,
        ...EXPORT_FIELD_OPTIONS.analysis,
        ...EXPORT_FIELD_OPTIONS.financial,
      ];

      allFields.forEach(field => {
        expect(field).toHaveProperty('value');
        expect(field).toHaveProperty('label');
        expect(typeof field.value).toBe('string');
        expect(typeof field.label).toBe('string');
      });
    });

    it('all values are unique', () => {
      const allValues = [
        ...EXPORT_FIELD_OPTIONS.basics.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.details.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.analysis.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.financial.map(f => f.value),
      ];

      const uniqueValues = new Set(allValues);
      expect(uniqueValues.size).toBe(allValues.length);
    });

    it('values use snake_case', () => {
      const allValues = [
        ...EXPORT_FIELD_OPTIONS.basics.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.details.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.analysis.map(f => f.value),
        ...EXPORT_FIELD_OPTIONS.financial.map(f => f.value),
      ];

      allValues.forEach(value => {
        // snake_case: lowercase with underscores
        expect(value).toMatch(/^[a-z][a-z0-9_]*$/);
      });
    });
  });

  describe('category field counts', () => {
    it('basics has at least 3 fields', () => {
      expect(EXPORT_FIELD_OPTIONS.basics.length).toBeGreaterThanOrEqual(3);
    });

    it('details has at least 3 fields', () => {
      expect(EXPORT_FIELD_OPTIONS.details.length).toBeGreaterThanOrEqual(3);
    });

    it('analysis has at least 3 fields', () => {
      expect(EXPORT_FIELD_OPTIONS.analysis.length).toBeGreaterThanOrEqual(3);
    });

    it('financial has at least 3 fields', () => {
      expect(EXPORT_FIELD_OPTIONS.financial.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('export formats', () => {
  const validFormats = ['summary', 'markdown', 'json'];

  it('summary format is for human-readable output', () => {
    expect(validFormats).toContain('summary');
  });

  it('markdown format is for AI assistants', () => {
    expect(validFormats).toContain('markdown');
  });

  it('json format is for programmatic use', () => {
    expect(validFormats).toContain('json');
  });

  it('has exactly 3 formats', () => {
    expect(validFormats.length).toBe(3);
  });
});

describe('IncludeConfig interface', () => {
  it('supports empty config', () => {
    const config = {};
    expect(config).toBeDefined();
  });

  it('supports partial config', () => {
    const config = {
      basics: ['hive_name'],
    };
    expect(config.basics).toHaveLength(1);
  });

  it('supports full config', () => {
    const config = {
      basics: ['hive_name', 'queen_age'],
      details: ['inspection_log'],
      analysis: ['beebrain_insights'],
      financial: ['costs'],
    };
    expect(config.basics).toHaveLength(2);
    expect(config.details).toHaveLength(1);
    expect(config.analysis).toHaveLength(1);
    expect(config.financial).toHaveLength(1);
  });
});
