/**
 * Auth Test Utilities for Dual-Mode Testing
 *
 * Provides utilities for testing components in both local and Keycloak auth modes.
 * These utilities help ensure consistent test setup across the test suite.
 *
 * Story: 13-22 - Dual-Mode CI Testing
 * Updated for Epic 15, Story 15.5: Keycloak Migration
 */

import { vi } from 'vitest';

/**
 * Auth configuration types matching the server response
 */
export interface LocalAuthConfig {
  mode: 'local';
  setup_required: boolean;
}

export interface KeycloakAuthConfig {
  mode: 'keycloak';
  keycloak_authority: string;
  client_id: string;
}

export type AuthConfig = LocalAuthConfig | KeycloakAuthConfig;

/**
 * Test constants for auth configuration
 */
export const TEST_KEYCLOAK_AUTHORITY = 'https://keycloak.example.com/realms/honeybee';
export const TEST_KEYCLOAK_CLIENT_ID = 'apis-dashboard';

/**
 * Creates a mock auth config for local mode.
 * Use this when testing components that should render local auth UI.
 *
 * @param setupRequired - Whether setup wizard is required (default: false)
 * @returns LocalAuthConfig object
 *
 * @example
 * mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig());
 */
export function mockLocalAuthConfig(setupRequired = false): LocalAuthConfig {
  return {
    mode: 'local',
    setup_required: setupRequired,
  };
}

/**
 * Creates a mock auth config for Keycloak (SaaS) mode.
 * Use this when testing components that should render Keycloak SSO UI.
 *
 * @param authority - Keycloak authority URL (default: TEST_KEYCLOAK_AUTHORITY)
 * @param clientId - Keycloak client ID (default: TEST_KEYCLOAK_CLIENT_ID)
 * @returns KeycloakAuthConfig object
 *
 * @example
 * mockFetchAuthConfig.mockResolvedValue(mockKeycloakAuthConfig());
 */
export function mockKeycloakAuthConfig(
  authority = TEST_KEYCLOAK_AUTHORITY,
  clientId = TEST_KEYCLOAK_CLIENT_ID
): KeycloakAuthConfig {
  return {
    mode: 'keycloak',
    keycloak_authority: authority,
    client_id: clientId,
  };
}


/**
 * User roles for testing
 */
export type UserRole = 'admin' | 'member';

/**
 * Mock user interface for tests
 */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string;
  is_super_admin?: boolean;
}

/**
 * Creates a mock user for testing.
 * This simulates the user object returned from /api/auth/me.
 *
 * @param options - User override options
 * @returns MockUser object
 *
 * @example
 * const user = createMockUser({ role: 'admin' });
 */
export function createMockUser(options?: Partial<MockUser>): MockUser {
  return {
    id: options?.id ?? 'test-user-123',
    email: options?.email ?? 'test@example.com',
    name: options?.name ?? 'Test User',
    role: options?.role ?? 'admin',
    tenant_id: options?.tenant_id ?? '00000000-0000-0000-0000-000000000000',
    is_super_admin: options?.is_super_admin ?? false,
  };
}

/**
 * Creates a mock super admin user for Keycloak mode tests.
 *
 * @param options - User override options
 * @returns MockUser object with is_super_admin=true
 *
 * @example
 * const superAdmin = createMockSuperAdmin();
 */
export function createMockSuperAdmin(options?: Partial<MockUser>): MockUser {
  return createMockUser({
    ...options,
    email: options?.email ?? 'superadmin@example.com',
    name: options?.name ?? 'Super Admin',
    is_super_admin: true,
  });
}

/**
 * Gets the current auth mode from environment variable.
 * Falls back to 'local' if not set (for backwards compatibility).
 *
 * @returns Current auth mode
 */
export function getCurrentAuthMode(): 'local' | 'keycloak' {
  const mode = import.meta.env.VITE_AUTH_MODE;
  return mode === 'keycloak' ? 'keycloak' : 'local';
}

/**
 * Returns true if running in local auth mode.
 */
export function isLocalMode(): boolean {
  return getCurrentAuthMode() === 'local';
}

/**
 * Returns true if running in Keycloak auth mode.
 */
export function isKeycloakMode(): boolean {
  return getCurrentAuthMode() === 'keycloak';
}


/**
 * Creates a mock fetchAuthConfig function for tests.
 * The mock can be configured to return different auth configurations.
 *
 * @returns Vi mock function for fetchAuthConfig
 *
 * @example
 * // In test setup:
 * const mockFetchAuthConfig = createMockFetchAuthConfig();
 * vi.mock('../../src/config', () => ({
 *   fetchAuthConfig: () => mockFetchAuthConfig(),
 * }));
 *
 * // In test:
 * mockFetchAuthConfig.mockResolvedValue(mockLocalAuthConfig());
 */
export function createMockFetchAuthConfig() {
  return vi.fn();
}

/**
 * Creates a mock for the auth provider login function.
 *
 * @returns Vi mock function for login
 */
export function createMockLogin() {
  return vi.fn();
}

/**
 * Creates a mock for the loginWithReturnTo function.
 *
 * @returns Vi mock function for loginWithReturnTo
 */
export function createMockLoginWithReturnTo() {
  return vi.fn();
}

/**
 * Skip condition for local mode tests.
 * Use with Vitest's describe.skipIf for conditional test suites.
 *
 * @example
 * describe.skipIf(skipIfNotLocalMode)('Local Mode Features', () => {
 *   // Tests here only run when VITE_AUTH_MODE=local
 * });
 */
export const skipIfNotLocalMode = !isLocalMode();

/**
 * Skip condition for Keycloak mode tests.
 * Use with Vitest's describe.skipIf for conditional test suites.
 *
 * @example
 * describe.skipIf(skipIfNotKeycloakMode)('Keycloak Mode Features', () => {
 *   // Tests here only run when VITE_AUTH_MODE=keycloak
 * });
 */
export const skipIfNotKeycloakMode = !isKeycloakMode();


/**
 * Test data factory for creating consistent test data.
 */
export const TestData = {
  /**
   * Valid credentials for local mode login tests
   */
  validCredentials: {
    email: 'test@example.com',
    password: 'validpassword123',
    rememberMe: false,
  },

  /**
   * Invalid credentials for testing error scenarios
   */
  invalidCredentials: {
    email: 'test@example.com',
    password: 'wrongpassword',
    rememberMe: false,
  },

  /**
   * Invalid email format for validation tests
   */
  invalidEmail: 'not-an-email',

  /**
   * Default tenant ID (matches server DefaultTenantID)
   */
  defaultTenantId: '00000000-0000-0000-0000-000000000000',
};
