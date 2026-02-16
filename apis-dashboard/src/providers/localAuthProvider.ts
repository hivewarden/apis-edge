/**
 * Local Authentication Provider
 *
 * Provides email/password authentication for local deployment mode.
 * Uses session cookies for authentication state management.
 *
 * SECURITY (AUTH-001-7-DASH): Includes CSRF protection for state-changing
 * requests to prevent Cross-Site Request Forgery attacks.
 *
 * API Endpoints:
 * - POST /api/auth/login - Authenticate with email/password
 * - POST /api/auth/logout - Clear session
 * - GET /api/auth/me - Get current user
 */
import type { AuthProvider } from "@refinedev/core";
import { API_URL, clearAuthConfigCache } from "../config";
import type { UserIdentity, LocalLoginParams, MeResponse } from "../types/auth";
import { getCsrfToken, CSRF_HEADER_NAME } from "../utils/csrf";
import { cleanupAllAuthData } from "../services/authCleanup";

/**
 * SECURITY (S4-L4): Promise deduplication for /api/auth/me responses.
 * Refine calls check(), getIdentity(), and getPermissions() separately on
 * each route navigation, resulting in 2-3 redundant /api/auth/me requests.
 * This deduplicates concurrent calls by reusing the same in-flight promise.
 */
let mePromise: Promise<MeResponse | null> | null = null;

async function fetchMe(): Promise<MeResponse | null> {
  if (!mePromise) {
    mePromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: 'include',
        });

        if (!response.ok) {
          return null;
        }

        return await response.json();
      } catch {
        return null;
      } finally {
        mePromise = null;
      }
    })();
  }

  return mePromise;
}

/**
 * Local authentication provider implementing Refine's AuthProvider interface.
 *
 * Features:
 * - Email/password authentication
 * - Session cookie-based auth (HttpOnly, Secure, SameSite=Strict)
 * - Automatic session validation
 * - Role-based permissions from user profile
 */
export const localAuthProvider: AuthProvider = {
  /**
   * Authenticate user with email and password.
   *
   * @param params - Login credentials { email, password, rememberMe? }
   * @returns Success with redirect, or error with message
   */
  login: async (params: LocalLoginParams) => {
    const { email, password, rememberMe } = params;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Required for cookies
        body: JSON.stringify({
          email,
          password,
          remember_me: rememberMe,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle rate limiting
        if (response.status === 429) {
          return {
            success: false,
            error: {
              name: 'RateLimited',
              message: errorData.error || 'Too many login attempts. Please try again later.',
            },
          };
        }

        // Handle invalid credentials
        if (response.status === 401) {
          return {
            success: false,
            error: {
              name: 'InvalidCredentials',
              message: errorData.error || 'Invalid email or password',
            },
          };
        }

        // Generic error
        return {
          success: false,
          error: {
            name: 'LoginError',
            message: errorData.error || 'Login failed. Please try again.',
          },
        };
      }

      // Login successful - session cookie is set by server
      return { success: true, redirectTo: '/' };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'NetworkError',
          message: 'Failed to connect to server. Please check your connection.',
        },
      };
    }
  },

  /**
   * Logout and clear session.
   * Calls server to invalidate session cookie.
   *
   * SECURITY:
   * - AUTH-001-7-DASH: Includes CSRF token in logout request
   * - PWA-001-5-INFRA: Clears all cached data on logout
   */
  logout: async () => {
    // Clear any in-flight /api/auth/me promise on logout
    mePromise = null;
    try {
      // Include CSRF token in logout request (AUTH-001-7-DASH)
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }

      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {
      // Ignore errors - we still want to redirect to login
    }

    // Clear all cached data on logout (PWA-001-5-INFRA)
    // This clears IndexedDB, localStorage, sessionStorage, SW caches, etc.
    try {
      await cleanupAllAuthData();
    } catch {
      // Ignore cleanup errors - still redirect to login
    }

    return { success: true, redirectTo: '/login' };
  },

  /**
   * Check if user is authenticated.
   * Validates session by calling /api/auth/me.
   * SECURITY (S4-L4): Uses shared cache to prevent redundant API calls.
   */
  check: async () => {
    const data = await fetchMe();
    if (data) {
      return { authenticated: true };
    }

    // Not authenticated
    return {
      authenticated: false,
      redirectTo: '/login',
      logout: true,
    };
  },

  /**
   * Get current user identity.
   * Returns user information from /api/auth/me.
   * SECURITY (S4-L4): Uses shared cache to prevent redundant API calls.
   */
  getIdentity: async (): Promise<UserIdentity | null> => {
    const data = await fetchMe();
    if (!data) {
      return null;
    }

    return {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      avatar: undefined, // Local users don't have avatars by default
      tenant_id: data.user.tenant_id, // Story 14.16: Offline Task Support
    };
  },

  /**
   * Handle API errors.
   * 401 triggers logout, 403 returns forbidden error.
   */
  onError: async (error) => {
    // Handle 401 Unauthorized - session expired or invalid
    if (error?.statusCode === 401 || error?.status === 401) {
      // SECURITY (S4-L2): Clear auth config cache on 401 to force a fresh
      // config fetch. This handles cases where the server auth mode changed
      // (e.g., switched from local to keycloak) and the cached mode is stale.
      clearAuthConfigCache();
      return {
        logout: true,
        redirectTo: '/login',
        error: {
          name: 'SessionExpired',
          message: 'Your session has expired. Please log in again.',
        },
      };
    }

    // Handle 403 Forbidden - authenticated but not authorized
    if (error?.statusCode === 403 || error?.status === 403) {
      return {
        error: {
          name: 'Forbidden',
          message: 'You don\'t have permission to access this resource.',
        },
      };
    }

    // Other errors - don't affect auth state
    return {};
  },

  /**
   * Get user permissions/roles.
   * Returns role from user profile.
   * SECURITY (S4-L4): Uses shared cache to prevent redundant API calls.
   */
  getPermissions: async () => {
    const data = await fetchMe();
    if (!data) {
      return [];
    }

    // Return role as array for Refine's permission system
    return [data.user.role];
  },
};

export default localAuthProvider;
