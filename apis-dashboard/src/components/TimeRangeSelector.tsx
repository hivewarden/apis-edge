import { Segmented, DatePicker, Space } from 'antd';
import dayjs from 'dayjs';
import { useTimeRange, TimeRange } from '../providers/TimeRangeContext';

interface TimeRangeOption {
  label: string;
  value: TimeRange;
}

const rangeOptions: TimeRangeOption[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Season', value: 'season' },
  { label: 'Year', value: 'year' },
  { label: 'All', value: 'all' },
];

/**
 * TimeRangeSelector Component
 *
 * Segmented control for selecting time range.
 * When "Day" is selected, shows a date picker for specific day selection.
 * Updates all charts on the dashboard via TimeRangeContext.
 *
 * Part of Epic 3, Story 3.4: Time Range Selector
 */
export function TimeRangeSelector() {
  const { range, date, setRange, setDate } = useTimeRange();

  const handleRangeChange = (value: string | number) => {
    setRange(value as TimeRange);
  };

  const handleDateChange = (dateObj: dayjs.Dayjs | null) => {
    if (dateObj) {
      setDate(dateObj.format('YYYY-MM-DD'));
    } else {
      setDate(null);
    }
  };

  return (
    <Space size="middle" wrap>
      <Segmented
        options={rangeOptions}
        value={range}
        onChange={handleRangeChange}
        style={{
          backgroundColor: '#fbf9e7',
        }}
      />
      {range === 'day' && (
        <DatePicker
          value={date ? dayjs(date) : null}
          onChange={handleDateChange}
          allowClear
          placeholder="Today"
          format="MMM D, YYYY"
          disabledDate={(current) => current && current > dayjs().endOf('day')}
        />
      )}
    </Space>
  );
}

export default TimeRangeSelector;
