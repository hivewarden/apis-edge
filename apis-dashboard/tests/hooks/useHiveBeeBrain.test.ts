/**
 * useHiveBeeBrain Hook Tests
 *
 * Tests for the hive-specific BeeBrain AI analysis data hook.
 * Part of Epic 8, Story 8.3: Hive Detail BeeBrain Analysis
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHiveBeeBrain, HiveBeeBrainData, Insight } from '../../src/hooks/useHiveBeeBrain';

// Mock the apiClient module
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Import the mocked module
import { apiClient } from '../../src/providers/apiClient';

const mockApiClient = apiClient as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

/**
 * Sample hive BeeBrain data for testing.
 */
const mockHealthyData: HiveBeeBrainData = {
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  health_assessment: 'This hive is in good health with no immediate concerns.',
  insights: [],
  recommendations: ['Continue regular inspections', 'Monitor for varroa in spring'],
  last_analysis: new Date().toISOString(),
};

const mockInsight1: Insight = {
  id: 'insight-1',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'treatment_due',
  severity: 'warning',
  message: 'Varroa treatment due (92 days since last)',
  suggested_action: 'Consider applying treatment within the next week',
  data_points: { days_since_treatment: 92, last_treatment_date: '2025-10-25', last_treatment_type: 'oxalic_acid' },
  created_at: new Date().toISOString(),
};

const mockInsight2: Insight = {
  id: 'insight-2',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'inspection_overdue',
  severity: 'info',
  message: 'Consider inspection (16 days)',
  suggested_action: 'Schedule a routine inspection',
  data_points: { days_since_inspection: 16, last_inspection_date: '2026-01-09' },
  created_at: new Date().toISOString(),
};

const mockInsight3: Insight = {
  id: 'insight-3',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'queen_aging',
  severity: 'action-needed',
  message: 'Queen is 3 years old, consider replacement',
  suggested_action: 'Plan for queen replacement this season',
  data_points: { queen_age_years: 3, productivity_drop_percent: 23 },
  created_at: new Date().toISOString(),
};

const mockDataWithInsights: HiveBeeBrainData = {
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  health_assessment: 'This hive has some items that need your attention.',
  insights: [mockInsight1, mockInsight2, mockInsight3],
  recommendations: [],
  last_analysis: new Date().toISOString(),
};

