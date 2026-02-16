/**
 * useBeeBrainSettings Hook Tests
 *
 * Tests for the BeeBrain settings hook that provides BYOK configuration
 * for AI-powered hive analysis.
 *
 * Part of Epic 13, Story 13-18 (BeeBrain BYOK)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useBeeBrainSettings,
  useUpdateBeeBrainSettings,
  getModeDisplayName,
  getModeDescription,
  getProviderDisplayName,
  getProviderDescription,
  getBYOKProviderOptions,
  getModeOptions,
} from '../../src/hooks/useBeeBrainSettings';
import { apiClient } from '../../src/providers/apiClient';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockApiClient = apiClient as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

// Mock BeeBrain settings response
const mockSettingsResponse = {
  data: {
    data: {
      mode: 'system' as const,
      effective_backend: 'rules' as const,
      effective_provider: undefined,
      effective_model: undefined,
      custom_config_status: 'not_configured' as const,
      system_available: true,
      updated_at: '2024-01-15T10:30:00Z',
    },
  },
};

const mockCustomSettingsResponse = {
  data: {
    data: {
      mode: 'custom' as const,
      effective_backend: 'external' as const,
      effective_provider: 'openai',
      effective_model: 'gpt-4',
      custom_config_status: 'configured' as const,
      system_available: true,
      updated_at: '2024-01-15T12:00:00Z',
      message: 'BeeBrain configuration updated',
    },
  },
};

describe('useBeeBrainSettings hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches settings on mount', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockSettingsResponse);

    const { result } = renderHook(() => useBeeBrainSettings());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/settings/beebrain');
    expect(result.current.settings).toEqual(mockSettingsResponse.data.data);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error', async () => {
    const errorMessage = 'Network error';
    mockApiClient.get.mockRejectedValueOnce(new Error(errorMessage));

    const { result } = renderHook(() => useBeeBrainSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe(errorMessage);
    expect(result.current.settings).toBeNull();
  });

  it('refresh function refetches settings', async () => {
    mockApiClient.get.mockResolvedValue(mockSettingsResponse);

    const { result } = renderHook(() => useBeeBrainSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockApiClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('useUpdateBeeBrainSettings hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates settings successfully', async () => {
    mockApiClient.put.mockResolvedValueOnce(mockCustomSettingsResponse);

    const { result } = renderHook(() => useUpdateBeeBrainSettings());

    expect(result.current.updating).toBe(false);

    let updateResult;
    await act(async () => {
      updateResult = await result.current.updateSettings({
        mode: 'custom',
        provider: 'openai',
        api_key: 'sk-test-key',
        model: 'gpt-4',
      });
    });

    expect(mockApiClient.put).toHaveBeenCalledWith('/settings/beebrain', {
      mode: 'custom',
      provider: 'openai',
      api_key: 'sk-test-key',
      model: 'gpt-4',
    });
    expect(updateResult).toEqual(mockCustomSettingsResponse.data.data);
    expect(result.current.updating).toBe(false);
  });

  it('handles update error', async () => {
    const errorMessage = 'Invalid API key';
    mockApiClient.put.mockRejectedValueOnce(new Error(errorMessage));

    const { result } = renderHook(() => useUpdateBeeBrainSettings());

    await expect(
      act(async () => {
        await result.current.updateSettings({
          mode: 'custom',
          provider: 'openai',
          api_key: 'invalid-key',
        });
      })
    ).rejects.toThrow(errorMessage);

    expect(result.current.updating).toBe(false);
  });

  it('sets updating flag during request', async () => {
    let resolvePromise: (value: unknown) => void;
    const delayedPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockApiClient.put.mockReturnValueOnce(delayedPromise);

    const { result } = renderHook(() => useUpdateBeeBrainSettings());

    expect(result.current.updating).toBe(false);

    // Start the update (don't await)
    let updatePromise: Promise<unknown>;
    act(() => {
      updatePromise = result.current.updateSettings({
        mode: 'rules_only',
      });
    });

    // Should be updating now
    expect(result.current.updating).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockSettingsResponse);
      await updatePromise;
    });

    // Should no longer be updating
    expect(result.current.updating).toBe(false);
  });
});

describe('getModeDisplayName', () => {
  it('returns correct name for system mode', () => {
    expect(getModeDisplayName('system')).toBe('Use System Default');
  });

  it('returns correct name for custom mode', () => {
    expect(getModeDisplayName('custom')).toBe('Custom Configuration');
  });

  it('returns correct name for rules_only mode', () => {
    expect(getModeDisplayName('rules_only')).toBe('Rules Only (No AI)');
  });

  it('returns the mode itself for unknown modes', () => {
    // @ts-expect-error - testing invalid input
    expect(getModeDisplayName('unknown')).toBe('unknown');
  });
});

describe('getModeDescription', () => {
  it('returns description for system mode', () => {
    const desc = getModeDescription('system');
    expect(desc).toContain('system administrator');
  });

  it('returns description for custom mode', () => {
    const desc = getModeDescription('custom');
    expect(desc).toContain('OpenAI');
    expect(desc).toContain('Anthropic');
    expect(desc).toContain('Ollama');
  });

  it('returns description for rules_only mode', () => {
    const desc = getModeDescription('rules_only');
    expect(desc).toContain('rule-based');
    expect(desc).toContain('No AI');
  });

  it('returns empty string for unknown modes', () => {
    // @ts-expect-error - testing invalid input
    expect(getModeDescription('unknown')).toBe('');
  });
});

describe('getProviderDisplayName', () => {
  it('returns correct name for openai', () => {
    expect(getProviderDisplayName('openai')).toBe('OpenAI');
  });

  it('returns correct name for anthropic', () => {
    expect(getProviderDisplayName('anthropic')).toBe('Anthropic');
  });

  it('returns correct name for ollama', () => {
    expect(getProviderDisplayName('ollama')).toBe('Ollama (Local)');
  });

  it('returns the provider itself for unknown providers', () => {
    // @ts-expect-error - testing invalid input
    expect(getProviderDisplayName('unknown')).toBe('unknown');
  });
});

describe('getProviderDescription', () => {
  it('returns description for openai', () => {
    const desc = getProviderDescription('openai');
    expect(desc).toContain('OpenAI');
    expect(desc).toContain('API key');
  });

  it('returns description for anthropic', () => {
    const desc = getProviderDescription('anthropic');
    expect(desc).toContain('Anthropic');
    expect(desc).toContain('Claude');
    expect(desc).toContain('API key');
  });

  it('returns description for ollama', () => {
    const desc = getProviderDescription('ollama');
    expect(desc).toContain('Ollama');
    expect(desc).toContain('endpoint');
  });

  it('returns empty string for unknown providers', () => {
    // @ts-expect-error - testing invalid input
    expect(getProviderDescription('unknown')).toBe('');
  });
});

describe('getBYOKProviderOptions', () => {
  it('returns array of provider options', () => {
    const options = getBYOKProviderOptions();
    expect(options).toHaveLength(3);
  });

  it('includes openai option', () => {
    const options = getBYOKProviderOptions();
    const openai = options.find(o => o.value === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.label).toBe('OpenAI');
  });

  it('includes anthropic option', () => {
    const options = getBYOKProviderOptions();
    const anthropic = options.find(o => o.value === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.label).toBe('Anthropic');
  });

  it('includes ollama option', () => {
    const options = getBYOKProviderOptions();
    const ollama = options.find(o => o.value === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama?.label).toContain('Ollama');
  });
});

describe('getModeOptions', () => {
  it('returns array of mode options when system is available', () => {
    const options = getModeOptions(true);
    expect(options).toHaveLength(3);
  });

  it('enables system option when system is available', () => {
    const options = getModeOptions(true);
    const systemOption = options.find(o => o.value === 'system');
    expect(systemOption).toBeDefined();
    expect(systemOption?.disabled).toBeFalsy();
  });

  it('disables system option when system is not available', () => {
    const options = getModeOptions(false);
    const systemOption = options.find(o => o.value === 'system');
    expect(systemOption).toBeDefined();
    expect(systemOption?.disabled).toBe(true);
    expect(systemOption?.label).toContain('Not Available');
  });

  it('custom mode is always enabled', () => {
    const options = getModeOptions(false);
    const customOption = options.find(o => o.value === 'custom');
    expect(customOption).toBeDefined();
    expect(customOption?.disabled).toBeFalsy();
  });

  it('rules_only mode is always enabled', () => {
    const options = getModeOptions(false);
    const rulesOption = options.find(o => o.value === 'rules_only');
    expect(rulesOption).toBeDefined();
    expect(rulesOption?.disabled).toBeFalsy();
  });
});
