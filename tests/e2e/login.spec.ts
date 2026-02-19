import { test, expect } from '@playwright/test';

/**
 * Login Journey E2E Tests (@P0)
 *
 * Critical user journey: navigate to login, enter credentials, verify
 * redirect to dashboard, verify user info is displayed.
 *
 * Preconditions:
 * - Dashboard running on APP_URL (default http://localhost:5173)
 * - Server running on API_URL (default http://localhost:3000)
 * - AUTH_MODE=local with default admin account
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';
const API_URL = process.env.API_URL || 'http://localhost:3000';

test.describe('Login Journey @P0', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Wait for auth config to load and login form to render
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Fill email field
    await page.getByLabel('Email address').fill(TEST_EMAIL);

    // Fill password field
    await page.getByLabel('Password').fill(TEST_PASSWORD);

    // Click sign in button
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to dashboard (should redirect away from /login)
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });

    // Verify we are on the dashboard (root or dashboard route)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('login form shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Welcome back')).toBeVisible();

    // Enter invalid credentials
    await page.getByLabel('Email address').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill('wrong-password-definitely-invalid');

    // Click sign in
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for error message to appear
    await expect(
      page.getByText(/invalid email or password/i)
    ).toBeVisible({ timeout: 5000 });

    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('login form validates required fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Welcome back')).toBeVisible();

    // Try to submit without filling any fields
    await page.getByRole('button', { name: /sign in/i }).click();

    // Ant Design Form validation should show error messages
    await expect(
      page.getByText(/please enter your email/i)
    ).toBeVisible({ timeout: 3000 });
  });

  test('login page shows Hive Warden branding', async ({ page }) => {
    await page.goto('/login');

    // Check for branding elements
    await expect(page.getByText('Hive Warden')).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(
      page.getByText(/log in to manage your apiary/i)
    ).toBeVisible();
  });

  test('login page shows remember me checkbox', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Welcome back')).toBeVisible();

    // Check for remember me checkbox
    await expect(page.getByText('Remember me')).toBeVisible();
  });

  test('direct navigation to protected route redirects to login', async ({ page }) => {
    // Try to access a protected route without being logged in
    await page.goto('/sites');

    // Should redirect to login page
    await page.waitForURL((url) => url.pathname.includes('/login'), {
      timeout: 10000,
    });

    expect(page.url()).toContain('/login');
  });

  test('after login, user info is accessible', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await expect(page.getByText('Welcome back')).toBeVisible();

    await page.getByLabel('Email address').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for dashboard to load
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });

    // Verify the user info is accessible via API (session cookie should be set)
    const meResponse = await page.request.get(`${API_URL}/api/me`);
    expect(meResponse.status()).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.email).toBe(TEST_EMAIL);
  });
});
