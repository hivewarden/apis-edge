/**
 * useCalendar Hook
 *
 * Fetches calendar events and reminders from the API with CRUD operations.
 * Calendar events include past treatments, computed treatment due dates,
 * and manual reminders.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';
import dayjs from 'dayjs';

/**
 * Calendar event data returned by the API.
 */
export interface CalendarEvent {
  id: string;
  date: string;
  type: 'treatment_past' | 'treatment_due' | 'reminder' | 'inspection_past';
  title: string;
  hive_id?: string;
  hive_name?: string;
  site_id?: string;
  site_name?: string;
  reminder_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Optional filters for calendar event fetching.
 */
export interface CalendarFilters {
  siteId?: string;
  hiveId?: string;
}

/**
 * Reminder data returned by the API.
 */
export interface Reminder {
  id: string;
  hive_id?: string;
  hive_name?: string;
  reminder_type: ReminderType;
  title: string;
  due_at: string;
  completed_at?: string;
  snoozed_until?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/**
 * Valid reminder types.
 */
export type ReminderType = 'treatment_due' | 'treatment_followup' | 'custom';

/**
 * Input for creating a new reminder.
 */
export interface CreateReminderInput {
  hive_id?: string;
  reminder_type?: ReminderType;
  title: string;
  due_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating a reminder.
 */
export interface UpdateReminderInput {
  title?: string;
  due_at?: string;
  snoozed_until?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Treatment interval configuration.
 */
export type TreatmentIntervals = Record<string, number>;

interface CalendarResponse {
  data: CalendarEvent[];
}

interface ReminderResponse {
  data: Reminder;
}

interface TreatmentIntervalsResponse {
  data: TreatmentIntervals;
}

interface UseCalendarResult {
  /** Calendar events for the current date range */
  events: CalendarEvent[];
  /** Current start date of the calendar view */
  startDate: dayjs.Dayjs;
  /** Current end date of the calendar view */
  endDate: dayjs.Dayjs;
  loading: boolean;
  error: Error | null;
  /** Fetch events for a new date range, with optional filters */
  fetchEvents: (start: dayjs.Dayjs, end: dayjs.Dayjs, filters?: CalendarFilters) => Promise<void>;
  /** Create a new reminder */
  createReminder: (input: CreateReminderInput) => Promise<Reminder>;
  /** Update an existing reminder */
  updateReminder: (id: string, input: UpdateReminderInput) => Promise<Reminder>;
  /** Delete a reminder */
  deleteReminder: (id: string) => Promise<void>;
  /** Snooze a reminder by a number of days */
  snoozeReminder: (id: string, days?: number) => Promise<Reminder>;
  /** Mark a reminder as complete */
  completeReminder: (id: string) => Promise<Reminder>;
  /** Snooze a computed treatment due (creates a snooze reminder) */
  snoozeTreatmentDue: (hiveId: string, treatmentType: string, days?: number) => Promise<void>;
  /** Skip a computed treatment due (permanently dismisses until next treatment) */
  skipTreatmentDue: (hiveId: string, treatmentType: string) => Promise<void>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Hook to fetch and manage calendar events and reminders.
 *
 * @example
 * function CalendarPage() {
 *   const { events, loading, fetchEvents } = useCalendar();
 *
 *   const onPanelChange = (date: Dayjs) => {
 *     const start = date.startOf('month');
 *     const end = date.endOf('month');
 *     fetchEvents(start, end);
 *   };
 *
 *   return <Calendar dateCellRender={...} onPanelChange={onPanelChange} />;
 * }
 */
export function useCalendar(): UseCalendarResult {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [startDate, setStartDate] = useState<dayjs.Dayjs>(dayjs().startOf('month'));
  const [endDate, setEndDate] = useState<dayjs.Dayjs>(dayjs().endOf('month'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = useCallback(async (start: dayjs.Dayjs, end: dayjs.Dayjs, filters?: CalendarFilters) => {
    setLoading(true);
    setStartDate(start);
    setEndDate(end);
    try {
      const params = new URLSearchParams();
      params.set('start', start.format('YYYY-MM-DD'));
      params.set('end', end.format('YYYY-MM-DD'));
      if (filters?.hiveId) {
        params.set('hive_id', filters.hiveId);
      } else if (filters?.siteId) {
        params.set('site_id', filters.siteId);
      }
      const response = await apiClient.get<CalendarResponse>(
        `/calendar?${params.toString()}`
      );
      setEvents(response.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial month on mount
  // Note: We intentionally omit startDate and endDate from deps because they're
  // initialized from state and we only want to fetch once on mount.
  // Subsequent fetches are triggered explicitly via fetchEvents().
  // TODO (S5-L3): Refactor to use useRef for initial date range to avoid
  // suppressing exhaustive-deps. The current pattern risks stale closures
  // if the hook is refactored and new deps are added without updating this array.
  useEffect(() => {
    fetchEvents(startDate, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createReminder = useCallback(async (input: CreateReminderInput): Promise<Reminder> => {
    setCreating(true);
    try {
      const response = await apiClient.post<ReminderResponse>('/reminders', {
        ...input,
        reminder_type: input.reminder_type || 'custom',
      });
      // Refetch events to include the new reminder
      await fetchEvents(startDate, endDate);
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const updateReminder = useCallback(async (id: string, input: UpdateReminderInput): Promise<Reminder> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<ReminderResponse>(`/reminders/${id}`, input);
      await fetchEvents(startDate, endDate);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const deleteReminder = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/reminders/${id}`);
      await fetchEvents(startDate, endDate);
    } finally {
      setDeleting(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const snoozeReminder = useCallback(async (id: string, days: number = 7): Promise<Reminder> => {
    setUpdating(true);
    try {
      const response = await apiClient.post<ReminderResponse>(`/reminders/${id}/snooze`, { days });
      await fetchEvents(startDate, endDate);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const completeReminder = useCallback(async (id: string): Promise<Reminder> => {
    setUpdating(true);
    try {
      const response = await apiClient.post<ReminderResponse>(`/reminders/${id}/complete`);
      await fetchEvents(startDate, endDate);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const snoozeTreatmentDue = useCallback(async (hiveId: string, treatmentType: string, days: number = 7): Promise<void> => {
    setUpdating(true);
    try {
      await apiClient.post('/calendar/snooze-treatment', {
        hive_id: hiveId,
        treatment_type: treatmentType,
        days,
      });
      await fetchEvents(startDate, endDate);
    } finally {
      setUpdating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  const skipTreatmentDue = useCallback(async (hiveId: string, treatmentType: string): Promise<void> => {
    setUpdating(true);
    try {
      await apiClient.post('/calendar/skip-treatment', {
        hive_id: hiveId,
        treatment_type: treatmentType,
      });
      await fetchEvents(startDate, endDate);
    } finally {
      setUpdating(false);
    }
  }, [fetchEvents, startDate, endDate]);

  return {
    events,
    startDate,
    endDate,
    loading,
    error,
    fetchEvents,
    createReminder,
    updateReminder,
    deleteReminder,
    snoozeReminder,
    completeReminder,
    snoozeTreatmentDue,
    skipTreatmentDue,
    creating,
    updating,
    deleting,
  };
}

/**
 * Hook to fetch and manage treatment intervals.
 */
export function useTreatmentIntervals() {
  const [intervals, setIntervals] = useState<TreatmentIntervals>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchIntervals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<TreatmentIntervalsResponse>('/settings/treatment-intervals');
      setIntervals(response.data.data || {});
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntervals();
  }, [fetchIntervals]);

  const updateIntervals = useCallback(async (newIntervals: TreatmentIntervals): Promise<void> => {
    setSaving(true);
    try {
      const response = await apiClient.put<TreatmentIntervalsResponse>(
        '/settings/treatment-intervals',
        newIntervals
      );
      setIntervals(response.data.data || newIntervals);
    } finally {
      setSaving(false);
    }
  }, []);

  const resetToDefaults = useCallback(async (): Promise<void> => {
    // Reset by updating with default values
    const defaults: TreatmentIntervals = {
      oxalic_acid: 90,
      formic_acid: 60,
      apiguard: 84,
      apivar: 42,
      maqs: 7,
      api_bioxal: 90,
    };
    await updateIntervals(defaults);
  }, [updateIntervals]);

  return {
    intervals,
    loading,
    error,
    saving,
    refetch: fetchIntervals,
    updateIntervals,
    resetToDefaults,
  };
}

/**
 * Default treatment interval days.
 */
export const DEFAULT_TREATMENT_INTERVALS: TreatmentIntervals = {
  oxalic_acid: 90,
  formic_acid: 60,
  apiguard: 84,
  apivar: 42,
  maqs: 7,
  api_bioxal: 90,
};

/**
 * Format treatment type slug to display name.
 */
export function formatTreatmentType(type: string): string {
  const names: Record<string, string> = {
    oxalic_acid: 'Oxalic Acid',
    formic_acid: 'Formic Acid',
    apiguard: 'Apiguard',
    apivar: 'Apivar',
    maqs: 'MAQS',
    api_bioxal: 'Api-Bioxal',
  };
  return names[type] || type;
}

export default useCalendar;
