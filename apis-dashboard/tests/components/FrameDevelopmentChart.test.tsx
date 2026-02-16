/**
 * Tests for FrameDevelopmentChart component
 *
 * Part of Epic 5, Story 5.6: Frame Development Graphs
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FrameDevelopmentChart } from '../../src/components/FrameDevelopmentChart';

// Mock the useFrameHistory hook
const mockUseFrameHistory = vi.fn();
vi.mock('../../src/hooks', () => ({
  useFrameHistory: () => mockUseFrameHistory(),
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    coconutCream: '#fefbe8',
    seaBuckthorn: '#f5a524',
    salomie: '#fedc8c',
    brownBramble: '#5c3c10',
    goldTips: '#d4a012',
    goldenGrass: '#daa520',
  },
}));

// Mock @ant-design/charts Area component
vi.mock('@ant-design/charts', () => ({
  Area: ({ height }: { height: number }) => (
    <div data-testid="area-chart" data-height={height}>
      Mocked Area Chart
    </div>
  ),
}));

describe('FrameDevelopmentChart', () => {
  describe('loading state', () => {
    it('renders loading spinner when loading', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: true,
        error: null,
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText(/Loading frame history/i)).toBeInTheDocument();
    });

    it('shows spinner element', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: true,
        error: null,
        hasEnoughData: false,
      });

      const { container } = render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(container.querySelector('.ant-spin')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error message when error occurs', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: 'Failed to load frame history',
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText('Failed to load frame history')).toBeInTheDocument();
    });

    it('shows alert with error type', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: 'Network error',
        hasEnoughData: false,
      });

      const { container } = render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(container.querySelector('.ant-alert-error')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders empty state when hasEnoughData is false', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText(/Record more inspections to see frame trends/i)).toBeInTheDocument();
    });

    it('shows guidance about minimum inspections', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText(/At least 3 inspections/i)).toBeInTheDocument();
    });

    it('shows preview placeholder', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText(/Chart preview will appear here/i)).toBeInTheDocument();
    });

    it('shows Frame Development title in empty state', () => {
      mockUseFrameHistory.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        hasEnoughData: false,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText('Frame Development')).toBeInTheDocument();
    });
  });

  describe('chart rendering', () => {
    const mockData = [
      { date: '2024-06-01T10:00:00Z', type: 'Brood', value: 5 },
      { date: '2024-06-01T10:00:00Z', type: 'Honey', value: 3 },
      { date: '2024-06-01T10:00:00Z', type: 'Pollen', value: 1 },
      { date: '2024-06-08T10:00:00Z', type: 'Brood', value: 6 },
      { date: '2024-06-08T10:00:00Z', type: 'Honey', value: 4 },
      { date: '2024-06-08T10:00:00Z', type: 'Pollen', value: 2 },
      { date: '2024-06-15T10:00:00Z', type: 'Brood', value: 7 },
      { date: '2024-06-15T10:00:00Z', type: 'Honey', value: 5 },
      { date: '2024-06-15T10:00:00Z', type: 'Pollen', value: 3 },
    ];

    it('renders chart when data is available', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('renders with correct height', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      const chart = screen.getByTestId('area-chart');
      expect(chart).toHaveAttribute('data-height', '300');
    });

    it('shows Frame Development title with chart', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText('Frame Development')).toBeInTheDocument();
    });

    it('displays legend items for all frame types', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      render(<FrameDevelopmentChart hiveId="hive-123" />);

      expect(screen.getByText('Brood')).toBeInTheDocument();
      expect(screen.getByText('Honey')).toBeInTheDocument();
      expect(screen.getByText('Pollen')).toBeInTheDocument();
    });
  });

  describe('chart colors', () => {
    const mockData = [
      { date: '2024-06-01T10:00:00Z', type: 'Brood', value: 5 },
      { date: '2024-06-01T10:00:00Z', type: 'Honey', value: 3 },
      { date: '2024-06-01T10:00:00Z', type: 'Pollen', value: 1 },
    ];

    it('renders color indicators for Brood (saddle brown #8B4513)', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      const { container } = render(<FrameDevelopmentChart hiveId="hive-123" />);

      // Find the color indicator divs
      const colorDivs = container.querySelectorAll('div[style*="background-color"]');
      const colors = Array.from(colorDivs).map(
        div => (div as HTMLElement).style.backgroundColor
      );

      // Check for saddle brown (may be converted to rgb)
      expect(colors.some(c => c === 'rgb(139, 69, 19)' || c === '#8B4513')).toBe(true);
    });

    it('renders color indicators for Honey (sea buckthorn)', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      const { container } = render(<FrameDevelopmentChart hiveId="hive-123" />);

      const colorDivs = container.querySelectorAll('div[style*="background-color"]');
      const colors = Array.from(colorDivs).map(
        div => (div as HTMLElement).style.backgroundColor
      );

      // Check for sea buckthorn color (mocked as #f5a524)
      expect(colors.some(c => c === 'rgb(245, 165, 36)' || c === '#f5a524' || c === 'rgb(247, 164, 45)' || c === '#f7a42d')).toBe(true);
    });

    it('renders color indicators for Pollen (orange #FFA500)', () => {
      mockUseFrameHistory.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        hasEnoughData: true,
      });

      const { container } = render(<FrameDevelopmentChart hiveId="hive-123" />);

      const colorDivs = container.querySelectorAll('div[style*="background-color"]');
      const colors = Array.from(colorDivs).map(
        div => (div as HTMLElement).style.backgroundColor
      );

      // Check for orange
      expect(colors.some(c => c === 'rgb(255, 165, 0)' || c === '#FFA500')).toBe(true);
    });
  });
});
