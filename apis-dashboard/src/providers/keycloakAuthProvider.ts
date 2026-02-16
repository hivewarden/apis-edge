/**
 * Keycloak OIDC Authentication Provider
 *
 * Provides authentication using Keycloak's OIDC implementation via oidc-client-ts.
 * Used in SaaS mode when auth mode is 'keycloak'.
 *
 * This module contains:
 * - Keycloak UserManager configuration
 * - User manager for token/session handling
 * - Refine-compatible auth provider interface
 *
 * SECURITY (AUTH-001-1-DASH): Tokens are stored in-memory only, not in
 * localStorage/sessionStorage, to prevent XSS token theft.
 */
import { UserManager, InMemoryWebStorage, WebStorageStateStore } from "oidc-client-ts";
import type { UserManagerSettings } from "oidc-client-ts";
import type { AuthProvider } from "@refinedev/core";
import { KEYCLOAK_AUTHORITY, KEYCLOAK_CLIENT_ID, getAuthConfigSync } from "../config";
import type { UserIdentity } from "../types/auth";
import { isValidRedirectUrl, getSafeRedirectUrl } from "../utils";
import { cleanupAllAuthData } from "../services/authCleanup";

// ============================================================================
// In-Memory Token Storage (AUTH-001-1-DASH)
// ============================================================================

/**
 * Singleton in-memory storage instance for OIDC state.
 *
 * SECURITY (AUTH-001-1-DASH): This prevents XSS attacks from stealing tokens
 * via localStorage/sessionStorage. Tokens are only held in JavaScript memory
 * and are lost on page refresh.
 *
 * Trade-offs:
 * - More secure: Tokens are not accessible via document.cookie, localStorage, or sessionStorage
 * - Less convenient: User must re-authenticate after page refresh
 * - Mitigated by: Token refresh via refresh tokens (automaticSilentRenew with offline_access scope)
 *
 * We use oidc-client-ts's InMemoryWebStorage which implements the Storage interface.
 */
const inMemoryStorage = new InMemoryWebStorage();

/**
 * WebStorageStateStore wrapper for the in-memory storage.
 * Required for oidc-client-ts userStore configuration.
 */
const inMemoryUserStore = new WebStorageStateStore({ store: inMemoryStorage });

/**
 * Clear all authentication-related storage.
 *
 * SECURITY: This function ensures complete cleanup of auth artifacts on logout.
 * Uses the centralized cleanupAllAuthData service for comprehensive cleanup.
 *
 * Note: This is a synchronous wrapper for logout flow compatibility.
 * The full async cleanup is called in the logout method.
 */
function clearAllAuthStorageSync(): void {
  // Clear in-memory storage for OIDC tokens
  inMemoryStorage.clear();

  // Clear sessionStorage completely - this is where oidc-client-ts stores tokens
  try {
    sessionStorage.clear();
  } catch {
    // sessionStorage may not be available in some contexts
  }

  // Clear localStorage - remove any auth-related keys
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('oidc.') || key.startsWith('apis_auth'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage may not be available in some contexts
  }
}

/**
 * Get the effective Keycloak configuration.
 * In SaaS mode, the authority and client ID may come from /api/auth/config
 * instead of environment variables.
 */
function getKeycloakConfig(): { authority: string; clientId: string } {
  const authConfig = getAuthConfigSync();

  // If we have a cached keycloak config, prefer it
  if (authConfig && authConfig.mode === 'keycloak') {
    return {
      authority: authConfig.keycloak_authority,
      clientId: authConfig.client_id,
    };
  }

  // Fall back to environment variables
  return {
    authority: KEYCLOAK_AUTHORITY,
    clientId: KEYCLOAK_CLIENT_ID,
  };
}

/**
 * Build the Keycloak OIDC UserManager configuration.
 * Configuration sources are prioritized: API config > environment variables.
 *
 * SECURITY (AUTH-001-1-DASH): Uses in-memory storage for tokens instead of
 * localStorage/sessionStorage to prevent XSS token theft.
 *
 * Note: oidc-client-ts enables PKCE S256 by default when response_type is "code".
 */
