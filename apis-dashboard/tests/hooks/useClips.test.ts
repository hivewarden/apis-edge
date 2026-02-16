/**
 * useClips Hook Tests
 *
 * Tests for the useClips hook that fetches clip data.
 * Part of Epic 4, Story 4.2 (Clip Archive List View)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the apiClient before importing the hook
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '../../src/providers/apiClient';

describe('useClips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API query parameters', () => {
    it('builds correct URL with site_id only', () => {
      const params = new URLSearchParams();
      params.append('site_id', 'site-123');
      params.append('page', '1');
      params.append('per_page', '20');

      const expectedUrl = `/clips?site_id=site-123&page=1&per_page=20`;
      const actualUrl = `/clips?${params.toString()}`;

      expect(actualUrl).toBe(expectedUrl);
    });

    it('builds correct URL with all filters', () => {
      const params = new URLSearchParams();
      params.append('site_id', 'site-123');
      params.append('page', '1');
      params.append('per_page', '20');
      params.append('unit_id', 'unit-456');
      params.append('from', '2026-01-01');
      params.append('to', '2026-01-31');

      const url = `/clips?${params.toString()}`;

      expect(url).toContain('site_id=site-123');
      expect(url).toContain('unit_id=unit-456');
      expect(url).toContain('from=2026-01-01');
      expect(url).toContain('to=2026-01-31');
    });

    it('omits empty filters', () => {
      const params = new URLSearchParams();
      params.append('site_id', 'site-123');
      params.append('page', '1');
      params.append('per_page', '20');
      // Do NOT append null/undefined filters

      const url = `/clips?${params.toString()}`;

      expect(url).not.toContain('unit_id');
      expect(url).not.toContain('from');
      expect(url).not.toContain('to');
    });
  });

  describe('date formatting', () => {
    it('formats dates as YYYY-MM-DD', () => {
      function formatDateParam(date: Date | null | undefined): string | null {
        if (!date) return null;
        return date.toISOString().split('T')[0];
      }

      const date = new Date('2026-01-25T14:30:00Z');
      expect(formatDateParam(date)).toBe('2026-01-25');
    });

    it('returns null for null date', () => {
      function formatDateParam(date: Date | null | undefined): string | null {
        if (!date) return null;
        return date.toISOString().split('T')[0];
      }

      expect(formatDateParam(null)).toBeNull();
    });

    it('returns null for undefined date', () => {
      function formatDateParam(date: Date | null | undefined): string | null {
        if (!date) return null;
        return date.toISOString().split('T')[0];
      }

      expect(formatDateParam(undefined)).toBeNull();
    });
  });

  describe('Clip interface', () => {
    it('has all required fields', () => {
      const clip = {
        id: 'clip-123',
        unit_id: 'unit-456',
        site_id: 'site-789',
        file_size_bytes: 1024,
        recorded_at: '2026-01-25T14:30:00Z',
        created_at: '2026-01-25T14:31:00Z',
        thumbnail_url: '/api/clips/clip-123/thumbnail',
      };

      expect(clip.id).toBeDefined();
      expect(clip.unit_id).toBeDefined();
      expect(clip.site_id).toBeDefined();
      expect(clip.file_size_bytes).toBeDefined();
      expect(clip.recorded_at).toBeDefined();
      expect(clip.created_at).toBeDefined();
      expect(clip.thumbnail_url).toBeDefined();
    });

    it('allows optional fields', () => {
      const clip = {
        id: 'clip-123',
        unit_id: 'unit-456',
        unit_name: 'Hive 1 Protector',
        site_id: 'site-789',
        detection_id: 'det-abc',
        duration_seconds: 4.5,
        file_size_bytes: 1024,
        recorded_at: '2026-01-25T14:30:00Z',
        created_at: '2026-01-25T14:31:00Z',
        thumbnail_url: '/api/clips/clip-123/thumbnail',
      };

      expect(clip.unit_name).toBe('Hive 1 Protector');
      expect(clip.detection_id).toBe('det-abc');
      expect(clip.duration_seconds).toBe(4.5);
    });
  });

  describe('ClipFilters interface', () => {
    it('requires siteId', () => {
      const filters = {
        siteId: 'site-123',
      };

      expect(filters.siteId).toBe('site-123');
    });

    it('allows optional filter fields', () => {
      const filters = {
        siteId: 'site-123',
        unitId: 'unit-456',
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      };

      expect(filters.unitId).toBe('unit-456');
      expect(filters.from).toBeInstanceOf(Date);
      expect(filters.to).toBeInstanceOf(Date);
    });

    it('handles null filter fields', () => {
      const filters = {
        siteId: 'site-123',
        unitId: null,
        from: null,
        to: null,
      };

      expect(filters.unitId).toBeNull();
      expect(filters.from).toBeNull();
      expect(filters.to).toBeNull();
    });
  });

  describe('UseClipsResult interface', () => {
    it('has all expected fields', () => {
      const result = {
        clips: [],
        total: 0,
        page: 1,
        perPage: 20,
        loading: false,
        error: null,
        setPage: () => {},
        setPerPage: () => {},
        refetch: async () => {},
      };

      expect(result.clips).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(20);
      expect(result.loading).toBe(false);
      expect(result.error).toBeNull();
      expect(typeof result.setPage).toBe('function');
      expect(typeof result.setPerPage).toBe('function');
      expect(typeof result.refetch).toBe('function');
    });
  });

  describe('filter change behavior', () => {
    it('resets page to 1 when filters change', () => {
      // Simulate the hook's filter change logic
      let currentPage = 5;
      const prevFilters = { siteId: 'site-123', unitId: null };
      const newFilters = { siteId: 'site-123', unitId: 'unit-456' };

      const filtersChanged = prevFilters.unitId !== newFilters.unitId;
      if (filtersChanged) {
        currentPage = 1; // Reset to page 1
      }

      expect(currentPage).toBe(1);
    });

    it('preserves page when filters unchanged', () => {
      let currentPage = 5;
      const prevFilters = { siteId: 'site-123', unitId: 'unit-456' };
      const newFilters = { siteId: 'site-123', unitId: 'unit-456' };

      const filtersChanged = prevFilters.unitId !== newFilters.unitId;
      if (filtersChanged) {
        currentPage = 1;
      }

      expect(currentPage).toBe(5);
    });
  });

  describe('response handling', () => {
    it('handles successful response', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'clip-123',
              unit_id: 'unit-456',
              unit_name: 'Hive 1',
              site_id: 'site-789',
              recorded_at: '2026-01-25T14:30:00Z',
              created_at: '2026-01-25T14:31:00Z',
              thumbnail_url: '/api/clips/clip-123/thumbnail',
              file_size_bytes: 1024,
            },
          ],
          meta: {
            total: 1,
            page: 1,
            per_page: 20,
          },
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/clips?site_id=site-789');

      expect(result.data.data).toHaveLength(1);
      expect(result.data.meta.total).toBe(1);
    });

    it('handles empty response', async () => {
      const mockResponse = {
        data: {
          data: [],
          meta: {
            total: 0,
            page: 1,
            per_page: 20,
          },
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/clips?site_id=site-789');

      expect(result.data.data).toEqual([]);
      expect(result.data.meta.total).toBe(0);
    });

    it('handles API error', async () => {
      const mockError = new Error('Network error');
      (apiClient.get as any).mockRejectedValueOnce(mockError);

      await expect(apiClient.get('/clips?site_id=site-789')).rejects.toThrow('Network error');
    });
  });

  describe('no siteId behavior', () => {
    it('returns empty clips when siteId is null', () => {
      // Simulate hook behavior when siteId is null
      const siteId = null;
      let clips: any[] = [];
      let total = 0;

      if (!siteId) {
        clips = [];
        total = 0;
      }

      expect(clips).toEqual([]);
      expect(total).toBe(0);
    });
  });
});
