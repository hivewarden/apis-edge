import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Clips Page E2E Tests (@P1)
 *
 * Verifies the detection clips page:
 * - Page header "Detection Clips"
 * - Filter bar with unit selector and date range
 * - View mode toggle (grid/compact)
 * - Empty state when no clips
 * - Clips API returns correct structure
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

test.describe('Clips Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('clips page loads with header', async ({ page }) => {
    await page.goto('/clips');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Detection Clips')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/browse and review/i)).toBeVisible();
  });

  test('clips page shows filter bar with unit selector', async ({ page }) => {
    await page.goto('/clips');
    await page.waitForLoadState('networkidle');

    // Filter bar should have "All units" placeholder
    await expect(page.getByText(/all units/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('clips page shows view mode toggle', async ({ page }) => {
    await page.goto('/clips');
    await page.waitForLoadState('networkidle');

    // Segmented control for grid/compact view mode
    const segmented = page.locator('.ant-segmented');
    await expect(segmented).toBeVisible({ timeout: 10000 });
  });

  test('clips page shows result count', async ({ page }) => {
    await page.goto('/clips');
    await page.waitForLoadState('networkidle');

    // Should show "Showing X of Y clips" or "No clips found"
    const hasClipsCount = await page.getByText(/showing.*of.*clips/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoClips = await page.getByText(/no clips found/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasClipsCount || hasNoClips).toBeTruthy();
  });

  test('clips API returns list for a site', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a site
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Clips Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    try {
      const response = await page.request.get(`${API_URL}/api/clips?site_id=${siteId}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBeTruthy();
    } finally {
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
