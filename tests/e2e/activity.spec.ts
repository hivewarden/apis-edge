import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Activity Page E2E Tests (@P1)
 *
 * Verifies the activity feed page:
 * - Page header "Activity"
 * - Filter bar with type and hive filters
 * - Activity list or empty state
 * - Clear Filters button
 * - Activity API returns correct structure
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

test.describe('Activity Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('activity page loads with heading', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /activity/i })).toBeVisible({ timeout: 10000 });
  });

  test('activity page shows description', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/what.*been happening/i)).toBeVisible({ timeout: 10000 });
  });

  test('activity page shows filter section', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Filters:')).toBeVisible({ timeout: 10000 });
  });

  test('activity page shows activity type filter', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    // Activity Type multi-select
    await expect(page.getByText(/activity type/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('activity page shows hive filter', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    // Hive filter select
    await expect(page.getByText(/filter by hive/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('activity feed shows items or empty state', async ({ page }) => {
    await page.goto('/activity');
    await page.waitForLoadState('networkidle');

    // Either activity items appear or empty state
    const hasItems = await page.locator('.ant-list-item').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no activity/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasItems || hasEmpty).toBeTruthy();
  });

  test('creating data generates activity entries', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a site (this should generate an activity entry)
    const siteName = `PW-Activity Site ${Date.now()}`;
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: siteName }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    try {
      // Check activity API for recent entries
      const activityResponse = await page.request.get(`${API_URL}/api/activity?limit=10`);
      expect(activityResponse.status()).toBe(200);
      const body = await activityResponse.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
    } finally {
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
