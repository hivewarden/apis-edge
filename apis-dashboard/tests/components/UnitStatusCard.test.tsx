/**
 * UnitStatusCard Component Tests
 *
 * Tests for the UnitStatusCard component that displays unit status in card format.
 * Part of Epic 2, Story 2.4 (Unit Status Dashboard Cards)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnitStatusCard, Unit } from '../../src/components/UnitStatusCard';

// Mock Ant Design components
vi.mock('antd', () => ({
  Card: ({ children, onClick, hoverable, style, styles, ...props }: any) => (
    <div
      data-testid="unit-card"
      onClick={onClick}
      style={style}
      role="button"
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  ),
  Badge: ({ status, text, ...props }: any) => (
    <span
      data-testid="status-badge"
      data-status={status}
      {...props}
    >
      {text}
    </span>
  ),
  Typography: {
    Title: ({ children, level, style, ellipsis, ...props }: any) => (
      <h5 data-testid="unit-title" style={style} {...props}>{children}</h5>
    ),
    Text: ({ children, type, style, ...props }: any) => (
      <span data-type={type} style={style} {...props}>{children}</span>
    ),
  },
  Space: ({ children, direction, size, style, ...props }: any) => (
    <div style={style} {...props}>{children}</div>
  ),
}));

// Mock icons
vi.mock('@ant-design/icons', () => ({
  ClockCircleOutlined: () => <span data-testid="clock-icon">Clock</span>,
  EnvironmentOutlined: () => <span data-testid="location-icon">Location</span>,
  ApiOutlined: () => <span data-testid="api-icon">API</span>,
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    seaBuckthorn: '#F7A42D',
  },
}));

describe('UnitStatusCard', () => {
  const mockOnClick = vi.fn();

  const createMockUnit = (overrides: Partial<Unit> = {}): Unit => ({
    id: 'unit-123',
    serial: 'APIS-001',
    name: 'Hive 1 Protector',
    site_id: 'site-1',
    site_name: 'Backyard Apiary',
    firmware_version: '1.0.0',
    status: 'online',
    last_seen: new Date().toISOString(),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-22T10:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    mockOnClick.mockClear();
    // Mock Date.now to have consistent time comparisons
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-22T15:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('status indicator', () => {
    it('shows green status (success) for online units', () => {
      const unit = createMockUnit({ status: 'online' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('data-status', 'success');
      expect(badge).toHaveTextContent('Armed');
    });

    it('shows yellow status (warning) for error units (disarmed)', () => {
      const unit = createMockUnit({ status: 'error' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('data-status', 'warning');
      expect(badge).toHaveTextContent('Disarmed');
    });

    it('shows red status (error) for offline units', () => {
      const unit = createMockUnit({ status: 'offline' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('data-status', 'error');
      expect(badge).toHaveTextContent('Offline');
    });

    it('defaults to offline status for unknown statuses', () => {
      const unit = createMockUnit({ status: 'unknown' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('data-status', 'error');
      expect(badge).toHaveTextContent('Offline');
    });
  });

  describe('timestamp formatting', () => {
    it('shows "Just now" for recent timestamps (< 1 minute)', () => {
      const unit = createMockUnit({
        status: 'online',
        last_seen: new Date('2026-01-22T15:29:30Z').toISOString(), // 30 seconds ago
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows minutes ago for timestamps < 60 minutes', () => {
      const unit = createMockUnit({
        status: 'online',
        last_seen: new Date('2026-01-22T15:15:00Z').toISOString(), // 15 minutes ago
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('15m ago')).toBeInTheDocument();
    });

    it('shows hours ago for timestamps < 24 hours', () => {
      const unit = createMockUnit({
        status: 'online',
        last_seen: new Date('2026-01-22T12:30:00Z').toISOString(), // 3 hours ago
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('3h ago')).toBeInTheDocument();
    });

    it('shows days ago for timestamps < 7 days', () => {
      const unit = createMockUnit({
        status: 'online',
        last_seen: new Date('2026-01-20T15:30:00Z').toISOString(), // 2 days ago
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('2d ago')).toBeInTheDocument();
    });

    it('shows "Offline since HH:MM" for offline units', () => {
      const unit = createMockUnit({
        status: 'offline',
        last_seen: new Date('2026-01-22T14:00:00Z').toISOString(),
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      // Note: toLocaleTimeString format may vary by locale
      expect(screen.getByText(/Offline since/)).toBeInTheDocument();
    });

    it('shows "Never connected" when last_seen is null', () => {
      const unit = createMockUnit({
        status: 'offline',
        last_seen: null,
      });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('Never connected')).toBeInTheDocument();
    });
  });

  describe('unit information display', () => {
    it('displays unit name when available', () => {
      const unit = createMockUnit({ name: 'My Custom Unit' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByTestId('unit-title')).toHaveTextContent('My Custom Unit');
    });

    it('falls back to serial number when name is null', () => {
      const unit = createMockUnit({ name: null, serial: 'APIS-999' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByTestId('unit-title')).toHaveTextContent('APIS-999');
    });

    it('displays site name when available', () => {
      const unit = createMockUnit({ site_name: 'Rooftop Hives' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('Rooftop Hives')).toBeInTheDocument();
      expect(screen.getByTestId('location-icon')).toBeInTheDocument();
    });

    it('does not display site name when null', () => {
      const unit = createMockUnit({ site_name: null });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.queryByTestId('location-icon')).not.toBeInTheDocument();
    });

    it('displays serial number separately when name is different', () => {
      const unit = createMockUnit({ name: 'Guard Unit', serial: 'APIS-123' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByText('APIS-123')).toBeInTheDocument();
      expect(screen.getByTestId('api-icon')).toBeInTheDocument();
    });

    it('does not show serial separately when name is null (serial is title)', () => {
      const unit = createMockUnit({ name: null, serial: 'APIS-456' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      // Serial appears as title, not separately
      const serialElements = screen.getAllByText('APIS-456');
      expect(serialElements).toHaveLength(1); // Only in title
    });
  });

  describe('click interaction', () => {
    it('calls onClick with unit id when card is clicked', () => {
      const unit = createMockUnit({ id: 'unit-xyz' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const card = screen.getByTestId('unit-card');
      fireEvent.click(card);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
      expect(mockOnClick).toHaveBeenCalledWith('unit-xyz');
    });

    it('navigates correctly for different unit ids', () => {
      const unit1 = createMockUnit({ id: 'first-unit' });
      const { rerender } = render(<UnitStatusCard unit={unit1} onClick={mockOnClick} />);

      fireEvent.click(screen.getByTestId('unit-card'));
      expect(mockOnClick).toHaveBeenLastCalledWith('first-unit');

      const unit2 = createMockUnit({ id: 'second-unit' });
      rerender(<UnitStatusCard unit={unit2} onClick={mockOnClick} />);

      fireEvent.click(screen.getByTestId('unit-card'));
      expect(mockOnClick).toHaveBeenLastCalledWith('second-unit');
    });
  });

  describe('accessibility', () => {
    it('card has button role for keyboard navigation', () => {
      const unit = createMockUnit();
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toBeInTheDocument();
    });

    it('card is focusable via tabIndex', () => {
      const unit = createMockUnit();
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const card = screen.getByTestId('unit-card');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('status badge has accessible aria-label', () => {
      const unit = createMockUnit({ status: 'online' });
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('aria-label', 'Unit status: Armed');
    });

    it('displays clock icon with timestamp', () => {
      const unit = createMockUnit();
      render(<UnitStatusCard unit={unit} onClick={mockOnClick} />);

      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });
  });
});
