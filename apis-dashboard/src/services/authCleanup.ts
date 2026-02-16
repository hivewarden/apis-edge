/**
 * Authentication Cleanup Service
 *
 * Provides comprehensive cleanup of all authentication and cached data
 * on logout to prevent data leakage.
 *
 * SECURITY (PWA-001-5-INFRA): Ensures complete cleanup of:
 * - IndexedDB cached data
 * - localStorage entries
 * - sessionStorage entries
 * - Service worker caches
 * - CSRF tokens
 *
 * @module services/authCleanup
 */

import { forceClearCache } from './db';
import { clearCsrfToken } from '../utils/csrf';
import { clearAuthConfigCache } from '../config';

/**
 * Clear all browser storage related to authentication and cached data.
 *
 * SECURITY (PWA-001-5-INFRA): This function should be called on logout to ensure
 * no sensitive data remains in browser storage after the user signs out.
 *
 * Clears:
 * - IndexedDB (all cached sites, hives, inspections, etc.)
 * - sessionStorage (auth config cache, OIDC state)
 * - localStorage (any persisted auth tokens, preferences)
 * - CSRF tokens
 * - Service worker API caches
 *
 * @example
 * ```ts
 * // In logout handler
 * async function handleLogout() {
 *   await cleanupAllAuthData();
 *   // Then redirect to login
 * }
 * ```
 */
export async function cleanupAllAuthData(): Promise<void> {
  if (import.meta.env.DEV) console.log('[AuthCleanup] Starting comprehensive cleanup...');

  // 1. Clear IndexedDB cached data
  try {
    await forceClearCache();
    if (import.meta.env.DEV) console.log('[AuthCleanup] IndexedDB cleared');
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear IndexedDB:', error);
  }

  // 2. Clear auth config cache (memory + sessionStorage)
  try {
    clearAuthConfigCache();
    if (import.meta.env.DEV) console.log('[AuthCleanup] Auth config cache cleared');
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear auth config:', error);
  }

  // 3. Clear CSRF token
  try {
    clearCsrfToken();
    if (import.meta.env.DEV) console.log('[AuthCleanup] CSRF token cleared');
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear CSRF token:', error);
  }

  // 4. Clear sessionStorage completely
  try {
    sessionStorage.clear();
    if (import.meta.env.DEV) console.log('[AuthCleanup] sessionStorage cleared');
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear sessionStorage:', error);
  }

  // 5. Clear auth-related localStorage entries (keep app preferences)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isAuthRelatedKey(key)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    if (import.meta.env.DEV) console.log(`[AuthCleanup] Removed ${keysToRemove.length} localStorage entries`);
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear localStorage:', error);
  }

  // 6. Clear service worker caches (API cache, etc.)
  try {
    await clearServiceWorkerCaches();
    if (import.meta.env.DEV) console.log('[AuthCleanup] Service worker caches cleared');
  } catch (error) {
    if (import.meta.env.DEV) console.error('[AuthCleanup] Failed to clear SW caches:', error);
  }

  if (import.meta.env.DEV) console.log('[AuthCleanup] Cleanup complete');
}

/**
 * Check if a localStorage key is auth-related and should be cleared on logout.
 *
 * Preserves non-auth settings like theme preferences, UI state, etc.
 */
function isAuthRelatedKey(key: string): boolean {
  const authPatterns = [
    'oidc.',           // OIDC client state
    'apis_auth',       // Our auth tokens/config
    'apis_csrf',       // CSRF tokens
    'apis_user',       // User data
    'apis_session',    // Session data
    'token',           // Generic token storage
    'access_token',    // OAuth tokens
    'refresh_token',   // OAuth refresh tokens
    'id_token',        // OIDC ID tokens
  ];

  const lowerKey = key.toLowerCase();
  return authPatterns.some(pattern => lowerKey.includes(pattern.toLowerCase()));
}

/**
 * Clear service worker caches that may contain sensitive data.
 *
 * Only clears caches that might contain auth-related or user-specific data.
 * Preserves static asset caches for faster reload.
 */
async function clearServiceWorkerCaches(): Promise<void> {
  if (!('caches' in window)) {
    return; // Cache API not available
  }

  const cacheNames = await caches.keys();
  const cachesToClear = cacheNames.filter(name => {
    // Clear API caches that may contain user-specific data
    const apiCachePatterns = ['api-cache', 'api-', 'data-', 'user-'];
    return apiCachePatterns.some(pattern => name.includes(pattern));
  });

  await Promise.all(cachesToClear.map(name => caches.delete(name)));
}

/**
 * Quick cleanup for session expiry (less aggressive than full logout).
 *
 * Clears auth tokens but preserves cached data for potential re-login.
 */
export async function cleanupExpiredSession(): Promise<void> {
  if (import.meta.env.DEV) console.log('[AuthCleanup] Cleaning up expired session...');

  // Clear auth config and tokens
  clearAuthConfigCache();
  clearCsrfToken();

  // Clear session storage (OIDC state)
  try {
    sessionStorage.clear();
  } catch {
    // Ignore errors
  }

  // Don't clear IndexedDB - user may re-login and want cached data

  if (import.meta.env.DEV) console.log('[AuthCleanup] Session cleanup complete');
}

export default cleanupAllAuthData;
