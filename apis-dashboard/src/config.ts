/**
 * Application Configuration
 *
 * Centralized configuration values from environment variables.
 * All environment-based config should be defined here.
 */

/**
 * API server base URL.
 * Used by data provider and API client for all backend requests.
 */
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/**
 * Zitadel OIDC configuration.
 * Used by auth provider for authentication.
 */
export const ZITADEL_AUTHORITY = import.meta.env.VITE_ZITADEL_AUTHORITY || "http://localhost:8080";
export const ZITADEL_CLIENT_ID = import.meta.env.VITE_ZITADEL_CLIENT_ID || "";
