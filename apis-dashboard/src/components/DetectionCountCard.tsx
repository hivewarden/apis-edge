import { useState, useEffect, useCallback, useContext } from 'react';
import { Card, Typography, Space, Skeleton, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { apiClient } from '../providers/apiClient';
import TimeRangeContext from '../providers/TimeRangeContext';

const { Text, Paragraph } = Typography;

export interface DetectionStats {
  total_detections: number;
  laser_activations: number;
  hourly_breakdown: number[];
  avg_confidence: number | null;
  first_detection: string | null;
  last_detection: string | null;
}

interface DetectionStatsResponse {
  data: DetectionStats;
}

interface DetectionCountCardProps {
  siteId: string | null;
  refreshTrigger?: number; // Increment to trigger refresh
}

const POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * DetectionCountCard Component
 *
 * Displays today's hornet detection count with friendly messaging.
 * Shows "X hornets deterred today" or "All quiet today" with reassuring styling.
 * Auto-refreshes every 30 seconds.
 *
 * Part of Epic 3, Story 3.2: Today's Detection Count Card
 */
export function DetectionCountCard({ siteId, refreshTrigger }: DetectionCountCardProps) {
  const [stats, setStats] = useState<DetectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Get time range from context (optional - falls back to 'day' if not in context)
  const timeRangeContext = useContext(TimeRangeContext);
  const range = timeRangeContext?.range ?? 'day';
  const date = timeRangeContext?.date;

  const fetchStats = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    try {
      let url = `/detections/stats?site_id=${siteId}&range=${range}`;
      if (date) {
        url += `&date=${date}`;
      }
      const response = await apiClient.get<DetectionStatsResponse>(url);
      setStats(response.data.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [siteId, range, date]);

  useEffect(() => {
    fetchStats();

    // Set up polling interval
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats, refreshTrigger]);

  const formatLastDetection = (lastDetection: string | null) => {
    if (!lastDetection) return null;

    const date = new Date(lastDetection);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return date.toLocaleDateString();
  };

  // No site selected
  if (!siteId) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd483 0%, #fbf9e7 100%)',
          borderRadius: 12,
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '16px 0' }}>
          <Text type="secondary">Select a site to view detection data</Text>
        </Space>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd483 0%, #fbf9e7 100%)',
          borderRadius: 12,
        }}
      >
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #fcd483 0%, #fbf9e7 100%)',
          borderRadius: 12,
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '16px 0' }}>
          <Text type="secondary">Unable to load detection data</Text>
        </Space>
      </Card>
    );
  }

  const count = stats?.total_detections ?? 0;
  const laserActivations = stats?.laser_activations ?? 0;
  const lastDetection = stats?.last_detection;

  // Get period label for display
  const rangeLabel = timeRangeContext?.rangeLabel ?? 'today';
  const periodText = range === 'day' ? 'today' : `this ${rangeLabel.toLowerCase()}`;
  const noPeriodText = range === 'day' ? 'today' : `for this ${rangeLabel.toLowerCase()}`;

  // Zero detections - show reassuring message
  if (count === 0) {
    return (
      <Card
        style={{
          background: 'linear-gradient(135deg, #52c41a15 0%, #fbf9e7 100%)',
          borderRadius: 12,
          border: '1px solid #52c41a40',
        }}
      >
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
          <Paragraph
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              color: '#662604',
            }}
          >
            All quiet {noPeriodText}
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 14 }}>
            No hornets detected — your hives are protected
          </Text>
        </Space>
      </Card>
    );
  }

  // Detections found - show count and stats
  return (
    <Card
      style={{
        background: 'linear-gradient(135deg, #fcd483 0%, #fbf9e7 100%)',
        borderRadius: 12,
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* Main stat */}
        <div style={{ textAlign: 'center' }}>
          <Statistic
            title={null}
            value={count}
            suffix={count === 1 ? 'hornet deterred' : 'hornets deterred'}
            valueStyle={{
              fontSize: 48,
              fontWeight: 700,
              color: '#f7a42d',
            }}
          />
          <Text style={{ fontSize: 16, color: '#662604' }}>{periodText}</Text>
        </div>

        {/* Secondary stats */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #f7a42d30',
          }}
        >
          {/* Laser activations */}
          <Space>
            <ThunderboltOutlined style={{ color: '#f7a42d' }} />
            <Text style={{ color: '#662604' }}>
              {laserActivations} of {count} deterred with laser
            </Text>
          </Space>
        </div>

        {/* Last detection time */}
        {lastDetection && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              Last detection: {formatLastDetection(lastDetection)}
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );
}

export default DetectionCountCard;
