/**
 * useAuth Hook
 *
 * Mode-aware authentication hook that works with both local and Keycloak auth modes.
 * Uses Refine's auth provider abstraction for mode-agnostic operations.
 * Provides a simple interface for components to interact with auth.
 */
import { useCallback } from "react";
import { useIsAuthenticated, useGetIdentity, useLogout, useLogin } from "@refinedev/core";
import { getAuthConfigSync } from "../config";
import { userManager } from "../providers/keycloakAuthProvider";
import type { UserIdentity } from "../types/auth";
import { sanitizeError } from "../utils/sanitizeError";

/**
 * Authentication state and actions.
 */
export interface AuthState {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Current user information (null if not authenticated) */
  user: UserIdentity | null;
  /** Trigger login flow (mode-aware) */
  login: () => Promise<void>;
  /** Logout and clear session */
  logout: () => Promise<void>;
  /** Get the current access token (for API calls) - only available in Keycloak mode */
  getAccessToken: () => Promise<string | null>;
}

/**
 * Mode-aware hook for authentication state and actions.
 *
 * Works with both local (email/password) and Keycloak (OIDC) authentication modes.
 * Uses Refine's auth hooks internally for mode-agnostic operations.
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isAuthenticated, user, login, logout } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <button onClick={login}>Login</button>;
 *   }
 *
 *   return (
 *     <div>
 *       Hello, {user?.name}!
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthState {
  // Use Refine's auth hooks for mode-agnostic operations
  const { data: authData, isLoading: authLoading } = useIsAuthenticated();
  const { data: identity, isLoading: identityLoading } = useGetIdentity<UserIdentity>();
  const { mutateAsync: refineLogout } = useLogout();
  const { mutateAsync: refineLogin } = useLogin();

  const isLoading = authLoading || identityLoading;
  const isAuthenticated = authData?.authenticated ?? false;
  const user = identity ?? null;

  /**
   * Trigger login flow.
   * In Keycloak mode: Redirects to OIDC authorization endpoint
   * In local mode: Should be called from the Login page with credentials
   */
  const login = useCallback(async () => {
    const authConfig = getAuthConfigSync();

    if (authConfig?.mode === 'keycloak') {
      // Keycloak mode: trigger OIDC redirect
      await userManager.signinRedirect();
    } else {
      // Local mode: this should be called from the login form with credentials
      // This no-op call is for components that just want to trigger navigation to login
      await refineLogin({});
    }
  }, [refineLogin]);

  /**
   * Logout and clear session.
   * Works in both local and Keycloak modes via Refine's auth provider.
   */
  const logout = useCallback(async () => {
    await refineLogout();
  }, [refineLogout]);

  /**
   * Get current access token for API requests.
   * Only available in Keycloak mode - local mode uses cookies.
   *
   * @returns Access token string, or null if not available/expired
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const authConfig = getAuthConfigSync();

    // Local mode uses cookies, not tokens
    if (authConfig?.mode === 'local') {
      console.warn('getAccessToken() called in local mode - cookies handle auth automatically');
      return null;
    }

    // Keycloak mode: get token from OIDC user
    try {
      const oidcUser = await userManager.getUser();
      if (oidcUser && !oidcUser.expired) {
        return oidcUser.access_token;
      }
      // Try to refresh token
      const refreshedUser = await userManager.signinSilent();
      return refreshedUser?.access_token ?? null;
    } catch (error) {
      // SECURITY: Use sanitizeError to prevent token fragments from appearing in console
      console.error("Failed to get/refresh access token:", sanitizeError(error));
      return null;
    }
  }, []);

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    getAccessToken,
  };
}

export default useAuth;
