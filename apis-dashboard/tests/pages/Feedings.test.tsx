/**
 * Feedings Tests
 *
 * Tests for the useFeedings hook and feeding utility functions.
 * Part of Epic 6, Story 6.2: Feeding Log
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
  useFeedings,
  FEED_TYPES,
  FEED_UNITS,
  CONCENTRATION_OPTIONS,
  formatFeedType,
  formatAmount,
  feedTypeHasConcentration,
} from '../../src/hooks/useFeedings';

const mockFeeding = {
  id: 'feed-1',
  hive_id: 'hive-1',
  fed_at: '2026-01-20',
  feed_type: 'sugar_syrup',
  amount: 2.5,
  unit: 'liters',
  concentration: '2:1',
  notes: 'Winter prep feeding',
  created_at: '2026-01-20T10:00:00Z',
  updated_at: '2026-01-20T10:00:00Z',
};

const mockSeasonTotals = [
  { feed_type: 'sugar_syrup', unit: 'liters', total: 10 },
  { feed_type: 'fondant', unit: 'kg', total: 3 },
];

describe('useFeedings Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches feedings and season totals for a hive', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('season-totals')) {
        return Promise.resolve({ data: { data: mockSeasonTotals } });
      }
      return Promise.resolve({
        data: { data: [mockFeeding], meta: { total: 1 } },
      });
    });

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.feedings).toEqual([mockFeeding]);
    expect(result.current.total).toBe(1);
    expect(result.current.seasonTotals).toEqual(mockSeasonTotals);
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/feedings');
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/feedings/season-totals');
  });

  it('returns empty data when hiveId is null', async () => {
    const { result } = renderHook(() => useFeedings(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.feedings).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.seasonTotals).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('creates a feeding and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('season-totals')) {
        return Promise.resolve({ data: { data: mockSeasonTotals } });
      }
      return Promise.resolve({
        data: { data: [mockFeeding], meta: { total: 1 } },
      });
    });
    mockPost.mockResolvedValue({
      data: { data: [mockFeeding] },
    });

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createFeeding({
        hive_ids: ['hive-1'],
        fed_at: '2026-01-20',
        feed_type: 'sugar_syrup',
        amount: 2.5,
        unit: 'liters',
        concentration: '2:1',
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/feedings', {
      hive_ids: ['hive-1'],
      fed_at: '2026-01-20',
      feed_type: 'sugar_syrup',
      amount: 2.5,
      unit: 'liters',
      concentration: '2:1',
    });
  });

  it('updates a feeding and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('season-totals')) {
        return Promise.resolve({ data: { data: mockSeasonTotals } });
      }
      return Promise.resolve({
        data: { data: [mockFeeding], meta: { total: 1 } },
      });
    });
    mockPut.mockResolvedValue({
      data: { data: { ...mockFeeding, amount: 3.0 } },
    });

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateFeeding('feed-1', { amount: 3.0 });
    });

    expect(mockPut).toHaveBeenCalledWith('/feedings/feed-1', { amount: 3.0 });
  });

  it('deletes a feeding and refetches', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('season-totals')) {
        return Promise.resolve({ data: { data: mockSeasonTotals } });
      }
      return Promise.resolve({
        data: { data: [mockFeeding], meta: { total: 1 } },
      });
    });
    mockDelete.mockResolvedValue({});

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteFeeding('feed-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/feedings/feed-1');
  });
});

describe('Feed type enums and validation', () => {
  it('FEED_TYPES contains sugar_syrup', () => {
    const syrup = FEED_TYPES.find((t) => t.value === 'sugar_syrup');
    expect(syrup).toBeDefined();
    expect(syrup?.label).toBe('Sugar Syrup');
    expect(syrup?.hasConcentration).toBe(true);
  });

  it('FEED_TYPES contains fondant without concentration', () => {
    const fondant = FEED_TYPES.find((t) => t.value === 'fondant');
    expect(fondant).toBeDefined();
    expect(fondant?.label).toBe('Fondant');
    expect(fondant?.hasConcentration).toBe(false);
  });

  it('FEED_TYPES contains all expected types', () => {
    const expectedValues = [
      'sugar_syrup', 'fondant', 'pollen_patty',
      'pollen_substitute', 'honey', 'other',
    ];
    expectedValues.forEach((val) => {
      expect(FEED_TYPES.find((t) => t.value === val)).toBeDefined();
    });
  });

  it('FEED_UNITS contains kg and liters', () => {
    expect(FEED_UNITS.find((u) => u.value === 'kg')).toBeDefined();
    expect(FEED_UNITS.find((u) => u.value === 'liters')).toBeDefined();
  });

  it('CONCENTRATION_OPTIONS contains 1:1 and 2:1', () => {
    expect(CONCENTRATION_OPTIONS.find((c) => c.value === '1:1')).toBeDefined();
    expect(CONCENTRATION_OPTIONS.find((c) => c.value === '2:1')).toBeDefined();
  });
});

describe('Feeding formatting utilities', () => {
  it('formatFeedType formats known types', () => {
    expect(formatFeedType('sugar_syrup')).toBe('Sugar Syrup');
    expect(formatFeedType('fondant')).toBe('Fondant');
    expect(formatFeedType('pollen_patty')).toBe('Pollen Patty');
  });

  it('formatFeedType returns raw value for unknown types', () => {
    expect(formatFeedType('custom_feed')).toBe('custom_feed');
  });

  it('formatAmount formats correctly', () => {
    expect(formatAmount(2.5, 'liters')).toBe('2.5 liters');
    expect(formatAmount(1, 'kg')).toBe('1 kg');
  });

  it('feedTypeHasConcentration returns true for sugar_syrup', () => {
    expect(feedTypeHasConcentration('sugar_syrup')).toBe(true);
  });

  it('feedTypeHasConcentration returns false for fondant', () => {
    expect(feedTypeHasConcentration('fondant')).toBe(false);
  });

  it('feedTypeHasConcentration returns false for unknown types', () => {
    expect(feedTypeHasConcentration('unknown')).toBe(false);
  });
});

describe('Season totals display', () => {
  it('season totals are fetched alongside feedings', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('season-totals')) {
        return Promise.resolve({
          data: {
            data: [
              { feed_type: 'sugar_syrup', unit: 'liters', total: 15.5 },
              { feed_type: 'fondant', unit: 'kg', total: 4.0 },
            ],
          },
        });
      }
      return Promise.resolve({
        data: { data: [], meta: { total: 0 } },
      });
    });

    const { result } = renderHook(() => useFeedings('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.seasonTotals).toHaveLength(2);
    expect(result.current.seasonTotals[0].total).toBe(15.5);
    expect(result.current.seasonTotals[1].feed_type).toBe('fondant');
  });
});
