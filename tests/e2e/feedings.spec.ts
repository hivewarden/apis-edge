import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Feedings CRUD E2E Tests (@P1)
 *
 * Verifies feeding management via API:
 * - Create feeding for a hive
 * - List feedings for a hive
 * - Get single feeding
 * - Update feeding
 * - Delete feeding
 * - Validation (missing fields)
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

test.describe('Feedings CRUD @P1', () => {
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
      data: createSiteData({ name: `PW-Feeding Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-Feeding Hive ${Date.now()}` },
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

  test('create feeding via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const response = await page.request.post(`${API_URL}/api/feedings`, {
      data: {
        hive_ids: [hiveId],
        fed_at: today,
        feed_type: 'sugar_syrup',
        amount: 2.5,
        unit: 'liters',
        concentration: '2:1',
        notes: 'E2E test feeding',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data)).toBeTruthy();

    // Cleanup
    await page.request.delete(`${API_URL}/api/feedings/${body.data[0].id}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test('list feedings for a hive', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/feedings`, {
      data: {
        hive_ids: [hiveId],
        fed_at: today,
        feed_type: 'fondant',
        amount: 1,
        unit: 'kg',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const feedingId = (await createRes.json()).data[0].id;

    try {
      const listRes = await page.request.get(`${API_URL}/api/hives/${hiveId}/feedings`);
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    } finally {
      await page.request.delete(`${API_URL}/api/feedings/${feedingId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('get single feeding', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/feedings`, {
      data: {
        hive_ids: [hiveId],
        fed_at: today,
        feed_type: 'pollen_patty',
        amount: 0.5,
        unit: 'kg',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const feedingId = (await createRes.json()).data[0].id;

    try {
      const getRes = await page.request.get(`${API_URL}/api/feedings/${feedingId}`);
      expect(getRes.status()).toBe(200);
      const body = await getRes.json();
      expect(body.data.feed_type).toBe('pollen_patty');
    } finally {
      await page.request.delete(`${API_URL}/api/feedings/${feedingId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('update feeding via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/feedings`, {
      data: {
        hive_ids: [hiveId],
        fed_at: today,
        feed_type: 'sugar_syrup',
        amount: 1,
        unit: 'liters',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const feedingId = (await createRes.json()).data[0].id;

    try {
      const updateRes = await page.request.put(`${API_URL}/api/feedings/${feedingId}`, {
        data: { notes: 'Updated feeding notes' },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(updateRes.status()).toBe(200);

      const getRes = await page.request.get(`${API_URL}/api/feedings/${feedingId}`);
      const body = await getRes.json();
      expect(body.data.notes).toBe('Updated feeding notes');
    } finally {
      await page.request.delete(`${API_URL}/api/feedings/${feedingId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('delete feeding via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/feedings`, {
      data: {
        hive_ids: [hiveId],
        fed_at: today,
        feed_type: 'honey',
        amount: 0.3,
        unit: 'kg',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const feedingId = (await createRes.json()).data[0].id;

    const deleteRes = await page.request.delete(`${API_URL}/api/feedings/${feedingId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(deleteRes.status()).toBe(204);

    const getRes = await page.request.get(`${API_URL}/api/feedings/${feedingId}`);
    expect(getRes.status()).toBe(404);
  });

  test('create feeding without required fields returns 400', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    const response = await page.request.post(`${API_URL}/api/feedings`, {
      data: { hive_ids: [hiveId] },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(400);
  });
});
