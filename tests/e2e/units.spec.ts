import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Units Page E2E Tests (@P1)
 *
 * Verifies unit management flows:
 * - Units list page loads
 * - Register Unit button and page
 * - Unit detail page with info descriptions
 * - Unit registration via API, verify in list
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

test.describe('Units Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('units page loads with heading', async ({ page }) => {
    await page.goto('/units');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible({ timeout: 10000 });
  });

  test('units page shows Register Unit button', async ({ page }) => {
    await page.goto('/units');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /register unit/i })).toBeVisible({ timeout: 10000 });
  });

  test('Register Unit button navigates to register page', async ({ page }) => {
    await page.goto('/units');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /register unit/i }).click();
    await page.waitForURL((url: URL) => url.pathname.includes('/units/register'), {
      timeout: 10000,
    });
    expect(page.url()).toContain('/units/register');
  });

  test('unit register page loads with form', async ({ page }) => {
    await page.goto('/units/register');
    await page.waitForLoadState('networkidle');

    // Should have a form with at least a name or serial field
    const hasNameField = await page.getByLabel(/name/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasSerialField = await page.getByLabel(/serial/i).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNameField || hasSerialField).toBeTruthy();
  });

  test('register unit via API and verify in units list', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a site first
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Unit Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    // Register a unit via API — requires serial field (3-50 alphanumeric+hyphens)
    const unitSerial = `PW-Unit-${Date.now()}`;
    const unitName = unitSerial;
    const unitResponse = await page.request.post(`${API_URL}/api/units`, {
      data: {
        serial: unitSerial,
        name: unitName,
        site_id: siteId,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(unitResponse.status()).toBe(201);
    const unitData = await unitResponse.json();
    const unitId = unitData.data.id;

    try {
      // Navigate to units list and verify the unit appears
      await page.goto('/units');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(unitName).first()).toBeVisible({ timeout: 10000 });
    } finally {
      // Cleanup
      await page.request.delete(`${API_URL}/api/units/${unitId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('unit detail page shows unit information', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create site and unit
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-UnitDetail Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    const unitSerial = `PW-Detail-${Date.now()}`;
    const unitName = unitSerial;
    const unitResponse = await page.request.post(`${API_URL}/api/units`, {
      data: { serial: unitSerial, name: unitName, site_id: siteId },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(unitResponse.status()).toBe(201);
    const unitData = await unitResponse.json();
    const unitId = unitData.data.id;

    try {
      // Navigate to unit detail page
      await page.goto(`/units/${unitId}`);
      await page.waitForLoadState('networkidle');

      // Verify unit name is displayed
      await expect(page.getByRole('heading', { name: unitName })).toBeVisible({ timeout: 10000 });

      // Verify Unit Information card
      await expect(page.getByText('Unit Information')).toBeVisible();

      // Verify description fields
      await expect(page.getByText('Serial Number')).toBeVisible();
      await expect(page.getByText('Status', { exact: true })).toBeVisible();

      // Verify action buttons exist
      await expect(page.getByRole('button', { name: /edit/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /regenerate key/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /refresh status/i })).toBeVisible();
    } finally {
      await page.request.delete(`${API_URL}/api/units/${unitId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('unit detail page Back button returns to units list', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-UnitBack Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    const unitSerial = `PW-Back-${Date.now()}`;
    const unitResponse = await page.request.post(`${API_URL}/api/units`, {
      data: { serial: unitSerial, name: `PW-Back Unit ${Date.now()}`, site_id: siteId },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(unitResponse.status()).toBe(201);
    const unitId = (await unitResponse.json()).data.id;

    try {
      await page.goto(`/units/${unitId}`);
      await page.waitForLoadState('networkidle');

      // Click back button
      await page.getByRole('button', { name: /back/i }).click();

      await page.waitForURL((url: URL) => url.pathname === '/units', {
        timeout: 10000,
      });
      expect(page.url()).toContain('/units');
    } finally {
      await page.request.delete(`${API_URL}/api/units/${unitId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
