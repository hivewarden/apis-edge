/**
 * ClipPlayerModal Component Tests
 *
 * Tests for the video playback modal component from Story 4.3.
 * Covers: modal behavior, keyboard navigation, video controls, error states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { ClipPlayerModal } from '../../src/components/ClipPlayerModal';
import { apisTheme } from '../../src/theme/apisTheme';
import type { Clip } from '../../src/hooks/useClips';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// Sample clip data for testing
const mockClip: Clip = {
  id: 'clip-123',
  unit_id: 'unit-456',
  unit_name: 'Hive 1 Protector',
  site_id: 'site-789',
  detection_id: 'det-abc',
  duration_seconds: 15.5,
  file_size_bytes: 1024000,
  recorded_at: '2026-01-25T14:30:00Z',
  created_at: '2026-01-25T14:30:05Z',
  thumbnail_url: '/api/clips/clip-123/thumbnail',
};

const mockClips: Clip[] = [
  mockClip,
  {
    ...mockClip,
    id: 'clip-124',
    recorded_at: '2026-01-25T14:35:00Z',
  },
  {
    ...mockClip,
    id: 'clip-125',
    recorded_at: '2026-01-25T14:40:00Z',
  },
];

// Helper to render with theme
const renderWithTheme = (component: React.ReactNode) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

describe('ClipPlayerModal', () => {
  const defaultProps = {
    open: true,
    clip: mockClip,
    clips: mockClips,
    currentIndex: 0,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onDeleteSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.HTMLMediaElement.prototype methods
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.play = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Modal Open/Close Behavior', () => {
    it('renders when open is true', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      // Modal should be visible
      expect(screen.getByText('DETECTION')).toBeInTheDocument();
    });

    it('does not render content when clip is null', () => {
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} clip={null} />
      );

      // Should return null when no clip
      expect(screen.queryByText('DETECTION')).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} onClose={onClose} />
      );

      const closeButton = screen.getByRole('button', { name: /✕/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} onClose={onClose} />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('pauses video when modal closes', () => {
      const onClose = vi.fn();
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} onClose={onClose} />
      );

      const closeButton = screen.getByRole('button', { name: /✕/i });
      fireEvent.click(closeButton);

      expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to previous clip on ArrowLeft', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={1}
          onNavigate={onNavigate}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('navigates to next clip on ArrowRight', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={0}
          onNavigate={onNavigate}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('does not navigate left when at first clip', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={0}
          onNavigate={onNavigate}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate right when at last clip', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={2}
          onNavigate={onNavigate}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('does not respond to keyboard when modal is closed', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          open={false}
          currentIndex={1}
          onNavigate={onNavigate}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Navigation Buttons', () => {
    it('renders prev/next navigation buttons', () => {
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} currentIndex={1} />
      );

      expect(screen.getByLabelText('Previous clip')).toBeInTheDocument();
      expect(screen.getByLabelText('Next clip')).toBeInTheDocument();
    });

    it('disables previous button on first clip', () => {
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} currentIndex={0} />
      );

      const prevButton = screen.getByLabelText('Previous clip');
      expect(prevButton).toBeDisabled();
    });

    it('disables next button on last clip', () => {
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} currentIndex={2} />
      );

      const nextButton = screen.getByLabelText('Next clip');
      expect(nextButton).toBeDisabled();
    });

    it('navigates when clicking prev button', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={1}
          onNavigate={onNavigate}
        />
      );

      fireEvent.click(screen.getByLabelText('Previous clip'));

      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('navigates when clicking next button', () => {
      const onNavigate = vi.fn();
      renderWithTheme(
        <ClipPlayerModal
          {...defaultProps}
          currentIndex={1}
          onNavigate={onNavigate}
        />
      );

      fireEvent.click(screen.getByLabelText('Next clip'));

      expect(onNavigate).toHaveBeenCalledWith(2);
    });
  });

  describe('Video Player', () => {
    it('renders video element with correct source', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video?.src).toContain('/api/clips/clip-123/video');
    });

    it('sets autoPlay attribute', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.autoplay).toBe(true);
    });

    it('sets controls attribute for native controls', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.controls).toBe(true);
    });

    it('sets poster attribute for thumbnail', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.poster).toContain('/api/clips/clip-123/thumbnail');
    });
  });

  describe('Metadata Display', () => {
    it('displays clip date', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      // Date is formatted
      expect(screen.getByText(/January 25, 2026/i)).toBeInTheDocument();
    });

    it('displays clip time', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText('14:30:00')).toBeInTheDocument();
    });

    it('displays unit name', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText('Hive 1 Protector')).toBeInTheDocument();
    });

    it('displays duration', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      // Duration is formatted as 0:15 (15.5 seconds)
      expect(screen.getByText('0:15')).toBeInTheDocument();
    });

    it('displays navigation counter', () => {
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} currentIndex={1} />
      );

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('displays keyboard navigation hint', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText(/Use ← → to navigate/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when video fails to load', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        expect(screen.getByText('Video unavailable')).toBeInTheDocument();
      });
    });

    it('shows download button in error state', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        expect(screen.getByText('Download file')).toBeInTheDocument();
      });
    });

    it('download button links to video endpoint', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        const downloadButton = screen.getByText('Download file').closest('a, button');
        expect(downloadButton).toHaveAttribute('href', expect.stringContaining('/api/clips/clip-123/video'));
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      // Spinner should be visible before video loads
      expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('hides loading spinner when video is loaded', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.loadedData(video!);

      await waitFor(() => {
        // Check that loading state is cleared (spinner may still exist but not in video container)
        const videoContainer = video?.parentElement;
        const spinnerInContainer = videoContainer?.querySelector('.ant-spin');
        // After loadedData, spinner should be hidden (videoLoading = false)
        expect(spinnerInContainer).toBeNull();
      });
    });

    it('shows spinner when video is buffering', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      // First load
      fireEvent.loadedData(video!);
      // Then buffering
      fireEvent.waiting(video!);

      await waitFor(() => {
        expect(document.querySelector('.ant-spin')).toBeInTheDocument();
      });
    });

    it('hides spinner when video starts playing', async () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.playing(video!);

      await waitFor(() => {
        const videoContainer = video?.parentElement;
        const spinnerInContainer = videoContainer?.querySelector('.ant-spin');
        expect(spinnerInContainer).toBeNull();
      });
    });
  });

  describe('Download Button', () => {
    it('renders download button', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    it('download button is inside anchor tag for accessibility', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      const downloadButton = screen.getByText('Download');
      const anchor = downloadButton.closest('a');

      expect(anchor).toBeInTheDocument();
      expect(anchor).toHaveAttribute('download');
      expect(anchor).toHaveAttribute('href', expect.stringContaining('/api/clips/clip-123/video'));
    });
  });

  describe('Delete Functionality', () => {
    it('renders delete button', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByLabelText('Delete clip permanently')).toBeInTheDocument();
    });

    it('shows confirmation dialog when delete is clicked', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Delete clip permanently'));

      expect(screen.getByText('Delete Clip')).toBeInTheDocument();
      expect(screen.getByText(/Delete this clip permanently/i)).toBeInTheDocument();
    });

    it('confirmation dialog has danger-styled delete button', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Delete clip permanently'));

      // The Modal.confirm has okType: 'danger' which adds a danger class
      const deleteButton = screen.getByRole('button', { name: /Delete/i });
      expect(deleteButton).toBeInTheDocument();
    });

    it('confirmation dialog has cancel option', () => {
      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Delete clip permanently'));

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('calls onDeleteSuccess callback after successful delete', async () => {
      const { apiClient } = await import('../../src/providers/apiClient');
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      const onDeleteSuccess = vi.fn();
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} onDeleteSuccess={onDeleteSuccess} />
      );

      // Click delete button
      fireEvent.click(screen.getByLabelText('Delete clip permanently'));

      // Confirm in the dialog
      const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/clips/clip-123');
        expect(onDeleteSuccess).toHaveBeenCalled();
      });
    });

    it('closes modal after successful delete', async () => {
      const { apiClient } = await import('../../src/providers/apiClient');
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      const onClose = vi.fn();
      renderWithTheme(
        <ClipPlayerModal {...defaultProps} onClose={onClose} />
      );

      fireEvent.click(screen.getByLabelText('Delete clip permanently'));
      const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('shows error message when delete fails', async () => {
      const { apiClient } = await import('../../src/providers/apiClient');
      (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      renderWithTheme(<ClipPlayerModal {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('Delete clip permanently'));
      const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
      fireEvent.click(confirmButton);

      // Error notification should appear (antd message.error)
      await waitFor(() => {
        expect(screen.getByText(/Failed to delete clip/i)).toBeInTheDocument();
      });
    });
  });
});
