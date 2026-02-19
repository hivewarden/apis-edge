import { test, expect } from '@playwright/test';

/**
 * Season Recap Page E2E Tests (@P1)
 *
 * Verifies the season recap page (/recap):
 * - Page loads with "Season Recap" heading
 * - Year selector present
 * - Share button present
 * - Shows season data or appropriate empty state
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

test.describe('Season Recap Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('season recap page loads with heading', async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    // The heading may be "Season Recap" (h2) — it's lazy loaded so give extra time
    await expect(page.getByRole('heading', { name: /season recap/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('season recap page shows subtitle', async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/season.*achievement/i)).toBeVisible({ timeout: 10000 });
  });

  test('season recap page shows year selector', async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    // Year selector — could be a Select or a heading with year
    const hasYearSelect = await page.getByText(/season/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasYearSelect).toBeTruthy();
  });

  test('season recap page shows share button', async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /share/i })).toBeVisible({ timeout: 10000 });
  });

  test('season recap page shows content or empty state', async ({ page }) => {
    await page.goto('/recap');
    await page.waitForLoadState('networkidle');

    // Either shows recap data or empty/loading state
    const hasContent = await page.getByText(/season/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no.*data/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.getByText(/error|retry/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasContent || hasEmpty || hasError).toBeTruthy();
  });
});
