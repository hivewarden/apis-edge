/**
 * Mode-Aware Refine AuthProvider
 *
 * Factory for creating the appropriate auth provider based on auth mode.
 * Supports both local (email/password) and SaaS (Keycloak OIDC) authentication.
 *
 * DEV MODE: When VITE_DEV_MODE=true, authentication is bypassed entirely
 * and mock user data is returned. This matches DISABLE_AUTH on the server.
 */
import type { AuthProvider } from "@refinedev/core";
import { localAuthProvider } from "./localAuthProvider";
import { keycloakAuthProvider } from "./keycloakAuthProvider";
import { DEV_MODE } from "../config";
import type { AuthMode, UserIdentity } from "../types/auth";

/**
 * DEV MODE: Mock user data matching the server's DevAuthMiddleware.
 * Used when VITE_DEV_MODE=true to bypass all authentication.
 */
const DEV_USER: UserIdentity = {
  id: "dev-user-001",
  name: "Dev User",
  email: "dev@apis.local",
  avatar: undefined,
  tenant_id: "dev-tenant-001", // Story 14.16: Offline Task Support
};

/**
 * DEV MODE auth provider that bypasses all authentication.
 * Returns mock data for development without running auth services.
 */
const devAuthProvider: AuthProvider = {
  login: async () => {
    console.warn("⚠️ DEV MODE: Authentication bypassed");
    return { success: true };
  },
  logout: async () => {
    return { success: true, redirectTo: "/login" };
  },
  check: async () => {
    return { authenticated: true };
  },
  getIdentity: async () => {
    return DEV_USER;
  },
  onError: async () => {
    return {};
  },
  getPermissions: async () => {
    return ["admin"];
  },
};

/**
 * Create an auth provider based on the authentication mode.
 *
 * @param mode - The authentication mode ('local' or 'keycloak')
 * @returns AuthProvider - The appropriate auth provider for the mode
 *
 * @example
 * ```typescript
 * const config = await fetchAuthConfig();
 * const authProvider = createAuthProvider(config.mode);
 * ```
 */
export function createAuthProvider(mode: AuthMode): AuthProvider {
  // DEV_MODE takes precedence over everything
  if (DEV_MODE) {
    console.warn("⚠️ DEV MODE: Using mock auth provider (VITE_DEV_MODE=true)");
    return devAuthProvider;
  }

  return mode === 'local' ? localAuthProvider : keycloakAuthProvider;
}

/**
 * Legacy authProvider export for backward compatibility.
 *
 * SECURITY (S4-L1): This always falls back to Keycloak provider regardless of
 * configured auth mode, which causes auth failures in local mode. Use
 * createAuthProvider(mode) instead, which correctly selects the provider
 * based on the configured auth mode.
 *
 * @deprecated Use createAuthProvider(mode) for mode-aware auth
 */
export const authProvider: AuthProvider = DEV_MODE ? devAuthProvider : new Proxy(keycloakAuthProvider, {
  get(target, prop, receiver) {
    if (typeof prop === 'string' && typeof target[prop as keyof AuthProvider] === 'function') {
      console.warn(
        `[DEPRECATED] authProvider.${prop}() called. ` +
        'Use createAuthProvider(mode) instead of the deprecated authProvider export. ' +
        'This legacy export always uses Keycloak auth regardless of configured mode.'
      );
    }
    return Reflect.get(target, prop, receiver);
  },
});

// Re-export providers for direct access if needed
export { localAuthProvider } from "./localAuthProvider";
export { keycloakAuthProvider } from "./keycloakAuthProvider";

export default authProvider;
