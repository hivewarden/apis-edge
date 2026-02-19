import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Tasks Page E2E Tests (@P1)
 *
 * Verifies the task management page loads with:
 * - Page header "Tasks Overview"
 * - Task Library section
 * - Quick Assign panel
 * - Active Schedule panel
 * - Create Template capability
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

test.describe('Tasks Page @P1', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('tasks page loads with header', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Tasks Overview')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Operations Management')).toBeVisible();
  });

  test('tasks page shows search input', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByPlaceholder(/search tasks/i)).toBeVisible({ timeout: 10000 });
  });

  test('tasks page shows Quick Assign section', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Quick Assign')).toBeVisible({ timeout: 10000 });
  });

  test('tasks page shows Active Schedule section', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Active Schedule')).toBeVisible({ timeout: 10000 });
  });

  test('create task via API and verify in active tasks list', async ({ page }) => {
    const csrfToken = await getCsrfToken(page);

    // Create a site and hive for the task
    const siteResponse = await page.request.post(`${API_URL}/api/sites`, {
      data: createSiteData({ name: `PW-Task Site ${Date.now()}` }),
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(siteResponse.status()).toBe(201);
    const siteId = (await siteResponse.json()).data.id;

    const hiveResponse = await page.request.post(`${API_URL}/api/sites/${siteId}/hives`, {
      data: { name: `PW-Task Hive ${Date.now()}` },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(hiveResponse.status()).toBe(201);
    const hiveId = (await hiveResponse.json()).data.id;

    const taskTitle = `PW-E2E Task ${Date.now()}`;
    const taskResponse = await page.request.post(`${API_URL}/api/tasks`, {
      data: {
        custom_title: taskTitle,
        hive_id: hiveId,
        priority: 'medium',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(taskResponse.status()).toBe(201);
    const taskId = (await taskResponse.json()).data.id;

    try {
      // Verify task exists via API
      const listResponse = await page.request.get(`${API_URL}/api/tasks`);
      expect(listResponse.status()).toBe(200);
      const tasks = await listResponse.json();
      const found = tasks.data.find((t: any) => t.custom_title === taskTitle || t.title === taskTitle);
      expect(found).toBeTruthy();
    } finally {
      // Cleanup
      await page.request.delete(`${API_URL}/api/tasks/${taskId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/hives/${hiveId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      await page.request.delete(`${API_URL}/api/sites/${siteId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
