/**
 * Unit tests for useTaskSuggestions hook
 *
 * Part of Epic 14, Story 14.15: BeeBrain Task Suggestions Integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTaskSuggestions, TaskSuggestion, SuggestionPriority } from '../../src/hooks/useTaskSuggestions';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Helper to create mock suggestions
const createSuggestion = (overrides: Partial<TaskSuggestion>): TaskSuggestion => ({
  id: 'suggestion-1',
  hive_id: 'hive-1',
  suggested_title: 'Consider requeening',
  reason: 'Queen is 3 years old',
  priority: 'high' as SuggestionPriority,
  status: 'pending',
  created_at: '2026-01-30T10:00:00Z',
  ...overrides,
});

describe('useTaskSuggestions', () => {
  const mockApiClient = apiClient as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('returns loading true initially', async () => {
      // Create a promise that we control
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockApiClient.get.mockReturnValue(pendingPromise);

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.suggestions).toEqual([]);

      // Clean up
      resolvePromise!({ data: { data: [] } });
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('sets loading false after fetch completes', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [] },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Fetching Suggestions', () => {
    it('returns suggestions from API', async () => {
      const mockSuggestions = [
        createSuggestion({ id: 'suggestion-1', suggested_title: 'Requeen' }),
        createSuggestion({ id: 'suggestion-2', suggested_title: 'Treat for Varroa' }),
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockSuggestions },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions[0].suggested_title).toBe('Requeen');
      expect(result.current.suggestions[1].suggested_title).toBe('Treat for Varroa');
    });

    it('fetches from correct endpoint', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [] },
      });

      renderHook(() => useTaskSuggestions('hive-123'));

      await waitFor(() =>
        expect(mockApiClient.get).toHaveBeenCalledWith('/hives/hive-123/suggestions')
      );
    });

    it('returns empty array for empty response', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [] },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.suggestions).toEqual([]);
    });

    it('handles missing hiveId gracefully', async () => {
      const { result } = renderHook(() => useTaskSuggestions(''));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.suggestions).toEqual([]);
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('sets error on fetch failure', async () => {
      const error = new Error('Network error');
      mockApiClient.get.mockRejectedValue(error);

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.error).toBeTruthy());

      expect(result.current.error).toEqual(error);
      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe('Accept Suggestion', () => {
    it('calls accept endpoint with correct parameters', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [createSuggestion()] },
      });

      const mockTask = {
        id: 'task-new',
        hive_id: 'hive-1',
        title: 'Consider requeening',
        priority: 'high',
        status: 'pending',
        source: 'beebrain',
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockTask },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      let createdTask;
      await act(async () => {
        createdTask = await result.current.acceptSuggestion('suggestion-1');
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/hives/hive-1/suggestions/suggestion-1/accept'
      );
      expect(createdTask).toEqual(mockTask);
    });

    it('sets accepting state during accept', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [createSuggestion()] },
      });

      let resolveAccept: (value: unknown) => void;
      const pendingAccept = new Promise((resolve) => {
        resolveAccept = resolve;
      });
      mockApiClient.post.mockReturnValue(pendingAccept);

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Start accepting
      let acceptPromise: Promise<unknown>;
      act(() => {
        acceptPromise = result.current.acceptSuggestion('suggestion-1');
      });

      // Should be accepting now
      expect(result.current.accepting).toBe(true);

      // Resolve and wait
      resolveAccept!({ data: { data: { id: 'task-1' } } });
      await act(async () => {
        await acceptPromise;
      });

      expect(result.current.accepting).toBe(false);
    });
  });

  describe('Dismiss Suggestion', () => {
    it('calls dismiss endpoint with correct parameters', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [createSuggestion()] },
      });

      mockApiClient.delete.mockResolvedValue({});

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.dismissSuggestion('suggestion-1');
      });

      expect(mockApiClient.delete).toHaveBeenCalledWith(
        '/hives/hive-1/suggestions/suggestion-1'
      );
    });

    it('sets dismissing state during dismiss', async () => {
      mockApiClient.get.mockResolvedValue({
        data: { data: [createSuggestion()] },
      });

      let resolveDismiss: (value: unknown) => void;
      const pendingDismiss = new Promise((resolve) => {
        resolveDismiss = resolve;
      });
      mockApiClient.delete.mockReturnValue(pendingDismiss);

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Start dismissing
      let dismissPromise: Promise<unknown>;
      act(() => {
        dismissPromise = result.current.dismissSuggestion('suggestion-1');
      });

      // Should be dismissing now
      expect(result.current.dismissing).toBe(true);

      // Resolve and wait
      resolveDismiss!({});
      await act(async () => {
        await dismissPromise;
      });

      expect(result.current.dismissing).toBe(false);
    });
  });

  describe('Refetch', () => {
    it('refetches suggestions on refetch call', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          data: { data: [createSuggestion({ id: 'suggestion-1' })] },
        })
        .mockResolvedValueOnce({
          data: { data: [createSuggestion({ id: 'suggestion-2' })] },
        });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.suggestions[0].id).toBe('suggestion-1');

      // Refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.suggestions[0].id).toBe('suggestion-2');
      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Priority Values', () => {
    it('handles all priority values', async () => {
      const priorities: SuggestionPriority[] = ['low', 'medium', 'high', 'urgent'];
      const mockSuggestions = priorities.map((priority, i) =>
        createSuggestion({ id: `suggestion-${i}`, priority })
      );

      mockApiClient.get.mockResolvedValue({
        data: { data: mockSuggestions },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.suggestions).toHaveLength(4);
      expect(result.current.suggestions.map(s => s.priority)).toEqual(priorities);
    });
  });

  describe('Suggestion Fields', () => {
    it('includes all suggestion fields', async () => {
      const fullSuggestion: TaskSuggestion = {
        id: 'suggestion-full',
        hive_id: 'hive-1',
        inspection_id: 'inspection-123',
        suggested_template_id: 'sys-template-requeen',
        suggested_title: 'Requeen this hive',
        reason: 'Queen is 3 years old and showing reduced laying pattern',
        priority: 'high',
        status: 'pending',
        created_at: '2026-01-30T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: [fullSuggestion] },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const suggestion = result.current.suggestions[0];
      expect(suggestion.id).toBe('suggestion-full');
      expect(suggestion.hive_id).toBe('hive-1');
      expect(suggestion.inspection_id).toBe('inspection-123');
      expect(suggestion.suggested_template_id).toBe('sys-template-requeen');
      expect(suggestion.suggested_title).toBe('Requeen this hive');
      expect(suggestion.reason).toBe('Queen is 3 years old and showing reduced laying pattern');
      expect(suggestion.priority).toBe('high');
      expect(suggestion.status).toBe('pending');
      expect(suggestion.created_at).toBe('2026-01-30T10:00:00Z');
    });

    it('handles suggestion without optional fields', async () => {
      const minimalSuggestion: TaskSuggestion = {
        id: 'suggestion-minimal',
        hive_id: 'hive-1',
        suggested_title: 'Custom task',
        reason: 'Manual inspection needed',
        priority: 'medium',
        status: 'pending',
        created_at: '2026-01-30T10:00:00Z',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: [minimalSuggestion] },
      });

      const { result } = renderHook(() => useTaskSuggestions('hive-1'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const suggestion = result.current.suggestions[0];
      expect(suggestion.inspection_id).toBeUndefined();
      expect(suggestion.suggested_template_id).toBeUndefined();
    });
  });

  describe('HiveId Changes', () => {
    it('refetches when hiveId changes', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          data: { data: [createSuggestion({ id: 'suggestion-hive-1' })] },
        })
        .mockResolvedValueOnce({
          data: { data: [createSuggestion({ id: 'suggestion-hive-2' })] },
        });

      const { result, rerender } = renderHook(
        ({ hiveId }) => useTaskSuggestions(hiveId),
        { initialProps: { hiveId: 'hive-1' } }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.suggestions[0].id).toBe('suggestion-hive-1');

      // Change hiveId
      rerender({ hiveId: 'hive-2' });

      await waitFor(() =>
        expect(mockApiClient.get).toHaveBeenLastCalledWith('/hives/hive-2/suggestions')
      );
    });
  });
});
