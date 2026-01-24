import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Time range options matching the API
export type TimeRange = 'day' | 'week' | 'month' | 'season' | 'year' | 'all';

export interface TimeRangeContextValue {
  range: TimeRange;
  date: string | null; // ISO date string for specific day selection
  setRange: (range: TimeRange) => void;
  setDate: (date: string | null) => void;
  // Computed helper values
  rangeLabel: string;
  isRealTime: boolean; // True for 'day' range (shows real-time data)
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

// Labels for each range option
const rangeLabels: Record<TimeRange, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  season: 'Season',
  year: 'Year',
  all: 'All Time',
};

interface TimeRangeProviderProps {
  children: ReactNode;
}

/**
 * TimeRangeProvider
 *
 * Provides shared time range state for all dashboard charts.
 * Persists selection in URL query params for bookmarkable views.
 *
 * Part of Epic 3, Story 3.4: Time Range Selector
 */
export function TimeRangeProvider({ children }: TimeRangeProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL or default to 'day'
  const [range, setRangeState] = useState<TimeRange>(() => {
    const urlRange = searchParams.get('range') as TimeRange;
    if (urlRange && Object.keys(rangeLabels).includes(urlRange)) {
      return urlRange;
    }
    return 'day';
  });

  const [date, setDateState] = useState<string | null>(() => {
    return searchParams.get('date');
  });

  // Update URL when range changes
  const setRange = useCallback(
    (newRange: TimeRange) => {
      setRangeState(newRange);
      const newParams = new URLSearchParams(searchParams);
      newParams.set('range', newRange);
      // Clear date when changing range (unless it's 'day')
      if (newRange !== 'day') {
        newParams.delete('date');
        setDateState(null);
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Update URL when date changes
  const setDate = useCallback(
    (newDate: string | null) => {
      setDateState(newDate);
      const newParams = new URLSearchParams(searchParams);
      if (newDate) {
        newParams.set('date', newDate);
      } else {
        newParams.delete('date');
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Sync state with URL when navigating
  useEffect(() => {
    const urlRange = searchParams.get('range') as TimeRange;
    if (urlRange && Object.keys(rangeLabels).includes(urlRange) && urlRange !== range) {
      setRangeState(urlRange);
    }
    const urlDate = searchParams.get('date');
    if (urlDate !== date) {
      setDateState(urlDate);
    }
  }, [searchParams, range, date]);

  const value: TimeRangeContextValue = {
    range,
    date,
    setRange,
    setDate,
    rangeLabel: rangeLabels[range],
    isRealTime: range === 'day',
  };

  return (
    <TimeRangeContext.Provider value={value}>
      {children}
    </TimeRangeContext.Provider>
  );
}

/**
 * Hook to access time range context.
 * Throws error if used outside of TimeRangeProvider.
 */
export function useTimeRange(): TimeRangeContextValue {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error('useTimeRange must be used within a TimeRangeProvider');
  }
  return context;
}

export default TimeRangeContext;
