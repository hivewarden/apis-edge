import { useState, useEffect, useCallback, useContext } from 'react';
import { Card, Typography, Skeleton, Empty } from 'antd';
import { Area } from '@ant-design/charts';
import { apiClient } from '../providers/apiClient';
import TimeRangeContext from '../providers/TimeRangeContext';

const { Title, Text } = Typography;

interface TrendPoint {
  date: string;
  count: number;
}

interface TrendResponse {
  data: TrendPoint[];
}

interface TrendChartProps {
  siteId: string | null;
  refreshTrigger?: number;
}

const POLL_INTERVAL_MS = 60000; // 1 minute

/**
 * TrendChart Component
 *
 * Line/area chart showing daily detection trends over time.
 * Helps identify if hornet pressure is increasing or decreasing.
 *
 * Part of Epic 3, Story 3.7: Daily/Weekly Trend Line Chart
 */
export function TrendChart({ siteId, refreshTrigger }: TrendChartProps) {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Get time range from context
  const timeRangeContext = useContext(TimeRangeContext);
  const range = timeRangeContext?.range ?? 'month';
  const date = timeRangeContext?.date;

  const fetchData = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    try {
      let url = `/detections/trend?site_id=${siteId}&range=${range}`;
      if (date) {
        url += `&date=${date}`;
      }
      const response = await apiClient.get<TrendResponse>(url);
      setData(response.data.data || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [siteId, range, date]);

  useEffect(() => {
    setLoading(true);
    fetchData();

    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData, refreshTrigger]);

  // Format date for display based on range
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    switch (range) {
      case 'week':
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      case 'month':
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      case 'season':
      case 'year':
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      default:
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // No site selected
  if (!siteId) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #90ee9020 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Detection Trend
        </Title>
        <Empty description="Select a site to view detection trends" />
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #90ee9020 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Detection Trend
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
          background: 'linear-gradient(135deg, #90ee9020 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Detection Trend
        </Title>
        <Empty description="Unable to load trend data" />
      </Card>
    );
  }

  // No data
  if (data.length === 0) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #90ee9020 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Detection Trend
        </Title>
        <Empty description="No detection data for this period" />
      </Card>
    );
  }

  // Calculate trend insight
  const totalDetections = data.reduce((sum, d) => sum + d.count, 0);
  const avgDetections = totalDetections / data.length;

  // Simple trend calculation: compare first half to second half
  const midpoint = Math.floor(data.length / 2);
  const firstHalfAvg =
    data.slice(0, midpoint).reduce((sum, d) => sum + d.count, 0) / Math.max(1, midpoint);
  const secondHalfAvg =
    data.slice(midpoint).reduce((sum, d) => sum + d.count, 0) / Math.max(1, data.length - midpoint);

  let trendText = 'Stable activity';
  let trendEmoji = '➡️';
  if (secondHalfAvg > firstHalfAvg * 1.2) {
    trendText = 'Activity increasing';
    trendEmoji = '📈';
  } else if (secondHalfAvg < firstHalfAvg * 0.8) {
    trendText = 'Activity decreasing';
    trendEmoji = '📉';
  }

  const rangeLabel = timeRangeContext?.rangeLabel ?? 'period';

  // Format data for chart
  const chartData = data.map((d) => ({
    ...d,
    displayDate: formatDate(d.date),
  }));

  // Area chart configuration
  const config = {
    data: chartData,
    xField: 'displayDate',
    yField: 'count',
    smooth: true,
    areaStyle: {
      fill: 'l(270) 0:rgba(247, 164, 45, 0.1) 1:rgba(247, 164, 45, 0.6)',
    },
    line: {
      style: {
        stroke: '#f7a42d',
        lineWidth: 2,
      },
    },
    point: {
      size: 4,
      shape: 'circle',
      style: {
        fill: '#fff',
        stroke: '#f7a42d',
        lineWidth: 2,
      },
    },
    xAxis: {
      label: {
        style: {
          fill: '#662604',
          fontSize: 11,
        },
        autoRotate: true,
        autoHide: true,
      },
      tickLine: null,
    },
    yAxis: {
      title: {
        text: 'Detections',
        style: {
          fill: '#662604',
          fontSize: 12,
        },
      },
      label: {
        style: {
          fill: '#662604',
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
      formatter: (datum: { displayDate: string; count: number; date: string }) => ({
        name: 'Detections',
        value: datum.count,
      }),
    },
    width: 400,
    height: 280,
    autoFit: true,
  };

  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #90ee9020 0%, #fbf9e7 100%)',
        borderRadius: 12,
        height: '100%',
      }}
    >
      <Title level={5} style={{ marginBottom: 8, color: '#662604' }}>
        Detection Trend
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Daily detections ({rangeLabel.toLowerCase()})
      </Text>

      <Area {...config} />

      {/* Trend insight */}
      <div
        style={{
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: 'rgba(144, 238, 144, 0.2)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#662604' }}>
          {trendEmoji} {trendText}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Avg: {avgDetections.toFixed(1)}/day
        </Text>
      </div>
    </Card>
  );
}

export default TrendChart;
