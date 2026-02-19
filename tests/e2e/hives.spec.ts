import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Hives List Page E2E Tests (@P1)
 *
 * Verifies the standalone hives list page (/hives):
 * - Page loads with heading
 * - Site filter dropdown
 * - Add Hive button
 * - Hive cards display
 * - Empty state
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

test.describe('Hives List Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('hives page loads with heading', async ({ page }) => {
    await page.goto('/hives');
    await page.waitForLoadState('networkidle');

    // Heading contains "Hives" — may say "Hives at All Apiaries" or "Hives at [SiteName]"
    await expect(page.getByRole('heading', { name: /hives/i })).toBeVisible({ timeout: 10000 });
  });

  test('hives page shows site filter', async ({ page }) => {
    await page.goto('/hives');
    await page.waitForLoadState('networkidle');

    // Site filter should be present — either as "All Sites" placeholder or a specific site
    const hasSiteFilter = await page.getByText(/all sites/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCombobox = await page.getByRole('combobox').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSiteFilter || hasCombobox).toBeTruthy();
  });

  test('hives page shows Add Hive button', async ({ page }) => {
    await page.goto('/hives');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /add hive/i })).toBeVisible({ timeout: 10000 });
  });

  test('hives page shows filter tabs', async ({ page }) => {
    await page.goto('/hives');
    await page.waitForLoadState('networkidle');

    // Filter tabs: All Hives, Healthy, Needs Attention, etc.
    await expect(page.getByText(/all hives/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('hives page shows hive cards or empty state', async ({ page }) => {
    await page.goto('/hives');
    await page.waitForLoadState('networkidle');

    const hasHiveCards = await page.locator('.ant-card').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no hives/i).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHiveCards || hasEmpty).toBeTruthy();
  });

  test('create hive via API and verify in hives list', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a site
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Hives Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    // Create a hive
    const hiveName = `PW-Hive List ${Date.now()}`;
    const hiveResponse = await page.request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: hiveName },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(hiveResponse.status()).toBe(201);
    const hiveId = (await hiveResponse.json()).data.id;

    try {
      await page.goto('/hives');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(hiveName).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await page.request.delete(`${API_URL}/api/hives/${hiveId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('hives page is accessible from sidebar nav', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('menuitem', { name: /hives/i }).click();
    await page.waitForURL((url: URL) => url.pathname.includes('/hives'), { timeout: 10000 });
    expect(page.url()).toContain('/hives');
  });
});
