import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Clips API Contract Tests (@P1)
 *
 * Tests clip listing with filters and pagination.
 * Note: Clip upload is done by devices via X-API-Key, not dashboard users.
 * We test the read/list/delete operations available to authenticated users.
 *
 * Routes tested:
 * - GET    /api/clips?site_id={site_id}
 * - GET    /api/clips/{id}/thumbnail
 * - GET    /api/clips/{id}/video
 * - DELETE /api/clips/{id}
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

test.describe('Clips API @P1', () => {
  let csrfToken: string;
  let siteId: string;

  test.beforeEach(async ({ request }) => {
    csrfToken = await loginAndGetCsrf(request);
    // The clips endpoint requires site_id — create a site for each test
    const siteResponse = await request.post('/api/sites', {
      data: createSiteData({ name: 'PW-Clips-Test Site' }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    siteId = (await siteResponse.json()).data.id;
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/sites/${siteId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test('GET /api/clips returns list with correct structure', async ({ request }) => {
    const response = await request.get(`/api/clips?site_id=${siteId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('total');
    expect(Array.isArray(body.data)).toBe(true);

    // Validate clip response structure if clips exist
    if (body.data.length > 0) {
      const clip = body.data[0];
      expect(clip).toHaveProperty('id');
      expect(clip).toHaveProperty('unit_id');
      expect(clip).toHaveProperty('site_id');
      expect(clip).toHaveProperty('file_size_bytes');
      expect(clip).toHaveProperty('recorded_at');
      expect(clip).toHaveProperty('created_at');
      // Should NOT expose internal file paths
      expect(clip).not.toHaveProperty('file_path');
      expect(clip).not.toHaveProperty('thumbnail_path');
    }
  });

  test('GET /api/clips supports pagination via per_page and page', async ({ request }) => {
    const response = await request.get(`/api/clips?site_id=${siteId}&per_page=5&page=1`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.data.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/clips/{id}/video with non-existent ID returns 404', async ({ request }) => {
    const response = await request.get('/api/clips/00000000-0000-0000-0000-000000000000/video');
    expect(response.status()).toBe(404);
  });

  test('GET /api/clips/{id}/thumbnail with non-existent ID returns 404', async ({ request }) => {
    const response = await request.get('/api/clips/00000000-0000-0000-0000-000000000000/thumbnail');
    expect(response.status()).toBe(404);
  });

  test('DELETE /api/clips/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.delete('/api/clips/00000000-0000-0000-0000-000000000000', {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(404);
  });

  test('GET /api/clips supports filtering by unit_id', async ({ request }) => {
    // Use a non-existent unit ID - should return empty list, not error
    const response = await request.get(`/api/clips?site_id=${siteId}&unit_id=00000000-0000-0000-0000-000000000000`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
