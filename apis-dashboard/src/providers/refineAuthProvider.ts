/**
 * Refine AuthProvider for Zitadel OIDC
 *
 * Implements Refine's AuthProvider interface using Zitadel for authentication.
 * This bridges Zitadel's OIDC capabilities with Refine's auth system.
 */
import type { AuthProvider } from "@refinedev/core";
import { zitadelAuth, userManager } from "./authProvider";

/**
 * Refine-compatible authentication provider.
 *
 * Methods:
 * - login: Triggers OIDC authorization flow
 * - logout: Signs out and clears session
 * - check: Verifies if user is authenticated
 * - getIdentity: Returns current user information
 * - onError: Handles API errors (401 triggers re-auth)
 */
export const authProvider: AuthProvider = {
  /**
   * Trigger OIDC login flow.
   * Redirects to Zitadel authorization endpoint.
   */
  login: async () => {
    try {
      await zitadelAuth.authorize();
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
   * Redirects to Zitadel logout endpoint.
   */
  logout: async () => {
    try {
      await zitadelAuth.signout();
      return { success: true, redirectTo: "/login" };
    } catch (error) {
      // Even on error, remove local user and redirect
      await userManager.removeUser();
      return { success: true, redirectTo: "/login" };
    }
  },

  /**
   * Check if user is authenticated.
   * Used by Refine to protect routes and determine auth state.
   * Note: automaticSilentRenew is enabled in config, so we don't need manual refresh here.
   */
  check: async () => {
    try {
      const user = await userManager.getUser();

      if (user && !user.expired) {
        return { authenticated: true };
      }

      // User not authenticated or token expired
      // automaticSilentRenew will handle refresh, but if we get here the token is gone
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
  getIdentity: async () => {
    try {
      const user = await userManager.getUser();

      if (user && !user.expired) {
        return {
          id: user.profile.sub,
          name: user.profile.name || user.profile.preferred_username || "User",
          email: user.profile.email,
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
   * Can be used for role-based access control.
   */
  getPermissions: async () => {
    try {
      const user = await userManager.getUser();
      if (user && !user.expired) {
        // Extract roles from Zitadel claims
        const roles = user.profile["urn:zitadel:iam:user:roles"] as string[] | undefined;
        return roles || [];
      }
      return [];
    } catch {
      return [];
    }
  },
};

export default authProvider;
