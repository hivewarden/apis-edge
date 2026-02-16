/**
 * TimeRangeContext
 *
 * Provides time range state management for the dashboard.
 * Syncs selected range with URL query params for bookmarkable URLs.
 *
 * Part of Epic 3, Story 3.4: Time Range Selector
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Available time range options for filtering dashboard data.
 */
export type TimeRange = 'day' | 'week' | 'month' | 'season' | 'year' | 'all';

/**
 * Default time range when none is specified.
 */
export const DEFAULT_TIME_RANGE: TimeRange = 'day';

/**
 * Valid time range values for validation.
 */
const VALID_RANGES: TimeRange[] = ['day', 'week', 'month', 'season', 'year', 'all'];

/**
 * Check if a string is a valid TimeRange.
 */
function isValidTimeRange(value: string | null): value is TimeRange {
  return value !== null && VALID_RANGES.includes(value as TimeRange);
}

/**
 * Parse a date string (YYYY-MM-DD) to Date object.
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a Date object to YYYY-MM-DD string.
 */
function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

/**
 * Context value type for time range management.
 */
export interface TimeRangeContextValue {
  /** Currently selected time range */
  range: TimeRange;
  /** Selected date (only used when range is 'day') */
  date: Date | null;
  /** Set the time range */
  setRange: (range: TimeRange) => void;
  /** Set the selected date */
  setDate: (date: Date | null) => void;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

interface TimeRangeProviderProps {
  children: ReactNode;
}

/**
 * TimeRangeProvider
 *
 * Provides time range state to child components.
 * Syncs state bidirectionally with URL query params:
 * - ?range=week
 * - ?range=day&date=2026-01-20
 */
export function TimeRangeProvider({ children }: TimeRangeProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL params or defaults
  const urlRange = searchParams.get('range');
  const urlDate = searchParams.get('date');

  const [range, setRangeState] = useState<TimeRange>(() => {
    if (isValidTimeRange(urlRange)) {
      return urlRange;
    }
    return DEFAULT_TIME_RANGE;
  });

  const [date, setDateState] = useState<Date | null>(() => {
    if (range === 'day' && urlDate) {
      return parseDate(urlDate);
    }
    return null;
  });

  // Set range and update URL params
  const setRange = useCallback(
    (newRange: TimeRange) => {
      setRangeState(newRange);

      // Update URL params (preserve other params like site_id)
      const newParams = new URLSearchParams(searchParams);
      newParams.set('range', newRange);

      // Clear date if not day range, or initialize to today if switching TO day
      if (newRange !== 'day') {
        newParams.delete('date');
        setDateState(null);
      } else if (newRange === 'day' && !date) {
        // Initialize date to today when switching to 'day' range with no date set
        // This ensures the DatePicker display and API call are consistent
        const today = new Date();
        setDateState(today);
        newParams.set('date', formatDate(today) || '');
      }

      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams, date]
  );

  // Set date and update URL params
  const setDate = useCallback(
    (newDate: Date | null) => {
      setDateState(newDate);

      const newParams = new URLSearchParams(searchParams);
      const formatted = formatDate(newDate);

      if (formatted) {
        newParams.set('date', formatted);
      } else {
        newParams.delete('date');
      }

      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Sync from URL on external navigation (back/forward)
  useEffect(() => {
    const urlRange = searchParams.get('range');
    const urlDate = searchParams.get('date');

    if (isValidTimeRange(urlRange) && urlRange !== range) {
      setRangeState(urlRange);
    }

    if (range === 'day') {
      const parsed = parseDate(urlDate);
      if (parsed?.getTime() !== date?.getTime()) {
        setDateState(parsed);
      }
    }
    // Only sync FROM URL on searchParams change (back/forward navigation)
    // We don't include range/date because we're syncing *from* URL *to* state, not the reverse
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: TimeRangeContextValue = {
    range,
    date,
    setRange,
    setDate,
  };

  return (
    <TimeRangeContext.Provider value={value}>
      {children}
    </TimeRangeContext.Provider>
  );
}

/**
 * Hook to access time range context.
 *
 * @throws Error if used outside TimeRangeProvider
 *
 * @example
 * function MyComponent() {
 *   const { range, setRange } = useTimeRange();
 *   return <button onClick={() => setRange('week')}>Week</button>;
 * }
 */
export function useTimeRange(): TimeRangeContextValue {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error('useTimeRange must be used within a TimeRangeProvider');
  }
  return context;
}

export default TimeRangeContext;
