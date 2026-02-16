/**
 * useHiveLoss Hook Tests
 *
 * Tests for the hive loss hooks that manage API interactions.
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHiveLoss, useHiveLosses, useHiveLossStats, CAUSE_OPTIONS, SYMPTOM_OPTIONS } from '../../src/hooks/useHiveLoss';
import { apiClient } from '../../src/providers/apiClient';
import type { CreateHiveLossInput } from '../../src/hooks/useHiveLoss';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('useHiveLoss', () => {
  const mockApiGet = vi.mocked(apiClient.get);
  const mockApiPost = vi.mocked(apiClient.post);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useHiveLoss (single hive)', () => {
    const mockLoss = {
      id: 'loss-123',
      hive_id: 'hive-456',
      discovered_at: '2026-01-20',
      cause: 'varroa',
      cause_display: 'Varroa/Mites',
      symptoms: ['deformed_wings'],
      symptoms_display: ['Deformed wings visible'],
      data_choice: 'archive',
      created_at: '2026-01-20T10:00:00Z',
    };

    it('fetches hive loss for a given hive ID', async () => {
      mockApiGet.mockResolvedValue({ data: { data: mockLoss } });

      const { result } = renderHook(() => useHiveLoss('hive-456'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/hives/hive-456/loss');
      expect(result.current.hiveLoss).toEqual(mockLoss);
    });

    it('does not fetch when hiveId is null', async () => {
      const { result } = renderHook(() => useHiveLoss(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiGet).not.toHaveBeenCalled();
      expect(result.current.hiveLoss).toBeNull();
    });

    it('handles 404 response gracefully', async () => {
      mockApiGet.mockRejectedValue({ response: { status: 404 } });

      const { result } = renderHook(() => useHiveLoss('hive-456'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hiveLoss).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('sets error on non-404 failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useHiveLoss('hive-456'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });

    it('creates hive loss record', async () => {
      mockApiGet.mockResolvedValue({ data: { data: null } });
      mockApiPost.mockResolvedValue({ data: { data: mockLoss } });

      const { result } = renderHook(() => useHiveLoss('hive-456'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const input: CreateHiveLossInput = {
        discovered_at: '2026-01-20',
        cause: 'varroa',
        symptoms: ['deformed_wings'],
        data_choice: 'archive',
      };

      await result.current.createHiveLoss('hive-456', input);

      expect(mockApiPost).toHaveBeenCalledWith('/hives/hive-456/loss', input);
    });

    it('updates local hiveLoss state after creating loss for same hive', async () => {
      // Start with no loss record
      mockApiGet.mockResolvedValue({ data: { data: null } });
      mockApiPost.mockResolvedValue({ data: { data: mockLoss } });

      const { result } = renderHook(() => useHiveLoss('hive-456'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initially no hiveLoss
      expect(result.current.hiveLoss).toBeNull();

      const input: CreateHiveLossInput = {
        discovered_at: '2026-01-20',
        cause: 'varroa',
        symptoms: ['deformed_wings'],
        data_choice: 'archive',
      };

      // Create loss for the same hive
      await result.current.createHiveLoss('hive-456', input);

      // After creating, local state should be updated with the new loss
      await waitFor(() => {
        expect(result.current.hiveLoss).toEqual(mockLoss);
      });
    });

    it('does not update local state when creating loss for different hive', async () => {
      mockApiGet.mockResolvedValue({ data: { data: null } });
      mockApiPost.mockResolvedValue({ data: { data: mockLoss } });

      const { result } = renderHook(() => useHiveLoss('hive-789'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const input: CreateHiveLossInput = {
        discovered_at: '2026-01-20',
        cause: 'varroa',
        symptoms: ['deformed_wings'],
        data_choice: 'archive',
      };

      // Create loss for a DIFFERENT hive (hive-456, not hive-789)
      await result.current.createHiveLoss('hive-456', input);

      // Local state should NOT be updated since it's a different hive
      expect(result.current.hiveLoss).toBeNull();
    });
  });

  describe('useHiveLosses (all losses)', () => {
    const mockLosses = [
      { id: 'loss-1', hive_id: 'hive-1', cause: 'varroa', discovered_at: '2026-01-15' },
      { id: 'loss-2', hive_id: 'hive-2', cause: 'starvation', discovered_at: '2026-01-20' },
    ];

    it('fetches all hive losses', async () => {
      mockApiGet.mockResolvedValue({ data: { data: mockLosses, meta: { total: 2 } } });

      const { result } = renderHook(() => useHiveLosses());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/hive-losses');
      expect(result.current.losses).toEqual(mockLosses);
    });

    it('handles empty list', async () => {
      mockApiGet.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });

      const { result } = renderHook(() => useHiveLosses());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.losses).toEqual([]);
    });
  });

  describe('useHiveLossStats', () => {
    const mockStats = {
      total_losses: 5,
      losses_by_cause: {
        varroa: 2,
        starvation: 2,
        unknown: 1,
      },
      losses_by_year: {
        '2025': 2,
        '2026': 3,
      },
      most_common_cause: 'varroa',
      most_common_cause_display: 'Varroa/Mites',
    };

    it('fetches hive loss statistics', async () => {
      mockApiGet.mockResolvedValue({ data: { data: mockStats } });

      const { result } = renderHook(() => useHiveLossStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/hive-losses/stats');
      expect(result.current.stats).toEqual(mockStats);
    });
  });

  describe('Constants', () => {
    it('exports CAUSE_OPTIONS with all required causes', () => {
      const requiredCauses = [
        'starvation',
        'varroa',
        'queen_failure',
        'pesticide',
        'swarming',
        'robbing',
        'unknown',
        'other',
      ];

      const exportedKeys = Object.keys(CAUSE_OPTIONS);
      requiredCauses.forEach((cause) => {
        expect(exportedKeys).toContain(cause);
      });
    });

    it('exports SYMPTOM_OPTIONS with common symptoms', () => {
      const requiredSymptoms = [
        'no_bees',
        'dead_bees_entrance',
        'deformed_wings',
        'dead_brood',
        'empty_stores',
      ];

      const exportedKeys = Object.keys(SYMPTOM_OPTIONS);
      requiredSymptoms.forEach((symptom) => {
        expect(exportedKeys).toContain(symptom);
      });
    });

    it('CAUSE_OPTIONS have display values', () => {
      Object.entries(CAUSE_OPTIONS).forEach(([key, value]) => {
        expect(key).toBeTruthy();
        expect(value).toBeTruthy();
        expect(typeof value).toBe('string');
      });
    });

    it('SYMPTOM_OPTIONS have display values', () => {
      Object.entries(SYMPTOM_OPTIONS).forEach(([key, value]) => {
        expect(key).toBeTruthy();
        expect(value).toBeTruthy();
        expect(typeof value).toBe('string');
      });
    });
  });
});
