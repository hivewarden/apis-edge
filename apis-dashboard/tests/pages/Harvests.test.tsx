/**
 * Harvests Tests
 *
 * Tests for the useHarvestsByHive hook, useHarvestAnalytics hook,
 * and harvest utility functions.
 * Part of Epic 6, Story 6.3: Harvest Tracking
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
  useHarvestsByHive,
  useHarvestAnalytics,
  formatHarvestDate,
  formatKg,
  getCurrentSeasonLabel,
} from '../../src/hooks/useHarvests';

const mockHarvest = {
  id: 'harvest-1',
  site_id: 'site-1',
  harvested_at: '2026-07-15',
  total_kg: 12.5,
  notes: 'Great honey flow',
  created_at: '2026-07-15T10:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
  hives: [
    { hive_id: 'hive-1', hive_name: 'Sunny Hive', frames: 4, amount_kg: 7.0 },
    { hive_id: 'hive-2', hive_name: 'Shadowy Hive', frames: 3, amount_kg: 5.5 },
  ],
};

const mockAnalytics = {
  total_kg: 45.5,
  total_harvests: 5,
  per_hive: [
    { hive_id: 'hive-1', hive_name: 'Sunny Hive', total_kg: 28.0, harvests: 3 },
    { hive_id: 'hive-2', hive_name: 'Shadowy Hive', total_kg: 17.5, harvests: 2 },
  ],
  year_over_year: [
    { year: 2025, total_kg: 20.0 },
    { year: 2026, total_kg: 25.5 },
  ],
  best_performing_hive: {
    hive_id: 'hive-1',
    hive_name: 'Sunny Hive',
    kg_per_harvest: 9.3,
  },
};

describe('useHarvestsByHive Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches harvests for a hive', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockHarvest], meta: { total: 1 } },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.harvests).toEqual([mockHarvest]);
    expect(result.current.total).toBe(1);
    expect(mockGet).toHaveBeenCalledWith('/hives/hive-1/harvests');
  });

  it('returns empty data when hiveId is null', async () => {
    const { result } = renderHook(() => useHarvestsByHive(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.harvests).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('creates a harvest and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockHarvest], meta: { total: 1 } },
    });
    mockPost.mockResolvedValue({
      data: { data: mockHarvest },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createHarvest({
        site_id: 'site-1',
        harvested_at: '2026-07-15',
        total_kg: 12.5,
        hive_breakdown: [
          { hive_id: 'hive-1', frames: 4, amount_kg: 7.0 },
          { hive_id: 'hive-2', frames: 3, amount_kg: 5.5 },
        ],
      });
    });

    expect(mockPost).toHaveBeenCalledWith('/harvests', expect.objectContaining({
      site_id: 'site-1',
      harvested_at: '2026-07-15',
      total_kg: 12.5,
    }));
  });

  it('adds hive weights in breakdown', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockHarvest], meta: { total: 1 } },
    });
    mockPost.mockResolvedValue({
      data: { data: mockHarvest },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const createInput = {
      site_id: 'site-1',
      harvested_at: '2026-07-15',
      total_kg: 12.5,
      hive_breakdown: [
        { hive_id: 'hive-1', frames: 4, amount_kg: 7.0 },
        { hive_id: 'hive-2', frames: 3, amount_kg: 5.5 },
      ],
    };

    await act(async () => {
      await result.current.createHarvest(createInput);
    });

    expect(mockPost).toHaveBeenCalledWith('/harvests', createInput);
    // Verify hive_breakdown includes the weight data
    const calledWith = mockPost.mock.calls[0][1];
    expect(calledWith.hive_breakdown).toHaveLength(2);
    expect(calledWith.hive_breakdown[0].amount_kg).toBe(7.0);
    expect(calledWith.hive_breakdown[1].amount_kg).toBe(5.5);
  });

  it('updates a harvest and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockHarvest], meta: { total: 1 } },
    });
    mockPut.mockResolvedValue({
      data: { data: { ...mockHarvest, total_kg: 15.0 } },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateHarvest('harvest-1', { total_kg: 15.0 });
    });

    expect(mockPut).toHaveBeenCalledWith('/harvests/harvest-1', { total_kg: 15.0 });
  });

  it('deletes a harvest and refetches', async () => {
    mockGet.mockResolvedValue({
      data: { data: [mockHarvest], meta: { total: 1 } },
    });
    mockDelete.mockResolvedValue({});

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteHarvest('harvest-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/harvests/harvest-1');
  });

  it('calculates season totals from current season harvests', async () => {
    // Create a harvest dated in the current season (April 1 to March 31)
    const now = new Date();
    const currentSeasonYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const currentSeasonHarvest = {
      ...mockHarvest,
      harvested_at: `${currentSeasonYear}-07-15`,
    };

    mockGet.mockResolvedValue({
      data: { data: [currentSeasonHarvest], meta: { total: 1 } },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.seasonTotalKg).toBe(12.5);
    expect(result.current.seasonHarvestCount).toBe(1);
  });

  it('excludes previous season harvests from season totals', async () => {
    const now = new Date();
    const currentSeasonYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const previousSeasonYear = currentSeasonYear - 1;

    const previousSeasonHarvest = {
      ...mockHarvest,
      harvested_at: `${previousSeasonYear}-07-15`,
    };

    mockGet.mockResolvedValue({
      data: { data: [previousSeasonHarvest], meta: { total: 1 } },
    });

    const { result } = renderHook(() => useHarvestsByHive('hive-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.seasonTotalKg).toBe(0);
    expect(result.current.seasonHarvestCount).toBe(0);
  });
});

describe('useHarvestAnalytics Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches harvest analytics', async () => {
    mockGet.mockResolvedValue({
      data: { data: mockAnalytics },
    });

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.analytics).toEqual(mockAnalytics);
    expect(mockGet).toHaveBeenCalledWith('/harvests/analytics');
  });

  it('shows per-hive statistics', async () => {
    mockGet.mockResolvedValue({
      data: { data: mockAnalytics },
    });

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.analytics?.per_hive).toHaveLength(2);
    expect(result.current.analytics?.per_hive[0].hive_name).toBe('Sunny Hive');
    expect(result.current.analytics?.per_hive[0].total_kg).toBe(28.0);
  });

  it('shows year-over-year data for charts', async () => {
    mockGet.mockResolvedValue({
      data: { data: mockAnalytics },
    });

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.analytics?.year_over_year).toHaveLength(2);
    expect(result.current.analytics?.year_over_year[0].year).toBe(2025);
    expect(result.current.analytics?.year_over_year[1].total_kg).toBe(25.5);
  });

  it('shows best performing hive', async () => {
    mockGet.mockResolvedValue({
      data: { data: mockAnalytics },
    });

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.analytics?.best_performing_hive?.hive_name).toBe('Sunny Hive');
    expect(result.current.analytics?.best_performing_hive?.kg_per_harvest).toBe(9.3);
  });

  it('handles analytics fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.analytics).toBeNull();
  });

  it('supports refetch', async () => {
    mockGet.mockResolvedValue({
      data: { data: mockAnalytics },
    });

    const { result } = renderHook(() => useHarvestAnalytics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

describe('Harvest formatting utilities', () => {
  it('formatHarvestDate formats date correctly', () => {
    const formatted = formatHarvestDate('2026-07-15');
    expect(formatted).toContain('Jul');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2026');
  });

  it('formatKg formats with one decimal place', () => {
    expect(formatKg(12.5)).toBe('12.5 kg');
    expect(formatKg(0.0)).toBe('0.0 kg');
    expect(formatKg(100.123)).toBe('100.1 kg');
  });

  it('getCurrentSeasonLabel returns correct season', () => {
    const label = getCurrentSeasonLabel();
    // Season label should contain a year
    expect(label).toMatch(/\d{4} season/);
  });
});
