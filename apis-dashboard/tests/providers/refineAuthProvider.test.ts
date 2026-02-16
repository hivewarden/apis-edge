/**
 * Refine Auth Provider Tests
 *
 * Tests for the mode-aware auth provider factory and DEV_MODE behavior.
 * Part of Epic 13, Story 13.5: Retrofit Auth Provider
 * Updated for Epic 15, Story 15.5: Keycloak Migration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original module values for reset
let mockDevMode = false;

// Mock config module
vi.mock('../../src/config', () => ({
  get DEV_MODE() {
    return mockDevMode;
  },
  API_URL: 'http://localhost:3000/api',
  getAuthConfigSync: vi.fn(),
  KEYCLOAK_AUTHORITY: 'http://localhost:8081/realms/honeybee',
  KEYCLOAK_CLIENT_ID: 'test-client-id',
}));

// Mock keycloakAuthProvider to avoid OIDC initialization
vi.mock('../../src/providers/keycloakAuthProvider', () => ({
  keycloakAuthProvider: {
    login: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue({ success: true, redirectTo: '/login' }),
    check: vi.fn().mockResolvedValue({ authenticated: true }),
    getIdentity: vi.fn().mockResolvedValue({
      id: 'keycloak-user',
      name: 'Keycloak User',
      email: 'keycloak@example.com',
    }),
    onError: vi.fn().mockResolvedValue({}),
    getPermissions: vi.fn().mockResolvedValue(['member']),
  },
  keycloakUserManager: {
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
  },
  userManager: {
    getUser: vi.fn(),
    removeUser: vi.fn(),
  },
  loginWithReturnTo: vi.fn(),
}));

// Mock localAuthProvider
vi.mock('../../src/providers/localAuthProvider', () => ({
  localAuthProvider: {
    login: vi.fn().mockResolvedValue({ success: true, redirectTo: '/' }),
    logout: vi.fn().mockResolvedValue({ success: true, redirectTo: '/login' }),
    check: vi.fn().mockResolvedValue({ authenticated: true }),
    getIdentity: vi.fn().mockResolvedValue({
      id: 'local-user',
      name: 'Local User',
      email: 'local@example.com',
    }),
    onError: vi.fn().mockResolvedValue({}),
    getPermissions: vi.fn().mockResolvedValue(['admin']),
  },
}));

describe('refineAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDevMode = false;
    // Reset modules to pick up new mock values
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAuthProvider', () => {
    it('returns localAuthProvider when mode is "local"', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { localAuthProvider } = await import(
        '../../src/providers/localAuthProvider'
      );

      const provider = createAuthProvider('local');

      await provider.login({ email: 'test@test.com', password: 'pass' });
      expect(localAuthProvider.login).toHaveBeenCalled();
    });

    it('returns keycloakAuthProvider when mode is "keycloak"', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { keycloakAuthProvider } = await import(
        '../../src/providers/keycloakAuthProvider'
      );

      const provider = createAuthProvider('keycloak');

      await provider.login({});
      expect(keycloakAuthProvider.login).toHaveBeenCalled();
    });

    it('returns devAuthProvider in DEV_MODE regardless of mode param', async () => {
      mockDevMode = true;
      vi.resetModules();

      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      // Even when passing 'local' or 'keycloak', DEV_MODE should take precedence
      const provider = createAuthProvider('local');

      const result = await provider.check();
      expect(result.authenticated).toBe(true);

      // login should return success immediately (mock dev behavior)
      const loginResult = await provider.login({});
      expect(loginResult.success).toBe(true);
    });
  });

  describe('DEV_MODE auth provider', () => {
    beforeEach(async () => {
      mockDevMode = true;
      vi.resetModules();
    });

    it('login returns success immediately', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.login({});

      expect(result.success).toBe(true);
    });

    it('logout redirects to login', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.logout();

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/login');
    });

    it('check returns always authenticated', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.check();

      expect(result.authenticated).toBe(true);
    });

    it('getIdentity returns DEV_USER', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.getIdentity();

      expect(result).toEqual({
        id: 'dev-user-001',
        name: 'Dev User',
        email: 'dev@apis.local',
        avatar: undefined,
      });
    });

    it('getPermissions returns admin role', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.getPermissions();

      expect(result).toEqual(['admin']);
    });

    it('onError returns empty object', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const provider = createAuthProvider('local');
      const result = await provider.onError({ statusCode: 401 });

      expect(result).toEqual({});
    });
  });

  describe('legacy authProvider export', () => {
    it('exports authProvider for backward compatibility', async () => {
      const { authProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      expect(authProvider).toBeDefined();
      expect(authProvider.login).toBeDefined();
      expect(authProvider.logout).toBeDefined();
      expect(authProvider.check).toBeDefined();
      expect(authProvider.getIdentity).toBeDefined();
      expect(authProvider.onError).toBeDefined();
      expect(authProvider.getPermissions).toBeDefined();
    });

    it('authProvider uses devAuthProvider when DEV_MODE=true', async () => {
      mockDevMode = true;
      vi.resetModules();

      const { authProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );

      const result = await authProvider.check();
      expect(result.authenticated).toBe(true);

      const identity = await authProvider.getIdentity();
      expect(identity?.id).toBe('dev-user-001');
    });
  });

  describe('mode switching', () => {
    it('local mode provider calls correct endpoints', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { localAuthProvider } = await import(
        '../../src/providers/localAuthProvider'
      );

      const provider = createAuthProvider('local');

      await provider.check();
      expect(localAuthProvider.check).toHaveBeenCalled();

      await provider.getIdentity();
      expect(localAuthProvider.getIdentity).toHaveBeenCalled();
    });

    it('keycloak mode provider uses OIDC methods', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { keycloakAuthProvider } = await import(
        '../../src/providers/keycloakAuthProvider'
      );

      const provider = createAuthProvider('keycloak');

      await provider.check();
      expect(keycloakAuthProvider.check).toHaveBeenCalled();

      await provider.getIdentity();
      expect(keycloakAuthProvider.getIdentity).toHaveBeenCalled();
    });
  });

  describe('mode initialization integration', () => {
    it('creates local auth provider when fetchAuthConfig returns local mode', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { localAuthProvider } = await import(
        '../../src/providers/localAuthProvider'
      );

      // Simulate what App.tsx does: fetch config then create provider
      const mockConfig = { mode: 'local' as const, setup_required: false };
      const provider = createAuthProvider(mockConfig.mode);

      // Verify it uses the local auth provider
      await provider.login({ email: 'test@test.com', password: 'test' });
      expect(localAuthProvider.login).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'test',
      });
    });

    it('creates keycloak auth provider when fetchAuthConfig returns keycloak mode', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { keycloakAuthProvider } = await import(
        '../../src/providers/keycloakAuthProvider'
      );

      // Simulate what App.tsx does: fetch config then create provider
      const mockConfig = {
        mode: 'keycloak' as const,
        keycloak_authority: 'https://keycloak.example.com/realms/honeybee',
        client_id: 'apis-dashboard',
      };
      const provider = createAuthProvider(mockConfig.mode);

      // Verify it uses the keycloak auth provider
      await provider.login({});
      expect(keycloakAuthProvider.login).toHaveBeenCalled();
    });

    it('auth provider maintains correct behavior across multiple operations', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { localAuthProvider } = await import(
        '../../src/providers/localAuthProvider'
      );

      const provider = createAuthProvider('local');

      // Simulate a typical auth flow
      // 1. Check if authenticated
      const checkResult = await provider.check();
      expect(checkResult.authenticated).toBe(true);
      expect(localAuthProvider.check).toHaveBeenCalled();

      // 2. Get user identity
      const identity = await provider.getIdentity();
      expect(identity).toEqual({
        id: 'local-user',
        name: 'Local User',
        email: 'local@example.com',
      });
      expect(localAuthProvider.getIdentity).toHaveBeenCalled();

      // 3. Get permissions
      const permissions = await provider.getPermissions();
      expect(permissions).toEqual(['admin']);
      expect(localAuthProvider.getPermissions).toHaveBeenCalled();

      // 4. Handle an error
      await provider.onError({ statusCode: 500 });
      expect(localAuthProvider.onError).toHaveBeenCalled();
    });

    it('provider mode is immutable after creation', async () => {
      const { createAuthProvider } = await import(
        '../../src/providers/refineAuthProvider'
      );
      const { localAuthProvider } = await import(
        '../../src/providers/localAuthProvider'
      );
      const { keycloakAuthProvider } = await import(
        '../../src/providers/keycloakAuthProvider'
      );

      // Create a local provider
      const localProvider = createAuthProvider('local');

      // Create a keycloak provider
      const keycloakProvider = createAuthProvider('keycloak');

      // Both should work independently
      await localProvider.check();
      expect(localAuthProvider.check).toHaveBeenCalled();

      await keycloakProvider.check();
      expect(keycloakAuthProvider.check).toHaveBeenCalled();

      // Creating a new provider doesn't affect the old one
      vi.clearAllMocks();
      await localProvider.login({ email: 'a@b.com', password: 'x' });
      expect(localAuthProvider.login).toHaveBeenCalled();
      expect(keycloakAuthProvider.login).not.toHaveBeenCalled();
    });
  });
});
