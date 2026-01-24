/**
 * useAuth Hook
 *
 * Custom hook for accessing authentication state and actions.
 * Provides a simple interface for components to interact with auth.
 */
import { useState, useEffect, useCallback } from "react";
import type { User } from "oidc-client-ts";
import { zitadelAuth, userManager } from "../providers/authProvider";

/**
 * User identity information extracted from JWT claims.
 */
export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

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
  /** Trigger OIDC login flow */
  login: () => Promise<void>;
  /** Logout and clear session */
  logout: () => Promise<void>;
  /** Get the current access token (for API calls) */
  getAccessToken: () => Promise<string | null>;
}

/**
 * Hook for authentication state and actions.
 *
 * @example
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
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check auth status on mount and subscribe to user changes
  useEffect(() => {
    const loadUser = async () => {
      try {
        const oidcUser = await userManager.getUser();
        updateUserState(oidcUser);
      } catch (error) {
        console.error("Failed to load user:", error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();

    // Subscribe to user loaded events (after login or token refresh)
    const handleUserLoaded = (oidcUser: User) => {
      updateUserState(oidcUser);
    };

    // Subscribe to user unloaded events (after logout or session end)
    const handleUserUnloaded = () => {
      setUser(null);
      setIsAuthenticated(false);
    };

    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);

    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
    };
  }, []);

  /**
   * Update user state from OIDC user object.
   */
  const updateUserState = (oidcUser: User | null) => {
    if (oidcUser && !oidcUser.expired) {
      setUser({
        id: oidcUser.profile.sub,
        name: oidcUser.profile.name || oidcUser.profile.preferred_username || "User",
        email: oidcUser.profile.email || "",
        avatar: oidcUser.profile.picture,
      });
      setIsAuthenticated(true);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  /**
   * Trigger OIDC login flow.
   * Redirects to Zitadel login page.
   */
  const login = useCallback(async () => {
    await zitadelAuth.authorize();
  }, []);

  /**
   * Logout and clear session.
   * Redirects to Zitadel logout endpoint.
   */
  const logout = useCallback(async () => {
    try {
      await zitadelAuth.signout();
    } catch (error) {
      // Even if signout fails, clear local state
      console.error("Signout failed, clearing local state:", error);
      await userManager.removeUser();
    }
  }, []);

  /**
   * Get current access token for API requests.
   * Returns null if not authenticated or token expired.
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const oidcUser = await userManager.getUser();
      if (oidcUser && !oidcUser.expired) {
        return oidcUser.access_token;
      }
      // Try to refresh token (automaticSilentRenew should handle this)
      const refreshedUser = await userManager.signinSilent();
      return refreshedUser?.access_token || null;
    } catch (error) {
      console.error("Failed to get/refresh access token:", error);
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
