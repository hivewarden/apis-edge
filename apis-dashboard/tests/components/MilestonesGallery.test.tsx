/**
 * MilestonesGallery Component Tests
 *
 * Tests for the milestones gallery component including:
 * - Photo display
 * - Delete functionality
 * - Empty state
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MilestonesGallery } from '../../src/components/MilestonesGallery';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock the useMilestonePhotos hook
const mockDeletePhoto = vi.fn();
vi.mock('../../src/hooks/useMilestones', () => ({
  useMilestonePhotos: vi.fn(() => ({
    photos: [],
    total: 0,
    loading: false,
    error: null,
    refetch: vi.fn(),
    deletePhoto: mockDeletePhoto,
    deleting: false,
    uploading: false,
    uploadPhoto: vi.fn(),
  })),
  getMilestoneTypeName: (type: string) => {
    switch (type) {
      case 'first_harvest':
        return 'First Harvest';
      case 'first_hive_harvest':
        return 'First Hive Harvest';
      default:
        return type;
    }
  },
}));

// Wrapper component with providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={apisTheme}>{children}</ConfigProvider>;
}

describe('MilestonesGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('should display empty state when no photos', () => {
      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByText('No milestone photos yet')).toBeInTheDocument();
    });

    it('should display helpful description in empty state', () => {
      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(
        screen.getByText('Photos from your first harvest and other milestones will appear here')
      ).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should display loading spinner when loading', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [],
        total: 0,
        loading: true,
        error: null,
        refetch: vi.fn(),
        deletePhoto: vi.fn(),
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByText('Loading milestones...')).toBeInTheDocument();
    });
  });

  describe('Photos Display', () => {
    it('should display photos when available', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            thumbnail_path: '/clips/tenant/milestones/photo1_thumb.jpg',
            caption: 'My first honey!',
            created_at: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      // Check for caption
      expect(screen.getByText('My first honey!')).toBeInTheDocument();
    });

    it('should display milestone type badge', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            created_at: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByText('First Harvest')).toBeInTheDocument();
    });

    it('should display formatted date', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            created_at: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByText(/January 15, 2026/)).toBeInTheDocument();
    });
  });

  describe('View Button', () => {
    it('should display View button for each photo', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            created_at: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
    });
  });

  describe('Delete Button', () => {
    it('should display Delete button for each photo', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            created_at: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });
  });

  describe('Multiple Photos', () => {
    it('should display multiple photos in grid', async () => {
      const { useMilestonePhotos } = await import('../../src/hooks/useMilestones');
      (useMilestonePhotos as ReturnType<typeof vi.fn>).mockReturnValue({
        photos: [
          {
            id: 'photo-1',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/photo1.jpg',
            caption: 'First harvest photo',
            created_at: '2026-01-15T10:00:00Z',
          },
          {
            id: 'photo-2',
            milestone_type: 'first_hive_harvest',
            file_path: '/clips/tenant/milestones/photo2.jpg',
            caption: 'First hive harvest photo',
            created_at: '2026-01-20T10:00:00Z',
          },
        ],
        total: 2,
        loading: false,
        error: null,
        refetch: vi.fn(),
        deletePhoto: mockDeletePhoto,
        deleting: false,
        uploading: false,
        uploadPhoto: vi.fn(),
      });

      render(
        <TestWrapper>
          <MilestonesGallery />
        </TestWrapper>
      );

      expect(screen.getByText('First harvest photo')).toBeInTheDocument();
      expect(screen.getByText('First hive harvest photo')).toBeInTheDocument();
    });
  });
});
