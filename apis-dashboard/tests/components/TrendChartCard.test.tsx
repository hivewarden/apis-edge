/**
 * TrendChartCard Component Tests
 *
 * Tests for the trend chart card component displaying detection trends.
 *
 * Part of Epic 3, Story 3.7: Daily/Weekly Trend Line Chart
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendChartCard } from '../../src/components/TrendChartCard';
import { useTrendData } from '../../src/hooks/useTrendData';
import { useTimeRange } from '../../src/context/TimeRangeContext';

// Mock the hooks
vi.mock('../../src/hooks/useTrendData', () => ({
  useTrendData: vi.fn(),
}));

vi.mock('../../src/context/TimeRangeContext', () => ({
  useTimeRange: vi.fn(),
}));

// @ant-design/charts is resolve-aliased to a mock (Area returns null).
// No vi.mock override needed — tests assert on the wrapper DOM, not chart internals.

const mockUseTrendData = vi.mocked(useTrendData);
const mockUseTimeRange = vi.mocked(useTimeRange);

describe('TrendChartCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default time range mock
    mockUseTimeRange.mockReturnValue({
      range: 'week',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });
  });

  it('renders "Select a site" when siteId is null', () => {
    mockUseTrendData.mockReturnValue({
      points: [],
      aggregation: 'daily',
      totalDetections: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId={null} />);

    expect(screen.getByText('Select a site to view trends')).toBeInTheDocument();
  });

  it('shows loading spinner when loading with no data', () => {
    mockUseTrendData.mockReturnValue({
      points: [],
      aggregation: 'daily',
      totalDetections: 0,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Loading trend data...')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', () => {
    mockUseTrendData.mockReturnValue({
      points: [],
      aggregation: 'daily',
      totalDetections: 0,
      loading: false,
      error: new Error('Network error'),
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Failed to load trend data')).toBeInTheDocument();
  });

  it('shows empty state when totalDetections is 0', () => {
    mockUseTrendData.mockReturnValue({
      points: [
        { label: 'Mon', date: '2026-01-20', count: 0 },
        { label: 'Tue', date: '2026-01-21', count: 0 },
      ],
      aggregation: 'daily',
      totalDetections: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('No activity recorded for this period')).toBeInTheDocument();
  });

  it('renders Area chart with correct data', () => {
    mockUseTrendData.mockReturnValue({
      points: [
        { label: 'Mon', date: '2026-01-20', count: 5 },
        { label: 'Tue', date: '2026-01-21', count: 3 },
        { label: 'Wed', date: '2026-01-22', count: 8 },
      ],
      aggregation: 'daily',
      totalDetections: 16,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    // Area is resolve-aliased to a noop mock (returns null), so we check the
    // wrapper div that holds the chart and the summary text below it.
    const chartContainer = screen.getByRole('img');
    expect(chartContainer).toBeInTheDocument();
    expect(screen.getByText('16 total detections')).toBeInTheDocument();
  });

  it('title changes to "Weekly Trend" for week range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'week',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Mon', count: 5 }],
      aggregation: 'daily',
      totalDetections: 5,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Weekly Trend')).toBeInTheDocument();
  });

  it('title changes to "Monthly Trend" for month range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'month',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Jan 1', count: 5 }],
      aggregation: 'daily',
      totalDetections: 5,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Monthly Trend')).toBeInTheDocument();
  });

  it('title changes to "Hourly Activity" for day range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'day',
      date: new Date('2026-01-20'),
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: '08:00', hour: 8, count: 2 }],
      aggregation: 'hourly',
      totalDetections: 2,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Hourly Activity')).toBeInTheDocument();
  });

  it('title changes to "Season Trend" for season range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'season',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: 'W32', count: 10 }],
      aggregation: 'weekly',
      totalDetections: 10,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Season Trend')).toBeInTheDocument();
  });

  it('title changes to "Yearly Trend" for year range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'year',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Jan 5', count: 20 }],
      aggregation: 'weekly',
      totalDetections: 20,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('Yearly Trend')).toBeInTheDocument();
  });

  it('title changes to "All-Time Trend" for all range', () => {
    mockUseTimeRange.mockReturnValue({
      range: 'all',
      date: null,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Jan 5', count: 100 }],
      aggregation: 'weekly',
      totalDetections: 100,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('All-Time Trend')).toBeInTheDocument();
  });

  it('has aria-label on chart container for accessibility', () => {
    mockUseTrendData.mockReturnValue({
      points: [
        { label: 'Mon', count: 5 },
        { label: 'Tue', count: 3 },
        { label: 'Wed', count: 8 },
      ],
      aggregation: 'daily',
      totalDetections: 16,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    const chartContainer = screen.getByRole('img');
    expect(chartContainer).toHaveAttribute(
      'aria-label',
      'Trend chart showing 16 total detections over 3 periods'
    );
  });

  it('shows singular "detection" when total is 1', () => {
    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Mon', count: 1 }],
      aggregation: 'daily',
      totalDetections: 1,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    expect(screen.getByText('1 total detection')).toBeInTheDocument();
  });

  it('calls useTrendData with correct parameters', () => {
    const testDate = new Date('2026-01-15');
    mockUseTimeRange.mockReturnValue({
      range: 'day',
      date: testDate,
      setRange: vi.fn(),
      setDate: vi.fn(),
    });

    mockUseTrendData.mockReturnValue({
      points: [],
      aggregation: 'hourly',
      totalDetections: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-abc" />);

    expect(mockUseTrendData).toHaveBeenCalledWith('site-abc', 'day', testDate);
  });

  it('does not show loading when loading but has previous data', () => {
    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Mon', count: 5 }],
      aggregation: 'daily',
      totalDetections: 5,
      loading: true, // Loading but has data
      error: null,
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    // Should show the chart, not the loading state
    expect(screen.queryByText('Loading trend data...')).not.toBeInTheDocument();
    // Area is resolve-aliased to noop (returns null), so check the wrapper
    const chartContainer = screen.getByRole('img');
    expect(chartContainer).toBeInTheDocument();
  });

  it('does not show error when error exists but has previous data', () => {
    mockUseTrendData.mockReturnValue({
      points: [{ label: 'Mon', count: 5 }],
      aggregation: 'daily',
      totalDetections: 5,
      loading: false,
      error: new Error('Some error'), // Error but has data
      refetch: vi.fn(),
    });

    render(<TrendChartCard siteId="site-123" />);

    // Should show the chart with previous data, not the error state
    expect(screen.queryByText('Failed to load trend data')).not.toBeInTheDocument();
    // Area is resolve-aliased to noop (returns null), so check the wrapper
    const chartContainer = screen.getByRole('img');
    expect(chartContainer).toBeInTheDocument();
  });
});
