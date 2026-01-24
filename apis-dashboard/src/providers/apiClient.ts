/**
 * Axios API Client with Authentication
 *
 * Configured axios instance that automatically attaches
 * the Bearer token to all API requests.
 */
import axios from "axios";
import { message } from "antd";
import { userManager } from "./authProvider";
import { API_URL } from "../config";

/**
 * Axios instance configured for APIS server communication.
 * Automatically attaches Bearer token from OIDC session.
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Request interceptor to attach Bearer token.
 * Gets the current access token from the user manager and adds it to requests.
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const user = await userManager.getUser();
      if (user && !user.expired && user.access_token) {
        config.headers.Authorization = `Bearer ${user.access_token}`;
      }
    } catch {
      // If we can't get the user, proceed without token
      // The server will return 401 and trigger re-authentication
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to handle authentication errors and display notifications.
 * On 401/403, the user will be redirected to login via Refine's authProvider.
 * Other errors are displayed to the user via Ant Design message notification.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Don't show notifications for auth errors - Refine handles those
    if (status !== 401 && status !== 403) {
      // Extract error message from response or use default
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "An unexpected error occurred";

      message.error(errorMessage);
    }

    // Let the error propagate - Refine's onError will handle 401s/403s
    return Promise.reject(error);
  }
);

export default apiClient;
