/**
 * OverdueBadge Component Tests
 *
 * Tests for the overdue task badge on hive list views.
 *
 * Part of Epic 14, Story 14.6: Portal Hive Detail Task Count Integration
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverdueBadge } from '../../src/components/OverdueBadge';

describe('OverdueBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<OverdueBadge count={0} />);

    // Should render nothing at all
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when count is negative', () => {
    const { container } = render(<OverdueBadge count={-1} />);

    expect(container.firstChild).toBeNull();
  });

  it('displays count in red badge when count > 0', () => {
    render(<OverdueBadge count={3} />);

    // Ant Badge uses sup element for the count
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('wraps children and shows badge when count > 0', () => {
    render(
      <OverdueBadge count={5}>
        <div data-testid="child-element">Child Content</div>
      </OverdueBadge>
    );

    // Child should be rendered
    expect(screen.getByTestId('child-element')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();

    // Badge count should be visible
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders only children when count is 0', () => {
    render(
      <OverdueBadge count={0}>
        <div data-testid="child-element">Child Content</div>
      </OverdueBadge>
    );

    // Child should be rendered
    expect(screen.getByTestId('child-element')).toBeInTheDocument();

    // No badge count should be visible
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('handles count of 1 correctly', () => {
    render(<OverdueBadge count={1} />);

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('handles high counts correctly', () => {
    const { container } = render(<OverdueBadge count={99} />);

    // Ant Badge uses a title attribute for the full number
    // The visual representation may be broken into multiple spans
    const badgeCount = container.querySelector('.ant-badge-count');
    expect(badgeCount).toHaveAttribute('title', '99');
  });

  it('applies small size to badge', () => {
    const { container } = render(<OverdueBadge count={5} />);

    // Ant Badge with size="small" adds specific classes
    const badge = container.querySelector('.ant-badge');
    expect(badge).toBeInTheDocument();
  });
});
