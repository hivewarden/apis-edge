/**
 * useBeeBrainSettings Hook
 *
 * CRUD operations for tenant BeeBrain settings (BYOK configuration).
 * Allows tenants to configure their own AI provider (OpenAI, Anthropic, Ollama)
 * or use the system default / rules-only mode.
 *
 * Part of Epic 13, Story 13-18 (BeeBrain BYOK)
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Mode options for BeeBrain configuration.
 */
export type BeeBrainMode = 'system' | 'custom' | 'rules_only';

/**
 * Provider options for custom mode.
 */
export type BeeBrainProvider = 'openai' | 'anthropic' | 'ollama';

/**
 * BeeBrain settings data returned from the API.
 */
export interface BeeBrainSettings {
  mode: BeeBrainMode;
  effective_backend: 'rules' | 'local' | 'external';
  effective_provider?: string;
  effective_model?: string;
  custom_config_status: 'configured' | 'not_configured';
  system_available: boolean;
  updated_at: string;
  message?: string;
}

/**
 * Input for updating BeeBrain settings.
 */
export interface UpdateBeeBrainSettingsInput {
  mode: BeeBrainMode;
  provider?: BeeBrainProvider;
  endpoint?: string; // Required for Ollama
  api_key?: string; // Required for OpenAI/Anthropic
  model?: string;
}

/**
 * Result from the useBeeBrainSettings hook.
 */
export interface UseBeeBrainSettingsResult {
  settings: BeeBrainSettings | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Result from the useUpdateBeeBrainSettings hook.
 */
export interface UseUpdateBeeBrainSettingsResult {
  updateSettings: (input: UpdateBeeBrainSettingsInput) => Promise<BeeBrainSettings>;
  updating: boolean;
}

/**
 * Hook for getting tenant BeeBrain settings.
 * Fetches the effective configuration for the current tenant.
 */
export function useBeeBrainSettings(): UseBeeBrainSettingsResult {
  const [settings, setSettings] = useState<BeeBrainSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: BeeBrainSettings }>('/settings/beebrain');
      setSettings(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch BeeBrain settings'));
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
 * Hook for updating tenant BeeBrain settings.
 * Admin role required. Allows switching between system/custom/rules_only modes.
 */
export function useUpdateBeeBrainSettings(): UseUpdateBeeBrainSettingsResult {
  const [updating, setUpdating] = useState(false);

  const updateSettings = useCallback(async (input: UpdateBeeBrainSettingsInput): Promise<BeeBrainSettings> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<{ data: BeeBrainSettings }>('/settings/beebrain', input);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateSettings, updating };
}

/**
 * Display name for BeeBrain modes.
 */
export function getModeDisplayName(mode: BeeBrainMode): string {
  switch (mode) {
    case 'system':
      return 'Use System Default';
    case 'custom':
      return 'Custom Configuration';
    case 'rules_only':
      return 'Rules Only (No AI)';
    default:
      return mode;
  }
}

/**
 * Description for BeeBrain modes.
 */
export function getModeDescription(mode: BeeBrainMode): string {
  switch (mode) {
    case 'system':
      return 'Use the BeeBrain configuration provided by the system administrator.';
    case 'custom':
      return 'Configure your own AI provider (OpenAI, Anthropic, or Ollama).';
    case 'rules_only':
      return 'Use rule-based analysis only. No AI costs or API configuration needed.';
    default:
      return '';
  }
}

/**
 * Display name for BeeBrain providers.
 */
export function getProviderDisplayName(provider: BeeBrainProvider): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'ollama':
      return 'Ollama (Local)';
    default:
      return provider;
  }
}

/**
 * Description for BeeBrain providers.
 */
export function getProviderDescription(provider: BeeBrainProvider): string {
  switch (provider) {
    case 'openai':
      return 'Use OpenAI GPT models. Requires an API key.';
    case 'anthropic':
      return 'Use Anthropic Claude models. Requires an API key.';
    case 'ollama':
      return 'Use a locally-hosted Ollama instance. Requires an endpoint URL.';
    default:
      return '';
  }
}

/**
 * Get provider options for tenant BYOK configuration.
 */
export function getBYOKProviderOptions(): { value: BeeBrainProvider; label: string }[] {
  return [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'ollama', label: 'Ollama (Local)' },
  ];
}

/**
 * Get mode options for the dropdown.
 */
export function getModeOptions(systemAvailable: boolean): { value: BeeBrainMode; label: string; disabled?: boolean }[] {
  return [
    {
      value: 'system',
      label: systemAvailable ? 'Use System Default' : 'Use System Default (Not Available)',
      disabled: !systemAvailable,
    },
    { value: 'custom', label: 'Custom Configuration' },
    { value: 'rules_only', label: 'Rules Only (No AI)' },
  ];
}
