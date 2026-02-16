/**
 * useTaskSuggestions Hook
 *
 * Provides data fetching and management for BeeBrain task suggestions.
 * Follows the layered hooks architecture pattern from CLAUDE.md.
 *
 * Part of Epic 14, Story 14.15
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../providers/apiClient';
import type { Task } from './useTasks';

/**
 * Task suggestion priority levels.
 */
export type SuggestionPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Task suggestion status values.
 */
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

/**
 * Task suggestion data returned by the API.
 */
export interface TaskSuggestion {
  id: string;
  hive_id: string;
  inspection_id?: string;
  suggested_template_id?: string;
  suggested_title: string;
  reason: string;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  created_at: string;
}

/**
 * Response from fetching suggestions list.
 */
interface SuggestionsListResponse {
  data: TaskSuggestion[];
}

/**
 * Response from accepting a suggestion.
 */
interface AcceptSuggestionResponse {
  data: Task;
}

/**
 * Result type for the useTaskSuggestions hook.
 */
export interface UseTaskSuggestionsResult {
  /** List of pending suggestions for the hive */
  suggestions: TaskSuggestion[];
  /** Whether suggestions are being loaded */
  loading: boolean;
  /** Error that occurred during fetch, if any */
  error: Error | null;
  /** Refetch suggestions from the server */
  refetch: () => Promise<void>;
  /** Accept a suggestion and create a task from it */
  acceptSuggestion: (suggestionId: string) => Promise<Task>;
  /** Dismiss a suggestion without creating a task */
  dismissSuggestion: (suggestionId: string) => Promise<void>;
  /** Whether a suggestion is currently being accepted */
  accepting: boolean;
  /** Whether a suggestion is currently being dismissed */
  dismissing: boolean;
}

/**
 * Hook for fetching and managing BeeBrain task suggestions for a hive.
 *
 * @param hiveId - The hive ID to fetch suggestions for
 * @returns Suggestions data, loading state, error, and mutation functions
 *
 * @example
 * function SuggestionsSection({ hiveId }) {
 *   const { suggestions, loading, acceptSuggestion, dismissSuggestion } = useTaskSuggestions(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return (
 *     <div>
 *       {suggestions.map(s => (
 *         <SuggestionCard
 *           key={s.id}
 *           suggestion={s}
 *           onAccept={() => acceptSuggestion(s.id)}
 *           onDismiss={() => dismissSuggestion(s.id)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useTaskSuggestions(hiveId: string): UseTaskSuggestionsResult {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!hiveId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<SuggestionsListResponse>(`/hives/${hiveId}/suggestions`);
      if (isMountedRef.current) {
        setSuggestions(response.data.data || []);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
        setSuggestions([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [hiveId]);

  const acceptSuggestion = useCallback(
    async (suggestionId: string): Promise<Task> => {
      setAccepting(true);
      try {
        const response = await apiClient.post<AcceptSuggestionResponse>(
          `/hives/${hiveId}/suggestions/${suggestionId}/accept`
        );
        return response.data.data;
      } finally {
        if (isMountedRef.current) {
          setAccepting(false);
        }
      }
    },
    [hiveId]
  );

  const dismissSuggestion = useCallback(
    async (suggestionId: string): Promise<void> => {
      setDismissing(true);
      try {
        await apiClient.delete(`/hives/${hiveId}/suggestions/${suggestionId}`);
      } finally {
        if (isMountedRef.current) {
          setDismissing(false);
        }
      }
    },
    [hiveId]
  );

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetch]);

  return {
    suggestions,
    loading,
    error,
    refetch: fetch,
    acceptSuggestion,
    dismissSuggestion,
    accepting,
    dismissing,
  };
}

export default useTaskSuggestions;