describe('useHiveBeeBrain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial state', () => {
    it('returns null data when no hiveId provided', async () => {
      const { result } = renderHook(() => useHiveBeeBrain(null));

      // Wait for the loading state to resolve
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.timedOut).toBe(false);
      expect(result.current.refreshing).toBe(false);
    });

    it('shows loading state initially', () => {
      mockApiClient.get.mockImplementation(
        () => new Promise(() => {}) // Never resolves to keep loading state
      );

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  describe('Data fetching', () => {
    it('fetches hive BeeBrain data for provided hiveId', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/beebrain/hive/hive-1',
        expect.any(Object)
      );
      expect(result.current.data).toEqual(mockHealthyData);
      expect(result.current.error).toBeNull();
    });

    it('fetches data with insights', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockDataWithInsights);
      expect(result.current.data?.insights).toHaveLength(3);
    });

    it('handles fetch errors', async () => {
      const mockError = new Error('Network error');
      mockApiClient.get.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeNull();
    });

    it('resets state when hiveId changes', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result, rerender } = renderHook(
        ({ hiveId }) => useHiveBeeBrain(hiveId),
        { initialProps: { hiveId: 'hive-1' as string | null } }
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Change hive
      const newData = { ...mockDataWithInsights, hive_id: 'hive-2', hive_name: 'Hive 2' };
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: newData },
      });

      rerender({ hiveId: 'hive-2' });

      await waitFor(() => {
        expect(result.current.data?.hive_id).toBe('hive-2');
      });
    });

    it('shows loading state during hiveId transition', async () => {
      // First hive loads successfully
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result, rerender } = renderHook(
        ({ hiveId }) => useHiveBeeBrain(hiveId),
        { initialProps: { hiveId: 'hive-1' as string | null } }
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Set up a delayed response for the second hive
      let resolveSecondFetch: (value: unknown) => void;
      mockApiClient.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondFetch = resolve;
          })
      );

      // Change hive - should immediately show loading state
      rerender({ hiveId: 'hive-2' });

      // Verify loading state is true during transition
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();

      // Now resolve the fetch
      const newData = { ...mockDataWithInsights, hive_id: 'hive-2' };
      resolveSecondFetch!({ data: { data: newData } });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.data?.hive_id).toBe('hive-2');
      });
    });
  });

  describe('Refresh functionality', () => {
    it('calls GET /beebrain/hive/{id} on refresh', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set up mocks for refresh
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      // Trigger refresh
      await act(async () => {
        await result.current.refresh();
      });

      // Should have called GET twice (initial + refresh)
      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      expect(result.current.data).toEqual(mockDataWithInsights);
    });

    it('does not refresh when no hiveId', async () => {
      const { result } = renderHook(() => useHiveBeeBrain(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      // Should not have called any API methods
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('sets refreshing to true during refresh', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set up a delayed response for refresh
      let resolveRefresh: (value: unknown) => void;
      mockApiClient.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      );

      // Trigger refresh (don't await)
      await act(async () => {
        result.current.refresh();
      });

      // Should be refreshing
      expect(result.current.refreshing).toBe(true);

      // Resolve the refresh - wrap in act to handle state updates
      await act(async () => {
        resolveRefresh!({ data: { data: mockDataWithInsights } });
      });

      await waitFor(() => {
        expect(result.current.refreshing).toBe(false);
      });
    });
  });

  describe('Dismiss insight functionality', () => {
    it('calls POST /beebrain/insights/{id}/dismiss and updates local state', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.insights).toHaveLength(3);

      // Mock dismiss API call
      mockApiClient.post.mockResolvedValueOnce({
        data: { data: { message: 'Insight dismissed successfully', id: 'insight-1' } },
      });

      // Dismiss insight
      await act(async () => {
        await result.current.dismissInsight('insight-1');
      });

      // Should have called dismiss endpoint
      expect(mockApiClient.post).toHaveBeenCalledWith('/beebrain/insights/insight-1/dismiss');

      // Insight should be removed from local state (optimistic update)
      expect(result.current.data?.insights).toHaveLength(2);
      expect(result.current.data?.insights.find((i) => i.id === 'insight-1')).toBeUndefined();
    });

    it('reverts optimistic update on dismiss error', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock dismiss API call to fail
      mockApiClient.post.mockRejectedValueOnce(new Error('Dismiss failed'));

      // Mock refetch to return original data
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      // Dismiss insight (should fail)
      await expect(
        act(async () => {
          await result.current.dismissInsight('insight-1');
        })
      ).rejects.toThrow('Dismiss failed');

      // Data should be refetched (revert)
      expect(result.current.data?.insights).toHaveLength(3);
    });

    it('does not dismiss when no hiveId', async () => {
      const { result } = renderHook(() => useHiveBeeBrain(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.dismissInsight('insight-1');
      });

      // Should not have called dismiss endpoint
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });
  });

  describe('Timeout handling with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets timedOut to true after 10 seconds during refresh', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      // Wait for initial load - run pending timers to allow promise to resolve
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      // Set up mock that never resolves
      mockApiClient.get.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Trigger refresh - wrap in act to handle state updates
      await act(async () => {
        result.current.refresh();
      });

      expect(result.current.refreshing).toBe(true);
      expect(result.current.timedOut).toBe(false);

      // Advance time by 10 seconds - wrap in act for state updates
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(result.current.timedOut).toBe(true);
      expect(result.current.refreshing).toBe(false);
    });

    it('cleans up on unmount', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: mockHealthyData },
      });

      const { unmount, result } = renderHook(() => useHiveBeeBrain('hive-1'));

      // Wait for initial load to complete - run all timers within act
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      unmount();

      // Should not throw or cause issues after unmount
    });
  });

  describe('Error handling with stale data', () => {
    it('keeps stale data on refresh error', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Set up error for refresh
      mockApiClient.get.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () => {
        await result.current.refresh();
      });

      // Data should still be there
      expect(result.current.data).toEqual(mockHealthyData);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Healthy hive with recommendations', () => {
    it('returns data with empty insights but populated recommendations', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useHiveBeeBrain('hive-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data?.insights).toHaveLength(0);
      expect(result.current.data?.recommendations).toHaveLength(2);
      expect(result.current.data?.health_assessment).toBe('This hive is in good health with no immediate concerns.');
    });
  });
});
