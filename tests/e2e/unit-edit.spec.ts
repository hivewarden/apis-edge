import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Unit Edit Page E2E Tests (@P1)
 *
 * Verifies the unit edit form:
 * - Page loads with "Edit Unit" heading
 * - Shows serial number (read-only), name, site assignment
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

test.describe('Unit Edit Page @P1', () => {
  let siteId: string;
  let unitId: string;
  const unitSerial = `PW-UEdit-${Date.now()}`;

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
      data: createSiteData({ name: `PW-UnitEdit Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    const unitRes = await request.post(`${API_URL}/api/units`, {
      data: { serial: unitSerial, name: 'Original Name', site_id: siteId },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(unitRes.status()).toBe(201);
    unitId = (await unitRes.json()).data.id;
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

    await request.delete(`${API_URL}/api/units/${unitId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    await request.delete(`${API_URL}/api/sites/${siteId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('unit edit page loads with heading', async ({ page }) => {
    await page.goto(`/units/${unitId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /edit unit/i })).toBeVisible({ timeout: 10000 });
  });

  test('unit edit page shows serial number', async ({ page }) => {
    await page.goto(`/units/${unitId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(unitSerial, { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('unit edit page shows name field', async ({ page }) => {
    await page.goto(`/units/${unitId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel(/unit name/i)).toBeVisible({ timeout: 10000 });
  });

  test('unit edit page shows Save and Cancel buttons', async ({ page }) => {
    await page.goto(`/units/${unitId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('edit unit name via API and verify', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    const newName = `PW-Renamed ${Date.now()}`;

    const updateRes = await page.request.put(`${API_URL}/api/units/${unitId}`, {
      data: { name: newName },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(updateRes.status()).toBe(200);

    const getRes = await page.request.get(`${API_URL}/api/units/${unitId}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.data.name).toBe(newName);
  });
});
