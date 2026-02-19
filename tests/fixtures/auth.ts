import { test as base, expect } from '@playwright/test';

/**
 * APIS Auth Fixtures
 *
 * Provides authenticated request contexts for API and E2E tests.
 * Supports both local auth (JWT) and SaaS auth (Keycloak) modes.
 */

type AuthFixtures = {
  authToken: string;
  authenticatedRequest: typeof base['request'];
  adminToken: string;
  apiKeyHeader: Record<string, string>;
};

export const test = base.extend<AuthFixtures>({
  authToken: async ({ request }, use) => {
    // Login via local auth to get JWT
    const response = await request.post('/api/auth/login', {
      data: {
        email: process.env.TEST_USER_EMAIL || 'admin@apis.local',
        password: process.env.TEST_USER_PASSWORD || 'admin123',
      },
    });

    if (!response.ok()) {
      // If login fails (no server running), provide a test token
      await use('test-token-not-connected');
      return;
    }

    // Token is in HttpOnly cookie, but we can extract from response
    const cookies = response.headers()['set-cookie'] || '';
    const sessionMatch = cookies.match(/apis_session=([^;]+)/);
    const token = sessionMatch ? sessionMatch[1] : '';

    await use(token);
  },

  adminToken: async ({ request }, use) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: process.env.TEST_ADMIN_EMAIL || 'admin@apis.local',
        password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
      },
    });

    if (!response.ok()) {
      await use('test-admin-token-not-connected');
      return;
    }

    const cookies = response.headers()['set-cookie'] || '';
    const sessionMatch = cookies.match(/apis_session=([^;]+)/);
    await use(sessionMatch ? sessionMatch[1] : '');
  },

  apiKeyHeader: async ({}, use) => {
    // For device API endpoints that use X-API-Key
    await use({
      'X-API-Key': process.env.TEST_API_KEY || 'test-device-api-key',
    });
  },
});

export { expect };
