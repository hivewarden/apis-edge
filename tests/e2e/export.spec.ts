import { test, expect } from '@playwright/test';

/**
 * Export Page E2E Tests (@P1)
 *
 * Verifies the data export page (/settings/export):
 * - Page loads with "Export Data" heading
 * - Hive selection card
 * - Field selection card
 * - Format selection (Quick Summary, Detailed Markdown, Full JSON)
 * - Preview Export button
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

test.describe('Export Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('export page loads with heading', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /export/i })).toBeVisible({ timeout: 10000 });
  });

  test('export page shows hive selection', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/select hives/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('export page shows field selection', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/select fields/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('export page shows format selection', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/select format/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('export page shows format options', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    const hasQuickSummary = await page.getByText(/quick summary/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasMarkdown = await page.getByText(/detailed markdown/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasJSON = await page.getByText(/full json/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasQuickSummary || hasMarkdown || hasJSON).toBeTruthy();
  });

  test('export page shows Preview Export button', async ({ page }) => {
    await page.goto('/settings/export');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /preview export/i })).toBeVisible({ timeout: 10000 });
  });
});
