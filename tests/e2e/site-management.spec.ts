import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Site Management E2E Tests (@P1)
 *
 * Critical user journey: login, navigate to sites, create new site,
 * verify it appears in the list, edit site, delete site.
 *
 * Preconditions:
 * - Dashboard running on APP_URL (default http://localhost:5173)
 * - Server running on API_URL (default http://localhost:3000)
 * - AUTH_MODE=local with default admin account
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';
const API_URL = process.env.API_URL || 'http://localhost:3000';

/** Helper: login via the UI */
async function loginViaUI(page: any) {
  await page.goto('/login');
  await expect(page.getByText('Welcome back')).toBeVisible();
  await page.getByLabel('Email address').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect away from login
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), {
    timeout: 10000,
  });
}

/**
 * Helper: login via API and set cookies on the page context.
 * This is faster than UI login for tests that don't focus on login itself.
 */
async function loginViaAPI(page: any) {
  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

test.describe('Site Management @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('navigate to sites page and view list', async ({ page }) => {
    await page.goto('/sites');

    // Wait for the sites page to load
    // Look for the page heading or a recognizable element
    await expect(page.getByRole('heading', { name: /sites|apiaries/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('create a new site via UI', async ({ page }) => {
    const siteName = `PW-E2E Site ${Date.now()}`;

    // Navigate to site creation page
    await page.goto('/sites/create');

    // Wait for the creation form to render
    await expect(page.getByLabel(/name/i)).toBeVisible({ timeout: 10000 });

    // Fill in site name
    await page.getByLabel(/name/i).fill(siteName);

    // Fill timezone if there's a timezone field
    const tzField = page.getByLabel(/timezone/i);
    if (await tzField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tzField.fill('Europe/Brussels');
    }

    // Submit the form - look for save/create button
    const submitButton = page.getByRole('button', { name: /save|create|submit/i });
    await submitButton.click();

    // Wait for navigation back to sites list or site detail
    await page.waitForURL((url: URL) => !url.pathname.includes('/create'), {
      timeout: 10000,
    });

    // Cleanup: delete the site via API to avoid test data accumulation
    const sitesResponse = await page.request.get(`${API_URL}/api/sites`);
    const sites = await sitesResponse.json();
    const created = sites.data.find((s: any) => s.name === siteName);
    if (created) {
      // Get CSRF token from cookies
      const cookies = await page.context().cookies();
      const csrfCookie = cookies.find((c: any) => c.name === 'apis_csrf_token');
      const csrfToken = csrfCookie?.value || '';

      await page.request.delete(`${API_URL}/api/sites/${created.id}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('create site via API, verify in list, then delete', async ({ page }) => {
    const siteName = `PW-E2E Listed Site ${Date.now()}`;

    // Get CSRF token
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c: any) => c.name === 'apis_csrf_token');
    const csrfToken = csrfCookie?.value || '';

    // Create site via API
    const createResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: siteName }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const siteId = (await createResponse.json()).data.id;

    try {
      // Navigate to sites list
      await page.goto('/sites');

      // Wait for sites to load and verify our site appears
      await expect(page.getByText(siteName)).toBeVisible({ timeout: 10000 });

    } finally {
      // Cleanup via API
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('navigate to site detail page', async ({ page }) => {
    const siteName = `PW-E2E Detail Site ${Date.now()}`;

    // Get CSRF token
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c: any) => c.name === 'apis_csrf_token');
    const csrfToken = csrfCookie?.value || '';

    // Create site via API
    const createResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: siteName }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const siteId = (await createResponse.json()).data.id;

    try {
      // Navigate to the site detail page
      await page.goto(`/sites/${siteId}`);

      // Verify site name is displayed on the detail page (use exact match to avoid activity log headings)
      await expect(page.getByRole('heading', { name: siteName, exact: true })).toBeVisible({ timeout: 10000 });

    } finally {
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('navigate to site edit page', async ({ page }) => {
    const siteName = `PW-E2E Edit Site ${Date.now()}`;

    // Get CSRF token
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c: any) => c.name === 'apis_csrf_token');
    const csrfToken = csrfCookie?.value || '';

    // Create site via API
    const createResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: siteName }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const siteId = (await createResponse.json()).data.id;

    try {
      // Navigate to the site edit page
      await page.goto(`/sites/${siteId}/edit`);

      // Verify the edit form loads with the site name pre-filled
      const nameField = page.getByLabel(/name/i);
      await expect(nameField).toBeVisible({ timeout: 10000 });
      await expect(nameField).toHaveValue(siteName);

    } finally {
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
