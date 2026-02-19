import { test, expect } from '@playwright/test';

/**
 * Custom Labels Page E2E Tests (@P1)
 *
 * Verifies the custom labels management page (/settings/labels):
 * - Page loads with "Custom Labels" heading
 * - Shows category cards (Feed Types, Treatment Types, Equipment Types, Issue Types)
 * - Add button per category
 * - Built-in items shown
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

test.describe('Custom Labels Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('custom labels page loads with heading', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /custom labels/i })).toBeVisible({ timeout: 10000 });
  });

  test('custom labels page shows Feed Types category', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/feed types/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('custom labels page shows Treatment Types category', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/treatment types/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('custom labels page shows Equipment Types category', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/equipment types/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('custom labels page shows Issue Types category', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/issue types/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('custom labels page has Add buttons', async ({ page }) => {
    await page.goto('/settings/labels');
    await page.waitForLoadState('networkidle');

    // Each category should have an Add button
    const addButtons = page.getByRole('button', { name: /add/i });
    await expect(addButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('labels API returns label data', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/labels`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('data');
  });
});
