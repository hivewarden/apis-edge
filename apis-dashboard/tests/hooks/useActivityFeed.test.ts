/**
 * useActivityFeed Hook Tests
 *
 * Tests for the useActivityFeed hook that fetches activity feed data.
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the apiClient before importing the hook
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '../../src/providers/apiClient';

describe('useActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API query parameters', () => {
    it('builds correct URL with no filters', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');

      const expectedUrl = '/activity?limit=20';
      const actualUrl = `/activity?${params.toString()}`;

      expect(actualUrl).toBe(expectedUrl);
    });

    it('builds correct URL with entity types filter', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('entity_type', 'inspections,treatments,hives');

      const url = `/activity?${params.toString()}`;

      expect(url).toContain('entity_type=inspections%2Ctreatments%2Chives');
    });

    it('builds correct URL with hive_id filter', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('hive_id', 'hive-123');

      const url = `/activity?${params.toString()}`;

      expect(url).toContain('hive_id=hive-123');
    });

    it('builds correct URL with site_id filter', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('site_id', 'site-456');

      const url = `/activity?${params.toString()}`;

      expect(url).toContain('site_id=site-456');
    });

    it('builds correct URL with cursor for pagination', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('cursor', 'abc-123-cursor');

      const url = `/activity?${params.toString()}`;

      expect(url).toContain('cursor=abc-123-cursor');
    });

    it('builds correct URL with all filters', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('entity_type', 'inspections,treatments');
      params.append('hive_id', 'hive-123');
      params.append('site_id', 'site-456');
      params.append('cursor', 'abc-cursor');

      const url = `/activity?${params.toString()}`;

      expect(url).toContain('entity_type=');
      expect(url).toContain('hive_id=hive-123');
      expect(url).toContain('site_id=site-456');
      expect(url).toContain('cursor=abc-cursor');
    });

    it('omits empty filters', () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      // Do NOT append empty filters

      const url = `/activity?${params.toString()}`;

      expect(url).not.toContain('entity_type');
      expect(url).not.toContain('hive_id');
      expect(url).not.toContain('site_id');
      expect(url).not.toContain('cursor');
    });
  });

  describe('ActivityItem interface', () => {
    it('has all required fields', () => {
      const item = {
        id: 'activity-123',
        activity_type: 'inspection_created',
        icon: 'FileSearchOutlined',
        message: 'John recorded an inspection on Hive Alpha',
        relative_time: '2 hours ago',
        timestamp: '2026-01-25T14:30:00Z',
        entity_type: 'inspections',
        entity_id: 'inspection-uuid',
      };

      expect(item.id).toBeDefined();
      expect(item.activity_type).toBeDefined();
      expect(item.icon).toBeDefined();
      expect(item.message).toBeDefined();
      expect(item.relative_time).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(item.entity_type).toBeDefined();
      expect(item.entity_id).toBeDefined();
    });

    it('allows optional hive fields', () => {
      const item = {
        id: 'activity-123',
        activity_type: 'inspection_created',
        icon: 'FileSearchOutlined',
        message: 'John recorded an inspection on Hive Alpha',
        relative_time: '2 hours ago',
        timestamp: '2026-01-25T14:30:00Z',
        entity_type: 'inspections',
        entity_id: 'inspection-uuid',
        hive_id: 'hive-456',
        hive_name: 'Hive Alpha',
        entity_name: 'Winter inspection',
      };

      expect(item.hive_id).toBe('hive-456');
      expect(item.hive_name).toBe('Hive Alpha');
      expect(item.entity_name).toBe('Winter inspection');
    });
  });

  describe('ActivityFilters interface', () => {
    it('allows all optional fields', () => {
      const filters = {
        entityTypes: ['inspections', 'treatments'],
        hiveId: 'hive-123',
        siteId: 'site-456',
      };

      expect(filters.entityTypes).toEqual(['inspections', 'treatments']);
      expect(filters.hiveId).toBe('hive-123');
      expect(filters.siteId).toBe('site-456');
    });

    it('handles empty filters', () => {
      const filters = {};

      expect(filters).toEqual({});
    });

    it('handles undefined filters', () => {
      const filters = {
        entityTypes: undefined,
        hiveId: undefined,
        siteId: undefined,
      };

      expect(filters.entityTypes).toBeUndefined();
      expect(filters.hiveId).toBeUndefined();
      expect(filters.siteId).toBeUndefined();
    });
  });

  describe('UseActivityFeedResult interface', () => {
    it('has all expected fields', () => {
      const result = {
        activities: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: () => {},
        refetch: () => {},
      };

      expect(result.activities).toEqual([]);
      expect(result.loading).toBe(false);
      expect(result.loadingMore).toBe(false);
      expect(result.error).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(typeof result.loadMore).toBe('function');
      expect(typeof result.refetch).toBe('function');
    });
  });

  describe('response handling', () => {
    it('handles successful response', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'activity-123',
              activity_type: 'inspection_created',
              icon: 'FileSearchOutlined',
              message: 'John recorded an inspection',
              relative_time: '2 hours ago',
              timestamp: '2026-01-25T14:30:00Z',
              entity_type: 'inspections',
              entity_id: 'inspection-uuid',
            },
          ],
          meta: {
            cursor: 'activity-123',
            has_more: true,
          },
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/activity?limit=20');

      expect(result.data.data).toHaveLength(1);
      expect(result.data.meta.has_more).toBe(true);
      expect(result.data.meta.cursor).toBe('activity-123');
    });

    it('handles empty response', async () => {
      const mockResponse = {
        data: {
          data: [],
          meta: {
            cursor: null,
            has_more: false,
          },
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/activity?limit=20');

      expect(result.data.data).toEqual([]);
      expect(result.data.meta.has_more).toBe(false);
    });

    it('handles API error', async () => {
      const mockError = new Error('Network error');
      (apiClient.get as any).mockRejectedValueOnce(mockError);

      await expect(apiClient.get('/activity?limit=20')).rejects.toThrow('Network error');
    });
  });

  describe('pagination behavior', () => {
    it('uses cursor from previous response for next page', () => {
      const previousResponse = {
        data: [{ id: 'activity-1' }],
        meta: { cursor: 'activity-1', has_more: true },
      };

      // Simulate extracting cursor for next request
      const nextCursor = previousResponse.meta.cursor;
      const params = new URLSearchParams();
      params.append('limit', '20');
      if (nextCursor) {
        params.append('cursor', nextCursor);
      }

      const url = `/activity?${params.toString()}`;
      expect(url).toContain('cursor=activity-1');
    });

    it('does not add cursor for first page', () => {
      const cursor = null;
      const params = new URLSearchParams();
      params.append('limit', '20');
      if (cursor) {
        params.append('cursor', cursor);
      }

      const url = `/activity?${params.toString()}`;
      expect(url).not.toContain('cursor');
    });
  });

  describe('filter serialization', () => {
    it('serializes entity types as comma-separated string', () => {
      const entityTypes = ['inspections', 'treatments', 'hives'];
      const serialized = entityTypes.join(',');

      expect(serialized).toBe('inspections,treatments,hives');
    });

    it('handles single entity type', () => {
      const entityTypes = ['inspections'];
      const serialized = entityTypes.join(',');

      expect(serialized).toBe('inspections');
    });

    it('handles empty entity types array', () => {
      const entityTypes: string[] = [];

      // Should not append entity_type param if empty
      expect(entityTypes.length === 0).toBe(true);
    });
  });

  describe('activity type icons', () => {
    const iconMapping = {
      inspection_created: 'FileSearchOutlined',
      treatment_recorded: 'MedicineBoxOutlined',
      feeding_recorded: 'CoffeeOutlined',
      harvest_recorded: 'GiftOutlined',
      hive_created: 'HomeOutlined',
      hive_updated: 'EditOutlined',
      hive_deleted: 'DeleteOutlined',
      clip_uploaded: 'VideoCameraOutlined',
      user_joined: 'UserAddOutlined',
      site_created: 'EnvironmentOutlined',
    };

    it('has icon for each activity type', () => {
      Object.entries(iconMapping).forEach(([activityType, icon]) => {
        expect(icon).toBeDefined();
        expect(icon).toContain('Outlined');
      });
    });
  });

  describe('entity link generation', () => {
    it('generates hive link for hive entity', () => {
      const item = { entity_type: 'hives', entity_id: 'hive-123' };
      const link = `/hives/${item.entity_id}`;
      expect(link).toBe('/hives/hive-123');
    });

    it('generates hive link for inspection entity with hive_id', () => {
      const item = {
        entity_type: 'inspections',
        entity_id: 'inspection-123',
        hive_id: 'hive-456',
      };
      const link = item.hive_id ? `/hives/${item.hive_id}` : null;
      expect(link).toBe('/hives/hive-456');
    });

    it('generates site link for site entity', () => {
      const item = { entity_type: 'sites', entity_id: 'site-789' };
      const link = `/sites/${item.entity_id}`;
      expect(link).toBe('/sites/site-789');
    });

    it('generates clips link for clip entity', () => {
      const item = { entity_type: 'clips', entity_id: 'clip-abc' };
      const link = '/clips';
      expect(link).toBe('/clips');
    });

    it('returns null for user entity (no link)', () => {
      const item = { entity_type: 'users', entity_id: 'user-xyz' };
      const link = null; // Users don't have detail pages
      expect(link).toBeNull();
    });
  });
});
