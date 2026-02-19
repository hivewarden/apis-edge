import { test, expect } from '@playwright/test';

/**
 * Setup Wizard E2E Tests (@P0)
 *
 * Tests the full first-time setup wizard flow:
 * - Step 1: Create admin account (name, email, password)
 * - Step 2: Select deployment scenario
 * - Submits and verifies redirect to dashboard
 *
 * These tests only run on a FRESH database where no admin exists.
 * If an admin already exists, the tests are skipped.
 *
 * IMPORTANT: The test credentials used here MUST match the env vars
 * used by all other E2E tests (TEST_USER_EMAIL / TEST_USER_PASSWORD).
 * The password must meet complexity requirements: 8+ chars, uppercase,
 * lowercase, and a number.
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Admin123!';
const TEST_DISPLAY_NAME = 'Test Admin';
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function isSetupRequired(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/auth/config`);
    if (!response.ok) return false;
    const config = await response.json();
    return config.mode === 'local' && config.setup_required === true;
  } catch {
    return false;
  }
}

test.describe('Setup Wizard @P0', () => {
  // Check once before all tests if setup is available
  let setupAvailable = false;

  test.beforeAll(async () => {
    setupAvailable = await isSetupRequired();
  });

  test.beforeEach(async ({}, testInfo) => {
    if (!setupAvailable) {
      testInfo.skip();
    }
  });

  test('setup page shows welcome heading', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /welcome to hive warden/i })).toBeVisible({ timeout: 10000 });
  });

  test('setup page shows step 1: account creation form', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Step indicator shows "Account" as active
    await expect(page.getByText('Account')).toBeVisible({ timeout: 10000 });

    // Form fields for step 1
    await expect(page.getByPlaceholder('Display Name')).toBeVisible();
    await expect(page.getByPlaceholder('Email Address')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm Password')).toBeVisible();

    // Next button visible
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
  });

  test('step 1 validates required fields', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Click Next without filling anything
    await page.getByRole('button', { name: /next/i }).click();

    // Should show validation errors
    await expect(page.getByText('Please enter your name')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Please enter your email')).toBeVisible();
    await expect(page.getByText('Please enter a password')).toBeVisible();
  });

  test('step 1 validates password complexity', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Fill a weak password
    await page.getByPlaceholder('Password').fill('weak');
    await page.getByPlaceholder('Password').blur();

    // Should show complexity error
    await expect(
      page.getByText(/must be at least 8 characters/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('step 1 validates password match', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Confirm Password').fill('DifferentPassword1');
    await page.getByPlaceholder('Confirm Password').blur();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 });
  });

  test('navigating from step 1 to step 2', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Fill step 1
    await page.getByPlaceholder('Display Name').fill(TEST_DISPLAY_NAME);
    await page.getByPlaceholder('Email Address').fill(TEST_EMAIL);
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Confirm Password').fill(TEST_PASSWORD);

    // Click Next
    await page.getByRole('button', { name: /next/i }).click();

    // Should see step 2 heading
    await expect(
      page.getByRole('heading', { name: /how will you access hive warden/i })
    ).toBeVisible({ timeout: 10000 });

    // Deployment scenario selector should be visible
    await expect(page.getByText('Local Network')).toBeVisible();
  });

  test('step 2 has Back button that returns to step 1', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Fill step 1 and advance
    await page.getByPlaceholder('Display Name').fill(TEST_DISPLAY_NAME);
    await page.getByPlaceholder('Email Address').fill(TEST_EMAIL);
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Confirm Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /next/i }).click();

    await expect(
      page.getByRole('heading', { name: /how will you access hive warden/i })
    ).toBeVisible({ timeout: 10000 });

    // Click Back
    await page.getByRole('button', { name: /back/i }).click();

    // Should see step 1 again with values preserved
    await expect(page.getByPlaceholder('Display Name')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder('Display Name')).toHaveValue(TEST_DISPLAY_NAME);
  });

  test('full setup wizard flow completes successfully', async ({ page }) => {
    // This test actually creates the admin account, so it must run last
    // and only once. After this, setup_required will be false.
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Step 1: Fill account details
    await page.getByPlaceholder('Display Name').fill(TEST_DISPLAY_NAME);
    await page.getByPlaceholder('Email Address').fill(TEST_EMAIL);
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByPlaceholder('Confirm Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Deployment scenario (local_network is default)
    await expect(
      page.getByRole('heading', { name: /how will you access hive warden/i })
    ).toBeVisible({ timeout: 10000 });

    // Local Network should already be selected as default
    await expect(page.getByText('Local Network Access')).toBeVisible();

    // Click Create Account
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to dashboard (or login page after setup)
    await page.waitForURL(/\/(dashboard|login)?$/, { timeout: 15000 });

    // Verify setup is no longer required
    const configResponse = await page.request.get(`${API_URL}/api/auth/config`);
    expect(configResponse.status()).toBe(200);
    const config = await configResponse.json();
    expect(config.setup_required).toBeFalsy();
  });

  test('setup page redirects to login after setup is complete', async ({ page }) => {
    // After the full flow test above, visiting /setup should redirect to /login
    // This test depends on the full flow test having run
    const stillRequired = await isSetupRequired();
    if (stillRequired) {
      // Full flow hasn't run yet, skip
      test.skip();
      return;
    }

    await page.goto('/setup');
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });
});
