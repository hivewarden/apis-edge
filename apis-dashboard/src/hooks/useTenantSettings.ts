/**
 * useTenantSettings Hook
 *
 * Fetches tenant settings including usage and limits.
 * Used by the Settings Overview tab to display resource consumption.
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Tenant basic information.
 */
export interface TenantInfo {
  id: string;
  name: string;
  plan: string;
  created_at: string;
}

/**
 * Resource usage statistics.
 */
export interface UsageInfo {
  hive_count: number;
  unit_count: number;
  user_count: number;
  storage_bytes: number;
}

/**
 * Resource limits.
 */
export interface LimitsInfo {
  max_hives: number;
  max_units: number;
  max_users: number;
  max_storage_bytes: number;
}

/**
 * Usage percentages.
 */
export interface PercentagesInfo {
  hives_percent: number;
  units_percent: number;
  users_percent: number;
  storage_percent: number;
}

/**
 * Complete tenant settings response.
 */
export interface TenantSettings {
  tenant: TenantInfo;
  usage: UsageInfo;
  limits: LimitsInfo;
  percentages: PercentagesInfo;
}

/**
 * Result type for useTenantSettings hook.
 */
export interface UseTenantSettingsResult {
  settings: TenantSettings | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching tenant settings with usage and limits.
 */
export function useTenantSettings(): UseTenantSettingsResult {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: TenantSettings }>('/settings/tenant');
      setSettings(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tenant settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    refresh: fetchSettings,
  };
}

/**
 * Input for profile update.
 */
export interface UpdateProfileInput {
  name: string;
}

/**
 * Profile response.
 */
export interface ProfileInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Result type for useUpdateProfile hook.
 */
export interface UseUpdateProfileResult {
  updateProfile: (input: UpdateProfileInput) => Promise<ProfileInfo>;
  updating: boolean;
}

/**
 * Hook for updating user profile (display name).
 * Only available in local auth mode.
 */
export function useUpdateProfile(): UseUpdateProfileResult {
  const [updating, setUpdating] = useState(false);

  const updateProfile = useCallback(async (input: UpdateProfileInput): Promise<ProfileInfo> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<{ data: ProfileInfo }>('/settings/profile', input);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateProfile, updating };
}

/**
 * Format bytes to human-readable size (MB or GB).
 */
export function formatStorageSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * Get status color based on percentage.
 */
export function getUsageStatus(percent: number): 'success' | 'normal' | 'exception' {
  if (percent >= 95) {
    return 'exception';
  }
  if (percent >= 80) {
    return 'normal'; // We'll use warning color in UI via status mapping
  }
  return 'success';
}

/**
 * Get Ant Design Progress status based on percentage.
 * Maps to Ant Design's Progress component status prop.
 */
export function getProgressStatus(percent: number): 'success' | 'normal' | 'exception' | 'active' | undefined {
  if (percent >= 95) {
    return 'exception'; // Red
  }
  if (percent >= 80) {
    return undefined; // Will use custom warning color
  }
  return 'normal';
}

/**
 * Check if usage is in warning zone (80-95%).
 */
export function isWarningZone(percent: number): boolean {
  return percent >= 80 && percent < 95;
}
