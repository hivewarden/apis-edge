/**
 * Authentication Type Definitions
 *
 * Types for dual-mode authentication supporting both local (email/password)
 * and SaaS (Keycloak OIDC) authentication modes.
 */

/**
 * Authentication modes supported by the application.
 * - 'local': Email/password authentication with session cookies
 * - 'keycloak': OIDC authentication via Keycloak identity provider
 */
export type AuthMode = 'local' | 'keycloak';

/**
 * Auth configuration for local mode.
 * Local mode uses email/password authentication with session cookies.
 */
export interface AuthConfigLocal {
  mode: 'local';
  /** True if initial admin setup is required (no users exist) */
  setup_required: boolean;
}

/**
 * Auth configuration for Keycloak (SaaS) mode.
 * Keycloak mode uses OIDC authentication with redirect flow.
 */
export interface AuthConfigKeycloak {
  mode: 'keycloak';
  /** Keycloak realm authority URL (e.g. https://keycloak.example.com/realms/honeybee) */
  keycloak_authority: string;
  /** OIDC client ID for this application */
  client_id: string;
}

/**
 * Union type for auth configuration.
 * Use type narrowing with `config.mode` to access mode-specific fields.
 *
 * @example
 * ```typescript
 * const config = await fetchAuthConfig();
 * if (config.mode === 'local') {
 *   console.log('Setup required:', config.setup_required);
 * } else {
 *   console.log('Keycloak authority:', config.keycloak_authority);
 * }
 * ```
 */
export type AuthConfig = AuthConfigLocal | AuthConfigKeycloak;

/**
 * User identity returned by getIdentity in auth providers.
 * Compatible with Refine's identity interface.
 *
 * @example
 * ```typescript
 * const identity: UserIdentity = {
 *   id: 'user-123',
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   avatar: 'https://example.com/avatar.jpg', // optional
 * };
 * ```
 */
export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  /** Tenant ID for multi-tenant isolation (Story 14.16: Offline Task Support) */
  tenant_id?: string;
}

/**
 * Login parameters for local authentication.
 * Used with localAuthProvider.login() method.
 *
 * @example
 * ```typescript
 * // Basic login
 * await authProvider.login({
 *   email: 'user@example.com',
 *   password: 'securePassword123',
 * });
 *
 * // Login with remember me
 * await authProvider.login({
 *   email: 'user@example.com',
 *   password: 'securePassword123',
 *   rememberMe: true,
 * });
 * ```
 */
export interface LocalLoginParams {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * User data returned from /api/auth/me endpoint.
 * Contains full user profile with role and tenant information.
 *
 * @example
 * ```typescript
 * const user: AuthUser = {
 *   id: 'user-123',
 *   email: 'admin@example.com',
 *   name: 'Admin User',
 *   role: 'admin',
 *   tenant_id: 'tenant-456',
 * };
 * ```
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  tenant_id: string;
}

/**
 * Response from /api/auth/login endpoint.
 * Contains the authenticated user after successful login.
 *
 * @example
 * ```typescript
 * // Successful login response
 * const response: LoginResponse = {
 *   user: {
 *     id: 'user-123',
 *     email: 'user@example.com',
 *     name: 'John Doe',
 *     role: 'member',
 *     tenant_id: 'tenant-456',
 *   },
 * };
 * ```
 */
export interface LoginResponse {
  user: AuthUser;
}

/**
 * Response from /api/auth/me endpoint.
 * Used to validate session and get current user info.
 *
 * @example
 * ```typescript
 * // GET /api/auth/me response
 * const response: MeResponse = {
 *   user: {
 *     id: 'user-123',
 *     email: 'user@example.com',
 *     name: 'John Doe',
 *     role: 'admin',
 *     tenant_id: 'tenant-456',
 *   },
 * };
 * ```
 */
export interface MeResponse {
  user: AuthUser;
}