function createUserManagerConfig(): UserManagerSettings {
  const { authority, clientId } = getKeycloakConfig();

  return {
    // Keycloak realm URL (issuer), e.g. https://keycloak.example.com/realms/honeybee
    authority,

    // Application client ID from Keycloak realm
    client_id: clientId,

    // Where to redirect after successful authentication
    redirect_uri: `${window.location.origin}/callback`,

    // Where to redirect after logout
    post_logout_redirect_uri: `${window.location.origin}/login`,

    // Scopes determine what information we get in the token
    // - openid: Required for OIDC
    // - profile: Get user name, picture, etc.
    // - email: Get user email
    // - offline_access: Get refresh token for token renewal (not iframe-based)
    scope: "openid profile email offline_access",

    // Automatically refresh tokens before they expire using refresh tokens
    automaticSilentRenew: true,

    // Time in seconds before token expiration to trigger silent renew
    accessTokenExpiringNotificationTimeInSeconds: 120,

    // SECURITY (AUTH-001-1-DASH): Store tokens in memory only, not browser storage.
    // This prevents XSS attacks from stealing tokens via localStorage/sessionStorage.
    // Users will need to re-authenticate after page refresh, but refresh token
    // renewal mitigates this for active sessions.
    userStore: inMemoryUserStore,

    // Authorization code flow (PKCE S256 is enabled automatically by oidc-client-ts)
    response_type: "code",
  };
}

// ============================================================================
// Lazy-Initialized UserManager (SECURITY S4-H1)
// ============================================================================

/**
 * Lazily-initialized UserManager instance.
 *
 * SECURITY (S4-H1): Deferred from module load time to avoid using stale/missing config
 * before fetchAuthConfig() completes. Created on first access.
 */
let _userManager: UserManager | null = null;

/**
 * Get or create the UserManager instance (lazy initialization).
 * SECURITY (S4-H1): Defers creation until first use so fetchAuthConfig() can complete.
 */
function getOrCreateUserManager(): UserManager {
  if (!_userManager) {
    _userManager = new UserManager(createUserManagerConfig());
  }
  return _userManager;
}

/**
 * Get the underlying UserManager for advanced operations.
 * The UserManager handles token storage, refresh, and session management.
 * SECURITY (S4-H1): Lazily initialized to avoid stale config.
 */
export function getUserManager(): UserManager {
  return getOrCreateUserManager();
}

/**
 * Lazy proxy for UserManager that defers creation until first use.
 * SECURITY (S4-H1): Prevents using stale/missing config at module load time.
 * All property accesses and method calls are forwarded to the real UserManager.
 */
export const userManager = new Proxy({} as UserManager, {
  get(_target, prop, receiver) {
    const real = getOrCreateUserManager();
    const value = Reflect.get(real, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(real);
    }
    return value;
  },
  set(_target, prop, value, receiver) {
    const real = getOrCreateUserManager();
    return Reflect.set(real, prop, value, receiver);
  },
});

/**
 * Alias export for backward compatibility.
 * Provides access to the UserManager directly since we no longer use
 * the previous SDK wrapper.
 */
export const keycloakUserManager = userManager;

/**
 * Login with return URL support.
 * Stores the returnTo URL in OIDC state so it can be retrieved after callback.
 *
 * SECURITY: Validates returnTo URL to prevent open redirect attacks (CSRF-001-2).
 * Only same-origin URLs are allowed as redirect targets.
 *
 * @param returnTo - URL to redirect to after successful login (optional)
 */
export async function loginWithReturnTo(returnTo?: string): Promise<void> {
  // Validate returnTo URL to prevent open redirect attacks (CSRF-001-2)
  // Only allow same-origin URLs to prevent malicious redirects
  const safeReturnTo = returnTo && isValidRedirectUrl(returnTo)
    ? returnTo
    : undefined;

  const state = safeReturnTo ? { returnTo: safeReturnTo } : undefined;
  await userManager.signinRedirect({ state });
}

/**
 * Process callback and extract safe redirect URL from OIDC state.
 *
 * SECURITY: Validates the returnTo URL from state to prevent open redirect attacks.
 * Even if an attacker managed to inject a malicious URL into state, this validation
 * ensures we only redirect to same-origin URLs.
 *
 * @param state - OIDC state object from callback
 * @returns Safe redirect URL (same-origin only) or default path
 */
export function getSafeReturnToFromState(state: unknown): string {
  if (state && typeof state === 'object' && 'returnTo' in state) {
    const returnTo = (state as { returnTo: unknown }).returnTo;
    if (typeof returnTo === 'string') {
      return getSafeRedirectUrl(returnTo, '/');
    }
  }
  return '/';
}

