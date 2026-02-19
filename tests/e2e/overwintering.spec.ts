import { test, expect } from '@playwright/test';

/**
 * Overwintering Pages E2E Tests (@P1)
 *
 * Verifies the overwintering survey and report pages:
 * - Survey page loads with heading
 * - Survey shows hive status cards or empty state
 * - Report page loads with heading
 * - Report shows survival stats or empty state
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

test.describe('Overwintering Survey Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('overwintering survey page loads', async ({ page }) => {
    await page.goto('/overwintering/survey');
    await page.waitForLoadState('networkidle');

    // Should show heading with "Overwintering" or "Winter"
    const hasHeading = await page.getByRole('heading', { name: /overwinter|winter/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await page.getByText(/overwinter|winter|survived/i).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHeading || hasContent).toBeTruthy();
  });

  test('overwintering survey shows hive cards or empty state', async ({ page }) => {
    await page.goto('/overwintering/survey');
    await page.waitForLoadState('networkidle');

    // Either hive status cards or empty state
    const hasCards = await page.locator('.ant-card').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no hives|no data/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasSurvived = await page.getByText(/survived/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasMarkAll = await page.getByRole('button', { name: /mark all/i }).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCards || hasEmpty || hasSurvived || hasMarkAll).toBeTruthy();
  });

  test('overwintering survey has action button', async ({ page }) => {
    await page.goto('/overwintering/survey');
    await page.waitForLoadState('networkidle');

    // The bottom button shows "X hives remaining" when incomplete, or "Complete Survey" when all recorded
    const hasRemaining = await page.getByRole('button', { name: /hives remaining/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasComplete = await page.getByRole('button', { name: /complete survey/i }).isVisible({ timeout: 3000 }).catch(() => false);
    const hasMarkAll = await page.getByRole('button', { name: /mark all/i }).isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmpty = await page.getByText(/no hives/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasRemaining || hasComplete || hasMarkAll || hasEmpty).toBeTruthy();
  });
});

test.describe('Overwintering Report Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('overwintering report page loads', async ({ page }) => {
    await page.goto('/overwintering/report');
    await page.waitForLoadState('networkidle');

    // Should show report heading or redirect to survey if no data
    const hasHeading = await page.getByRole('heading', { name: /winter.*report|report/i }).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await page.getByText(/survival|overwinter|winter|report/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoData = await page.getByText(/no.*data|complete.*survey/i).first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHeading || hasContent || hasNoData).toBeTruthy();
  });

  test('overwintering report shows survival stats or empty state', async ({ page }) => {
    await page.goto('/overwintering/report');
    await page.waitForLoadState('networkidle');

    // Either shows survival rate or empty message
    const hasSurvivalRate = await page.getByText(/survival/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPercentage = await page.getByText(/%/).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasNoData = await page.getByText(/no.*data|no.*overwinter/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSurvey = await page.getByText(/complete.*survey/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSurvivalRate || hasPercentage || hasNoData || hasSurvey).toBeTruthy();
  });
});
