/**
 * ClipCard Component Tests
 *
 * Tests for the ClipCard component that displays clip thumbnails.
 * Part of Epic 4, Story 4.2 (Clip Archive List View)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipCard } from '../../src/components/ClipCard';

// Mock Ant Design components
vi.mock('antd', () => ({
  Card: ({ children, onClick, onKeyDown, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }: any) => (
    <div
      data-testid="clip-card"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      tabIndex={0}
      role="button"
      {...props}
    >
      {children}
    </div>
  ),
  Typography: {
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  Image: ({ src, alt, fallback, ...props }: any) => (
    <img src={src} alt={alt} data-testid="clip-thumbnail" {...props} />
  ),
}));

// Mock icons
vi.mock('@ant-design/icons', () => ({
  PlayCircleOutlined: () => <span data-testid="play-icon">Play</span>,
  ClockCircleOutlined: () => <span data-testid="clock-icon">Clock</span>,
  AlertOutlined: () => <span data-testid="alert-icon">Alert</span>,
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#F7A42D',
    salomie: '#FCD483',
    coconutCream: '#FFF9E7',
    brownBramble: '#662604',
  },
}));

describe('ClipCard', () => {
  const mockClip = {
    id: 'clip-123',
    unit_name: 'Hive 1 Protector',
    duration_seconds: 4.5,
    recorded_at: '2026-01-22T14:30:00Z',
    thumbnail_url: '/api/clips/clip-123/thumbnail',
  };

  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  describe('rendering', () => {
    it('renders clip thumbnail', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const thumbnail = screen.getByTestId('clip-thumbnail');
      expect(thumbnail).toBeInTheDocument();
      expect(thumbnail).toHaveAttribute('src', mockClip.thumbnail_url);
    });

    it('renders formatted date (MMM D)', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      // Date should be formatted as "Jan 22"
      expect(screen.getByText('Jan 22')).toBeInTheDocument();
    });

    it('renders formatted time (HH:mm)', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      // Time should be formatted as HH:mm (timezone may affect displayed hour)
      // The time is in format like "14:30" or "15:30" depending on local timezone
      const timeElement = screen.getByText(/^\d{2}:30$/);
      expect(timeElement).toBeInTheDocument();
    });

    it('renders unit name', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      expect(screen.getByText('Hive 1 Protector')).toBeInTheDocument();
    });

    it('renders formatted duration', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      // 4.5 seconds should be "0:04"
      expect(screen.getByText('0:04')).toBeInTheDocument();
    });

    it('renders play icon overlay', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      expect(screen.getByTestId('play-icon')).toBeInTheDocument();
    });

    it('renders detection badge', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      expect(screen.getByText('Detection')).toBeInTheDocument();
    });
  });

  describe('duration formatting', () => {
    it('formats 0 seconds as 0:00', () => {
      const clip = { ...mockClip, duration_seconds: 0 };
      render(<ClipCard clip={clip} onClick={mockOnClick} />);

      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('formats 65 seconds as 1:05', () => {
      const clip = { ...mockClip, duration_seconds: 65 };
      render(<ClipCard clip={clip} onClick={mockOnClick} />);

      expect(screen.getByText('1:05')).toBeInTheDocument();
    });

    it('formats undefined duration as 0:00', () => {
      const clip = { ...mockClip, duration_seconds: undefined };
      render(<ClipCard clip={clip} onClick={mockOnClick} />);

      expect(screen.getByText('0:00')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('calls onClick when clicked', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByTestId('clip-card');
      fireEvent.click(card);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick on Enter key press', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByTestId('clip-card');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick on Space key press', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByTestId('clip-card');
      fireEvent.keyDown(card, { key: ' ' });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick on other key press', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByTestId('clip-card');
      fireEvent.keyDown(card, { key: 'Escape' });

      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has button role', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toBeInTheDocument();
    });

    it('has descriptive aria-label with unit name', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label');
      expect(card.getAttribute('aria-label')).toContain('Hive 1 Protector');
      expect(card.getAttribute('aria-label')).toContain('Jan 22');
    });

    it('has aria-label without unit name when not provided', () => {
      const clip = { ...mockClip, unit_name: undefined };
      render(<ClipCard clip={clip} onClick={mockOnClick} />);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label');
      expect(card.getAttribute('aria-label')).toContain('Detection clip');
    });

    it('is focusable', () => {
      render(<ClipCard clip={mockClip} onClick={mockOnClick} />);

      const card = screen.getByTestId('clip-card');
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('optional fields', () => {
    it('renders without unit_name', () => {
      const clip = { ...mockClip, unit_name: undefined };
      render(<ClipCard clip={clip} onClick={mockOnClick} />);

      // Should not crash, and should not show unit name
      expect(screen.queryByText('Hive 1 Protector')).not.toBeInTheDocument();
    });
  });
});
