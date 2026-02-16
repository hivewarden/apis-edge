/**
 * Application Configuration
 *
 * Centralized configuration values from environment variables.
 * All environment-based config should be defined here.
 *
 * SECURITY (AUTH-001-4-DASH): Auth config cache includes integrity verification
 * to detect cache tampering/poisoning attacks.
 */

import type { AuthConfig } from "./types/auth";

// ============================================================================
// Cache Integrity Utilities (AUTH-001-4-DASH)
// ============================================================================

/**
 * Generate a simple hash for integrity verification.
 * Uses a fast, non-cryptographic hash suitable for detecting accidental
 * corruption of cached config data (e.g., malformed JSON, truncation).
 *
 * SECURITY NOTE (S4-M1): This is NOT a security mechanism. An attacker
 * with XSS access can trivially recompute this hash. This check only
 * guards against accidental cache corruption, not deliberate tampering.
 * True tamper resistance would require an HMAC with a key not accessible
 * to client-side JavaScript, which is not feasible for sessionStorage.
 *
 * @param data - String data to hash
 * @returns Hash string
 */
function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Add timestamp-based salt to make hash unique per session
  // This prevents pre-computed hash attacks
  const sessionSalt = window.performance?.timeOrigin?.toString() ?? '';
  return `${Math.abs(hash).toString(16)}-${simpleHash2(data + sessionSalt)}`;
}

/**
 * Secondary hash function for combined integrity check.
 */
function simpleHash2(data: string): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
  }
  return Math.abs(hash).toString(16);
}

/**
 * Cached auth config with integrity hash for tamper detection.
 */
interface CachedAuthConfig {
  config: AuthConfig;
  hash: string;
}

/**
 * API server base URL.
 * Used by data provider and API client for all backend requests.
 */
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// Warn if API URL uses HTTP in production (potential credential interception)
if (!import.meta.env.DEV && API_URL.startsWith('http://')) {
  console.warn('SECURITY: API_URL should use HTTPS in production');
}

/**
 * Keycloak OIDC configuration.
 * Used by auth provider for authentication.
 * Note: In SaaS mode, these may be overridden by /api/auth/config response.
 */
export const KEYCLOAK_AUTHORITY = import.meta.env.VITE_KEYCLOAK_AUTHORITY || "http://localhost:8081/realms/honeybee";
export const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "";

/**
 * DEV MODE: Set VITE_DEV_MODE=true to bypass all authentication.
 * This should NEVER be used in production! Matches DISABLE_AUTH on the server.
 * Note: DEV_MODE is separate from auth mode - it bypasses ALL auth checks.
 *
 * SECURITY: In production builds, __DEV_MODE__ is replaced with 'false' at
 * build time via Vite's define config. This ensures the auth bypass code
 * is completely stripped from production bundles via dead code elimination.
 */
declare const __DEV_MODE__: boolean;
export const DEV_MODE = typeof __DEV_MODE__ !== 'undefined' ? __DEV_MODE__ : false;

/**
 * Session storage key for auth config cache.
 */
const AUTH_CONFIG_CACHE_KEY = 'apis_auth_config';

/**
 * In-memory cache for auth config to prevent repeated API calls
 * within the same page session.
 */
let authConfigCache: AuthConfig | null = null;

/**
 * Validate that a parsed object has the expected shape for AuthConfig.
 * SECURITY (S4-M1): Ensures cached config has required fields to prevent
 * using corrupted or malformed config data.
 *
 * @param obj - The object to validate
 * @returns true if the object is a valid AuthConfig
 */
function isValidAuthConfig(obj: unknown): obj is AuthConfig {
  if (!obj || typeof obj !== 'object') return false;
  const config = obj as Record<string, unknown>;
  if (config.mode === 'local') {
    return typeof config.setup_required === 'boolean';
  }
  if (config.mode === 'keycloak') {
    return (
      typeof config.keycloak_authority === 'string' &&
      typeof config.client_id === 'string'
    );
  }
  return false;
}

