import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Treatments CRUD E2E Tests (@P1)
 *
 * Verifies treatment management via API:
 * - Create treatment for a hive
 * - List treatments for a hive
 * - Get single treatment
 * - Update treatment
 * - Delete treatment
 * - Validation (missing fields, invalid types)
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function loginViaAPI(page: any) {
  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

async function getCsrfToken(page: any): Promise<string> {
  const cookies = await page.context().cookies();
  const csrfCookie = cookies.find((c: any) => c.name === 'apis_csrf_token');
  return csrfCookie?.value || '';
}

test.describe('Treatments CRUD @P1', () => {
  let siteId: string;
  let hiveId: string;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);

    const cookies = (await loginRes.headersArray())
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const csrfMatch = cookies.find((c) => c.includes('apis_csrf_token'));
    const csrfToken = csrfMatch?.match(/apis_csrf_token=([^;]+)/)?.[1] || '';

    const siteRes = await request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Treatment Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-Treatment Hive ${Date.now()}` },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(hiveRes.status()).toBe(201);
    hiveId = (await hiveRes.json()).data.id;
  });

  test.afterAll(async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookies = (await loginRes.headersArray())
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const csrfMatch = cookies.find((c) => c.includes('apis_csrf_token'));
    const csrfToken = csrfMatch?.match(/apis_csrf_token=([^;]+)/)?.[1] || '';

    await request.delete(`${API_URL}/api/hives/${hiveId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    await request.delete(`${API_URL}/api/sites/${siteId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('create treatment via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const response = await page.request.post(`${API_URL}/api/treatments`, {
      data: {
        hive_ids: [hiveId],
        treated_at: today,
        treatment_type: 'oxalic_acid',
        method: 'vaporization',
        notes: 'E2E test treatment',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBe(1);

    // Cleanup
    await page.request.delete(`${API_URL}/api/treatments/${body.data[0].id}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test('list treatments for a hive', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    // Create
    const createRes = await page.request.post(`${API_URL}/api/treatments`, {
      data: {
        hive_ids: [hiveId],
        treated_at: today,
        treatment_type: 'formic_acid',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const treatmentId = (await createRes.json()).data[0].id;

    try {
      const listRes = await page.request.get(`${API_URL}/api/hives/${hiveId}/treatments`);
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    } finally {
      await page.request.delete(`${API_URL}/api/treatments/${treatmentId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('get single treatment', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/treatments`, {
      data: {
        hive_ids: [hiveId],
        treated_at: today,
        treatment_type: 'apiguard',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const treatmentId = (await createRes.json()).data[0].id;

    try {
      const getRes = await page.request.get(`${API_URL}/api/treatments/${treatmentId}`);
      expect(getRes.status()).toBe(200);
      const body = await getRes.json();
      expect(body.data.treatment_type).toBe('apiguard');
    } finally {
      await page.request.delete(`${API_URL}/api/treatments/${treatmentId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('update treatment via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/treatments`, {
      data: {
        hive_ids: [hiveId],
        treated_at: today,
        treatment_type: 'apivar',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const treatmentId = (await createRes.json()).data[0].id;

    try {
      const updateRes = await page.request.put(`${API_URL}/api/treatments/${treatmentId}`, {
        data: { notes: 'Updated treatment notes' },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(updateRes.status()).toBe(200);

      const getRes = await page.request.get(`${API_URL}/api/treatments/${treatmentId}`);
      const body = await getRes.json();
      expect(body.data.notes).toBe('Updated treatment notes');
    } finally {
      await page.request.delete(`${API_URL}/api/treatments/${treatmentId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('delete treatment via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/treatments`, {
      data: {
        hive_ids: [hiveId],
        treated_at: today,
        treatment_type: 'maqs',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const treatmentId = (await createRes.json()).data[0].id;

    const deleteRes = await page.request.delete(`${API_URL}/api/treatments/${treatmentId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(deleteRes.status()).toBe(204);

    // Verify deleted
    const getRes = await page.request.get(`${API_URL}/api/treatments/${treatmentId}`);
    expect(getRes.status()).toBe(404);
  });

  test('create treatment without required fields returns 400', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    const response = await page.request.post(`${API_URL}/api/treatments`, {
      data: { hive_ids: [hiveId] },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(400);
  });

  test('get non-existent treatment returns 404', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/treatments/00000000-0000-0000-0000-000000000000`);
    expect(response.status()).toBe(404);
  });
});
