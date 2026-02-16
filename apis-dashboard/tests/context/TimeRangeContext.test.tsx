import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { ReactNode } from 'react';
import {
  TimeRangeProvider,
  useTimeRange,
  DEFAULT_TIME_RANGE,
  TimeRange,
} from '../../src/context/TimeRangeContext';

// Helper component to display context values for testing
function TestConsumer() {
  const { range, date, setRange, setDate } = useTimeRange();
  return (
    <div>
      <span data-testid="range">{range}</span>
      <span data-testid="date">{date ? date.toISOString().split('T')[0] : 'null'}</span>
      <button onClick={() => setRange('week')} data-testid="set-week">
        Set Week
      </button>
      <button onClick={() => setRange('day')} data-testid="set-day">
        Set Day
      </button>
      <button onClick={() => setDate(new Date('2026-01-15'))} data-testid="set-date">
        Set Date
      </button>
      <button onClick={() => setDate(null)} data-testid="clear-date">
        Clear Date
      </button>
    </div>
  );
}

// Helper to render with router
function renderWithRouter(
  ui: ReactNode,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {}
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  );
}

describe('TimeRangeContext', () => {
  describe('Provider initialization', () => {
    it('provides default time range when no URL params', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>
      );

      expect(screen.getByTestId('range').textContent).toBe(DEFAULT_TIME_RANGE);
    });

    it('initializes range from URL params', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=month'] }
      );

      expect(screen.getByTestId('range').textContent).toBe('month');
    });

    it('initializes date from URL params when range is day', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=day&date=2026-01-20'] }
      );

      expect(screen.getByTestId('range').textContent).toBe('day');
      expect(screen.getByTestId('date').textContent).toBe('2026-01-20');
    });

    it('ignores invalid range values and uses default', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=invalid'] }
      );

      expect(screen.getByTestId('range').textContent).toBe(DEFAULT_TIME_RANGE);
    });
  });

  describe('setRange', () => {
    it('updates range state', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>
      );

      act(() => {
        screen.getByTestId('set-week').click();
      });

      expect(screen.getByTestId('range').textContent).toBe('week');
    });

    it('clears date when switching away from day range', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=day&date=2026-01-20'] }
      );

      expect(screen.getByTestId('date').textContent).toBe('2026-01-20');

      act(() => {
        screen.getByTestId('set-week').click();
      });

      expect(screen.getByTestId('date').textContent).toBe('null');
    });

    it('initializes date to today when switching to day range with no date', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=week'] }
      );

      expect(screen.getByTestId('date').textContent).toBe('null');

      act(() => {
        screen.getByTestId('set-day').click();
      });

      // Date should be initialized to today
      const today = new Date().toISOString().split('T')[0];
      expect(screen.getByTestId('date').textContent).toBe(today);
    });
  });

  describe('setDate', () => {
    it('updates date state', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=day'] }
      );

      act(() => {
        screen.getByTestId('set-date').click();
      });

      expect(screen.getByTestId('date').textContent).toBe('2026-01-15');
    });

    it('clears date when set to null', () => {
      renderWithRouter(
        <TimeRangeProvider>
          <TestConsumer />
        </TimeRangeProvider>,
        { initialEntries: ['/?range=day&date=2026-01-20'] }
      );

      act(() => {
        screen.getByTestId('clear-date').click();
      });

      expect(screen.getByTestId('date').textContent).toBe('null');
    });
  });

  describe('useTimeRange hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useTimeRange());
      }).toThrow('useTimeRange must be used within a TimeRangeProvider');

      consoleSpy.mockRestore();
    });

    it('returns context value when used inside provider', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <TimeRangeProvider>{children}</TimeRangeProvider>
        </MemoryRouter>
      );

      const { result } = renderHook(() => useTimeRange(), { wrapper });

      expect(result.current.range).toBe(DEFAULT_TIME_RANGE);
      expect(typeof result.current.setRange).toBe('function');
      expect(typeof result.current.setDate).toBe('function');
    });
  });

  describe('valid time ranges', () => {
    const validRanges: TimeRange[] = ['day', 'week', 'month', 'season', 'year', 'all'];

    validRanges.forEach((rangeValue) => {
      it(`accepts valid range: ${rangeValue}`, () => {
        renderWithRouter(
          <TimeRangeProvider>
            <TestConsumer />
          </TimeRangeProvider>,
          { initialEntries: [`/?range=${rangeValue}`] }
        );

        expect(screen.getByTestId('range').textContent).toBe(rangeValue);
      });
    });
  });
});
