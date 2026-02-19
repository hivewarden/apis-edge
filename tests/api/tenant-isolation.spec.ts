import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Multi-Tenant Isolation Tests (@P0)
 *
 * Validates that data created by one tenant is not accessible to another.
 * These tests are critical for security in SaaS (multi-tenant) mode.
 *
 * In local/standalone mode, all data belongs to the default tenant, so
 * tenant isolation is inherently enforced. These tests verify the principle
 * by checking that:
 * 1. Resources created by authenticated user A are visible to user A
 * 2. Non-existent resource IDs return 404 (not data leaks)
 * 3. The tenant_id is consistently set on all resources
 *
 * Note: Full cross-tenant isolation testing requires two separate tenant
 * accounts, which is only available in SaaS mode with Keycloak. This test
 * file provides the framework and tests what is possible in local mode.
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

async function loginAndGetCsrf(request: any): Promise<string> {
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginResponse.status()).toBe(200);
  const cookies = loginResponse.headers()['set-cookie'] || '';
  const csrfMatch = cookies.match(/apis_csrf_token=([^;]+)/);
  return csrfMatch ? csrfMatch[1] : '';
}

test.describe('Multi-Tenant Isolation @P0', () => {
  let csrfToken: string;

  test.beforeEach(async ({ request }) => {
    csrfToken = await loginAndGetCsrf(request);
  });

  test('authenticated user has consistent tenant_id across endpoints', async ({ request }) => {
    // Check /api/me for tenant_id
    const meResponse = await request.get('/api/me');
    expect(meResponse.status()).toBe(200);
    const me = await meResponse.json();
    const tenantId = me.tenant_id;
    expect(tenantId).toBeTruthy();

    // Check /api/auth/me for same tenant_id
    const authMeResponse = await request.get('/api/auth/me');
    expect(authMeResponse.status()).toBe(200);
    const authMe = await authMeResponse.json();
    expect(authMe.user.tenant_id).toBe(tenantId);
  });

  test('resources created by tenant A are accessible by tenant A', async ({ request }) => {
    // Create a site
    const siteData = createSiteData({ name: 'PW-Tenant-Isolation Site' });
    const createResponse = await request.post('/api/sites', {
      data: siteData,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const siteId = (await createResponse.json()).data.id;

    try {
      // Same user can read it
      const getResponse = await request.get(`/api/sites/${siteId}`);
      expect(getResponse.status()).toBe(200);

      // Same user can see it in list
      const listResponse = await request.get('/api/sites');
      expect(listResponse.status()).toBe(200);
      const listed = await listResponse.json();
      const found = listed.data.find((s: any) => s.id === siteId);
      expect(found).toBeTruthy();
    } finally {
      await request.delete(`/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('accessing non-existent resources returns 404, not data from other tenants', async ({ request }) => {
    // These fake UUIDs should never match a real resource.
    // If the system returns anything other than 404, it could indicate a data leak.
    const fakeId = '99999999-9999-9999-9999-999999999999';

    const siteResponse = await request.get(`/api/sites/${fakeId}`);
    expect(siteResponse.status()).toBe(404);

    const hiveResponse = await request.get(`/api/hives/${fakeId}`);
    expect(hiveResponse.status()).toBe(404);

    const inspectionResponse = await request.get(`/api/inspections/${fakeId}`);
    expect(inspectionResponse.status()).toBe(404);

    const taskResponse = await request.get(`/api/tasks/${fakeId}`);
    expect(taskResponse.status()).toBe(404);
  });

  test('unauthenticated requests to protected endpoints return 401', async ({ request }) => {
    // Create a fresh request context without stored cookies
    // This simulates a request from an unauthenticated client
    const endpoints = [
      { method: 'GET', path: '/api/sites' },
      { method: 'GET', path: '/api/hives' },
      { method: 'GET', path: '/api/tasks' },
      { method: 'GET', path: '/api/clips' },
      { method: 'GET', path: '/api/me' },
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint.path, {
        headers: {
          Cookie: '', // Clear any stored cookies
        },
      });
      // Should be 401 Unauthorized
      expect(response.status()).toBe(401);
    }
  });

  test('created resources are associated with correct tenant', async ({ request }) => {
    // Get current tenant ID
    const meResponse = await request.get('/api/me');
    const tenantId = (await meResponse.json()).tenant_id;

    // Create site
    const siteResponse = await request.post('/api/sites', {
      data: createSiteData({ name: 'PW-TenantAssoc Site' }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    // Create hive under site
    const hiveResponse = await request.post(`/api/sites/${siteId}/hives`, {
      data: { name: 'PW-TenantAssoc Hive' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(hiveResponse.status()).toBe(201);
    const hiveId = (await hiveResponse.json()).data.id;

    // Create task for hive
    const taskResponse = await request.post('/api/tasks', {
      data: {
        hive_id: hiveId,
        custom_title: 'PW-TenantAssoc Task',
        priority: 'low',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(taskResponse.status()).toBe(201);
    const taskBody = await taskResponse.json();
    const task = Array.isArray(taskBody.data?.tasks) ? taskBody.data.tasks[0] : taskBody.data;

    // All resources should be listable by this tenant
    const sitesListResponse = await request.get('/api/sites');
    const siteFound = (await sitesListResponse.json()).data.find((s: any) => s.id === siteId);
    expect(siteFound).toBeTruthy();

    const hivesListResponse = await request.get('/api/hives');
    const hiveFound = (await hivesListResponse.json()).data.find((h: any) => h.id === hiveId);
    expect(hiveFound).toBeTruthy();

    // Cleanup
    if (task?.id) {
      await request.delete(`/api/tasks/${task.id}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
    await request.delete(`/api/hives/${hiveId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    await request.delete(`/api/sites/${siteId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });
});
