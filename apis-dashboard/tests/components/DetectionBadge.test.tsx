/**
 * Detection Count Badge Tests
 *
 * Tests for the TodayActivityCard component that displays detection count badges.
 * The component uses useDetectionStats hook internally and useTimeRange from context.
 *
 * Part of Epic 3, Story 3.2: Today's Detection Count Card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Mutable mock state for useDetectionStats
const detectionStatsReturn = {
  stats: null as Record<string, unknown> | null,
  loading: true,
  error: null,
  refetch: vi.fn(),
};

// Mock the useDetectionStats hook directly
vi.mock('../../src/hooks/useDetectionStats', () => ({
  useDetectionStats: () => detectionStatsReturn,
}));

// Mock the context
vi.mock('../../src/context', () => ({
  useTimeRange: () => ({
    range: 'day' as const,
    setRange: vi.fn(),
    date: null,
    setDate: vi.fn(),
  }),
}));

// Import after mocks
import { TodayActivityCard } from '../../src/components/TodayActivityCard';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      {ui}
    </ConfigProvider>
  );
};

describe('TodayActivityCard (Detection Count Badge)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectionStatsReturn.stats = null;
    detectionStatsReturn.loading = true;
    detectionStatsReturn.error = null;
  });

  it('renders detection count when data is loaded', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 5,
      laser_activations: 3,
      hourly_breakdown: [],
      avg_confidence: 0.85,
      first_detection: '2026-02-17T08:00:00Z',
      last_detection: '2026-02-17T14:30:00Z',
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('renders zero count as quiet state', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 0,
      laser_activations: 0,
      hourly_breakdown: [],
      avg_confidence: null,
      first_detection: null,
      last_detection: null,
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.getByText(/no hornets detected/i)).toBeInTheDocument();
    });
  });

  it('shows loading skeleton when stats not yet available', () => {
    detectionStatsReturn.loading = true;
    detectionStatsReturn.stats = null;

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    // Ant Design Skeleton should be present
    expect(document.querySelector('.ant-skeleton')).toBeInTheDocument();
  });

  it('renders laser activation count', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 10,
      laser_activations: 8,
      hourly_breakdown: [],
      avg_confidence: 0.92,
      first_detection: '2026-02-17T06:00:00Z',
      last_detection: '2026-02-17T18:00:00Z',
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      // 8/10 = 80% laser success
      expect(screen.getByText(/80% Laser Success/)).toBeInTheDocument();
    });
  });

  it('handles large detection counts', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 1234,
      laser_activations: 999,
      hourly_breakdown: [],
      avg_confidence: 0.75,
      first_detection: '2026-02-17T06:00:00Z',
      last_detection: '2026-02-17T18:00:00Z',
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.getByText('1234')).toBeInTheDocument();
    });
  });

  it('shows select site message when siteId is null', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = null;

    renderWithProviders(<TodayActivityCard siteId={null} />);

    await waitFor(() => {
      expect(screen.getByText(/select a site/i)).toBeInTheDocument();
    });
  });

  it('shows Active badge when detections exist', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 5,
      laser_activations: 3,
      hourly_breakdown: [],
      avg_confidence: 0.85,
      first_detection: '2026-02-17T08:00:00Z',
      last_detection: '2026-02-17T14:30:00Z',
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('does not show Active badge when zero detections', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 0,
      laser_activations: 0,
      hourly_breakdown: [],
      avg_confidence: null,
      first_detection: null,
      last_detection: null,
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });
  });

  it('shows activity label with time range', async () => {
    detectionStatsReturn.loading = false;
    detectionStatsReturn.stats = {
      total_detections: 5,
      laser_activations: 3,
      hourly_breakdown: [],
      avg_confidence: 0.85,
      first_detection: null,
      last_detection: null,
    };

    renderWithProviders(<TodayActivityCard siteId="site-1" />);

    await waitFor(() => {
      // With 'day' range, should show "Today's Activity"
      expect(screen.getByText("Today's Activity")).toBeInTheDocument();
    });
  });
});
