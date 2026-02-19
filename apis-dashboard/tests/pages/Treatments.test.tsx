/**
 * Treatments Tests
 *
 * Tests for the useTreatments hook and treatment utility functions.
 * Part of Epic 6, Story 6.1: Treatment Log
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
  useTreatments,
  TREATMENT_TYPES,
  TREATMENT_METHODS,
  formatTreatmentType,
  formatTreatmentMethod,
  calculateEfficacy,
} from '../../src/hooks/useTreatments';

const mockTreatment = {
  id: 'treat-1',
  hive_id: 'hive-1',
  treated_at: '2026-01-15',
  treatment_type: 'oxalic_acid',
  method: 'vaporization',
  dose: '2g',
  mite_count_before: 30,
  mite_count_after: 5,
  efficacy: 83,
  efficacy_display: '83%',
  weather: 'Clear, 10C',
  notes: 'First treatment of season',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
};

describe('useTreatments Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches treatments for a hive', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockTreatment], meta: { total: 1 } },
    });

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.treatments).toEqual([mockTreatment]);
    expect(result.current.total).toBe(1);
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/treatments');
  });

  it('returns empty list when hiveId is null', async () => {
    const { result } = renderHook(() => useTreatments(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.treatments).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.treatments).toEqual([]);
  });

  it('creates a treatment and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockTreatment], meta: { total: 1 } },
    });
    mockPost.mockResolvedValue({
      data: { data: [mockTreatment] },
    });

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createTreatment({
        hive_ids: ['hive-1'],
        treated_at: '2026-01-15',
        treatment_type: 'oxalic_acid',
        method: 'vaporization',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/treatments', {
      hive_ids: ['hive-1'],
      treated_at: '2026-01-15',
      treatment_type: 'oxalic_acid',
      method: 'vaporization',
    });
    // Should refetch after create
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('updates a treatment and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockTreatment], meta: { total: 1 } },
    });
    mockPut.mockResolvedValue({
      data: { data: { ...mockTreatment, mite_count_after: 3 } },
    });

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateTreatment('treat-1', { mite_count_after: 3 });
    });

    expect(mockPut).toHaveBeenCalledWith('/treatments/treat-1', { mite_count_after: 3 });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('deletes a treatment and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockTreatment], meta: { total: 1 } },
    });
    mockDelete.mockResolvedValue({});

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteTreatment('treat-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/treatments/treat-1');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('sets creating flag during create operation', async () => {
    mockGet.mockResolvedValue({
      data: { data: [], meta: { total: 0 } },
    });

    let resolveCreate: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    const { result } = renderHook(() => useTreatments('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.creating).toBe(false);

    // Start create without awaiting
    act(() => {
      result.current.createTreatment({
        hive_ids: ['hive-1'],
        treated_at: '2026-01-15',
        treatment_type: 'oxalic_acid',
      });
    });

    expect(result.current.creating).toBe(true);

    // Resolve the create
    await act(async () => {
      resolveCreate!({ data: { data: [mockTreatment] } });
    });
  });
});

describe('Treatment type enums', () => {
  it('TREATMENT_TYPES contains oxalic_acid', () => {
    const oxalic = TREATMENT_TYPES.find((t) => t.value === 'oxalic_acid');
    expect(oxalic).toBeDefined();
    expect(oxalic?.label).toBe('Oxalic Acid');
  });

  it('TREATMENT_TYPES contains formic_acid', () => {
    const formic = TREATMENT_TYPES.find((t) => t.value === 'formic_acid');
    expect(formic).toBeDefined();
    expect(formic?.label).toBe('Formic Acid');
  });

  it('TREATMENT_TYPES contains all expected types', () => {
    const expectedValues = [
      'oxalic_acid', 'formic_acid', 'apiguard', 'apivar',
      'maqs', 'api_bioxal', 'other',
    ];
    expectedValues.forEach((val) => {
      expect(TREATMENT_TYPES.find((t) => t.value === val)).toBeDefined();
    });
  });

  it('TREATMENT_METHODS contains vaporization', () => {
    const vaporization = TREATMENT_METHODS.find((m) => m.value === 'vaporization');
    expect(vaporization).toBeDefined();
    expect(vaporization?.label).toBe('Vaporization');
  });

  it('TREATMENT_METHODS contains all expected methods', () => {
    const expectedValues = ['vaporization', 'dribble', 'strips', 'spray', 'other'];
    expectedValues.forEach((val) => {
      expect(TREATMENT_METHODS.find((m) => m.value === val)).toBeDefined();
    });
  });
});

describe('Treatment formatting utilities', () => {
  it('formatTreatmentType formats known types', () => {
    expect(formatTreatmentType('oxalic_acid')).toBe('Oxalic Acid');
    expect(formatTreatmentType('formic_acid')).toBe('Formic Acid');
    expect(formatTreatmentType('apiguard')).toBe('Apiguard');
  });

  it('formatTreatmentType returns raw value for unknown types', () => {
    expect(formatTreatmentType('custom_treatment')).toBe('custom_treatment');
  });

  it('formatTreatmentMethod formats known methods', () => {
    expect(formatTreatmentMethod('vaporization')).toBe('Vaporization');
    expect(formatTreatmentMethod('dribble')).toBe('Dribble');
    expect(formatTreatmentMethod('strips')).toBe('Strips');
  });

  it('formatTreatmentMethod returns dash for undefined', () => {
    expect(formatTreatmentMethod(undefined)).toBe('-');
  });

  it('formatTreatmentMethod returns raw value for unknown methods', () => {
    expect(formatTreatmentMethod('custom_method')).toBe('custom_method');
  });
});

describe('Efficacy calculation', () => {
  it('calculates efficacy correctly', () => {
    expect(calculateEfficacy(30, 5)).toBe(83);
    expect(calculateEfficacy(100, 0)).toBe(100);
    expect(calculateEfficacy(50, 25)).toBe(50);
  });

  it('returns null when before count is zero', () => {
    expect(calculateEfficacy(0, 5)).toBeNull();
  });

  it('returns null when before count is undefined', () => {
    expect(calculateEfficacy(undefined, 5)).toBeNull();
  });

  it('returns null when after count is undefined', () => {
    expect(calculateEfficacy(30, undefined)).toBeNull();
  });

  it('handles negative efficacy (mite count increased)', () => {
    const result = calculateEfficacy(10, 20);
    expect(result).toBe(-100);
  });
});
