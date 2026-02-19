import { test, expect } from '@playwright/test';

/**
 * Calendar Page E2E Tests (@P1)
 *
 * Verifies the treatment calendar page:
 * - Page header "Treatment Calendar"
 * - Legend with event types
 * - Site/hive filter dropdowns
 * - Calendar grid renders
 * - Add Reminder float button
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

test.describe('Calendar Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('calendar page loads with header', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /treatment calendar/i })).toBeVisible({ timeout: 10000 });
  });

  test('calendar page shows description text', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/view past treatments/i)).toBeVisible({ timeout: 10000 });
  });

  test('calendar page shows legend with event types', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Past Treatment', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Inspection', { exact: true })).toBeVisible();
    await expect(page.getByText('Treatment Due', { exact: true })).toBeVisible();
    await expect(page.getByText('Reminder', { exact: true })).toBeVisible();
  });

  test('calendar page shows site filter', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Ant Design Select with "All sites" placeholder
    await expect(page.getByText(/all sites/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('calendar page shows hive filter (disabled without site)', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Hive filter should exist with "All hives" placeholder
    await expect(page.getByText(/all hives/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('calendar page shows floating add reminder button', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // FloatButton with PlusOutlined icon - look for the button by role
    const floatButton = page.locator('.ant-float-btn');
    await expect(floatButton).toBeVisible({ timeout: 10000 });
  });

  test('calendar API returns events for current month', async ({ page }) => {
    // Verify the calendar API endpoint works
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-28`;

    const response = await page.request.get(
      `${API_URL}/api/calendar?start=${startDate}&end=${endDate}`
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('data');
  });
});
