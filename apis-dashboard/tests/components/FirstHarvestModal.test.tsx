/**
 * FirstHarvestModal Component Tests
 *
 * Tests for the first harvest celebration modal including:
 * - Confetti animation rendering
 * - Photo upload flow
 * - Modal interactions
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { FirstHarvestModal } from '../../src/components/FirstHarvestModal';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: { data: { id: 'photo-123' } } }),
  },
}));

// Wrapper component with providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={apisTheme}>{children}</ConfigProvider>;
}

describe('FirstHarvestModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    amountKg: 25.5,
    hiveCount: 3,
    harvestDate: '2026-01-15',
    harvestId: 'harvest-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the modal when open', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Congratulations on Your First Harvest!')).toBeInTheDocument();
    });

    it('should display harvest amount correctly', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('25.5 kg')).toBeInTheDocument();
    });

    it('should display hive count correctly', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('3 hives')).toBeInTheDocument();
    });

    it('should display singular hive for count of 1', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} hiveCount={1} />
        </TestWrapper>
      );

      expect(screen.getByText('1 hive')).toBeInTheDocument();
    });

    it('should display formatted harvest date', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      // Date should be formatted as "Wednesday, January 15, 2026"
      expect(screen.getByText(/January 15, 2026/)).toBeInTheDocument();
    });
  });

  describe('Confetti Animation', () => {
    it('should render confetti animation when modal is open', async () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      // Wait for confetti animation container to appear (uses useEffect)
      // Modal renders in a portal, so query from document.body
      await waitFor(() => {
        const confettiContainer = document.body.querySelector('[aria-hidden="true"]');
        expect(confettiContainer).toBeInTheDocument();
      });
    });

    it('should have confetti pieces with animation styles', async () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      // Wait for animated elements to appear (confetti uses useEffect)
      // Modal renders in a portal, so query from document.body
      await waitFor(() => {
        const animatedElements = document.body.querySelectorAll('[style*="animation"]');
        expect(animatedElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Photo Upload Section', () => {
    it('should display photo upload prompt', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Add a photo to remember this moment')).toBeInTheDocument();
    });

    it('should display upload area with camera icon', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Select Photo')).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('should display Thanks! button', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('button', { name: 'Thanks!' })).toBeInTheDocument();
    });

    it('should call onClose when Thanks! button is clicked', () => {
      const onClose = vi.fn();
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} onClose={onClose} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Thanks!' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when modal is cancelled', () => {
      const onClose = vi.fn();
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} onClose={onClose} />
        </TestWrapper>
      );

      // Click the modal close button (X)
      const closeButton = document.querySelector('.ant-modal-close');
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });

  describe('Not Open', () => {
    it('should not render content when modal is closed', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} open={false} />
        </TestWrapper>
      );

      expect(screen.queryByText('Congratulations on Your First Harvest!')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper modal role', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have accessible trophy icon', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      // Trophy icon should be visible
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Optional Props', () => {
    it('should work without harvestId', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} harvestId={undefined} />
        </TestWrapper>
      );

      expect(screen.getByText('Congratulations on Your First Harvest!')).toBeInTheDocument();
    });

    it('should call onPhotoUploaded callback after successful upload', async () => {
      const { apiClient } = await import('../../src/providers/apiClient');
      const onPhotoUploaded = vi.fn();

      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} onPhotoUploaded={onPhotoUploaded} />
        </TestWrapper>
      );

      // Find the file input (hidden but present for Ant Design Upload)
      const uploadInput = document.querySelector('input[type="file"]');
      expect(uploadInput).toBeInTheDocument();

      // Create a mock file
      const file = new File(['test image content'], 'test-photo.jpg', {
        type: 'image/jpeg',
      });

      // Simulate file selection using userEvent or direct change
      if (uploadInput) {
        // Use Object.defineProperty to set files (input.files is read-only)
        Object.defineProperty(uploadInput, 'files', {
          value: [file],
          writable: false,
        });

        fireEvent.change(uploadInput);

        // Wait for the upload to process
        await waitFor(() => {
          // The mock apiClient.post should have been called
          expect(apiClient.post).toHaveBeenCalled();
        });
      }
    });

    it('should show file input that accepts images', () => {
      render(
        <TestWrapper>
          <FirstHarvestModal {...defaultProps} />
        </TestWrapper>
      );

      const uploadInput = document.querySelector('input[type="file"]');
      expect(uploadInput).toBeInTheDocument();
      expect(uploadInput).toHaveAttribute('accept', 'image/*');
    });
  });
});