/**
 * Keycloak-specific Refine AuthProvider implementation.
 *
 * Implements all Refine AuthProvider methods using Keycloak OIDC:
 * - login: Triggers OIDC authorization redirect
 * - logout: Signs out and clears session
 * - check: Verifies token validity
 * - getIdentity: Returns user from OIDC claims
 * - onError: Handles 401/403 errors
 * - getPermissions: Extracts roles from Keycloak realm_access.roles
 */
export const keycloakAuthProvider: AuthProvider = {
  /**
   * Trigger OIDC login flow.
   * Redirects to Keycloak authorization endpoint.
   */
  login: async () => {
    try {
      await userManager.signinRedirect();
      // Note: This won't actually return - user is redirected
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: "Failed to initiate login",
        },
      };
    }
  },

  /**
   * Logout and terminate session.
   * Clears all local storage, revokes tokens, and redirects to Keycloak logout endpoint.
   *
   * SECURITY:
   * - Ensures complete cleanup of auth state to prevent session persistence
   * - PWA-001-5-INFRA: Clears IndexedDB, localStorage, sessionStorage, SW caches
   */
  logout: async () => {
    // Clear synchronous storage first for immediate cleanup
    clearAllAuthStorageSync();

    try {
      // Attempt to revoke tokens server-side before signing out
      // This invalidates the tokens immediately rather than waiting for expiry
      try {
        await userManager.revokeTokens();
      } catch {
        // Token revocation is best-effort - continue with logout even if it fails
        // The server will eventually reject expired tokens anyway
      }

      // Clear all cached data (PWA-001-5-INFRA)
      // This is async but we don't wait for it to complete before redirect
      try {
        await cleanupAllAuthData();
      } catch {
        // Cleanup errors should not prevent logout
      }

      await userManager.signoutRedirect();
      return { success: true, redirectTo: "/login" };
    } catch {
      // Even on error, remove local user and redirect
      await userManager.removeUser();
      return { success: true, redirectTo: "/login" };
    }
  },

  /**
   * Check if user is authenticated.
   * Used by Refine to protect routes and determine auth state.
   */
  check: async () => {
    try {
      const user = await userManager.getUser();

      if (user && !user.expired) {
        return { authenticated: true };
      }

      // User not authenticated or token expired
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
      };
    } catch {
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
      };
    }
  },

  /**
   * Get current user identity.
   * Returns user information for display in UI.
   */
  getIdentity: async (): Promise<UserIdentity | null> => {
    try {
      const user = await userManager.getUser();

      if (user && !user.expired) {
        return {
          id: user.profile.sub,
          name: user.profile.name || user.profile.preferred_username || "User",
          email: user.profile.email || "",
          avatar: user.profile.picture,
        };
      }

      return null;
    } catch {
      return null;
    }
  },

  /**
   * Handle API errors.
   * 401 errors trigger logout and re-authentication.
   */
  onError: async (error) => {
    // Handle 401 Unauthorized - token expired or invalid
    if (error?.statusCode === 401 || error?.status === 401) {
      return {
        logout: true,
        redirectTo: "/login",
        error: {
          name: "SessionExpired",
          message: "Your session has expired. Please log in again.",
        },
      };
    }

    // Handle 403 Forbidden - authenticated but not authorized
    if (error?.statusCode === 403 || error?.status === 403) {
      return {
        error: {
          name: "Forbidden",
          message: "You don't have permission to access this resource.",
        },
      };
    }

    // Other errors - don't affect auth state
    return {};
  },

  /**
   * Get user permissions/roles.
   * Extracts roles from Keycloak's realm_access.roles claim structure.
   *
   * In Keycloak JWTs, roles live in a nested structure:
   * { "realm_access": { "roles": ["admin", "user"] } }
   */
  getPermissions: async () => {
    try {
      const user = await userManager.getUser();
      if (user && !user.expired) {
        // Extract roles from Keycloak's realm_access claim
        const realmAccess = user.profile["realm_access"] as { roles?: string[] } | undefined;
        const roles = realmAccess?.roles ?? [];
        return roles;
      }
      return [];
    } catch {
      return [];
    }
  },
};

export default keycloakAuthProvider;