/**
 * Fetch authentication configuration from the server.
 *
 * Determines whether the application is running in local (email/password)
 * or SaaS (Keycloak OIDC) authentication mode. The result is cached in
 * both memory and sessionStorage to prevent repeated API calls.
 *
 * SECURITY (AUTH-001-4-DASH): Cache includes integrity verification to detect
 * cache tampering/poisoning attacks.
 *
 * @returns Promise<AuthConfig> - The auth configuration
 * @throws Error if the API call fails and no cached config exists
 *
 * @example
 * ```typescript
 * const config = await fetchAuthConfig();
 * if (config.mode === 'local') {
 *   // Use local auth provider
 * } else {
 *   // Use Keycloak auth provider
 * }
 * ```
 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  // Return in-memory cache if available (fastest)
  if (authConfigCache) {
    return authConfigCache;
  }

  // Check sessionStorage for persistence across page reloads
  // SECURITY (AUTH-001-4-DASH): Verify integrity hash before using cached data
  try {
    const cached = sessionStorage.getItem(AUTH_CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedAuthConfig;
      // Verify integrity hash to detect tampering
      const configStr = JSON.stringify(parsed.config);
      const expectedHash = simpleHash(configStr);
      if (parsed.hash === expectedHash && isValidAuthConfig(parsed.config)) {
        authConfigCache = parsed.config;
        return authConfigCache;
      } else {
        // Hash mismatch or invalid shape - cache may be tampered/corrupted, clear it
        console.warn('[Config] Auth config cache integrity check failed, fetching fresh config');
        sessionStorage.removeItem(AUTH_CONFIG_CACHE_KEY);
      }
    }
  } catch {
    // sessionStorage may not be available or data is corrupted
    try {
      sessionStorage.removeItem(AUTH_CONFIG_CACHE_KEY);
    } catch {
      // Ignore removal errors
    }
  }

  // Fetch from API
  const response = await fetch(`${API_URL}/auth/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch auth config: ${response.status} ${response.statusText}`);
  }

  const config = await response.json() as AuthConfig;

  // SECURITY (S4-M1): Validate the response has expected fields
  if (!isValidAuthConfig(config)) {
    throw new Error('Invalid auth config received from server: missing required fields');
  }

  // Cache in memory
  authConfigCache = config;

  // Cache in sessionStorage with integrity hash (AUTH-001-4-DASH)
  try {
    const configStr = JSON.stringify(config);
    const cachedData: CachedAuthConfig = {
      config,
      hash: simpleHash(configStr),
    };
    sessionStorage.setItem(AUTH_CONFIG_CACHE_KEY, JSON.stringify(cachedData));
  } catch {
    // sessionStorage may not be available or full
  }

  return config;
}

/**
 * Clear the auth config cache.
 * Useful for testing or when auth mode may have changed.
 */
export function clearAuthConfigCache(): void {
  authConfigCache = null;
  try {
    sessionStorage.removeItem(AUTH_CONFIG_CACHE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Get the current auth mode synchronously from cache.
 * Returns null if config hasn't been fetched yet.
 *
 * SECURITY (AUTH-001-4-DASH): Verifies integrity hash before returning cached data.
 *
 * @returns The cached auth config or null
 */
export function getAuthConfigSync(): AuthConfig | null {
  if (authConfigCache) {
    return authConfigCache;
  }

  try {
    const cached = sessionStorage.getItem(AUTH_CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedAuthConfig;
      // Verify integrity hash to detect tampering (AUTH-001-4-DASH)
      const configStr = JSON.stringify(parsed.config);
      const expectedHash = simpleHash(configStr);
      if (parsed.hash === expectedHash && isValidAuthConfig(parsed.config)) {
        authConfigCache = parsed.config;
        return authConfigCache;
      } else {
        // Hash mismatch or invalid shape - cache may be tampered/corrupted, ignore it
        console.warn('[Config] Auth config cache integrity check failed');
        return null;
      }
    }
  } catch {
    // Ignore errors - will return null
  }

  return null;
}
