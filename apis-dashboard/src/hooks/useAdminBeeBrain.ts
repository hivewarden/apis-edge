/**
 * useAdminBeeBrain Hook
 *
 * CRUD operations for BeeBrain configuration in SaaS mode.
 * Super-admin only functionality for managing system-wide BeeBrain config
 * and per-tenant access control.
 *
 * Part of Epic 13, Story 13-15 (Super-Admin BeeBrain Config)
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Backend types for BeeBrain configuration.
 */
export type BeeBrainBackend = 'rules' | 'local' | 'external';

/**
 * System-wide BeeBrain configuration.
 */
export interface BeeBrainSystemConfig {
  backend: BeeBrainBackend;
  provider?: string;
  endpoint?: string;
  model?: string;
  api_key_status: 'configured' | 'not_configured';
  updated_at: string;
}

/**
 * Per-tenant BeeBrain access status.
 */
export interface TenantBeeBrainAccess {
  tenant_id: string;
  tenant_name: string;
  enabled: boolean;
  has_byok: boolean;
}

/**
 * Combined BeeBrain config response.
 */
export interface BeeBrainConfigResponse {
  system_config: BeeBrainSystemConfig;
  tenant_access: TenantBeeBrainAccess[];
}

/**
 * Input for updating system BeeBrain configuration.
 */
export interface UpdateBeeBrainConfigInput {
  backend: BeeBrainBackend;
  provider?: string;
  endpoint?: string;
  api_key?: string;
  model?: string;
}

/**
 * Hook for getting BeeBrain configuration (super-admin only).
 */
export function useAdminBeeBrainConfig() {
  const [config, setConfig] = useState<BeeBrainConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: BeeBrainConfigResponse }>('/admin/beebrain');
      setConfig(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch BeeBrain config'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    systemConfig: config?.system_config || null,
    tenantAccess: config?.tenant_access || [],
    loading,
    error,
    refresh: fetchConfig,
  };
}

/**
 * Hook for updating system BeeBrain configuration (super-admin only).
 */
export function useUpdateBeeBrainConfig() {
  const [updating, setUpdating] = useState(false);

  const updateConfig = useCallback(async (input: UpdateBeeBrainConfigInput): Promise<BeeBrainSystemConfig> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<{ data: BeeBrainSystemConfig }>('/admin/beebrain', input);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateConfig, updating };
}

/**
 * Hook for setting tenant BeeBrain access (super-admin only).
 */
export function useSetTenantBeeBrainAccess() {
  const [setting, setSetting] = useState(false);

  const setAccess = useCallback(async (tenantId: string, enabled: boolean): Promise<void> => {
    setSetting(true);
    try {
      await apiClient.put(`/admin/tenants/${tenantId}/beebrain`, { enabled });
    } finally {
      setSetting(false);
    }
  }, []);

  return { setAccess, setting };
}

/**
 * Backend display names.
 */
export function getBackendDisplayName(backend: BeeBrainBackend): string {
  switch (backend) {
    case 'rules':
      return 'Rules-Based (No AI)';
    case 'local':
      return 'Local Model';
    case 'external':
      return 'External API';
    default:
      return backend;
  }
}

/**
 * Backend descriptions.
 */
export function getBackendDescription(backend: BeeBrainBackend): string {
  switch (backend) {
    case 'rules':
      return 'Uses rule-based analysis without AI. No API costs.';
    case 'local':
      return 'Uses a locally-hosted model (e.g., Ollama). Requires endpoint URL.';
    case 'external':
      return 'Uses an external AI service (OpenAI, Anthropic). Requires API key.';
    default:
      return '';
  }
}

/**
 * Get provider options based on backend.
 */
export function getProviderOptions(backend: BeeBrainBackend): { value: string; label: string }[] {
  switch (backend) {
    case 'local':
      return [
        { value: 'ollama', label: 'Ollama' },
        { value: 'localai', label: 'LocalAI' },
        { value: 'lmstudio', label: 'LM Studio' },
      ];
    case 'external':
      return [
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'google', label: 'Google AI' },
      ];
    default:
      return [];
  }
}
