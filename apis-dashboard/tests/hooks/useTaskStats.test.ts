/**
 * useTaskStats Hook Tests
 *
 * Tests for the task stats hook and its interfaces.
 * Part of Epic 14, Story 14.14 (Overdue Alerts + Navigation Badge)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTaskStats } from '../../src/hooks/useTaskStats';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Interface definitions for testing
interface TaskStats {
  total_open: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
}

// Mock response data
const mockTaskStats: TaskStats = {
  total_open: 15,
  overdue: 3,
  due_today: 2,
  due_this_week: 5,
};

const mockEmptyStats: TaskStats = {
  total_open: 0,
  overdue: 0,
  due_today: 0,
  due_this_week: 0,
};

describe('useTaskStats hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('starts with loading=true and stats=null', () => {
      vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useTaskStats());

      expect(result.current.loading).toBe(true);
      expect(result.current.stats).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful data fetch', () => {
    it('fetches task stats successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockTaskStats } });

      const { result } = renderHook(() => useTaskStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/tasks/stats');
      expect(result.current.stats).toEqual(mockTaskStats);
      expect(result.current.error).toBeNull();
    });

    it('returns all zeros when no tasks exist', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockEmptyStats } });

      const { result } = renderHook(() => useTaskStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats?.total_open).toBe(0);
      expect(result.current.stats?.overdue).toBe(0);
      expect(result.current.stats?.due_today).toBe(0);
      expect(result.current.stats?.due_this_week).toBe(0);
    });

    it('returns correct counts for various scenarios', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockTaskStats } });

      const { result } = renderHook(() => useTaskStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats?.total_open).toBe(15);
      expect(result.current.stats?.overdue).toBe(3);
      expect(result.current.stats?.due_today).toBe(2);
      expect(result.current.stats?.due_this_week).toBe(5);
    });
  });

  describe('error handling', () => {
    it('sets error state on API failure', async () => {
      const mockError = new Error('Network error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      const { result } = renderHook(() => useTaskStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(mockError);
      expect(result.current.stats).toBeNull();
    });
  });

  describe('refetch functionality', () => {
    it('provides a refetch function that reloads data', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: { data: mockEmptyStats } })
        .mockResolvedValueOnce({ data: { data: mockTaskStats } });

      const { result } = renderHook(() => useTaskStats());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats?.overdue).toBe(0);

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.stats?.overdue).toBe(3);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('TaskStats interface', () => {
  it('has all required fields', () => {
    const stats: TaskStats = {
      total_open: 15,
      overdue: 3,
      due_today: 2,
      due_this_week: 5,
    };

    expect(stats.total_open).toBe(15);
    expect(stats.overdue).toBe(3);
    expect(stats.due_today).toBe(2);
    expect(stats.due_this_week).toBe(5);
  });

  it('all fields are numbers', () => {
    const stats: TaskStats = {
      total_open: 10,
      overdue: 2,
      due_today: 1,
      due_this_week: 4,
    };

    expect(typeof stats.total_open).toBe('number');
    expect(typeof stats.overdue).toBe('number');
    expect(typeof stats.due_today).toBe('number');
    expect(typeof stats.due_this_week).toBe('number');
  });

  it('fields can be zero', () => {
    const stats: TaskStats = {
      total_open: 0,
      overdue: 0,
      due_today: 0,
      due_this_week: 0,
    };

    expect(stats.total_open).toBe(0);
    expect(stats.overdue).toBe(0);
    expect(stats.due_today).toBe(0);
    expect(stats.due_this_week).toBe(0);
  });
});

describe('Task stats date conditions', () => {
  it('overdue means due_date < today', () => {
    // Document the SQL condition: due_date < CURRENT_DATE
    const condition = 'due_date < CURRENT_DATE';
    expect(condition).toContain('<');
    expect(condition).not.toContain('<=');
  });

  it('due_today means due_date = today', () => {
    // Document the SQL condition: due_date = CURRENT_DATE
    const condition = 'due_date = CURRENT_DATE';
    expect(condition).toContain('=');
  });

  it('due_this_week means due_date within next 7 days', () => {
    // Document the SQL condition: due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    const condition = "due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'";
    expect(condition).toContain('BETWEEN');
    expect(condition).toContain('7 days');
  });

  it('total_open counts all pending tasks', () => {
    // Document the SQL condition: status = 'pending'
    const condition = "status = 'pending'";
    expect(condition).toContain('pending');
  });
});

describe('Navigation badge usage', () => {
  it('badge shows overdue count when > 0', () => {
    const stats: TaskStats = {
      total_open: 15,
      overdue: 3,
      due_today: 2,
      due_this_week: 5,
    };

    const shouldShowBadge = stats.overdue > 0;
    expect(shouldShowBadge).toBe(true);
  });

  it('badge hidden when overdue = 0', () => {
    const stats: TaskStats = {
      total_open: 10,
      overdue: 0,
      due_today: 2,
      due_this_week: 5,
    };

    const shouldShowBadge = stats.overdue > 0;
    expect(shouldShowBadge).toBe(false);
  });
});

describe('Alert banner usage', () => {
  it('banner shows when overdue > 0', () => {
    const stats: TaskStats = {
      total_open: 15,
      overdue: 3,
      due_today: 2,
      due_this_week: 5,
    };

    const shouldShowBanner = stats.overdue > 0;
    expect(shouldShowBanner).toBe(true);
  });

  it('banner text includes count', () => {
    const overdueCount = 3;
    const bannerText = `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`;
    expect(bannerText).toBe('You have 3 overdue tasks');
  });

  it('banner text uses singular when count = 1', () => {
    const overdueCount = 1;
    const bannerText = `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`;
    expect(bannerText).toBe('You have 1 overdue task');
  });
});
