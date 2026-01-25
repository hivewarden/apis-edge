/**
 * OfflineInspectionBadge Component Tests
 *
 * Tests for the badge component that indicates an inspection
 * hasn't been synced to the server yet.
 *
 * Part of Epic 7, Story 7.3: Offline Inspection Creation
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OfflineInspectionBadge } from '../../src/components/OfflineInspectionBadge';

describe('OfflineInspectionBadge', () => {
  const mockLocalId = 'local_12345678-1234-1234-1234-123456789abc';

  it('should render "Not synced" text in full mode', () => {
    render(<OfflineInspectionBadge localId={mockLocalId} />);

    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });

  it('should not render "Not synced" text in compact mode', () => {
    render(<OfflineInspectionBadge localId={mockLocalId} compact />);

    expect(screen.queryByText('Not synced')).not.toBeInTheDocument();
  });

  it('should show "Sync failed" when there is a sync error', () => {
    render(
      <OfflineInspectionBadge
        localId={mockLocalId}
        syncError="Network timeout"
      />
    );

    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });

  it('should display tooltip with local ID on hover', async () => {
    render(<OfflineInspectionBadge localId={mockLocalId} />);

    // Hover over the badge
    const badge = screen.getByText('Not synced');
    fireEvent.mouseEnter(badge);

    // Tooltip content should appear
    await waitFor(() => {
      expect(screen.getByText(/Local ID:/)).toBeInTheDocument();
    });
  });

  it('should display sync error in tooltip when provided', async () => {
    render(
      <OfflineInspectionBadge
        localId={mockLocalId}
        syncError="Server returned 500"
      />
    );

    // Hover over the badge
    const badge = screen.getByText('Sync failed');
    fireEvent.mouseEnter(badge);

    // Error message should appear in tooltip
    await waitFor(() => {
      expect(screen.getByText(/Error: Server returned 500/)).toBeInTheDocument();
    });
  });

  it('should apply warning color for pending state', () => {
    const { container } = render(<OfflineInspectionBadge localId={mockLocalId} />);

    // Check that the tag has warning color class
    const tag = container.querySelector('.ant-tag-warning');
    expect(tag).toBeInTheDocument();
  });

  it('should apply error color for sync error state', () => {
    const { container } = render(
      <OfflineInspectionBadge
        localId={mockLocalId}
        syncError="Error"
      />
    );

    // Check that the tag has error color class
    const tag = container.querySelector('.ant-tag-error');
    expect(tag).toBeInTheDocument();
  });

  it('should render correctly with long local ID', () => {
    const longLocalId = 'local_12345678-1234-1234-1234-123456789abcdef';
    const { container } = render(<OfflineInspectionBadge localId={longLocalId} />);

    // Badge should render without error
    expect(screen.getByText('Not synced')).toBeInTheDocument();
    expect(container.querySelector('.ant-tag')).toBeInTheDocument();
  });
});
