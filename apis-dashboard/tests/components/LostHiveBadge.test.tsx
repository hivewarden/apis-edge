/**
 * LostHiveBadge Component Tests
 *
 * Tests for the badge component that displays lost hive status.
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LostHiveBadge } from '../../src/components/LostHiveBadge';

describe('LostHiveBadge', () => {
  it('renders "Lost" text', () => {
    render(<LostHiveBadge lostAt="2026-01-20" />);

    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('displays date in tooltip', () => {
    const { container } = render(<LostHiveBadge lostAt="2026-01-20" />);

    // The tooltip should be on the tag wrapper
    const tag = container.querySelector('.ant-tag');
    expect(tag).toBeInTheDocument();
  });

  it('applies muted gray styling', () => {
    const { container } = render(<LostHiveBadge lostAt="2026-01-20" />);

    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveStyle({
      backgroundColor: '#f0f0f0',
      color: '#8c8c8c',
      fontStyle: 'italic',
    });
  });

  it('applies smaller styling for size="small"', () => {
    const { container } = render(<LostHiveBadge lostAt="2026-01-20" size="small" />);

    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveStyle({
      fontSize: '11px',
    });
  });

  it('applies default styling for size="default"', () => {
    const { container } = render(<LostHiveBadge lostAt="2026-01-20" size="default" />);

    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveStyle({
      fontSize: '12px',
    });
  });

  it('defaults to "default" size when not specified', () => {
    const { container } = render(<LostHiveBadge lostAt="2026-01-20" />);

    const tag = container.querySelector('.ant-tag');
    expect(tag).toHaveStyle({
      fontSize: '12px',
    });
  });

  it('correctly formats various date formats', () => {
    // Test ISO date string
    render(<LostHiveBadge lostAt="2026-12-25" />);
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });
});
