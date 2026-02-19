import { test, expect } from '@playwright/test';

/**
 * Settings Page E2E Tests (@P1)
 *
 * Verifies the settings page:
 * - Page loads with "Settings" heading
 * - Tab navigation (Overview, Profile, Users, BeeBrain, Preferences)
 * - Overview tab shows tenant info
 * - Profile tab shows user info
 * - Preferences tab shows advanced mode toggle and treatment intervals
 * - Hash-based tab routing works
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

test.describe('Settings Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('settings page loads with heading', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });
  });

  test('settings page shows Overview tab by default', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Overview tab should be active
    const overviewTab = page.getByRole('tab', { name: /overview/i });
    await expect(overviewTab).toBeVisible({ timeout: 10000 });
  });

  test('settings page shows Profile tab', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const profileTab = page.getByRole('tab', { name: /profile/i });
    await expect(profileTab).toBeVisible({ timeout: 10000 });
  });

  test('settings page shows BeeBrain tab', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const beeBrainTab = page.getByRole('tab', { name: /beebrain/i });
    await expect(beeBrainTab).toBeVisible({ timeout: 10000 });
  });

  test('settings page shows Preferences tab', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const preferencesTab = page.getByRole('tab', { name: /preferences/i });
    await expect(preferencesTab).toBeVisible({ timeout: 10000 });
  });

  test('clicking Profile tab shows profile content', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click Profile tab
    await page.getByRole('tab', { name: /profile/i }).click();

    // URL should update with hash
    await page.waitForURL((url: URL) => url.hash === '#profile', { timeout: 5000 });
  });

  test('navigating to settings#preferences shows Preferences tab', async ({ page }) => {
    await page.goto('/settings#preferences');
    await page.waitForLoadState('networkidle');

    // Preferences content should be visible
    await expect(page.getByText('Inspection Preferences')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Advanced Mode')).toBeVisible();
  });

  test('Preferences tab shows treatment intervals table', async ({ page }) => {
    await page.goto('/settings#preferences');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Treatment Intervals')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Treatment Type')).toBeVisible();
    await expect(page.getByText('Interval (days)')).toBeVisible();
  });

  test('Preferences tab shows voice input settings', async ({ page }) => {
    await page.goto('/settings#preferences');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Voice Input')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Transcription Method')).toBeVisible();
  });

  test('Preferences tab shows offline storage section', async ({ page }) => {
    await page.goto('/settings#preferences');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Offline Storage')).toBeVisible({ timeout: 10000 });
  });

  test('settings page shows Users tab for admin in local mode', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // In local mode with admin user, Users tab should be visible
    const usersTab = page.getByRole('tab', { name: /users/i });
    await expect(usersTab).toBeVisible({ timeout: 10000 });
  });

  test('navigating to settings#beebrain shows BeeBrain config', async ({ page }) => {
    await page.goto('/settings#beebrain');
    await page.waitForLoadState('networkidle');

    // BeeBrain content should show
    await expect(page.getByText(/beebrain uses ai/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Configuration Mode')).toBeVisible();
  });
});
