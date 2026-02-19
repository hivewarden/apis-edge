/**
 * TimeRangeSelector Component
 *
 * Segmented control for selecting time range on the dashboard.
 * Includes date navigation arrows and date range display per DESIGN-KEY.
 * Shows DatePicker when "Day" is selected for specific date selection.
 *
 * Part of Epic 3, Story 3.4: Time Range Selector
 */
import { Segmented, DatePicker, Button, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTimeRange, TimeRange } from '../context';
import { colors } from '../theme/apisTheme';

/**
 * Time range options for the segmented control.
 */
const TIME_RANGE_OPTIONS = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Season', value: 'season' },
  { label: 'Year', value: 'year' },
  { label: 'All Time', value: 'all' },
];

/**
 * Calculate the date range based on the selected range and date.
 */
function getDateRangeText(range: TimeRange, date: Date | null): string {
  const now = date ? dayjs(date) : dayjs();

  switch (range) {
    case 'day':
      return now.format('MMM D, YYYY');
    case 'week': {
      const start = now.startOf('week');
      const end = now.endOf('week');
      if (start.month() === end.month()) {
        return `${start.format('MMM D')} - ${end.format('D, YYYY')}`;
      }
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }
    case 'month':
      return now.format('MMMM YYYY');
    case 'season': {
      // Beekeeping season: roughly April-October
      const year = now.year();
      return `Season ${year}`;
    }
    case 'year':
      return now.format('YYYY');
    case 'all':
      return 'All Time';
    default:
      return '';
  }
}

/**
 * Navigate to previous/next period based on range.
 */
function navigateDate(
  range: TimeRange,
  currentDate: Date | null,
  direction: 'prev' | 'next'
): Date {
  const now = currentDate ? dayjs(currentDate) : dayjs();
  const delta = direction === 'prev' ? -1 : 1;

  switch (range) {
    case 'day':
      return now.add(delta, 'day').toDate();
    case 'week':
      return now.add(delta, 'week').toDate();
    case 'month':
      return now.add(delta, 'month').toDate();
    case 'season':
    case 'year':
      return now.add(delta, 'year').toDate();
    case 'all':
    default:
      return now.toDate();
  }
}

/**
 * TimeRangeSelector
 *
 * Renders a segmented control for time range selection with date navigation.
 * Includes chevron arrows for navigating between periods and date range display.
 * When "Day" is selected, shows a DatePicker for specific date.
 *
 * Uses TimeRangeContext for state management and URL sync.
 */
export function TimeRangeSelector() {
  const { range, date, setRange, setDate } = useTimeRange();

  const handleRangeChange = (value: string | number) => {
    setRange(value as TimeRange);
  };

  const handleDateChange = (value: dayjs.Dayjs | null) => {
    setDate(value ? value.toDate() : null);
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    const newDate = navigateDate(range, date, direction);
    // Don't allow navigating into the future
    if (dayjs(newDate).isAfter(dayjs(), 'day') && direction === 'next') {
      return;
    }
    setDate(newDate);
  };

  const isNextDisabled = range === 'all' || (
    date && dayjs(date).isSame(dayjs(), 'day')
  ) || (
    range !== 'day' && dayjs(date || new Date()).endOf(range === 'week' ? 'week' : range === 'month' ? 'month' : 'year').isAfter(dayjs())
  );

  const dateRangeText = getDateRangeText(range, date);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {/* Segmented control with rounded-full container */}
      <Segmented
        options={TIME_RANGE_OPTIONS}
        value={range}
        onChange={handleRangeChange}
        size="middle"
        style={{
          backgroundColor: colors.coconutCream,
          borderRadius: 9999, // rounded-full
          padding: 3,
        }}
      />

      {/* Date navigation and range display (hidden for 'all' but space preserved) */}
      <Space
        size="small"
        align="center"
        style={{
          visibility: range === 'all' ? 'hidden' : 'visible',
          width: range === 'all' ? 0 : 'auto',
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}
      >
        <Button
          type="text"
          icon={<LeftOutlined />}
          onClick={() => handleNavigate('prev')}
          aria-label="Previous period"
          style={{
            color: colors.brownBramble,
            borderRadius: 9999,
            minWidth: 32,
            height: 32,
          }}
        />
        <span
          style={{
            color: colors.brownBramble,
            fontWeight: 500,
            fontSize: 13,
            minWidth: 130,
            textAlign: 'center',
            display: 'inline-block',
          }}
        >
          {dateRangeText}
        </span>
        <Button
          type="text"
          icon={<RightOutlined />}
          onClick={() => handleNavigate('next')}
          disabled={!!isNextDisabled}
          aria-label="Next period"
          style={{
            color: isNextDisabled ? colors.textMuted : colors.brownBramble,
            borderRadius: 9999,
            minWidth: 32,
            height: 32,
          }}
        />
      </Space>

      {/* DatePicker for precise day selection - always in DOM, visibility toggled */}
      <DatePicker
        value={date ? dayjs(date) : dayjs()}
        onChange={handleDateChange}
        allowClear={false}
        disabledDate={(current) => current && current > dayjs().endOf('day')}
        size="middle"
        aria-label="Select date"
        style={{
          width: range === 'day' ? 160 : 0,
          opacity: range === 'day' ? 1 : 0,
          overflow: 'hidden',
          padding: range === 'day' ? undefined : 0,
          border: range === 'day' ? undefined : 'none',
          transition: 'width 0.2s ease, opacity 0.2s ease',
        }}
      />
    </div>
  );
}

export default TimeRangeSelector;
