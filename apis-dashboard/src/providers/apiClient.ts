/**
 * Axios API Client with Authentication
 *
 * Configured axios instance that handles authentication for both modes:
 * - Local mode: Uses session cookies (credentials: 'include') + CSRF tokens
 * - Keycloak mode: Attaches Bearer token from OIDC session
 *
 * SECURITY (AUTH-001-7-DASH): Includes CSRF token in state-changing requests
 * for local auth mode to prevent Cross-Site Request Forgery attacks.
 */
import axios from "axios";
import { message } from "antd";
import { userManager } from "./keycloakAuthProvider";
import { API_URL, getAuthConfigSync, DEV_MODE } from "../config";
import { sanitizeString } from "../utils/sanitizeError";
import { getCsrfToken, CSRF_HEADER_NAME } from "../utils/csrf";

/**
 * Extend Axios request config to include retry flag.
 * SECURITY (S4-H4): Used by the token refresh mutex to prevent infinite retry loops.
 */
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

/**
 * Axios instance configured for APIS server communication.
 * Supports both cookie-based (local) and Bearer token (Keycloak) auth.
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // Enable cookies for cross-origin requests (needed for local auth)
  withCredentials: true,
});

/**
 * HTTP methods that require CSRF protection (state-changing requests).
 */
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Request interceptor to handle authentication.
 *
 * In local mode: Relies on withCredentials for cookie auth + CSRF tokens
 * In Keycloak mode: Attaches Bearer token from OIDC session
 *
 * SECURITY (AUTH-001-7-DASH): Adds CSRF token to state-changing requests
 * in local auth mode to prevent Cross-Site Request Forgery attacks.
 *
 * Note: On initial app load, authConfig may be null before fetchAuthConfig()
 * completes. In this case, we proceed without a token - the server will
 * return 401 if auth is required, triggering proper authentication flow.
 */
apiClient.interceptors.request.use(
  async (config) => {
    // DEV_MODE: No auth needed
    if (DEV_MODE) {
      return config;
    }

    const authConfig = getAuthConfigSync();

    // If auth config is not yet loaded, proceed with request
    // - For local mode: cookies will handle auth via withCredentials
    // - For Keycloak mode: if user is already logged in, token will be added
    // - If not authenticated, server returns 401 which triggers login
    if (!authConfig) {
      // SECURITY (S4-M5): Only attempt Keycloak token fetch if we have
      // evidence this might be a Keycloak deployment (env vars configured).
      // In local-only deployments, skip unnecessary OIDC SDK calls
      // to avoid console errors and wasted computation.
      const hasKeycloakConfig = !!(
        import.meta.env.VITE_KEYCLOAK_AUTHORITY &&
        import.meta.env.VITE_KEYCLOAK_CLIENT_ID
      );
      if (hasKeycloakConfig) {
        try {
          const user = await userManager.getUser();
          if (user && !user.expired && user.access_token) {
            config.headers.Authorization = `Bearer ${user.access_token}`;
          }
        } catch {
          // Ignore - cookies may handle auth or server will return 401
        }
      }
      return config;
    }

    // Local mode: Cookies handle auth via withCredentials (already set)
    // Also add CSRF token for state-changing requests (AUTH-001-7-DASH)
    if (authConfig.mode === 'local') {
      const method = config.method?.toUpperCase() ?? '';
      if (CSRF_PROTECTED_METHODS.includes(method)) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          config.headers[CSRF_HEADER_NAME] = csrfToken;
        }
      }
    }

    // Keycloak mode: Attach Bearer token
    if (authConfig.mode === 'keycloak') {
      try {
        const user = await userManager.getUser();
        if (user && !user.expired && user.access_token) {
          config.headers.Authorization = `Bearer ${user.access_token}`;
        }
      } catch {
        // If we can't get the user, proceed without token
        // The server will return 401 and trigger re-authentication
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Token refresh mutex for preventing concurrent refresh attempts.
 * SECURITY (S4-H4): When a 401 is received, only one refresh runs at a time.
 * Other requests wait for the same promise to complete and then retry.
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Response interceptor to handle authentication errors and display notifications.
 * On 401/403, the user will be redirected to login via Refine's authProvider.
 * Other errors are displayed to the user via Ant Design message notification.
 *
 * SECURITY: Error messages are sanitized to prevent token exposure in console/UI.
 * SECURITY (S4-H4): Uses refresh mutex to prevent concurrent token refresh attempts.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    // Handle 401 with token refresh (Keycloak mode only)
    // SECURITY (S4-H4): Mutex prevents concurrent refresh attempts
    if (status === 401 && !originalRequest._retry) {
      const authConfig = getAuthConfigSync();

      if (authConfig?.mode === 'keycloak') {
        originalRequest._retry = true;

        // If no refresh is in progress, start one
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const user = await userManager.getUser();
              if (user && !user.expired && user.access_token) {
                return user.access_token;
              }
              return null;
            } catch {
              return null;
            } finally {
              refreshPromise = null;
            }
          })();
        }

        // All concurrent 401s wait for the same refresh promise
        const token = await refreshPromise;
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        }
      }
    }

    // Don't show notifications for auth errors - Refine handles those
    if (status !== 401 && status !== 403) {
      // Extract error message from response or use default
      // SECURITY: Sanitize error message to prevent token exposure
      const rawMessage =
        error.response?.data?.error ||
        error.message ||
        "An unexpected error occurred";

      const errorMessage = sanitizeString(rawMessage);
      message.error(errorMessage);
    }

    // Let the error propagate - Refine's onError will handle 401s/403s
    return Promise.reject(error);
  }
);

export default apiClient;
