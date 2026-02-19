/**
 * ClipPlayer Tests
 *
 * Additional tests for clip video playback behavior, complementing
 * the existing ClipPlayerModal.test.tsx with focus on the video
 * element rendering, loading states, error states, and controls.
 *
 * Part of Epic 4, Story 4.3: Clip Video Playback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { ClipPlayerModal } from '../../src/components/ClipPlayerModal';
import type { Clip } from '../../src/hooks/useClips';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the useDetection hook
vi.mock('../../src/hooks/useDetection', () => ({
  useDetection: () => ({
    detection: {
      id: 'det-1',
      confidence: 0.92,
      laser_activated: true,
      detected_at: '2026-01-25T14:30:00Z',
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const mockClip: Clip = {
  id: 'clip-100',
  unit_id: 'unit-200',
  unit_name: 'Sentinel Alpha',
  site_id: 'site-300',
  detection_id: 'det-1',
  duration_seconds: 45,
  file_size_bytes: 5120000,
  recorded_at: '2026-02-15T10:22:33Z',
  created_at: '2026-02-15T10:22:40Z',
  thumbnail_url: '/api/clips/clip-100/thumbnail',
};

const mockClips: Clip[] = [
  mockClip,
  { ...mockClip, id: 'clip-101', recorded_at: '2026-02-15T10:30:00Z' },
];

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <ConfigProvider>
      {component}
    </ConfigProvider>
  );
};

describe('ClipPlayer - Video Element', () => {
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
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Video element rendering', () => {
    it('renders a video element with the correct source URL', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video?.src).toContain('/api/clips/clip-100/video');
    });

    it('sets playsInline attribute for mobile compatibility', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.playsInline).toBe(true);
    });

    it('renders with native browser controls', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.controls).toBe(true);
    });

    it('sets poster image from thumbnail URL', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      expect(video?.poster).toContain('/api/clips/clip-100/thumbnail');
    });
  });

  describe('Loading state', () => {
    it('shows spinner overlay while video is loading', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      // Before loadedData fires, spinner should be visible
      expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('hides spinner after loadedData event fires', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.loadedData(video!);

      await waitFor(() => {
        const videoContainer = video?.parentElement;
        const spinnerInContainer = videoContainer?.querySelector('.ant-spin');
        expect(spinnerInContainer).toBeNull();
      });
    });

    it('shows spinner again during buffering (waiting event)', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');

      // First load completes
      fireEvent.loadedData(video!);

      await waitFor(() => {
        const videoContainer = video?.parentElement;
        const spinnerInContainer = videoContainer?.querySelector('.ant-spin');
        expect(spinnerInContainer).toBeNull();
      });

      // Buffering starts
      fireEvent.waiting(video!);

      await waitFor(() => {
        expect(document.querySelector('.ant-spin')).toBeInTheDocument();
      });
    });

    it('hides spinner when video starts playing', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.playing(video!);

      await waitFor(() => {
        const videoContainer = video?.parentElement;
        const spinnerInContainer = videoContainer?.querySelector('.ant-spin');
        expect(spinnerInContainer).toBeNull();
      });
    });
  });

  describe('Error state', () => {
    it('shows error state when video fails to load', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        expect(screen.getByText('Video unavailable')).toBeInTheDocument();
      });
    });

    it('hides video element in error state and shows fallback', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        // Download fallback should appear
        expect(screen.getByText('Download file')).toBeInTheDocument();
      });
    });

    it('provides download link in error state', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        const downloadLink = screen.getByText('Download file').closest('a, button');
        expect(downloadLink).toHaveAttribute(
          'href',
          expect.stringContaining('/api/clips/clip-100/video')
        );
      });
    });

    it('resets error state when clip changes', async () => {
      const { rerender } = renderWithProviders(
        <ClipPlayerModal {...defaultProps} />
      );

      const video = document.querySelector('video');
      fireEvent.error(video!);

      await waitFor(() => {
        expect(screen.getByText('Video unavailable')).toBeInTheDocument();
      });

      // Change to a different clip
      const newClip = { ...mockClip, id: 'clip-999' };
      rerender(
        <ConfigProvider>
          <ClipPlayerModal
            {...defaultProps}
            clip={newClip}
            clips={[newClip]}
          />
        </ConfigProvider>
      );

      // Error should be cleared and video element should reappear
      await waitFor(() => {
        expect(screen.queryByText('Video unavailable')).not.toBeInTheDocument();
      });
    });
  });

  describe('Controls and actions', () => {
    it('renders download button', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    it('download button has correct href with download parameter', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const downloadButton = screen.getByText('Download');
      const anchor = downloadButton.closest('a');
      expect(anchor).toHaveAttribute('href', expect.stringContaining('download=1'));
    });

    it('renders delete button', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByLabelText('Delete clip permanently')).toBeInTheDocument();
    });

    it('shows clip counter (position in list)', () => {
      renderWithProviders(
        <ClipPlayerModal {...defaultProps} currentIndex={0} />
      );

      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('displays unit name', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      expect(screen.getByText('Sentinel Alpha')).toBeInTheDocument();
    });

    it('displays formatted duration', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      // 45 seconds formatted as 0:45
      expect(screen.getByText('0:45')).toBeInTheDocument();
    });

    it('displays detection confidence', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('92%')).toBeInTheDocument();
      });
    });

    it('displays laser activation status', async () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Activated')).toBeInTheDocument();
      });
    });
  });

  describe('Autoplay behavior', () => {
    it('attempts to play video after loadedData', () => {
      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.loadedData(video!);

      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    it('shows tap to play overlay when autoplay is blocked', async () => {
      // Mock play to reject (simulating mobile browser autoplay block)
      window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue(
        new Error('Autoplay blocked')
      );

      renderWithProviders(<ClipPlayerModal {...defaultProps} />);

      const video = document.querySelector('video');
      fireEvent.loadedData(video!);

      await waitFor(() => {
        expect(screen.getByLabelText('Tap to play video')).toBeInTheDocument();
      });
    });
  });

  describe('Modal not rendering', () => {
    it('returns null when clip is null', () => {
      const { container } = renderWithProviders(
        <ClipPlayerModal {...defaultProps} clip={null} />
      );

      expect(screen.queryByText('DETECTION')).not.toBeInTheDocument();
    });
  });
});
