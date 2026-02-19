/**
 * Equipment Tests
 *
 * Tests for the useEquipment hook and equipment utility functions.
 * Part of Epic 6, Story 6.4: Equipment Log
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock apiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Import after mocks
import {
  useEquipment,
  EQUIPMENT_TYPES,
  EQUIPMENT_ACTIONS,
  formatEquipmentType,
  formatDuration,
} from '../../src/hooks/useEquipment';

const mockEquipmentLog = {
  id: 'eq-1',
  hive_id: 'hive-1',
  equipment_type: 'entrance_reducer',
  equipment_label: 'Entrance Reducer',
  action: 'installed' as const,
  logged_at: '2026-01-10',
  notes: 'Installed for winter',
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
};

const mockCurrentlyInstalled = [
  {
    id: 'eq-1',
    equipment_type: 'entrance_reducer',
    equipment_label: 'Entrance Reducer',
    installed_at: '2026-01-10',
    days_installed: 38,
    notes: 'Installed for winter',
  },
  {
    id: 'eq-2',
    equipment_type: 'mouse_guard',
    equipment_label: 'Mouse Guard',
    installed_at: '2025-11-01',
    days_installed: 109,
  },
];

const mockEquipmentHistory = [
  {
    equipment_type: 'queen_excluder',
    equipment_label: 'Queen Excluder',
    installed_at: '2025-05-01',
    removed_at: '2025-09-01',
    duration_days: 123,
    notes: 'Removed after honey harvest',
  },
];

describe('useEquipment Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches equipment logs, current, and history for a hive', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: mockCurrentlyInstalled } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: mockEquipmentHistory } });
      }
      return Promise.resolve({
        data: { data: [mockEquipmentLog], meta: { total: 1 } },
      });
    });

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.equipmentLogs).toEqual([mockEquipmentLog]);
    expect(result.current.currentlyInstalled).toEqual(mockCurrentlyInstalled);
    expect(result.current.equipmentHistory).toEqual(mockEquipmentHistory);
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/equipment');
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/equipment/current');
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/equipment/history');
  });

  it('returns empty data when hiveId is null', async () => {
    const { result } = renderHook(() => useEquipment(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.equipmentLogs).toEqual([]);
    expect(result.current.currentlyInstalled).toEqual([]);
    expect(result.current.equipmentHistory).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('creates an equipment log and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({
        data: { data: [], meta: { total: 0 } },
      });
    });
    mockPost.mockResolvedValue({
      data: { data: mockEquipmentLog },
    });

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createEquipmentLog({
        equipment_type: 'entrance_reducer',
        action: 'installed',
        logged_at: '2026-01-10',
        notes: 'Installed for winter',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/hives/hive-1/equipment', {
      equipment_type: 'entrance_reducer',
      action: 'installed',
      logged_at: '2026-01-10',
      notes: 'Installed for winter',
    });
  });

  it('updates an equipment log and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({
        data: { data: [mockEquipmentLog], meta: { total: 1 } },
      });
    });
    mockPut.mockResolvedValue({
      data: { data: { ...mockEquipmentLog, notes: 'Updated notes' } },
    });

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateEquipmentLog('eq-1', { notes: 'Updated notes' });
    });

    expect(mockPut).toHaveBeenCalledWith('/equipment/eq-1', { notes: 'Updated notes' });
  });

  it('deletes an equipment log and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({
        data: { data: [mockEquipmentLog], meta: { total: 1 } },
      });
    });
    mockDelete.mockResolvedValue({});

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteEquipmentLog('eq-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/equipment/eq-1');
  });

  it('throws error when creating without hiveId', async () => {
    const { result } = renderHook(() => useEquipment(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      result.current.createEquipmentLog({
        equipment_type: 'entrance_reducer',
        action: 'installed',
        logged_at: '2026-01-10',
      })
    ).rejects.toThrow('Hive ID is required');
  });
});

describe('Equipment type enums', () => {
  it('EQUIPMENT_TYPES contains entrance_reducer', () => {
    const reducer = EQUIPMENT_TYPES.find((t) => t.value === 'entrance_reducer');
    expect(reducer).toBeDefined();
    expect(reducer?.label).toBe('Entrance Reducer');
  });

  it('EQUIPMENT_TYPES contains all expected types', () => {
    const expectedValues = [
      'entrance_reducer', 'mouse_guard', 'queen_excluder',
      'robbing_screen', 'feeder', 'top_feeder', 'bottom_board',
      'slatted_rack', 'inner_cover', 'outer_cover',
      'hive_beetle_trap', 'other',
    ];
    expectedValues.forEach((val) => {
      expect(EQUIPMENT_TYPES.find((t) => t.value === val)).toBeDefined();
    });
  });

  it('EQUIPMENT_ACTIONS contains installed and removed', () => {
    expect(EQUIPMENT_ACTIONS.find((a) => a.value === 'installed')).toBeDefined();
    expect(EQUIPMENT_ACTIONS.find((a) => a.value === 'removed')).toBeDefined();
  });
});

describe('Equipment formatting utilities', () => {
  it('formatEquipmentType formats known types', () => {
    expect(formatEquipmentType('entrance_reducer')).toBe('Entrance Reducer');
    expect(formatEquipmentType('mouse_guard')).toBe('Mouse Guard');
    expect(formatEquipmentType('queen_excluder')).toBe('Queen Excluder');
  });

  it('formatEquipmentType returns raw value for unknown types', () => {
    expect(formatEquipmentType('custom_equipment')).toBe('custom_equipment');
  });

  it('formatDuration formats days correctly', () => {
    expect(formatDuration(5)).toBe('5 days');
    expect(formatDuration(15)).toBe('15 days');
    expect(formatDuration(29)).toBe('29 days');
  });

  it('formatDuration formats months correctly', () => {
    expect(formatDuration(30)).toBe('1 month');
    expect(formatDuration(60)).toBe('2 months');
    expect(formatDuration(90)).toBe('3 months');
  });

  it('formatDuration formats years correctly', () => {
    expect(formatDuration(365)).toBe('1 year');
    expect(formatDuration(730)).toBe('2 years');
  });

  it('formatDuration formats years and months', () => {
    expect(formatDuration(395)).toBe('1y 1m');
    expect(formatDuration(425)).toBe('1y 2m');
  });
});

describe('Currently installed equipment', () => {
  it('provides currently installed equipment list', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: mockCurrentlyInstalled } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({
        data: { data: [], meta: { total: 0 } },
      });
    });

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentlyInstalled).toHaveLength(2);
    expect(result.current.currentlyInstalled[0].equipment_type).toBe('entrance_reducer');
    expect(result.current.currentlyInstalled[0].days_installed).toBe(38);
    expect(result.current.currentlyInstalled[1].equipment_type).toBe('mouse_guard');
  });
});

describe('Equipment history', () => {
  it('provides equipment history with durations', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/current')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ data: { data: mockEquipmentHistory } });
      }
      return Promise.resolve({
        data: { data: [], meta: { total: 0 } },
      });
    });

    const { result } = renderHook(() => useEquipment('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.equipmentHistory).toHaveLength(1);
    expect(result.current.equipmentHistory[0].equipment_type).toBe('queen_excluder');
    expect(result.current.equipmentHistory[0].duration_days).toBe(123);
  });
});
