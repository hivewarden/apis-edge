/**
 * Providers Barrel Export
 *
 * Authentication exports support dual-mode auth (local and Keycloak).
 * Use createAuthProvider(mode) for mode-aware auth provider.
 */

// Auth configuration (from config.ts, re-exported for convenience)
export {
  fetchAuthConfig,
  clearAuthConfigCache,
  getAuthConfigSync,
} from "../config";

// Auth types
export type {
  AuthMode,
  AuthConfig,
  AuthConfigLocal,
  AuthConfigKeycloak,
  UserIdentity,
  LocalLoginParams,
} from "../types/auth";

// Keycloak-specific exports (for SaaS mode and backward compatibility)
export {
  keycloakUserManager,
  userManager,
  loginWithReturnTo,
  keycloakAuthProvider,
} from "./keycloakAuthProvider";

// Local auth provider (for local mode)
export { localAuthProvider } from "./localAuthProvider";

// Mode-aware auth provider factory
export {
  createAuthProvider,
  authProvider, // Deprecated: use createAuthProvider instead
} from "./refineAuthProvider";

// Data providers
export { apiClient } from "./apiClient";
export { authenticatedDataProvider } from "./dataProvider";
