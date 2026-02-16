/**
 * useImpersonation Hook
 *
 * Manages impersonation state for super-admin users.
 * Provides the current impersonation status and methods to start/stop impersonation.
 *
 * Part of Epic 13, Story 13.14: Super-Admin Impersonation
 */
import { useState, useEffect, useCallback } from 'react';
import { getAuthConfigSync } from '../config';
import { apiClient } from '../providers/apiClient';

/**
 * Impersonation state returned by the hook.
 */
export interface ImpersonationState {
  /** Whether the user is currently impersonating a tenant */
  isImpersonating: boolean;
  /** ID of the tenant being impersonated */
  tenantId: string | null;
  /** Name of the tenant being impersonated */
  tenantName: string | null;
  /** Original tenant ID of the super-admin */
  originalTenantId: string | null;
  /** When the impersonation session started */
  startedAt: string | null;
  /** Whether impersonation status is being loaded */
  isLoading: boolean;
  /** Start impersonating a tenant */
  startImpersonation: (tenantId: string, reason?: string) => Promise<void>;
  /** Stop the current impersonation session */
  stopImpersonation: () => Promise<void>;
  /** Refresh the impersonation status from the server */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing super-admin impersonation state.
 *
 * Only available in SaaS (Keycloak) mode. In local mode, always returns
 * isImpersonating: false.
 *
 * @example
 * ```tsx
 * function AdminDashboard() {
 *   const { isImpersonating, tenantName, stopImpersonation } = useImpersonation();
 *
 *   if (isImpersonating) {
 *     return (
 *       <div>
 *         <p>Viewing as: {tenantName}</p>
 *         <button onClick={stopImpersonation}>Stop Impersonating</button>
 *       </div>
 *     );
 *   }
 *
 *   return <div>Normal admin view</div>;
 * }
 * ```
 */
export function useImpersonation(): ImpersonationState {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [originalTenantId, setOriginalTenantId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Fetch current impersonation status from the server.
   */
  const fetchStatus = useCallback(async () => {
    // Only check in SaaS mode
    const config = getAuthConfigSync();
    if (!config || config.mode !== 'keycloak') {
      setIsLoading(false);
      return;
    }

    try {
      // SECURITY (S5-H2): Use apiClient instead of raw fetch() to include
      // auth interceptors, CSRF tokens, and error handling.
      const response = await apiClient.get('/admin/impersonate/status');
      const statusData = response.data.data;

      setIsImpersonating(statusData.impersonating || false);
      setTenantId(statusData.tenant_id || null);
      setTenantName(statusData.tenant_name || null);
      setOriginalTenantId(statusData.original_tenant_id || null);
      setStartedAt(statusData.started_at || null);
    } catch (error: unknown) {
      // 403/404 means not a super-admin or not in SaaS mode - not an error
      const axiosErr = error as { response?: { status: number } };
      if (axiosErr.response?.status === 403 || axiosErr.response?.status === 404) {
        setIsImpersonating(false);
      } else {
        console.warn('Error fetching impersonation status:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Start impersonating a tenant.
   */
  const startImpersonation = useCallback(async (targetTenantId: string, reason?: string) => {
    // SECURITY (S5-H2): Use apiClient for auth interceptors and CSRF tokens
    await apiClient.post(`/admin/impersonate/${targetTenantId}`, reason ? { reason } : undefined);

    // Reload the page to apply new session cookie and refresh UI
    window.location.reload();
  }, []);

  /**
   * Stop the current impersonation session.
   */
  const stopImpersonation = useCallback(async () => {
    // SECURITY (S5-H2): Use apiClient for auth interceptors and CSRF tokens
    await apiClient.post('/admin/impersonate/stop');

    // Reload the page to apply new session cookie and refresh UI
    window.location.reload();
  }, []);

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    isImpersonating,
    tenantId,
    tenantName,
    originalTenantId,
    startedAt,
    isLoading,
    startImpersonation,
    stopImpersonation,
    refresh: fetchStatus,
  };
}

export default useImpersonation;
