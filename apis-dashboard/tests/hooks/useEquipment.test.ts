import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatEquipmentType,
  EQUIPMENT_TYPES,
  EQUIPMENT_ACTIONS,
} from '../../src/hooks/useEquipment';

describe('useEquipment utilities', () => {
  describe('formatDuration', () => {
    it('formats 0 days correctly', () => {
      expect(formatDuration(0)).toBe('0 days');
    });

    it('formats days under 30 as days', () => {
      expect(formatDuration(1)).toBe('1 days');
      expect(formatDuration(7)).toBe('7 days');
      expect(formatDuration(29)).toBe('29 days');
    });

    it('formats 30 days as 1 month', () => {
      expect(formatDuration(30)).toBe('1 month');
    });

    it('formats months correctly with singular/plural', () => {
      expect(formatDuration(60)).toBe('2 months');
      expect(formatDuration(90)).toBe('3 months');
      expect(formatDuration(180)).toBe('6 months');
      expect(formatDuration(364)).toBe('12 months');
    });

    it('formats years correctly', () => {
      expect(formatDuration(365)).toBe('1 year');
      expect(formatDuration(730)).toBe('2 years');
    });

    it('formats years with remaining months', () => {
      expect(formatDuration(395)).toBe('1y 1m'); // 1 year + 1 month
      expect(formatDuration(425)).toBe('1y 2m'); // 1 year + 2 months
    });
  });

  describe('formatEquipmentType', () => {
    it('formats known equipment types', () => {
      expect(formatEquipmentType('mouse_guard')).toBe('Mouse Guard');
      expect(formatEquipmentType('entrance_reducer')).toBe('Entrance Reducer');
      expect(formatEquipmentType('queen_excluder')).toBe('Queen Excluder');
      expect(formatEquipmentType('robbing_screen')).toBe('Robbing Screen');
      expect(formatEquipmentType('feeder')).toBe('Feeder');
      expect(formatEquipmentType('top_feeder')).toBe('Top Feeder');
      expect(formatEquipmentType('bottom_board')).toBe('Bottom Board');
      expect(formatEquipmentType('slatted_rack')).toBe('Slatted Rack');
      expect(formatEquipmentType('inner_cover')).toBe('Inner Cover');
      expect(formatEquipmentType('outer_cover')).toBe('Outer Cover');
      expect(formatEquipmentType('hive_beetle_trap')).toBe('Hive Beetle Trap');
      expect(formatEquipmentType('other')).toBe('Other');
    });

    it('returns raw value for unknown equipment types (custom)', () => {
      expect(formatEquipmentType('my_custom_equipment')).toBe('my_custom_equipment');
      expect(formatEquipmentType('solar_panel')).toBe('solar_panel');
    });
  });

  describe('EQUIPMENT_TYPES constant', () => {
    it('has all expected equipment types', () => {
      expect(EQUIPMENT_TYPES).toHaveLength(12);

      const values = EQUIPMENT_TYPES.map(t => t.value);
      expect(values).toContain('entrance_reducer');
      expect(values).toContain('mouse_guard');
      expect(values).toContain('queen_excluder');
      expect(values).toContain('robbing_screen');
      expect(values).toContain('feeder');
      expect(values).toContain('top_feeder');
      expect(values).toContain('bottom_board');
      expect(values).toContain('slatted_rack');
      expect(values).toContain('inner_cover');
      expect(values).toContain('outer_cover');
      expect(values).toContain('hive_beetle_trap');
      expect(values).toContain('other');
    });

    it('has labels for all types', () => {
      EQUIPMENT_TYPES.forEach(type => {
        expect(type.label).toBeDefined();
        expect(type.label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('EQUIPMENT_ACTIONS constant', () => {
    it('has installed and removed actions', () => {
      expect(EQUIPMENT_ACTIONS).toHaveLength(2);

      const values = EQUIPMENT_ACTIONS.map(a => a.value);
      expect(values).toContain('installed');
      expect(values).toContain('removed');
    });

    it('has labels for all actions', () => {
      EQUIPMENT_ACTIONS.forEach(action => {
        expect(action.label).toBeDefined();
        expect(action.label.length).toBeGreaterThan(0);
      });
    });
  });
});
