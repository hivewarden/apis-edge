import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Dashboard E2E Tests (@P1)
 *
 * Verifies the main dashboard page loads correctly with:
 * - Welcome greeting with user name
 * - Site selector
 * - Units section (empty state or unit cards)
 * - Time range selector
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

test.describe('Dashboard @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('dashboard loads with welcome greeting', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show welcome message with user name
    await expect(page.getByText(/welcome back/i)).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows apiary overview subtitle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/apiary overview/i)).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows Units section heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Units', level: 4 })).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows Register Unit button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /register unit/i })).toBeVisible({ timeout: 10000 });
  });

  test('Register Unit button navigates to /units/register', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /register unit/i }).first().click();

    await page.waitForURL((url: URL) => url.pathname.includes('/units/register'), {
      timeout: 10000,
    });
    expect(page.url()).toContain('/units/register');
  });

  test('dashboard shows site selector when sites exist', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a test site
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Dashboard Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Site selector should be visible — it auto-selects the first site,
      // so we look for the combobox element rather than placeholder text
      await expect(page.getByRole('combobox').first()).toBeVisible({ timeout: 10000 });
    } finally {
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('dashboard shows Refresh button for units', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The Refresh button is in the Units section header area next to the heading
    // Multiple nested divs contain the heading, so we find the heading and look for a sibling Refresh button
    const unitsHeading = page.getByRole('heading', { name: 'Units', level: 4 });
    await expect(unitsHeading).toBeVisible({ timeout: 10000 });
    // The Refresh button is in the same container as the heading — use a locator near the heading
    await expect(page.getByRole('button', { name: /refresh/i }).first()).toBeVisible();
  });
});
