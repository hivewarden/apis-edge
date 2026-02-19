import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Inspection Edit Page E2E Tests (@P1)
 *
 * Verifies the inspection edit form:
 * - Page loads with "Edit Inspection" heading
 * - Queen observations section
 * - Brood assessment section
 * - Stores assessment section
 * - Issues section
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

test.describe('Inspection Edit Page @P1', () => {
  let siteId: string;
  let hiveId: string;
  let inspectionId: string;

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

    // Create site
    const siteRes = await request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-InspEdit Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteRes.status()).toBe(201);
    siteId = (await siteRes.json()).data.id;

    // Create hive
    const hiveRes = await request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-InspEdit Hive ${Date.now()}` },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(hiveRes.status()).toBe(201);
    hiveId = (await hiveRes.json()).data.id;

    // Create inspection
    const today = new Date().toISOString().split('T')[0];
    const inspRes = await request.post(`${API_URL}/api/hives/${hiveId}/inspections`, {
      data: {
        inspected_at: today,
        queen_seen: true,
        brood_pattern: 'good',
        honey_level: 'medium',
        notes: 'Test inspection for edit',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(inspRes.status()).toBe(201);
    inspectionId = (await inspRes.json()).data.id;
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

    await request.delete(`${API_URL}/api/inspections/${inspectionId}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
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

  test('inspection edit page loads with heading', async ({ page }) => {
    await page.goto(`/inspections/${inspectionId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /edit inspection/i })).toBeVisible({ timeout: 10000 });
  });

  test('inspection edit page shows queen observations section', async ({ page }) => {
    await page.goto(`/inspections/${inspectionId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/queen.*observation/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/queen seen/i).first()).toBeVisible();
  });

  test('inspection edit page shows brood assessment section', async ({ page }) => {
    await page.goto(`/inspections/${inspectionId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/brood.*assessment/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('inspection edit page shows stores assessment section', async ({ page }) => {
    await page.goto(`/inspections/${inspectionId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/stores.*assessment/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('inspection edit page shows Save and Cancel buttons', async ({ page }) => {
    await page.goto(`/inspections/${inspectionId}/edit`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('edit inspection via API and verify', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    const updateRes = await page.request.put(`${API_URL}/api/inspections/${inspectionId}`, {
      data: { notes: 'Updated via E2E test' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(updateRes.status()).toBe(200);

    const getRes = await page.request.get(`${API_URL}/api/inspections/${inspectionId}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.data.notes).toBe('Updated via E2E test');
  });
});
