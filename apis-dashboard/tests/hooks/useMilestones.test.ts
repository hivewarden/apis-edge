/**
 * useMilestones Hook Tests
 *
 * Tests for the milestone photos and flags hooks.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#2, AC#3, AC#5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useMilestonePhotos,
  useMilestoneFlags,
  getMilestoneTypeName,
} from '../../src/hooks/useMilestones';
import type { MilestonePhoto, MilestoneFlags } from '../../src/hooks/useMilestones';

// Mock the apiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('useMilestonePhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Load', () => {
    it('should start with loading state', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useMilestonePhotos());

      expect(result.current.loading).toBe(true);
      expect(result.current.photos).toEqual([]);
    });

    it('should fetch photos on mount', async () => {
      const mockPhotos: MilestonePhoto[] = [
        {
          id: 'photo-1',
          milestone_type: 'first_harvest',
          file_path: '/clips/tenant/milestones/photo1.jpg',
          created_at: '2026-01-15T10:00:00Z',
        },
      ];

      mockGet.mockResolvedValue({
        data: {
          data: mockPhotos,
          meta: { total: 1 },
        },
      });

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.photos).toEqual(mockPhotos);
      expect(result.current.total).toBe(1);
      expect(mockGet).toHaveBeenCalledWith('/milestones/photos');
    });

    it('should handle empty response', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: [],
          meta: { total: 0 },
        },
      });

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.photos).toEqual([]);
      expect(result.current.total).toBe(0);
    });

    it('should handle fetch error', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe('uploadPhoto', () => {
    it('should upload photo and refetch', async () => {
      mockGet.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      mockPost.mockResolvedValue({
        data: {
          data: {
            id: 'new-photo',
            milestone_type: 'first_harvest',
            file_path: '/clips/tenant/milestones/new.jpg',
            created_at: '2026-01-15T10:00:00Z',
          },
        },
      });

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.uploadPhoto(file, 'first_harvest', 'harvest-123', 'Test caption');
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/milestones/photos',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
    });

    it('should set uploading state during upload', async () => {
      mockGet.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      let resolvePost: (value: unknown) => void;
      mockPost.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.uploadPhoto(file, 'first_harvest');
      });

      expect(result.current.uploading).toBe(true);

      await act(async () => {
        resolvePost({
          data: {
            data: { id: 'photo-1', milestone_type: 'first_harvest', file_path: '/test.jpg', created_at: '2026-01-01' },
          },
        });
      });

      await waitFor(() => {
        expect(result.current.uploading).toBe(false);
      });
    });
  });

  describe('deletePhoto', () => {
    it('should delete photo and refetch', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: [{ id: 'photo-1', milestone_type: 'first_harvest', file_path: '/test.jpg', created_at: '2026-01-01' }],
          meta: { total: 1 },
        },
      });

      mockDelete.mockResolvedValue({});

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deletePhoto('photo-1');
      });

      expect(mockDelete).toHaveBeenCalledWith('/milestones/photos/photo-1');
    });

    it('should set deleting state during delete', async () => {
      mockGet.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      let resolveDelete: () => void;
      mockDelete.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.deletePhoto('photo-1');
      });

      expect(result.current.deleting).toBe(true);

      await act(async () => {
        resolveDelete();
      });

      await waitFor(() => {
        expect(result.current.deleting).toBe(false);
      });
    });
  });

  describe('refetch', () => {
    it('should refetch photos when called', async () => {
      mockGet.mockResolvedValue({
        data: { data: [], meta: { total: 0 } },
      });

      const { result } = renderHook(() => useMilestonePhotos());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGet).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useMilestoneFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Load', () => {
    it('should fetch flags on mount', async () => {
      const mockFlags: MilestoneFlags = {
        first_harvest_seen: true,
        hive_first_harvests: ['hive-1', 'hive-2'],
      };

      mockGet.mockResolvedValue({
        data: { data: mockFlags },
      });

      const { result } = renderHook(() => useMilestoneFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flags).toEqual(mockFlags);
      expect(mockGet).toHaveBeenCalledWith('/milestones/flags');
    });

    it('should return default flags on error', async () => {
      mockGet.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useMilestoneFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flags).toEqual({
        first_harvest_seen: false,
        hive_first_harvests: [],
      });
    });
  });

  describe('markMilestoneSeen', () => {
    it('should set milestone flag', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: { first_harvest_seen: false, hive_first_harvests: [] },
        },
      });

      mockPost.mockResolvedValue({});

      const { result } = renderHook(() => useMilestoneFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.markMilestoneSeen('first_harvest_seen');
      });

      expect(mockPost).toHaveBeenCalledWith('/milestones/flags/first_harvest_seen', { value: true });
    });

    it('should update local state optimistically', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: { first_harvest_seen: false, hive_first_harvests: [] },
        },
      });

      mockPost.mockResolvedValue({});

      const { result } = renderHook(() => useMilestoneFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flags?.first_harvest_seen).toBe(false);

      await act(async () => {
        await result.current.markMilestoneSeen('first_harvest_seen');
      });

      expect(result.current.flags?.first_harvest_seen).toBe(true);
    });

    it('should set marking state during operation', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: { first_harvest_seen: false, hive_first_harvests: [] },
        },
      });

      let resolvePost: () => void;
      mockPost.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

      const { result } = renderHook(() => useMilestoneFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.markMilestoneSeen('first_harvest_seen');
      });

      expect(result.current.marking).toBe(true);

      await act(async () => {
        resolvePost();
      });

      await waitFor(() => {
        expect(result.current.marking).toBe(false);
      });
    });
  });
});

describe('getMilestoneTypeName', () => {
  it('should return "First Harvest" for first_harvest', () => {
    expect(getMilestoneTypeName('first_harvest')).toBe('First Harvest');
  });

  it('should return "First Hive Harvest" for first_hive_harvest', () => {
    expect(getMilestoneTypeName('first_hive_harvest')).toBe('First Hive Harvest');
  });

  it('should return the type itself for unknown types', () => {
    expect(getMilestoneTypeName('unknown_type')).toBe('unknown_type');
  });
});
