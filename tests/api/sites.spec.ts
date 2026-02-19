import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Sites API Contract Tests (@P1)
 *
 * Full CRUD cycle for sites: create, read, list, update, delete.
 * Also covers error cases: missing name, invalid coordinates, not found.
 *
 * Routes tested:
 * - GET    /api/sites
 * - POST   /api/sites
 * - GET    /api/sites/{id}
 * - PUT    /api/sites/{id}
 * - DELETE /api/sites/{id}
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

/** Helper: login and return CSRF token for state-changing requests */
async function loginAndGetCsrf(request: any): Promise<string> {
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginResponse.status()).toBe(200);

  const cookies = loginResponse.headers()['set-cookie'] || '';
  const csrfMatch = cookies.match(/apis_csrf_token=([^;]+)/);
  return csrfMatch ? csrfMatch[1] : '';
}

test.describe('Sites API @P1', () => {
  let csrfToken: string;

  test.beforeEach(async ({ request }) => {
    csrfToken = await loginAndGetCsrf(request);
  });

  test('full CRUD cycle: create -> read -> list -> update -> delete', async ({ request }) => {
    const siteData = createSiteData({ name: 'PW-Test Apiary CRUD' });

    // --- CREATE ---
    const createResponse = await request.post('/api/sites', {
      data: siteData,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);

    const created = await createResponse.json();
    expect(created).toHaveProperty('data');
    expect(created.data).toHaveProperty('id');
    expect(created.data.name).toBe(siteData.name);
    expect(created.data.timezone).toBe(siteData.timezone);
    expect(created.data).toHaveProperty('created_at');
    expect(created.data).toHaveProperty('updated_at');

    const siteId = created.data.id;

    try {
      // --- READ ---
      const getResponse = await request.get(`/api/sites/${siteId}`);
      expect(getResponse.status()).toBe(200);

      const fetched = await getResponse.json();
      expect(fetched.data.id).toBe(siteId);
      expect(fetched.data.name).toBe(siteData.name);
      expect(fetched.data.latitude).toBe(siteData.latitude);
      expect(fetched.data.longitude).toBe(siteData.longitude);

      // --- LIST ---
      const listResponse = await request.get('/api/sites');
      expect(listResponse.status()).toBe(200);

      const listed = await listResponse.json();
      expect(listed).toHaveProperty('data');
      expect(listed).toHaveProperty('meta');
      expect(listed.meta).toHaveProperty('total');
      expect(Array.isArray(listed.data)).toBe(true);
      // Our created site should be in the list
      const found = listed.data.find((s: any) => s.id === siteId);
      expect(found).toBeTruthy();
      expect(found.name).toBe(siteData.name);

      // --- UPDATE ---
      const updatedName = 'PW-Updated Apiary';
      const updateResponse = await request.put(`/api/sites/${siteId}`, {
        data: { name: updatedName },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(updateResponse.status()).toBe(200);

      const updated = await updateResponse.json();
      expect(updated.data.name).toBe(updatedName);
      expect(updated.data.id).toBe(siteId);

    } finally {
      // --- DELETE (cleanup) ---
      const deleteResponse = await request.delete(`/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(deleteResponse.status()).toBe(204);

      // Verify deletion
      const getAfterDelete = await request.get(`/api/sites/${siteId}`);
      expect(getAfterDelete.status()).toBe(404);
    }
  });

  test('POST /api/sites without name returns 400', async ({ request }) => {
    const response = await request.post('/api/sites', {
      data: {
        timezone: 'Europe/Brussels',
        latitude: 50.85,
        longitude: 4.35,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('Name is required');
  });

  test('POST /api/sites with invalid latitude returns 400', async ({ request }) => {
    const response = await request.post('/api/sites', {
      data: {
        name: 'Bad Coords Site',
        latitude: 999, // out of range
        longitude: 4.35,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Latitude');
  });

  test('POST /api/sites with invalid longitude returns 400', async ({ request }) => {
    const response = await request.post('/api/sites', {
      data: {
        name: 'Bad Coords Site',
        latitude: 50.85,
        longitude: -200, // out of range
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Longitude');
  });

  test('POST /api/sites with invalid timezone returns 400', async ({ request }) => {
    const response = await request.post('/api/sites', {
      data: {
        name: 'Bad TZ Site',
        timezone: 'Not/A/Timezone',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('timezone');
  });

  test('GET /api/sites/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.get('/api/sites/00000000-0000-0000-0000-000000000000');

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error', 'Site not found');
    expect(body).toHaveProperty('code', 404);
  });

  test('PUT /api/sites/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.put('/api/sites/00000000-0000-0000-0000-000000000000', {
      data: { name: 'Updated' },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(404);
  });

  test('DELETE /api/sites/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.delete('/api/sites/00000000-0000-0000-0000-000000000000', {
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(404);
  });

  test('POST /api/sites with name exceeding 200 chars returns 400', async ({ request }) => {
    const response = await request.post('/api/sites', {
      data: {
        name: 'A'.repeat(201),
        timezone: 'Europe/Brussels',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('200 characters');
  });

  test('list response structure follows API format', async ({ request }) => {
    const listResponse = await request.get('/api/sites');
    expect(listResponse.status()).toBe(200);

    const body = await listResponse.json();
    // Validate { data: [...], meta: { total: N } }
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('total');
    expect(typeof body.meta.total).toBe('number');
    expect(Array.isArray(body.data)).toBe(true);

    // Validate individual site response structure
    if (body.data.length > 0) {
      const site = body.data[0];
      expect(site).toHaveProperty('id');
      expect(site).toHaveProperty('name');
      expect(site).toHaveProperty('timezone');
      expect(site).toHaveProperty('created_at');
      expect(site).toHaveProperty('updated_at');
    }
  });
});
