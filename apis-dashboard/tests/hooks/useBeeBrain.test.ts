/**
 * useBeeBrain Hook Tests
 *
 * Tests for the BeeBrain AI analysis data hook.
 * Part of Epic 8, Story 8.2: Dashboard BeeBrain Card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBeeBrain, BeeBrainData, Insight } from '../../src/hooks/useBeeBrain';

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
 * Sample BeeBrain data for testing.
 */
const mockHealthyData: BeeBrainData = {
  summary: 'All quiet at Test Site. Your 3 hives are doing well. No actions needed.',
  last_analysis: new Date().toISOString(),
  insights: [],
  all_good: true,
};

const mockInsight1: Insight = {
  id: 'insight-1',
  hive_id: 'hive-1',
  hive_name: 'Hive 1',
  rule_id: 'treatment_due',
  severity: 'warning',
  message: 'Varroa treatment due (92 days since last)',
  suggested_action: 'Consider applying treatment within the next week',
  data_points: { days_since_treatment: 92 },
  created_at: new Date().toISOString(),
};

const mockInsight2: Insight = {
  id: 'insight-2',
  hive_id: 'hive-2',
  hive_name: 'Hive 2',
  rule_id: 'inspection_due',
  severity: 'info',
  message: 'Consider inspection (16 days)',
  suggested_action: 'Schedule a routine inspection',
  data_points: { days_since_inspection: 16 },
  created_at: new Date().toISOString(),
};

const mockInsight3: Insight = {
  id: 'insight-3',
  hive_id: 'hive-3',
  hive_name: 'Hive 3',
  rule_id: 'queen_aging',
  severity: 'action-needed',
  message: 'Queen is 3 years old, consider replacement',
  suggested_action: 'Plan for queen replacement this season',
  data_points: { queen_age_years: 3 },
  created_at: new Date().toISOString(),
};

const mockDataWithInsights: BeeBrainData = {
  summary: 'There are some items that need your attention.',
  last_analysis: new Date().toISOString(),
  insights: [mockInsight1, mockInsight2, mockInsight3],
  all_good: false,
};

describe('useBeeBrain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial state', () => {
    it('returns null data when no siteId provided', async () => {
      const { result } = renderHook(() => useBeeBrain(null));

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

      const { result } = renderHook(() => useBeeBrain('site-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  describe('Data fetching', () => {
    it('fetches BeeBrain data for provided siteId', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useBeeBrain('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/beebrain/dashboard?site_id=site-1'
      );
      expect(result.current.data).toEqual(mockHealthyData);
      expect(result.current.error).toBeNull();
    });

    it('fetches data with insights', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      const { result } = renderHook(() => useBeeBrain('site-2'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockDataWithInsights);
      expect(result.current.data?.insights).toHaveLength(3);
      expect(result.current.data?.all_good).toBe(false);
    });

    it('handles fetch errors', async () => {
      const mockError = new Error('Network error');
      mockApiClient.get.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useBeeBrain('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeNull();
    });

    it('resets state when siteId changes', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useBeeBrain(siteId),
        { initialProps: { siteId: 'site-1' as string | null } }
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Change site
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      rerender({ siteId: 'site-2' });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockDataWithInsights);
      });
    });

    it('shows loading state during siteId transition', async () => {
      // First site loads successfully
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result, rerender } = renderHook(
        ({ siteId }) => useBeeBrain(siteId),
        { initialProps: { siteId: 'site-1' as string | null } }
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Set up a delayed response for the second site
      let resolveSecondFetch: (value: unknown) => void;
      mockApiClient.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondFetch = resolve;
          })
      );

      // Change site - should immediately show loading state
      rerender({ siteId: 'site-2' });

      // Verify loading state is true during transition
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();

      // Now resolve the fetch
      resolveSecondFetch!({ data: { data: mockDataWithInsights } });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toEqual(mockDataWithInsights);
      });
    });
  });

  describe('Refresh functionality', () => {
    it('calls POST /beebrain/refresh and re-fetches data', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useBeeBrain('site-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set up mocks for refresh
      mockApiClient.post.mockResolvedValueOnce({});
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockDataWithInsights },
      });

      // Trigger refresh
      await act(async () => {
        await result.current.refresh();
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/beebrain/refresh?site_id=site-1',
        {},
        expect.any(Object)
      );
      expect(result.current.data).toEqual(mockDataWithInsights);
    });

    it('does not refresh when no siteId', async () => {
      const { result } = renderHook(() => useBeeBrain(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

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

    it('sets timedOut to true after 10 seconds', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useBeeBrain('site-1'));

      // Wait for initial load with real async handling
      await vi.waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set up mock that never resolves
      mockApiClient.post.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Trigger refresh
      act(() => {
        result.current.refresh();
      });

      expect(result.current.refreshing).toBe(true);
      expect(result.current.timedOut).toBe(false);

      // Advance time by 10 seconds
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.timedOut).toBe(true);
      expect(result.current.refreshing).toBe(false);
    });

    it('sets up auto-refresh every hour', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: mockHealthyData },
      });

      renderHook(() => useBeeBrain('site-1'));

      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      });

      // Advance time by 1 hour
      await act(async () => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
    });

    it('cleans up interval on unmount', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: mockHealthyData },
      });

      const { unmount } = renderHook(() => useBeeBrain('site-1'));

      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Advance time - should not trigger more fetches
      await act(async () => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      // Should still be 1 call
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling with stale data', () => {
    it('keeps stale data on refresh error', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { data: mockHealthyData },
      });

      const { result } = renderHook(() => useBeeBrain('site-1'));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockHealthyData);
      });

      // Set up error for refresh
      mockApiClient.post.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () => {
        await result.current.refresh();
      });

      // Data should still be there
      expect(result.current.data).toEqual(mockHealthyData);
      expect(result.current.error).toBeTruthy();
    });
  });
});
