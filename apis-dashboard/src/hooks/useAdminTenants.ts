/**
 * useAdminTenants Hook
 *
 * CRUD operations for tenant management in SaaS mode.
 * Super-admin only functionality for managing all tenants.
 *
 * Part of Epic 13, Story 13-12 (Super-Admin Tenant List & Management)
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Tenant representation from the admin API.
 */
export interface Tenant {
  id: string;
  name: string;
  plan: 'free' | 'hobby' | 'pro';
  status: 'active' | 'suspended' | 'deleted';
  user_count: number;
  hive_count: number;
  storage_used: number; // bytes
  created_at: string;
}

/**
 * Input for creating a tenant.
 */
export interface CreateTenantInput {
  name: string;
  plan?: 'free' | 'hobby' | 'pro';
}

/**
 * Input for updating a tenant.
 */
export interface UpdateTenantInput {
  name?: string;
  plan?: 'free' | 'hobby' | 'pro';
  status?: 'active' | 'suspended';
}

/**
 * Hook for listing all tenants (super-admin only).
 */
export function useAdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: Tenant[] }>('/admin/tenants');
      setTenants(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tenants'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch tenants on mount
  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return {
    tenants,
    loading,
    error,
    refresh: fetchTenants,
  };
}

/**
 * Hook for getting a single tenant by ID (super-admin only).
 */
export function useAdminTenant(tenantId: string | undefined) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTenant = useCallback(async () => {
    if (!tenantId) {
      setTenant(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: Tenant }>(`/admin/tenants/${tenantId}`);
      setTenant(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tenant'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Fetch tenant when ID changes
  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  return {
    tenant,
    loading,
    error,
    refresh: fetchTenant,
  };
}

/**
 * Hook for creating a tenant (super-admin only).
 */
export function useCreateTenant() {
  const [creating, setCreating] = useState(false);

  const createTenant = useCallback(async (input: CreateTenantInput): Promise<Tenant> => {
    setCreating(true);
    try {
      const response = await apiClient.post<{ data: Tenant }>('/admin/tenants', input);
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, []);

  return { createTenant, creating };
}

/**
 * Hook for updating a tenant (super-admin only).
 */
export function useUpdateTenant() {
  const [updating, setUpdating] = useState(false);

  const updateTenant = useCallback(async (tenantId: string, input: UpdateTenantInput): Promise<Tenant> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<{ data: Tenant }>(`/admin/tenants/${tenantId}`, input);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateTenant, updating };
}

/**
 * Hook for deleting (soft-delete) a tenant (super-admin only).
 */
export function useDeleteTenant() {
  const [deleting, setDeleting] = useState(false);

  const deleteTenant = useCallback(async (tenantId: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/admin/tenants/${tenantId}`);
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteTenant, deleting };
}

/**
 * Format storage size for display.
 * Converts bytes to human-readable format (KB, MB, GB).
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Get status color for Ant Design tags.
 */
export function getStatusColor(status: Tenant['status']): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'suspended':
      return 'orange';
    case 'deleted':
      return 'red';
    default:
      return 'default';
  }
}

/**
 * Get plan color for Ant Design tags.
 */
export function getPlanColor(plan: Tenant['plan']): string {
  switch (plan) {
    case 'free':
      return 'default';
    case 'hobby':
      return 'blue';
    case 'pro':
      return 'purple';
    default:
      return 'default';
  }
}
