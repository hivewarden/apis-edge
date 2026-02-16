/**
 * Local Auth Provider Tests
 *
 * Tests for localAuthProvider (email/password authentication).
 * Part of Epic 13, Story 13.5: Retrofit Auth Provider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localAuthProvider } from '../../src/providers/localAuthProvider';
import type { LocalLoginParams, AuthUser } from '../../src/types/auth';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock API_URL
vi.mock('../../src/config', () => ({
  API_URL: 'http://localhost:3000/api',
}));

describe('localAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('successfully logs in with valid credentials', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        tenant_id: 'tenant-123',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await localAuthProvider.login(params);

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
            remember_me: undefined,
          }),
        })
      );
    });

    it('sends remember_me flag when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: {} }),
      });

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'password123',
        rememberMe: true,
      };

      await localAuthProvider.login(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
            remember_me: true,
          }),
        })
      );
    });

    it('returns error on invalid credentials (401)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid email or password' }),
      });

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const result = await localAuthProvider.login(params);

      expect(result.success).toBe(false);
      expect(result.error?.name).toBe('InvalidCredentials');
      expect(result.error?.message).toBe('Invalid email or password');
    });

    it('returns error on rate limiting (429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({ error: 'Too many attempts. Please wait 15 minutes.' }),
      });

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await localAuthProvider.login(params);

      expect(result.success).toBe(false);
      expect(result.error?.name).toBe('RateLimited');
      expect(result.error?.message).toContain('Too many');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await localAuthProvider.login(params);

      expect(result.success).toBe(false);
      expect(result.error?.name).toBe('NetworkError');
      expect(result.error?.message).toContain('Failed to connect');
    });

    it('handles server error (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const params: LocalLoginParams = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await localAuthProvider.login(params);

      expect(result.success).toBe(false);
      expect(result.error?.name).toBe('LoginError');
    });
  });

  describe('logout', () => {
    it('calls logout endpoint and redirects to login', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await localAuthProvider.logout();

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/login');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('redirects to login even on logout failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await localAuthProvider.logout();

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/login');
    });
  });

  describe('check', () => {
    it('returns authenticated when session is valid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            user: {
              id: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
              role: 'admin',
              tenant_id: 'tenant-123',
            },
          }),
      });

      const result = await localAuthProvider.check();

      expect(result.authenticated).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/me',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('returns not authenticated when session is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await localAuthProvider.check();

      expect(result.authenticated).toBe(false);
      expect(result.redirectTo).toBe('/login');
      expect(result.logout).toBe(true);
    });

    it('returns not authenticated on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await localAuthProvider.check();

      expect(result.authenticated).toBe(false);
      expect(result.redirectTo).toBe('/login');
      expect(result.logout).toBe(true);
    });
  });

  describe('getIdentity', () => {
    it('returns user identity from /api/auth/me', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        tenant_id: 'tenant-123',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });

      const result = await localAuthProvider.getIdentity();

      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatar: undefined,
      });
    });

    it('returns null when not authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await localAuthProvider.getIdentity();

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await localAuthProvider.getIdentity();

      expect(result).toBeNull();
    });
  });

  describe('onError', () => {
    it('returns logout on 401 error', async () => {
      const result = await localAuthProvider.onError({ statusCode: 401 });

      expect(result.logout).toBe(true);
      expect(result.redirectTo).toBe('/login');
      expect(result.error?.name).toBe('SessionExpired');
    });

    it('handles 401 with status property', async () => {
      const result = await localAuthProvider.onError({ status: 401 });

      expect(result.logout).toBe(true);
    });

    it('returns forbidden error on 403', async () => {
      const result = await localAuthProvider.onError({ statusCode: 403 });

      expect(result.logout).toBeUndefined();
      expect(result.error?.name).toBe('Forbidden');
    });

    it('handles 403 with status property', async () => {
      const result = await localAuthProvider.onError({ status: 403 });

      expect(result.error?.name).toBe('Forbidden');
    });

    it('returns empty object for other errors', async () => {
      const result = await localAuthProvider.onError({ statusCode: 500 });

      expect(result).toEqual({});
    });
  });

  describe('getPermissions', () => {
    it('returns user role as array', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        tenant_id: 'tenant-123',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });

      const result = await localAuthProvider.getPermissions();

      expect(result).toEqual(['admin']);
    });

    it('returns member role', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        tenant_id: 'tenant-123',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });

      const result = await localAuthProvider.getPermissions();

      expect(result).toEqual(['member']);
    });

    it('returns empty array when not authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await localAuthProvider.getPermissions();

      expect(result).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await localAuthProvider.getPermissions();

      expect(result).toEqual([]);
    });
  });
});
