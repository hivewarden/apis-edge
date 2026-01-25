/**
 * useEquipment Hook
 *
 * Fetches equipment logs for a hive with CRUD operations.
 * Provides both currently installed equipment and equipment history.
 *
 * Part of Epic 6, Story 6.4 (Equipment Log)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Equipment log data returned by the API.
 */
export interface EquipmentLog {
  id: string;
  hive_id: string;
  equipment_type: string;
  equipment_label: string;
  action: 'installed' | 'removed';
  logged_at: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Currently installed equipment.
 */
export interface CurrentlyInstalledEquipment {
  id: string;
  equipment_type: string;
  equipment_label: string;
  installed_at: string;
  days_installed: number;
  notes?: string;
}

/**
 * Equipment history item (installed and removed).
 */
export interface EquipmentHistoryItem {
  equipment_type: string;
  equipment_label: string;
  installed_at: string;
  removed_at: string;
  duration_days: number;
  notes?: string;
}

interface EquipmentLogsResponse {
  data: EquipmentLog[];
  meta: {
    total: number;
  };
}

interface EquipmentLogResponse {
  data: EquipmentLog;
}

interface CurrentlyInstalledResponse {
  data: CurrentlyInstalledEquipment[];
}

interface EquipmentHistoryResponse {
  data: EquipmentHistoryItem[];
}

/**
 * Input for creating a new equipment log.
 */
export interface CreateEquipmentLogInput {
  equipment_type: string;
  action: 'installed' | 'removed';
  logged_at: string;
  notes?: string;
}

/**
 * Input for updating an equipment log.
 */
export interface UpdateEquipmentLogInput {
  equipment_type?: string;
  action?: 'installed' | 'removed';
  logged_at?: string;
  notes?: string;
}

interface UseEquipmentResult {
  equipmentLogs: EquipmentLog[];
  currentlyInstalled: CurrentlyInstalledEquipment[];
  equipmentHistory: EquipmentHistoryItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createEquipmentLog: (input: CreateEquipmentLogInput) => Promise<EquipmentLog>;
  updateEquipmentLog: (id: string, input: UpdateEquipmentLogInput) => Promise<EquipmentLog>;
  deleteEquipmentLog: (id: string) => Promise<void>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Hook to fetch and manage equipment logs for a hive.
 *
 * @param hiveId - The ID of the hive to fetch equipment for
 *
 * @example
 * function EquipmentStatus({ hiveId }) {
 *   const { currentlyInstalled, equipmentHistory, loading } = useEquipment(hiveId);
 *
 *   if (loading) return <Spin />;
 *
 *   return <EquipmentDisplay installed={currentlyInstalled} history={equipmentHistory} />;
 * }
 */
export function useEquipment(hiveId: string | null): UseEquipmentResult {
  const [equipmentLogs, setEquipmentLogs] = useState<EquipmentLog[]>([]);
  const [currentlyInstalled, setCurrentlyInstalled] = useState<CurrentlyInstalledEquipment[]>([]);
  const [equipmentHistory, setEquipmentHistory] = useState<EquipmentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchEquipment = useCallback(async () => {
    if (!hiveId) {
      setEquipmentLogs([]);
      setCurrentlyInstalled([]);
      setEquipmentHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch all three endpoints in parallel
      const [logsRes, currentRes, historyRes] = await Promise.all([
        apiClient.get<EquipmentLogsResponse>(`/hives/${hiveId}/equipment`),
        apiClient.get<CurrentlyInstalledResponse>(`/hives/${hiveId}/equipment/current`),
        apiClient.get<EquipmentHistoryResponse>(`/hives/${hiveId}/equipment/history`),
      ]);

      setEquipmentLogs(logsRes.data.data || []);
      setCurrentlyInstalled(currentRes.data.data || []);
      setEquipmentHistory(historyRes.data.data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  const createEquipmentLog = useCallback(async (input: CreateEquipmentLogInput): Promise<EquipmentLog> => {
    if (!hiveId) throw new Error('Hive ID is required');

    setCreating(true);
    try {
      const response = await apiClient.post<EquipmentLogResponse>(`/hives/${hiveId}/equipment`, input);
      // Refetch to update all lists
      await fetchEquipment();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [hiveId, fetchEquipment]);

  const updateEquipmentLog = useCallback(async (id: string, input: UpdateEquipmentLogInput): Promise<EquipmentLog> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<EquipmentLogResponse>(`/equipment/${id}`, input);
      // Refetch to update all lists
      await fetchEquipment();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchEquipment]);

  const deleteEquipmentLog = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/equipment/${id}`);
      // Refetch to update all lists
      await fetchEquipment();
    } finally {
      setDeleting(false);
    }
  }, [fetchEquipment]);

  return {
    equipmentLogs,
    currentlyInstalled,
    equipmentHistory,
    loading,
    error,
    refetch: fetchEquipment,
    createEquipmentLog,
    updateEquipmentLog,
    deleteEquipmentLog,
    creating,
    updating,
    deleting,
  };
}

/**
 * Equipment type options for dropdown.
 */
export const EQUIPMENT_TYPES = [
  { value: 'entrance_reducer', label: 'Entrance Reducer' },
  { value: 'mouse_guard', label: 'Mouse Guard' },
  { value: 'queen_excluder', label: 'Queen Excluder' },
  { value: 'robbing_screen', label: 'Robbing Screen' },
  { value: 'feeder', label: 'Feeder' },
  { value: 'top_feeder', label: 'Top Feeder' },
  { value: 'bottom_board', label: 'Bottom Board' },
  { value: 'slatted_rack', label: 'Slatted Rack' },
  { value: 'inner_cover', label: 'Inner Cover' },
  { value: 'outer_cover', label: 'Outer Cover' },
  { value: 'hive_beetle_trap', label: 'Hive Beetle Trap' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Equipment action options for radio group.
 */
export const EQUIPMENT_ACTIONS = [
  { value: 'installed', label: 'Installed' },
  { value: 'removed', label: 'Removed' },
] as const;

/**
 * Format equipment type for display.
 */
export function formatEquipmentType(type: string): string {
  const found = EQUIPMENT_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}

/**
 * Format duration for display.
 * Handles singular/plural for days, months, and years.
 */
export function formatDuration(days: number): string {
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years} ${years === 1 ? 'year' : 'years'}`;
  return `${years}y ${remainingMonths}m`;
}

export default useEquipment;
