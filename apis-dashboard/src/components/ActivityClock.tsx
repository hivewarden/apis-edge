import { useState, useEffect, useCallback, useContext } from 'react';
import { Card, Typography, Skeleton, Empty } from 'antd';
import { Radar } from '@ant-design/charts';
import { apiClient } from '../providers/apiClient';
import TimeRangeContext from '../providers/TimeRangeContext';

const { Title, Text } = Typography;

interface HourlyCount {
  hour: number;
  count: number;
}

interface HourlyResponse {
  data: HourlyCount[];
}

interface ActivityClockProps {
  siteId: string | null;
  refreshTrigger?: number;
}

const POLL_INTERVAL_MS = 60000; // 1 minute

// Generate hour labels for the radar chart
const hourLabels = [
  '00', '01', '02', '03', '04', '05',
  '06', '07', '08', '09', '10', '11',
  '12', '13', '14', '15', '16', '17',
  '18', '19', '20', '21', '22', '23',
];

/**
 * ActivityClock Component
 *
 * 24-hour polar/radar chart showing detection activity by hour.
 * Displays peak activity times as bulging spokes on the clock.
 *
 * Part of Epic 3, Story 3.5: Activity Clock Visualization
 */
export function ActivityClock({ siteId, refreshTrigger }: ActivityClockProps) {
  const [data, setData] = useState<{ hour: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [totalDetections, setTotalDetections] = useState(0);

  // Get time range from context
  const timeRangeContext = useContext(TimeRangeContext);
  const range = timeRangeContext?.range ?? 'week';
  const date = timeRangeContext?.date;

  const fetchHourlyData = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    try {
      let url = `/detections/hourly?site_id=${siteId}&range=${range}`;
      if (date) {
        url += `&date=${date}`;
      }
      const response = await apiClient.get<HourlyResponse>(url);

      // Transform data for the radar chart
      const hourlyData = response.data.data || [];
      const chartData = hourLabels.map((label, index) => {
        const hourData = hourlyData.find((h) => h.hour === index);
        return {
          hour: label + ':00',
          count: hourData?.count ?? 0,
        };
      });

      setData(chartData);
      setTotalDetections(chartData.reduce((sum, h) => sum + h.count, 0));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [siteId, range, date]);

  useEffect(() => {
    setLoading(true);
    fetchHourlyData();

    const interval = setInterval(fetchHourlyData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHourlyData, refreshTrigger]);

  // No site selected
  if (!siteId) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd48320 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Activity Clock
        </Title>
        <Empty description="Select a site to view activity patterns" />
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd48320 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Activity Clock
        </Title>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd48320 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Activity Clock
        </Title>
        <Empty description="Unable to load activity data" />
      </Card>
    );
  }

  // No activity
  if (totalDetections === 0) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd48320 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Activity Clock
        </Title>
        <Empty description="No activity recorded for this period" />
      </Card>
    );
  }

  // Calculate peak hour
  const peakHour = data.reduce(
    (max, current) => (current.count > max.count ? current : max),
    data[0]
  );

  const rangeLabel = timeRangeContext?.rangeLabel ?? 'period';

  // Radar chart configuration
  const config = {
    data,
    xField: 'hour',
    yField: 'count',
    area: {
      style: {
        fill: 'rgba(247, 164, 45, 0.4)',
      },
    },
    line: {
      style: {
        stroke: '#f7a42d',
        lineWidth: 2,
      },
    },
    point: {
      shape: 'circle',
      size: 4,
      style: {
        fill: '#f7a42d',
      },
    },
    xAxis: {
      line: null,
      tickLine: null,
      label: {
        style: {
          fill: '#662604',
          fontSize: 11,
        },
      },
    },
    yAxis: {
      line: null,
      tickLine: null,
      label: {
        style: {
          fill: '#999',
          fontSize: 10,
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#e8e8e8',
            lineDash: [4, 4],
          },
        },
      },
    },
    tooltip: {
      formatter: (datum: { hour: string; count: number }) => {
        const percentage =
          totalDetections > 0
            ? Math.round((datum.count / totalDetections) * 100)
            : 0;
        return {
          name: datum.hour,
          value: `${datum.count} detections (${percentage}%)`,
        };
      },
    },
    width: 300,
    height: 280,
    autoFit: true,
  };

  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #fcd48320 0%, #fbf9e7 100%)',
        borderRadius: 12,
        height: '100%',
      }}
    >
      <Title level={5} style={{ marginBottom: 8, color: '#662604' }}>
        Activity Clock
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {range === 'day'
          ? 'Hourly activity today'
          : `Average hourly activity (${rangeLabel.toLowerCase()})`}
      </Text>

      <Radar {...config} />

      {/* Peak hour info */}
      <div
        style={{
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: 'rgba(247, 164, 45, 0.1)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <Text style={{ color: '#662604' }}>
          Peak activity: <strong>{peakHour.hour}</strong> ({peakHour.count} detections)
        </Text>
      </div>
    </Card>
  );
}

export default ActivityClock;
