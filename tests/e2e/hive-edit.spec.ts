import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Hive Edit Page E2E Tests (@P1)
 *
 * Verifies the hive edit form:
 * - Page loads with "Edit [HiveName]" heading
 * - Form fields present (name, queen info, box config)
 * - Save and Cancel buttons
 * - Edit via API and verify changes
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

test.describe('Hive Edit Page @P1', () => {
  let siteId: string;
  let hiveId: string;
  const hiveName = `PW-EditHive ${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    // Login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);

    const cookies = (await loginRes.headersArray())
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const csrfMatch = cookies.find((c) => c.includes('apis_csrf_token'));
    const csrfToken = csrfMatch?.match(/apis_csrf_token=([^;]+)/)?.[1] || '';

    // Create site
    const siteRes = await request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-HiveEdit Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    // Create hive
    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: hiveName, brood_boxes: 1, honey_supers: 0 },
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

  test('hive edit page loads with heading', async ({ page }) => {
    await page.goto(`/hives/${hiveId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /edit/i })).toBeVisible({ timeout: 10000 });
  });

  test('hive edit page shows hive name field', async ({ page }) => {
    await page.goto(`/hives/${hiveId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel(/hive name/i)).toBeVisible({ timeout: 10000 });
  });

  test('hive edit page shows queen information section', async ({ page }) => {
    await page.goto(`/hives/${hiveId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/queen information/i)).toBeVisible({ timeout: 10000 });
  });

  test('hive edit page shows box configuration section', async ({ page }) => {
    await page.goto(`/hives/${hiveId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/box configuration/i)).toBeVisible({ timeout: 10000 });
  });

  test('hive edit page shows Save and Cancel buttons', async ({ page }) => {
    await page.goto(`/hives/${hiveId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('edit hive name via API and verify', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const newName = `PW-Edited ${Date.now()}`;

    const updateRes = await page.request.put(`${API_URL}/api/hives/${hiveId}`, {
      data: { name: newName },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(updateRes.status()).toBe(200);

    const getRes = await page.request.get(`${API_URL}/api/hives/${hiveId}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.data.name).toBe(newName);
  });
});
