import { test, expect } from '@playwright/test';

/**
 * Statistics Page E2E Tests (@P1)
 *
 * Verifies the statistics/analytics page:
 * - Page loads with "Statistics" heading
 * - Shows placeholder content for future analytics
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

test.describe('Statistics Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('statistics page loads with heading', async ({ page }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /statistics/i })).toBeVisible({ timeout: 10000 });
  });

  test('statistics page shows analytics description', async ({ page }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/analytics|patterns|detection/i)).toBeVisible({ timeout: 10000 });
  });

  test('statistics page is accessible from sidebar nav', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('menuitem', { name: /statistics/i }).click();
    await page.waitForURL((url: URL) => url.pathname.includes('/statistics'), { timeout: 10000 });
    expect(page.url()).toContain('/statistics');
  });
});
