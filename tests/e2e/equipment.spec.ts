import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Equipment CRUD E2E Tests (@P1)
 *
 * Verifies equipment log management via API:
 * - Install equipment on a hive
 * - List equipment for a hive
 * - Get currently installed equipment
 * - Remove equipment
 * - Equipment history
 * - Delete equipment log
 * - State validation (can't install twice)
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

test.describe('Equipment CRUD @P1', () => {
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
      data: createSiteData({ name: `PW-Equipment Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-Equipment Hive ${Date.now()}` },
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

  test('install equipment on a hive', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const response = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: {
        equipment_type: 'entrance_reducer',
        action: 'installed',
        logged_at: today,
        notes: 'E2E test install',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data).toBeTruthy();
    expect(body.data.equipment_type).toBe('entrance_reducer');
    expect(body.data.action).toBe('installed');

    // Cleanup: remove first, then delete
    await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'entrance_reducer', action: 'removed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    await page.request.delete(`${API_URL}/api/equipment/${body.data.id}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test('list equipment for a hive', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'mouse_guard', action: 'installed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const equipId = (await createRes.json()).data.id;

    try {
      const listRes = await page.request.get(`${API_URL}/api/hives/${hiveId}/equipment`);
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
    } finally {
      // Remove then delete
      await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
        data: { equipment_type: 'mouse_guard', action: 'removed', logged_at: today },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/equipment/${equipId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('get currently installed equipment', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'queen_excluder', action: 'installed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const equipId = (await createRes.json()).data.id;

    try {
      const currentRes = await page.request.get(`${API_URL}/api/hives/${hiveId}/equipment/current`);
      expect(currentRes.status()).toBe(200);
      const body = await currentRes.json();
      expect(body).toHaveProperty('data');
      const found = body.data.find((e: any) => e.equipment_type === 'queen_excluder');
      expect(found).toBeTruthy();
    } finally {
      await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
        data: { equipment_type: 'queen_excluder', action: 'removed', logged_at: today },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/equipment/${equipId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('equipment history endpoint works', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/hives/${hiveId}/equipment/history`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('delete equipment log', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    const createRes = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'robbing_screen', action: 'installed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createRes.status()).toBe(201);
    const equipId = (await createRes.json()).data.id;

    // Remove first (to clear installed state)
    await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'robbing_screen', action: 'removed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    const deleteRes = await page.request.delete(`${API_URL}/api/equipment/${equipId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(deleteRes.status()).toBe(204);
  });

  test('cannot install same equipment twice', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const today = new Date().toISOString().split('T')[0];

    // Install once
    const firstRes = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
      data: { equipment_type: 'feeder', action: 'installed', logged_at: today },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(firstRes.status()).toBe(201);
    const equipId = (await firstRes.json()).data.id;

    try {
      // Try to install again — should fail
      const secondRes = await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
        data: { equipment_type: 'feeder', action: 'installed', logged_at: today },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect([400, 409]).toContain(secondRes.status());
    } finally {
      // Cleanup
      await page.request.post(`${API_URL}/api/hives/${hiveId}/equipment`, {
        data: { equipment_type: 'feeder', action: 'removed', logged_at: today },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/equipment/${equipId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
