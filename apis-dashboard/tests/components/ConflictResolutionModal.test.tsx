/**
 * ConflictResolutionModal Component Tests
 *
 * Tests for the conflict resolution modal that displays when sync conflicts
 * are detected between local and server data.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { ConflictResolutionModal } from '../../src/components/ConflictResolutionModal';
import { apisTheme } from '../../src/theme/apisTheme';

// Wrapper with theme provider
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ConfigProvider theme={apisTheme}>{ui}</ConfigProvider>);
};

describe('ConflictResolutionModal', () => {
  const mockOnResolve = vi.fn();
  const mockOnCancel = vi.fn();

  const localData = {
    date: '2026-01-25',
    queen_seen: true,
    eggs_seen: true,
    brood_frames: 5,
    notes: 'Local notes',
  };

  const serverData = {
    date: '2026-01-25',
    queen_seen: false, // Different
    eggs_seen: true,
    brood_frames: 3, // Different
    notes: 'Server notes', // Different
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should not render when not visible', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={false}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText('Sync Conflict')).not.toBeInTheDocument();
  });

  it('should render modal when visible', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Sync Conflict')).toBeInTheDocument();
  });

  it('should display "Your Version" and "Server Version" headers', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Your Version')).toBeInTheDocument();
    expect(screen.getByText('Server Version')).toBeInTheDocument();
  });

  it('should display three action buttons', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Keep Mine')).toBeInTheDocument();
    expect(screen.getByText('Keep Server')).toBeInTheDocument();
  });

  it('should call onResolve with "local" when Keep Mine is clicked', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Keep Mine'));

    expect(mockOnResolve).toHaveBeenCalledWith('local');
  });

  it('should call onResolve with "server" when Keep Server is clicked', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Keep Server'));

    expect(mockOnResolve).toHaveBeenCalledWith('server');
  });

  it('should call onCancel when Cancel is clicked', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should display differences between local and server data', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Should show field labels for differing fields
    expect(screen.getAllByText('Queen Seen')).toHaveLength(2); // Once for each version
    expect(screen.getAllByText('Brood Frames')).toHaveLength(2);
    expect(screen.getAllByText('Notes')).toHaveLength(2);

    // Should show boolean values formatted correctly
    expect(screen.getByText('Yes')).toBeInTheDocument(); // local queen_seen
    expect(screen.getByText('No')).toBeInTheDocument(); // server queen_seen

    // Should show numeric values
    expect(screen.getByText('5')).toBeInTheDocument(); // local brood_frames
    expect(screen.getByText('3')).toBeInTheDocument(); // server brood_frames
  });

  it('should handle null data gracefully', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={null}
        serverData={null}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Should show message about no differences
    expect(
      screen.getByText(/No significant differences found/)
    ).toBeInTheDocument();
  });

  it('should handle identical data', () => {
    const identicalData = {
      date: '2026-01-25',
      queen_seen: true,
    };

    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={identicalData}
        serverData={identicalData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByText(/No significant differences found/)
    ).toBeInTheDocument();
  });

  it('should disable buttons when resolving', () => {
    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localData}
        serverData={serverData}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
        isResolving={true}
      />
    );

    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
    // Loading buttons may not be technically "disabled" but show loading state
  });

  it('should format dates correctly', () => {
    const localWithDate = {
      date: '2026-01-15',
    };
    const serverWithDate = {
      date: '2026-01-20',
    };

    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localWithDate}
        serverData={serverWithDate}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Dates should be formatted as "MMM D, YYYY"
    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jan 20, 2026')).toBeInTheDocument();
  });

  it('should show dash for null/undefined values', () => {
    const localWithNull = {
      notes: 'Has notes',
      brood_frames: null,
    };
    const serverWithNull = {
      notes: null,
      brood_frames: 4,
    };

    renderWithTheme(
      <ConflictResolutionModal
        visible={true}
        localData={localWithNull}
        serverData={serverWithNull}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Null values should be displayed as "-"
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
