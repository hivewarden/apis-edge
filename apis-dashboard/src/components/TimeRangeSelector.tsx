/**
 * TimeRangeSelector Component
 *
 * Segmented control for selecting time range on the dashboard.
 * Shows DatePicker when "Day" is selected for specific date selection.
 *
 * Part of Epic 3, Story 3.4: Time Range Selector
 */
import { Segmented, DatePicker, Space } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
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
 * TimeRangeSelector
 *
 * Renders a segmented control for time range selection.
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

  return (
    <Space size="middle" align="center" wrap>
      <CalendarOutlined style={{ fontSize: 18, color: colors.seaBuckthorn }} />
      <Segmented
        options={TIME_RANGE_OPTIONS}
        value={range}
        onChange={handleRangeChange}
        size="large"
        style={{
          backgroundColor: colors.coconutCream,
        }}
      />
      {range === 'day' && (
        <DatePicker
          value={date ? dayjs(date) : dayjs()}
          onChange={handleDateChange}
          allowClear={false}
          disabledDate={(current) => current && current > dayjs().endOf('day')}
          size="large"
          aria-label="Select date"
          style={{ width: 160 }}
        />
      )}
    </Space>
  );
}

export default TimeRangeSelector;
