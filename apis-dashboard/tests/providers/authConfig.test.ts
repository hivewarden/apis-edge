/**
 * Auth Config Tests
 *
 * Tests for fetchAuthConfig() and auth mode detection.
 * Part of Epic 13, Story 13.5: Retrofit Auth Provider
 * Updated for Epic 15, Story 15.5: Keycloak Migration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthConfigLocal, AuthConfigKeycloak } from '../../src/types/auth';

// Mock sessionStorage
let mockStore: Record<string, string> = {};
const mockSessionStorage = {
  getItem: vi.fn((key: string) => mockStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStore[key];
  }),
  clear: vi.fn(() => {
    mockStore = {};
  }),
};

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchAuthConfig', () => {
  // Import functions dynamically to reset module state
  let fetchAuthConfig: typeof import('../../src/config').fetchAuthConfig;
  let clearAuthConfigCache: typeof import('../../src/config').clearAuthConfigCache;
  let getAuthConfigSync: typeof import('../../src/config').getAuthConfigSync;
  let API_URL: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStore = {};
    mockSessionStorage.clear.mockClear();
    mockSessionStorage.getItem.mockClear();
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();

    // Ensure performance.timeOrigin is available for simpleHash in config.ts
    vi.stubGlobal('performance', { ...performance, timeOrigin: 1234567890 });

    // Reset the module to clear internal cache
    vi.resetModules();

    // Re-import the module to get fresh functions
    const configModule = await import('../../src/config');
    fetchAuthConfig = configModule.fetchAuthConfig;
    clearAuthConfigCache = configModule.clearAuthConfigCache;
    getAuthConfigSync = configModule.getAuthConfigSync;
    API_URL = configModule.API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('API fetching', () => {
    it('fetches auth config from /api/auth/config', async () => {
      const localConfig: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(localConfig),
      });

      const result = await fetchAuthConfig();

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/auth/config`);
      expect(result).toEqual(localConfig);
    });

    it('returns local mode config with setup_required=true', async () => {
      const localConfig: AuthConfigLocal = {
        mode: 'local',
        setup_required: true,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(localConfig),
      });

      const result = await fetchAuthConfig();

      expect(result.mode).toBe('local');
      if (result.mode === 'local') {
        expect(result.setup_required).toBe(true);
      }
    });

    it('returns keycloak mode config with authority and client_id', async () => {
      const keycloakConfig: AuthConfigKeycloak = {
        mode: 'keycloak',
        keycloak_authority: 'https://keycloak.example.com/realms/honeybee',
        client_id: 'apis-dashboard',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(keycloakConfig),
      });

      const result = await fetchAuthConfig();

      expect(result.mode).toBe('keycloak');
      if (result.mode === 'keycloak') {
        expect(result.keycloak_authority).toBe('https://keycloak.example.com/realms/honeybee');
        expect(result.client_id).toBe('apis-dashboard');
      }
    });

    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchAuthConfig()).rejects.toThrow(
        'Failed to fetch auth config: 500 Internal Server Error'
      );
    });

    it('throws error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchAuthConfig()).rejects.toThrow('Network error');
    });

    it('rejects invalid config with unrecognized mode', async () => {
      const invalidConfig = {
        mode: 'unknown',
        authority: 'https://auth.example.com',
        client_id: '12345',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidConfig),
      });

      await expect(fetchAuthConfig()).rejects.toThrow(
        'Invalid auth config received from server: missing required fields'
      );
    });
  });

  describe('caching', () => {
    it('caches config in memory on successful fetch', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      // First call fetches from API
      await fetchAuthConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call uses memory cache
      await fetchAuthConfig();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('caches config in sessionStorage with integrity hash', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      await fetchAuthConfig();

      // Verify setItem was called with the key and a JSON string containing the config and hash
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        'apis_auth_config',
        expect.stringContaining('"config"')
      );

      // Parse the stored value to verify structure
      const storedValue = JSON.parse(mockSessionStorage.setItem.mock.calls[0][1]);
      expect(storedValue.config).toEqual(config);
      expect(storedValue.hash).toBeDefined();
    });

    it('uses sessionStorage cache when memory cache is empty', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      // First, fetch to populate sessionStorage with a properly hashed cache entry
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });
      mockSessionStorage.getItem.mockReturnValue(null);
      await fetchAuthConfig();

      // Capture what was stored (with hash)
      const storedValue = mockSessionStorage.setItem.mock.calls[0][1];

      // Clear memory cache and re-import the module
      clearAuthConfigCache();
      vi.resetModules();
      const freshModule = await import('../../src/config');

      // Set up sessionStorage to return the properly hashed value
      mockSessionStorage.getItem.mockReturnValue(storedValue);
      mockFetch.mockClear();

      const result = await freshModule.fetchAuthConfig();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(config);
    });

    it('clearAuthConfigCache clears both memory and sessionStorage', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      // Ensure no sessionStorage cache
      mockSessionStorage.getItem.mockReturnValue(null);
      mockStore = {};

      // Populate cache via API fetch
      await fetchAuthConfig();
      const firstCallCount = mockFetch.mock.calls.length;

      // Clear cache
      clearAuthConfigCache();

      // Ensure sessionStorage returns null after clear
      mockSessionStorage.getItem.mockReturnValue(null);

      // Should fetch again since cache is cleared
      await fetchAuthConfig();

      // Should have made 2 fetch calls total
      expect(mockFetch).toHaveBeenCalledTimes(firstCallCount + 1);
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('apis_auth_config');
    });
  });

  describe('getAuthConfigSync', () => {
    it('returns null when no cache exists', () => {
      // Ensure sessionStorage returns null
      mockSessionStorage.getItem.mockReturnValue(null);
      // Clear the module to reset in-memory cache
      clearAuthConfigCache();

      const result = getAuthConfigSync();
      expect(result).toBeNull();
    });

    it('returns cached config from memory', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      // Populate memory cache
      await fetchAuthConfig();

      const result = getAuthConfigSync();
      expect(result).toEqual(config);
    });

    it('returns cached config from sessionStorage when memory is empty', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      // First, fetch to get a properly hashed cache entry
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });
      mockSessionStorage.getItem.mockReturnValue(null);
      await fetchAuthConfig();

      // Capture what was stored (with hash)
      const storedValue = mockSessionStorage.setItem.mock.calls[0][1];

      // Clear memory cache and re-import the module
      clearAuthConfigCache();
      vi.resetModules();
      const freshModule = await import('../../src/config');

      // Set up sessionStorage to return the properly hashed value
      mockSessionStorage.getItem.mockReturnValue(storedValue);

      const result = freshModule.getAuthConfigSync();
      expect(result).toEqual(config);
    });
  });

  describe('error resilience', () => {
    it('handles sessionStorage errors gracefully', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      // Make sessionStorage throw
      mockSessionStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw, just skip caching to sessionStorage
      const result = await fetchAuthConfig();
      expect(result).toEqual(config);
    });

    it('handles sessionStorage getItem errors gracefully', async () => {
      const config: AuthConfigLocal = {
        mode: 'local',
        setup_required: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(config),
      });

      // Make sessionStorage throw on getItem
      mockSessionStorage.getItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });

      // Should fetch from API instead
      const result = await fetchAuthConfig();
      expect(result).toEqual(config);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
