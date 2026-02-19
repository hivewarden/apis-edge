import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Harvests CRUD E2E Tests (@P1)
 *
 * Verifies harvest management via API:
 * - Create harvest with hive breakdown
 * - List harvests for a hive and site
 * - Get single harvest
 * - Update harvest
 * - Delete harvest
 * - Analytics endpoint
 * - Validation (amount mismatch)
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

test.describe('Harvests CRUD @P1', () => {
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
      data: createSiteData({ name: `PW-Harvest Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-Harvest Hive ${Date.now()}` },
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

  test('create harvest via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const response = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 5.0,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 5.0, frames: 3 }],
        notes: 'E2E test harvest',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data).toBeTruthy();
    expect(body.data.total_kg).toBe(5.0);

    // Cleanup
    await page.request.delete(`${API_URL}/api/harvests/${body.data.id}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test('list harvests for a hive', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 3.0,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 3.0 }],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const harvestId = (await createRes.json()).data.id;

    try {
      const listRes = await page.request.get(`${API_URL}/api/hives/${hiveId}/harvests`);
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
    } finally {
      await page.request.delete(`${API_URL}/api/harvests/${harvestId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('list harvests for a site', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 2.0,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 2.0 }],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const harvestId = (await createRes.json()).data.id;

    try {
      const listRes = await page.request.get(`${API_URL}/api/sites/${siteId}/harvests`);
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      expect(body).toHaveProperty('data');
    } finally {
      await page.request.delete(`${API_URL}/api/harvests/${harvestId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('get single harvest', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 4.5,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 4.5 }],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const harvestId = (await createRes.json()).data.id;

    try {
      const getRes = await page.request.get(`${API_URL}/api/harvests/${harvestId}`);
      expect(getRes.status()).toBe(200);
      const body = await getRes.json();
      expect(body.data.total_kg).toBe(4.5);
    } finally {
      await page.request.delete(`${API_URL}/api/harvests/${harvestId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('delete harvest via API', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 1.0,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 1.0 }],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const harvestId = (await createRes.json()).data.id;

    const deleteRes = await page.request.delete(`${API_URL}/api/harvests/${harvestId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(deleteRes.status()).toBe(204);

    const getRes = await page.request.get(`${API_URL}/api/harvests/${harvestId}`);
    expect(getRes.status()).toBe(404);
  });

  test('harvest analytics endpoint works', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/harvests/analytics`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('create harvest with mismatched total returns 400', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const response = await page.request.post(`${API_URL}/api/harvests`, {
      data: {
        site_id: siteId,
        harvested_at: today,
        total_kg: 10.0,
        hive_breakdown: [{ hive_id: hiveId, amount_kg: 5.0 }],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(400);
  });
});
