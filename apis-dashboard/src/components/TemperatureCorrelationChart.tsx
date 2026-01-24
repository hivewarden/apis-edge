import { useState, useEffect, useCallback, useContext } from 'react';
import { Card, Typography, Skeleton, Empty } from 'antd';
import { Scatter } from '@ant-design/charts';
import { apiClient } from '../providers/apiClient';
import TimeRangeContext from '../providers/TimeRangeContext';

const { Title, Text } = Typography;

interface CorrelationPoint {
  date: string;
  temperature_c: number;
  count: number;
}

interface CorrelationResponse {
  data: CorrelationPoint[];
}

interface TemperatureCorrelationChartProps {
  siteId: string | null;
  refreshTrigger?: number;
}

const POLL_INTERVAL_MS = 300000; // 5 minutes

/**
 * TemperatureCorrelationChart Component
 *
 * Scatter plot showing temperature vs detection count relationship.
 * Helps identify optimal temperature ranges for hornet activity.
 *
 * Part of Epic 3, Story 3.6: Temperature Correlation Chart
 */
export function TemperatureCorrelationChart({ siteId, refreshTrigger }: TemperatureCorrelationChartProps) {
  const [data, setData] = useState<CorrelationPoint[]>([]);
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
      let url = `/detections/temperature-correlation?site_id=${siteId}&range=${range}`;
      if (date) {
        url += `&date=${date}`;
      }
      const response = await apiClient.get<CorrelationResponse>(url);
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

  // No site selected
  if (!siteId) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #ff634720 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Temperature Correlation
        </Title>
        <Empty description="Select a site to view temperature correlation" />
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #ff634720 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Temperature Correlation
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
          background: 'linear-gradient(135deg, #ff634720 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Temperature Correlation
        </Title>
        <Empty description="Unable to load correlation data" />
      </Card>
    );
  }

  // No data
  if (data.length === 0) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #ff634720 0%, #fbf9e7 100%)',
          borderRadius: 12,
          height: '100%',
        }}
      >
        <Title level={5} style={{ marginBottom: 16, color: '#662604' }}>
          Temperature Correlation
        </Title>
        <Empty description="No temperature data available for this period" />
      </Card>
    );
  }

  // Calculate insights
  const temps = data.map((d) => d.temperature_c);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);

  // Find optimal temperature range (temperatures with most detections)
  const sortedByCount = [...data].sort((a, b) => b.count - a.count);
  const topDays = sortedByCount.slice(0, Math.min(3, sortedByCount.length));
  const optimalTempMin = Math.floor(Math.min(...topDays.map((d) => d.temperature_c)));
  const optimalTempMax = Math.ceil(Math.max(...topDays.map((d) => d.temperature_c)));

  const rangeLabel = timeRangeContext?.rangeLabel ?? 'period';

  // Scatter chart configuration
  const config = {
    data,
    xField: 'temperature_c',
    yField: 'count',
    colorField: 'count',
    size: 6,
    shape: 'circle',
    color: ['#fcd483', '#f7a42d', '#ff6347'],
    pointStyle: {
      fillOpacity: 0.8,
      stroke: '#f7a42d',
      lineWidth: 1,
    },
    xAxis: {
      title: {
        text: 'Temperature (°C)',
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
      fields: ['date', 'temperature_c', 'count'],
      formatter: (datum: CorrelationPoint) => ({
        name: datum.date,
        value: `${datum.temperature_c}°C, ${datum.count} detections`,
      }),
    },
    width: 400,
    height: 280,
    autoFit: true,
  };

  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #ff634720 0%, #fbf9e7 100%)',
        borderRadius: 12,
        height: '100%',
      }}
    >
      <Title level={5} style={{ marginBottom: 8, color: '#662604' }}>
        Temperature Correlation
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Temperature vs detections ({rangeLabel.toLowerCase()})
      </Text>

      <Scatter {...config} />

      {/* Insight text */}
      <div
        style={{
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: 'rgba(255, 99, 71, 0.1)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <Text style={{ color: '#662604' }}>
          🌡️ Hornets prefer <strong>{optimalTempMin}-{optimalTempMax}°C</strong> at this location
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Range: {Math.round(minTemp)}°C - {Math.round(maxTemp)}°C
        </Text>
      </div>
    </Card>
  );
}

export default TemperatureCorrelationChart;
